-- =============================================================================
-- Migración 0001: Esquema relacional de Multicatálogo (Fase 2 - Tema 3)
-- Modelo en Tercera Forma Normal (3FN):
--   * 1FN: atributos atómicos (la galería va en product_images, no en un ARRAY).
--   * 2FN: ningún atributo depende de una parte de una clave compuesta
--          (cabecera de pedido en orders, detalle en order_items).
--   * 3FN: sin dependencias transitivas ni datos derivados almacenados
--          (rol, categoría y método de pago son catálogos referenciados por FK;
--           nivel de red, ventas y total de pedido se calculan al consultar).
-- =============================================================================

-- pgcrypto permite generar hashes bcrypt en el seed (crypt + gen_salt('bf')).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Catálogo de roles de acceso (admin, customer).
-- -----------------------------------------------------------------------------
CREATE TABLE roles (
    id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- Usuarios: identidad y credenciales. La pertenencia a la red MLM vive en
-- network_members para no mezclar "cuenta" con "afiliación".
-- id GENERATED ALWAYS: la clave sustituta no puede modificarse, por lo que las
-- FK que apuntan a un usuario nunca se rompen al editar sus datos.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(254) NOT NULL CHECK (btrim(email) <> ''),
    password_hash VARCHAR(72)  NOT NULL,               -- hash bcrypt ($2a$/$2b$)
    name          VARCHAR(120) NOT NULL CHECK (btrim(name) <> ''),
    role_id       SMALLINT     NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
    active        BOOLEAN      NOT NULL DEFAULT TRUE,  -- borrado lógico
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Índice único sobre lower(email): evita duplicados por mayúsculas y sirve
-- para la búsqueda del login (no hace falta un índice adicional).
CREATE UNIQUE INDEX ux_users_email ON users (lower(email));

-- -----------------------------------------------------------------------------
-- Red multinivel: lista de adyacencia (tabla recursiva).
-- sponsor_id NULL significa únicamente "raíz de su red".
-- La FK apunta a network_members: solo un afiliado puede patrocinar.
-- -----------------------------------------------------------------------------
CREATE TABLE network_members (
    user_id    INTEGER     PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
    sponsor_id INTEGER     NULL REFERENCES network_members (user_id) ON DELETE RESTRICT,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_network_no_self_sponsor CHECK (sponsor_id <> user_id)
);
-- Acelera el recorrido recursivo padre -> hijos.
CREATE INDEX ix_network_members_sponsor ON network_members (sponsor_id);

-- Impide ciclos en la red (A patrocina a B, B patrocina a A, etc.).
-- El CHECK anterior solo cubre el auto-patrocinio; este trigger cubre cualquier
-- profundidad. El bloqueo consultivo serializa los cambios de árbol para que dos
-- transacciones concurrentes no creen un ciclo pasando ambas la validación.
CREATE FUNCTION fn_network_no_cycle() RETURNS trigger AS $$
BEGIN
    IF NEW.sponsor_id IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('network_members_tree'));

    -- Sube por los ancestros del nuevo patrocinador; si aparece NEW.user_id, hay ciclo.
    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT NEW.sponsor_id AS id
            UNION
            SELECT nm.sponsor_id
            FROM network_members nm
            JOIN ancestors a ON nm.user_id = a.id
            WHERE nm.sponsor_id IS NOT NULL
        )
        SELECT 1 FROM ancestors WHERE id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Ciclo en la red: el miembro % es descendiente de %', NEW.sponsor_id, NEW.user_id
            USING ERRCODE = '23514';  -- check_violation
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_network_no_cycle
    BEFORE INSERT OR UPDATE OF sponsor_id ON network_members
    FOR EACH ROW EXECUTE FUNCTION fn_network_no_cycle();

-- -----------------------------------------------------------------------------
-- Catálogo de categorías de producto.
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- Productos. price en NUMERIC (exacto, sin errores de coma flotante).
-- image_url es la imagen principal; la galería va en product_images.
-- -----------------------------------------------------------------------------
CREATE TABLE products (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(120)  NOT NULL CHECK (btrim(name) <> ''),
    description TEXT          NOT NULL DEFAULT '',
    price       NUMERIC(10,2) NOT NULL CHECK (price > 0),
    stock       INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category_id SMALLINT      NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    image_url   VARCHAR(500)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
-- Nombre único sin distinguir mayúsculas (permite responder 409 ante duplicados).
CREATE UNIQUE INDEX ux_products_name ON products (lower(name));
CREATE INDEX ix_products_category ON products (category_id);

-- -----------------------------------------------------------------------------
-- Galería de imágenes (atributo multivaluado -> tabla propia, 1FN).
-- -----------------------------------------------------------------------------
CREATE TABLE product_images (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER      NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    url        VARCHAR(500) NOT NULL,
    position   SMALLINT     NOT NULL CHECK (position >= 0),
    CONSTRAINT ux_product_images_position UNIQUE (product_id, position)
);

-- -----------------------------------------------------------------------------
-- Catálogo de métodos de pago.
-- -----------------------------------------------------------------------------
CREATE TABLE payment_methods (
    id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- Pedidos (cabecera). Los datos de envío son una foto del momento de la compra.
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           INTEGER      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    payment_method_id SMALLINT     NOT NULL REFERENCES payment_methods (id) ON DELETE RESTRICT,
    shipping_address  VARCHAR(200) NOT NULL,
    city              VARCHAR(80)  NOT NULL,
    phone             VARCHAR(20)  NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_orders_user ON orders (user_id);

-- -----------------------------------------------------------------------------
-- Detalle de pedido. unit_price es el precio AL MOMENTO de la venta
-- (hecho distinto de products.price, no es redundancia).
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
    order_id   INTEGER       NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id INTEGER       NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    quantity   INTEGER       NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, product_id)
);
CREATE INDEX ix_order_items_product ON order_items (product_id);

-- -----------------------------------------------------------------------------
-- Control de inventario: la base de datos es la autoridad del stock.
-- Toda venta (API, SQL directo, seed o cualquier otro cliente) pasa por este
-- trigger, que corre dentro de la transacción de quien inserta: si una línea
-- falla, PostgreSQL revierte el pedido completo y el stock ya descontado.
--   INSERT: descuenta con un UPDATE condicional (stock >= quantity). El UPDATE
--           bloquea la fila del producto, por lo que dos ventas simultáneas no
--           pueden vender la última unidad dos veces. Además fija unit_price
--           con el precio vigente: el precio nunca lo decide el cliente.
--   UPDATE: ajusta solo la diferencia de cantidad (descuenta o repone).
--   DELETE: repone las unidades (pedido cancelado o borrado en cascada).
-- Los errores usan SQLSTATE estándar y un nombre de restricción propio para que
-- el backend distinga "stock insuficiente" sin interpretar el texto del mensaje.
-- -----------------------------------------------------------------------------
CREATE FUNCTION fn_order_items_stock() RETURNS trigger AS $$
DECLARE
    v_price NUMERIC(10,2);
    v_delta INTEGER;
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

    -- INSERT
    UPDATE products SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id AND stock >= NEW.quantity
    RETURNING price INTO v_price;

    IF NOT FOUND THEN
        IF NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id) THEN
            RAISE EXCEPTION 'El producto % no existe', NEW.product_id
                USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'order_items_product_id_fkey';
        END IF;
        RAISE EXCEPTION 'Stock insuficiente para el producto %', NEW.product_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_products_stock_available';
    END IF;

    NEW.unit_price := v_price;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_stock
    BEFORE INSERT OR UPDATE OF quantity, product_id OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION fn_order_items_stock();

-- -----------------------------------------------------------------------------
-- Vistas de datos derivados (se calculan, no se almacenan).
-- -----------------------------------------------------------------------------
CREATE VIEW v_order_totals AS
SELECT o.id AS order_id,
       o.user_id,
       SUM(oi.quantity * oi.unit_price) AS total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.user_id;

CREATE VIEW v_user_sales AS
SELECT user_id, SUM(total) AS sales
FROM v_order_totals
GROUP BY user_id;
