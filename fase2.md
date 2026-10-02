# Fase 2: Persistencia Relacional Segura (Tema 3)

Este bloque de instrucciones establece la integración de PostgreSQL como base de datos relacional, eliminando completamente los arreglos en memoria y demostrando persistencia real.

### Configuración del Entorno - Requisitos de Base de Datos

Guarda este bloque como contexto global para la integración de PostgreSQL.

```markdown
# Contexto del Proyecto: Persistencia Relacional (Fase 2 - Tema 3)
Actúas como un desarrollador backend Senior en Go especializando en arquitectura de datos relacional. 
Estamos reemplazando los arreglos en memoria con PostgreSQL para garantizar persistencia real, escalabilidad y seguridad.
El frontend en React permanece sin cambios; los endpoints mantienen sus firmas actuales.

## Reglas de Persistencia
1. **Eliminación de arreglos en memoria:** Todos los datos (usuarios, productos, red MLM) migran a PostgreSQL.
2. **Estructura de tablas:** Seguir normalización relacional con integridad referencial (FK).
3. **Migrations:** Usar archivos SQL versionados en `/database/migrations` para reproducibilidad.
4. **Compatibilidad de API:** Endpoints existentes mantienen sus respuestas JSON idénticas; cambio interno solo.
5. **Transaccionalidad:** Operaciones críticas (login, compra, actualización de red) deben ser ACID-compliant.

```

---

## Instrucciones de Ejecución para la IA (Fase 2)

Copia y pega este texto como requerimiento para ejecutar la Fase 2.

### **Paso 1: Diseño del Esquema de Base de Datos (`database/schema.sql`)**

Crea archivo `/database/schema.sql` con tablas:

1. **Tabla `users`** - Almacena datos de usuario (id, email, password_hash, nombre, referrer_id)
   - PK: id (uuid o serial)
   - FK: referrer_id → users.id (para jerarquía MLM, nullable)
   - UNIQUE: email
   - Índice en email para búsquedas rápidas

2. **Tabla `products`** - Catálogo de productos (id, nombre, descripcion, precio, stock, created_at)
   - PK: id (uuid o serial)
   - Índice en nombre para búsquedas

3. **Tabla `user_products`** - Relación M:N entre usuarios y productos comprados (user_id, product_id, cantidad, fecha_compra)
   - PK compuesta: (user_id, product_id, fecha_compra)
   - FK: user_id → users.id
   - FK: product_id → products.id

4. **Tabla `network_hierarchy`** - Jerarquía MLM (user_id, referrer_id, nivel)
   - Desnormalización opcional para queries rápidas de red
   - FK ambas columnas a users.id

Incluye CREATE statements, tipos de dato seguros (VARCHAR con límites, DECIMAL para precios) y comentarios.

---

### **Paso 2: Configuración de Conexión (`database/db.go` - nuevo archivo)**

Crea `/Backend/database/db.go` con:

1. **Función `InitDB(dsn string) (*sql.DB, error)`**
   - Abre conexión a PostgreSQL usando `database/sql` y driver `github.com/lib/pq`
   - Retorna pool de conexiones abierta
   - Valida conexión con `Ping()`

2. **Función `RunMigrations(db *sql.DB) error`** 
   - Lee y ejecuta `schema.sql` contra la BD
   - Crea tablas si no existen
   - Manejo de errores (no fallar si tablas ya existen)

3. **Estructura `Database`** (opcional)
   - Envuelve `*sql.DB` para métodos helper
   - Métodos para Close, Health check

---

### **Paso 3: Refactorización de Repository (`Backend/repository/repository.go`)**

Reemplaza arreglos globales:

```go
// ANTES (eliminar):
var (
    usuarios = []models.User{ ... }
    productos = []models.Producto{ ... }
    red = []models.Red{ ... }
)

// DESPUÉS (implementar):
type Repository struct {
    db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
    return &Repository{db: db}
}
```

Reemplaza métodos:

1. **`GetProductos() ([]models.Producto, error)`** 
   - Query: `SELECT id, nombre, descripcion, precio, stock FROM products ORDER BY id`
   - Retorna slice de productos desde BD, no en memoria

2. **`GetProductoPorID(id int) (*models.Producto, error)`**
   - Query parametrizada: `SELECT ... WHERE id = $1`
   - Retorna error si no encuentra vs. nil

3. **`GetUsuarios() ([]models.User, error)`**
   - Query: `SELECT id, email, password_hash, nombre, referrer_id FROM users`

4. **`InsertProducto(p models.Producto) error`**
   - INSERT en BD con `Exec` parametrizado
   - Manejar constraint violations (UNIQUE, FK)

5. **`InsertUsuario(u models.User) error`**
   - INSERT en users tabla
   - Hash password antes de guardar (bcrypt)

6. **`InsertCompra(user_id, product_id int, cantidad int) error`**
   - INSERT en user_products
   - Iniciar transacción si decrementa stock automático

---

### **Paso 4: Actualización de Controladores**

Modifica controladores para usar repositorio con BD:

1. **`authController.go` - `Login()`**
   - Query: `SELECT id, nombre, email FROM users WHERE email = $1`
   - Validar password contra password_hash (bcrypt)
   - Retornar error 401 si no coincide

2. **`prodController.go` - `GetProductos()` y `GetProductoPorID()`**
   - Cambiar llamadas de `repo.GetProductos()` a la versión con BD
   - Manejar errores de query (no found vs. server error)

3. **`prodController.go` - `InsertProducto()` (nuevo/existente)**
   - Recibir datos JSON
   - Validar entrada (nombre no vacío, precio > 0)
   - Llamar `repo.InsertProducto()` con BD
   - Retornar error estructurado si falla INSERT (ej: producto duplicado)

---

### **Paso 5: Integración en `main.go` o `routes.go`**

1. Leer variable de entorno `DATABASE_URL` (ej: `postgres://user:pass@localhost:5432/multicatalogo`)
2. Llamar `database.InitDB(dsn)` en startup
3. Llamar `database.RunMigrations(db)` antes de iniciar servidor
4. Inyectar `*sql.DB` en constructor de `Repository`
5. Inyectar `Repository` en todos los controladores

---

### **Paso 6: Validación Visible en Pantalla (Testing Manual)**

**Criterio de aceptación:**

1. **Insertar producto directamente en BD:**
   ```sql
   INSERT INTO products (nombre, descripcion, precio, stock) 
   VALUES ('Nuevo Producto', 'Descripción test', 99.99, 10);
   ```

2. **Recargar rutas en React:**
   - Abrir `/tienda` en navegador
   - El nuevo producto aparece instantáneamente en lista

3. **Persistencia tras reinicio:**
   - Detener servidor Go (`Ctrl+C`)
   - Reiniciar servidor
   - Recargar `/tienda` en React
   - Producto sigue visible (NO se reinicia arreglo en memoria)

4. **Validación de integridad:**
   - Intentar insertar producto sin nombre (validación)
   - Intentar login con email inexistente (error 401)
   - Intentar referrer_id inválido en usuario nuevo (FK constraint)

---

## Configuración Local (Requisito previo)

Asegúrate de:

1. **PostgreSQL instalado y corriendo** (localhost:5432)
2. **Base de datos creada:** `createdb multicatalogo`
3. **Driver Go:** `go get github.com/lib/pq`
4. **Variable de entorno:** 
   ```bash
   export DATABASE_URL="postgres://postgres:password@localhost:5432/multicatalogo"
   ```

---

## Checkpoints de Control

| Checkpoint | Descripción | Validación |
|-----------|------------|-----------|
| 1 | Schema SQL creado y ejecutado | `psql multicatalogo -l` muestra tablas |
| 2 | Conexión BD funciona | `database.InitDB()` no falla en startup |
| 3 | Productos cargan desde BD | GET `/api/productos` retorna datos de BD |
| 4 | Persistencia post-reinicio | Producto agregado via SQL permanece tras restart |
| 5 | Validaciones activas | Insert sin datos requeridos falla con error estructurado |

---

Al completar Fase 2, habrás demostrado persistencia real: los datos no se pierden, la BD es fuente única de verdad, y el sistema es listo para producción multiusuario.
