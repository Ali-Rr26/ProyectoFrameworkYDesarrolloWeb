-- =============================================================================
-- Migración 0002: Datos semilla.
-- Reproduce exactamente los datos que antes estaban escritos en los
-- controladores, para que el frontend muestre la misma información.
-- Los valores (nombres, descripciones, categorías) quedan en español porque
-- son contenido que ve el usuario; los identificadores del esquema, en inglés.
-- Contraseña de todos los usuarios demo: 123456 (hash bcrypt vía pgcrypto,
-- compatible con golang.org/x/crypto/bcrypt).
-- =============================================================================

-- Catálogos ------------------------------------------------------------------
INSERT INTO roles (name) VALUES ('admin'), ('customer');

INSERT INTO categories (name) VALUES ('Serum'), ('Crema'), ('Tónico'), ('Mascarilla'), ('Kit');

INSERT INTO payment_methods (name)
VALUES ('Tarjeta de crédito'), ('Transferencia bancaria'), ('Efectivo contra entrega');

-- Productos (ORDER BY pos: reciben los IDs 1..8 en una base nueva) -------------
INSERT INTO products (name, description, price, stock, category_id, image_url)
SELECT p.name, p.description, p.price, 100, c.id, p.image_url
FROM (VALUES
    (1, 'Serum Revitalizante', 'Serum concentrado con vitamina C y ácido hialurónico. Ilumina la piel, reduce manchas y aporta hidratación profunda desde la primera aplicación.', 'Serum', 45.00, 'https://picsum.photos/seed/serum/600'),
    (2, 'Crema Hidratante Pro', 'Crema facial de textura ligera con niacinamida y manteca de karité. Hidratación de 24 horas y barrera cutánea fortalecida para todo tipo de piel.', 'Crema', 32.50, 'https://picsum.photos/seed/crema/600'),
    (3, 'Tónico Purificante', 'Tónico sin alcohol con hamamelis y agua de rosas. Limpia poros, equilibra el pH y prepara la piel para el resto de la rutina diaria.', 'Tónico', 28.00, 'https://picsum.photos/seed/tonico/600'),
    (4, 'Mascarilla Nocturna', 'Mascarilla de noche con colágeno y vitamina E. Repara la piel mientras duermes y recupera la luminosidad al despertar.', 'Mascarilla', 50.00, 'https://picsum.photos/seed/mascarilla/600'),
    (5, 'Serum Anti-Edad Retinol', 'Serum de retinol encapsulado que suaviza líneas de expresión y mejora la firmeza. Uso nocturno recomendado.', 'Serum', 58.00, 'https://picsum.photos/seed/retinol/600'),
    (6, 'Crema Contorno de Ojos', 'Contorno de ojos con cafeína y péptidos. Reduce bolsas y ojeras, hidrata la zona más delicada del rostro.', 'Crema', 26.00, 'https://picsum.photos/seed/ojos/600'),
    (7, 'Tónico Exfoliante AHA-BHA', 'Exfoliación química suave con ácidos AHA y BHA. Renueva la textura de la piel y desobstruye los poros.', 'Tónico', 34.00, 'https://picsum.photos/seed/exfoliante/600'),
    (8, 'Kit Rutina Completa', 'Kit integral con serum, crema, tónico y mascarilla. La rutina perfecta para comenzar: limpieza, tratamiento e hidratación.', 'Kit', 129.00, 'https://picsum.photos/seed/kit/600')
) AS p (pos, name, description, category, price, image_url)
JOIN categories c ON c.name = p.category
ORDER BY p.pos;

-- Galería: 3 imágenes por producto, <seed>1..3 -------------------------------
INSERT INTO product_images (product_id, url, position)
SELECT pr.id, 'https://picsum.photos/seed/' || s.seed || n.i || '/600', n.i - 1
FROM (VALUES
    ('Serum Revitalizante', 'serum'),
    ('Crema Hidratante Pro', 'crema'),
    ('Tónico Purificante', 'tonico'),
    ('Mascarilla Nocturna', 'mascarilla'),
    ('Serum Anti-Edad Retinol', 'retinol'),
    ('Crema Contorno de Ojos', 'ojos'),
    ('Tónico Exfoliante AHA-BHA', 'exfoliante'),
    ('Kit Rutina Completa', 'kit')
) AS s (product, seed)
JOIN products pr ON pr.name = s.product
CROSS JOIN generate_series(1, 3) AS n (i);

-- Usuarios (ORDER BY pos: IDs deterministas 1..9 en una base nueva) ----------
INSERT INTO users (email, password_hash, name, role_id)
SELECT u.email, crypt('123456', gen_salt('bf', 10)), u.name, r.id
FROM (VALUES
    (1, 'admin@upse.edu.ec',               'Administrador', 'admin'),
    (2, 'cliente@upse.edu.ec',             'Cliente Demo',  'customer'),
    (3, 'ana.garcia@multicatalogo.ec',     'Ana García',    'customer'),
    (4, 'luis.poveda@multicatalogo.ec',    'Luis Poveda',   'customer'),
    (5, 'marta.sanchez@multicatalogo.ec',  'Marta Sánchez', 'customer'),
    (6, 'carlos.ruiz@multicatalogo.ec',    'Carlos Ruiz',   'customer'),
    (7, 'sofia.leon@multicatalogo.ec',     'Sofía León',    'customer'),
    (8, 'marco.diaz@multicatalogo.ec',     'Marco Díaz',    'customer'),
    (9, 'diana.paz@multicatalogo.ec',      'Diana Paz',     'customer')
) AS u (pos, email, name, role)
JOIN roles r ON r.name = u.role
ORDER BY u.pos;

-- Red multinivel (el admin no participa). Se inserta de padres a hijos
-- para que la FK sponsor_id siempre encuentre al patrocinador.
INSERT INTO network_members (user_id, sponsor_id)
SELECT child.id, parent.id
FROM (VALUES
    (1, 'cliente@upse.edu.ec',            NULL),
    (2, 'ana.garcia@multicatalogo.ec',    'cliente@upse.edu.ec'),
    (2, 'luis.poveda@multicatalogo.ec',   'cliente@upse.edu.ec'),
    (2, 'marta.sanchez@multicatalogo.ec', 'cliente@upse.edu.ec'),
    (3, 'carlos.ruiz@multicatalogo.ec',   'ana.garcia@multicatalogo.ec'),
    (3, 'sofia.leon@multicatalogo.ec',    'ana.garcia@multicatalogo.ec'),
    (3, 'marco.diaz@multicatalogo.ec',    'luis.poveda@multicatalogo.ec'),
    (4, 'diana.paz@multicatalogo.ec',     'carlos.ruiz@multicatalogo.ec')
) AS m (depth, child_email, parent_email)
JOIN users child ON child.email = m.child_email
LEFT JOIN users parent ON parent.email = m.parent_email
ORDER BY m.depth, child.id;

-- Pedidos históricos: sus totales reproducen las ventas que mostraba la red --
--   Tú 2400 | Ana 1200 | Luis 850 | Marta 430 | Carlos 500 | Sofía 430 | Marco 380 | Diana 300
CREATE TEMPORARY TABLE seed_sales (email VARCHAR, product VARCHAR, quantity INT) ON COMMIT DROP;
INSERT INTO seed_sales VALUES
    ('cliente@upse.edu.ec',            'Mascarilla Nocturna',     48),
    ('ana.garcia@multicatalogo.ec',    'Mascarilla Nocturna',     24),
    ('luis.poveda@multicatalogo.ec',   'Mascarilla Nocturna',     17),
    ('marta.sanchez@multicatalogo.ec', 'Serum Anti-Edad Retinol',  5),
    ('marta.sanchez@multicatalogo.ec', 'Tónico Purificante',       5),
    ('carlos.ruiz@multicatalogo.ec',   'Mascarilla Nocturna',     10),
    ('sofia.leon@multicatalogo.ec',    'Serum Anti-Edad Retinol',  5),
    ('sofia.leon@multicatalogo.ec',    'Tónico Purificante',       5),
    ('marco.diaz@multicatalogo.ec',    'Serum Revitalizante',      4),
    ('marco.diaz@multicatalogo.ec',    'Mascarilla Nocturna',      4),
    ('diana.paz@multicatalogo.ec',     'Mascarilla Nocturna',      6);

-- Un pedido por usuario.
INSERT INTO orders (user_id, payment_method_id, shipping_address, city, phone)
SELECT u.id, pm.id, 'Av. Principal s/n', 'La Libertad', '0990000000'
FROM (SELECT DISTINCT email FROM seed_sales) ss
JOIN users u ON u.email = ss.email
JOIN payment_methods pm ON pm.name = 'Tarjeta de crédito';

-- Detalle con el precio vigente como unit_price.
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT o.id, p.id, ss.quantity, p.price
FROM seed_sales ss
JOIN users u    ON u.email = ss.email
JOIN orders o   ON o.user_id = u.id
JOIN products p ON p.name = ss.product;
