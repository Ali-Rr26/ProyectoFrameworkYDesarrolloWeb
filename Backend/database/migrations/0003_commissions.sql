-- =============================================================================
-- Migración 0003: Comisiones de la red multinivel (Fase 4)
-- Las comisiones se guardan como un REGISTRO DE MOVIMIENTOS (ledger), no como un
-- saldo en users: cada fila es un hecho (la comisión que generó un pedido para un
-- patrocinador, con la tasa vigente en ese momento). El saldo es un dato derivado
-- y se calcula con la vista v_user_commissions, igual que las ventas (3FN).
-- Las filas las inserta una goroutine después del COMMIT del pedido.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tasas por nivel: 1 = patrocinador directo del comprador, 2 = el de arriba, etc.
-- -----------------------------------------------------------------------------
CREATE TABLE commission_rates (
    level SMALLINT     PRIMARY KEY CHECK (level BETWEEN 1 AND 3),
    rate  NUMERIC(4,3) NOT NULL CHECK (rate > 0 AND rate < 1)
);

INSERT INTO commission_rates (level, rate) VALUES (1, 0.100), (2, 0.050), (3, 0.020);

-- -----------------------------------------------------------------------------
-- Comisiones pagadas. El comprador no se guarda: se obtiene de orders.user_id.
-- rate se copia porque es la tasa AL MOMENTO de la venta (hecho histórico, igual
-- que order_items.unit_price), no una redundancia de commission_rates.
-- UNIQUE (order_id, level): un pedido paga como máximo una comisión por nivel, así
-- reprocesar un pedido (reintento, recuperación al arrancar) nunca paga doble.
-- -----------------------------------------------------------------------------
CREATE TABLE commissions (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id       INTEGER       NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    beneficiary_id INTEGER       NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    level          SMALLINT      NOT NULL CHECK (level BETWEEN 1 AND 3),
    rate           NUMERIC(4,3)  NOT NULL CHECK (rate > 0 AND rate < 1),
    amount         NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ux_commissions_order_level UNIQUE (order_id, level)
);
-- Acelera el saldo de un beneficiario (KPIs del dashboard).
CREATE INDEX ix_commissions_beneficiary ON commissions (beneficiary_id, created_at);

-- -----------------------------------------------------------------------------
-- Saldo derivado: total histórico y total del mes en curso por beneficiario.
-- -----------------------------------------------------------------------------
CREATE VIEW v_user_commissions AS
SELECT beneficiary_id AS user_id,
       SUM(amount) AS total,
       COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_total
FROM commissions
GROUP BY beneficiary_id;

-- -----------------------------------------------------------------------------
-- Comisiones de los pedidos existentes (seed): sin esto el dashboard arrancaría
-- en $0. Se usa la fecha del pedido para que cada comisión caiga en su mes.
-- Sube por la red desde el comprador hasta 3 niveles (misma lógica que la API).
-- -----------------------------------------------------------------------------
WITH RECURSIVE up AS (
    SELECT o.id AS order_id, o.created_at, nm.sponsor_id AS beneficiary_id, 1 AS level
    FROM orders o
    JOIN network_members nm ON nm.user_id = o.user_id
    WHERE nm.sponsor_id IS NOT NULL
  UNION ALL
    SELECT up.order_id, up.created_at, nm.sponsor_id, up.level + 1
    FROM up
    JOIN network_members nm ON nm.user_id = up.beneficiary_id
    WHERE up.level < 3 AND nm.sponsor_id IS NOT NULL
)
INSERT INTO commissions (order_id, beneficiary_id, level, rate, amount, created_at)
SELECT up.order_id, up.beneficiary_id, up.level, cr.rate, round(t.total * cr.rate, 2), up.created_at
FROM up
JOIN commission_rates cr ON cr.level = up.level
JOIN v_order_totals t ON t.order_id = up.order_id;
