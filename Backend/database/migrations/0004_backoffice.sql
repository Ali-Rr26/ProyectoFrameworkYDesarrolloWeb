-- =============================================================================
-- Migración 0004: Base de datos del back-office (rama BackofficeU2, Fase 1)
-- Agrega lo que necesitan el registro por código de referido, la baja lógica de
-- productos, el ciclo de vida de los pedidos y la liquidación de comisiones.
-- Se ejecuta en una sola transacción (database/migrate.go): o se aplica completa
-- o no se aplica. Los datos existentes se completan aquí mismo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Código de referido: identifica al patrocinador en el link de invitación
-- (/register?ref=CODIGO). Se genera solo al afiliar a alguien, así ningún INSERT
-- en network_members necesita conocerlo. 8 caracteres sin 0/O/1/I para que se
-- pueda dictar sin confusiones.
-- -----------------------------------------------------------------------------
CREATE FUNCTION fn_new_referral_code() RETURNS VARCHAR(20) AS $$
DECLARE
    v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_code     VARCHAR(20);
BEGIN
    LOOP
        SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
          INTO v_code
          FROM generate_series(1, 8);
        -- Reintento ante la (improbable) colisión; el índice único es la garantía final.
        EXIT WHEN NOT EXISTS (SELECT 1 FROM network_members WHERE referral_code = v_code);
    END LOOP;
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE network_members ADD COLUMN referral_code VARCHAR(20);
UPDATE network_members SET referral_code = fn_new_referral_code();
ALTER TABLE network_members ALTER COLUMN referral_code SET NOT NULL;
ALTER TABLE network_members
    ADD CONSTRAINT ux_network_members_referral_code UNIQUE (referral_code);

CREATE FUNCTION fn_network_referral_code() RETURNS trigger AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := fn_new_referral_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_network_referral_code
    BEFORE INSERT ON network_members
    FOR EACH ROW EXECUTE FUNCTION fn_network_referral_code();

-- -----------------------------------------------------------------------------
-- Baja lógica de productos: un producto inactivo deja de venderse pero sigue en
-- el historial de order_items (no se borra la fila).
-- -----------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

-- -----------------------------------------------------------------------------
-- Ciclo de vida del pedido: pending → preparing → shipped → delivered,
-- y cancelled desde pending/preparing (las transiciones las valida la API).
-- Los pedidos anteriores a esta migración ya cobraron comisiones y se consideran
-- entregados; los nuevos nacen en pending.
-- -----------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
UPDATE orders SET status = 'delivered';
ALTER TABLE orders ADD CONSTRAINT ck_orders_status
    CHECK (status IN ('pending', 'preparing', 'shipped', 'delivered', 'cancelled'));
-- Listado del admin filtrado por estado y ordenado por fecha.
CREATE INDEX ix_orders_status_created ON orders (status, created_at);

-- -----------------------------------------------------------------------------
-- Liquidaciones: cada fila es un pago a un distribuidor por la suma de sus
-- comisiones pendientes. total se guarda porque es el monto efectivamente pagado
-- (hecho histórico), no un dato derivado.
-- -----------------------------------------------------------------------------
CREATE TABLE payouts (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    beneficiary_id INTEGER       NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    total          NUMERIC(10,2) NOT NULL CHECK (total > 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_payouts_beneficiary ON payouts (beneficiary_id, created_at);

-- -----------------------------------------------------------------------------
-- Estado de cada comisión: pending (por pagar), paid (liquidada en payout_id),
-- reversed (el pedido se canceló). Una comisión pagada siempre tiene su payout.
-- -----------------------------------------------------------------------------
ALTER TABLE commissions ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE commissions ADD COLUMN payout_id INTEGER NULL REFERENCES payouts (id) ON DELETE RESTRICT;
ALTER TABLE commissions ADD CONSTRAINT ck_commissions_status
    CHECK (status IN ('pending', 'paid', 'reversed'));
ALTER TABLE commissions ADD CONSTRAINT ck_commissions_paid_payout
    CHECK ((status = 'paid') = (payout_id IS NOT NULL));
-- Deuda por distribuidor (comisiones pendientes) para liquidaciones y reportes.
CREATE INDEX ix_commissions_beneficiary_status ON commissions (beneficiary_id, status);

-- El saldo no cuenta las comisiones revertidas (pedido cancelado).
CREATE OR REPLACE VIEW v_user_commissions AS
SELECT beneficiary_id AS user_id,
       SUM(amount) AS total,
       COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_total
FROM commissions
WHERE status <> 'reversed'
GROUP BY beneficiary_id;

-- -----------------------------------------------------------------------------
-- Control de inventario: igual que en 0001, pero un producto dado de baja ya no
-- se puede vender (restricción ck_products_active).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_order_items_stock() RETURNS trigger AS $$
DECLARE
    v_price  NUMERIC(10,2);
    v_delta  INTEGER;
    v_active BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE products SET stock = stock + OLD.quantity WHERE id = OLD.product_id;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Cambiar el producto de una línea alteraría el historial: se exige borrar e insertar.
        IF NEW.product_id <> OLD.product_id THEN
            RAISE EXCEPTION 'No se puede cambiar el producto de una línea de pedido'
                USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_order_items_product_immutable';
        END IF;

        v_delta := NEW.quantity - OLD.quantity;
        IF v_delta > 0 THEN
            UPDATE products SET stock = stock - v_delta
            WHERE id = NEW.product_id AND stock >= v_delta;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', NEW.product_id
                    USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_products_stock_available';
            END IF;
        ELSIF v_delta < 0 THEN
            UPDATE products SET stock = stock - v_delta WHERE id = NEW.product_id;
        END IF;
        -- El precio histórico de la línea no cambia al ajustar la cantidad.
        NEW.unit_price := OLD.unit_price;
        RETURN NEW;
    END IF;

    -- INSERT: solo productos activos y con stock suficiente.
    UPDATE products SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id AND active AND stock >= NEW.quantity
    RETURNING price INTO v_price;

    IF NOT FOUND THEN
        SELECT active INTO v_active FROM products WHERE id = NEW.product_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto % no existe', NEW.product_id
                USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'order_items_product_id_fkey';
        END IF;
        IF NOT v_active THEN
            RAISE EXCEPTION 'El producto % no está disponible', NEW.product_id
                USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_products_active';
        END IF;
        RAISE EXCEPTION 'Stock insuficiente para el producto %', NEW.product_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_products_stock_available';
    END IF;

    NEW.unit_price := v_price;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
