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
-- Catálogo de roles de acceso (admin, cliente).
-- -----------------------------------------------------------------------------
CREATE TABLE roles (
    id     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE
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
    nombre        VARCHAR(120) NOT NULL CHECK (btrim(nombre) <> ''),
    role_id       SMALLINT     NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,  -- borrado lógico
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
        WITH RECURSIVE ancestros AS (
            SELECT NEW.sponsor_id AS id
            UNION
            SELECT nm.sponsor_id
            FROM network_members nm
            JOIN ancestros a ON nm.user_id = a.id
            WHERE nm.sponsor_id IS NOT NULL
        )
        SELECT 1 FROM ancestros WHERE id = NEW.user_id
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
    id     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- Productos. precio en NUMERIC (exacto, sin errores de coma flotante).
-- img_url es la imagen principal; la galería va en product_images.
-- -----------------------------------------------------------------------------
CREATE TABLE products (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(120)  NOT NULL CHECK (btrim(nombre) <> ''),
    descripcion TEXT          NOT NULL DEFAULT '',
    precio      NUMERIC(10,2) NOT NULL CHECK (precio > 0),
    stock       INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category_id SMALLINT      NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    img_url     VARCHAR(500)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
-- Nombre único sin distinguir mayúsculas (permite responder 409 ante duplicados).
CREATE UNIQUE INDEX ux_products_nombre ON products (lower(nombre));
CREATE INDEX ix_products_category ON products (category_id);

-- -----------------------------------------------------------------------------
-- Galería de imágenes (atributo multivaluado -> tabla propia, 1FN).
-- -----------------------------------------------------------------------------
CREATE TABLE product_images (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER      NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    url        VARCHAR(500) NOT NULL,
    orden      SMALLINT     NOT NULL CHECK (orden >= 0),
    CONSTRAINT ux_product_images_orden UNIQUE (product_id, orden)
);

-- -----------------------------------------------------------------------------
-- Catálogo de métodos de pago.
-- -----------------------------------------------------------------------------
CREATE TABLE payment_methods (
    id     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- Pedidos (cabecera). Los datos de envío son una foto del momento de la compra.
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           INTEGER      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    payment_method_id SMALLINT     NOT NULL REFERENCES payment_methods (id) ON DELETE RESTRICT,
    direccion_envio   VARCHAR(200) NOT NULL,
    ciudad            VARCHAR(80)  NOT NULL,
    telefono          VARCHAR(20)  NOT NULL,
    fecha             TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_orders_user ON orders (user_id);

-- -----------------------------------------------------------------------------
-- Detalle de pedido. precio_unitario es el precio AL MOMENTO de la venta
-- (hecho distinto de products.precio, no es redundancia).
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
    order_id        INTEGER       NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id      INTEGER       NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    cantidad        INTEGER       NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    PRIMARY KEY (order_id, product_id)
);
CREATE INDEX ix_order_items_product ON order_items (product_id);

-- -----------------------------------------------------------------------------
-- Vistas de datos derivados (se calculan, no se almacenan).
-- -----------------------------------------------------------------------------
CREATE VIEW v_order_totals AS
SELECT o.id AS order_id,
       o.user_id,
       SUM(oi.cantidad * oi.precio_unitario) AS total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.user_id;

CREATE VIEW v_user_sales AS
SELECT user_id, SUM(total) AS ventas
FROM v_order_totals
GROUP BY user_id;
