-- =============================================================================
-- Migración 0005: índice para los reportes por periodo (Fase 7)
-- Los reportes filtran los pedidos por rango de fecha (created_at >= $1 AND < $2) sin
-- igualdad sobre el estado, así que el índice (status, created_at) de la migración 0004
-- no sirve para ese filtro. Este índice evita recorrer la tabla completa con volumen real.
-- =============================================================================
CREATE INDEX ix_orders_created ON orders (created_at);
