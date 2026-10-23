-- =============================================================================
-- Migración 0006: soporte para la sincronización offline de la PWA (PLAN_PWA, Fase 5)
-- 1. Concurrencia optimista en productos: products.version + updated_at. Un cliente
--    que edita con una versión vieja recibe 409 en lugar de pisar otra edición.
-- 2. Idempotencia: idempotency_keys guarda la respuesta de cada escritura enviada
--    con la cabecera Idempotency-Key. Reenviar la misma petición (p. ej. un pedido
--    guardado sin conexión) devuelve la respuesta original sin volver a ejecutarla.
-- Se ejecuta en una sola transacción (database/migrate.go).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Versión del producto: cuenta TODOS los cambios de la fila, incluido el stock que
-- descuentan las ventas y repone una cancelación. Así una edición offline de stock no
-- sobrescribe ventas ocurridas mientras tanto (el cliente resuelve el conflicto).
-- -----------------------------------------------------------------------------
ALTER TABLE products
    ADD COLUMN version    INTEGER     NOT NULL DEFAULT 1 CHECK (version > 0),
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE FUNCTION fn_products_version() RETURNS trigger AS $$
BEGIN
    NEW.version    := OLD.version + 1;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_version
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_products_version();

-- -----------------------------------------------------------------------------
-- Claves de idempotencia. La fila se inserta y completa DENTRO de la transacción de
-- la escritura: si la escritura hace ROLLBACK, la clave tampoco queda registrada y el
-- reintento vuelve a ejecutarse; si hace COMMIT, la respuesta queda guardada.
-- La PK por usuario impide que una clave ajena (o adivinada) devuelva datos de otro.
-- -----------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
    user_id       INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key           UUID         NOT NULL,
    method        VARCHAR(10)  NOT NULL,
    path          VARCHAR(200) NOT NULL,
    request_hash  CHAR(64)     NOT NULL,              -- SHA-256 hex de método + ruta + cuerpo
    status_code   SMALLINT,                           -- NULL mientras la transacción no termina
    response_body JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);
-- Limpieza periódica de claves vencidas (7 días).
CREATE INDEX ix_idempotency_keys_created ON idempotency_keys (created_at);
