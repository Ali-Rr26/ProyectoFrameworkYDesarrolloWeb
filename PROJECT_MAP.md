# PROJECT MAP — MultiCatálogo

> Mapa arquitectónico del workspace. Leer ESTE archivo antes de explorar código.
> Proyecto didáctico "MultiCatálogo": tienda de cosméticos con red de ventas
> multinivel (MLM). Asignatura: Framework Programación Web (UPSE, 2026-02).
>
> **Papel de cada documento:** este mapa dice *dónde está cada cosa*;
> `REQUIREMENTS_CHECKLIST.md` el *avance por unidad*; `ANALISIS_FUNCIONAL_U2.md`
> el *porqué* del back-office; `PLAN_IMPLEMENTACION_U2.md` el *backlog* de la rama
> `BackofficeU2`. Convención: identificadores en inglés, textos de UI en español.
>
> Actualizado contra el código de la rama `BackofficeU2` (base `Fase4`, `0ff974f`) — 2026-10-16.

## Visión general

```
React SPA (Vite :5175) ──fetch + JWT──► Go/Fiber API (:4000, env PORT) ──pgx──────► PostgreSQL 16 (host :5434, Docker)
                                              │
                                              ├──go-redis──► Redis (host :6380, Docker) — caché Cache-Aside
                                              └──goroutine──► comisiones multinivel tras cada COMMIT
```

## Ramas

| Rama | Contenido |
|---|---|
| `main` ← `develop` ← `FaseN` | Flujo por PR: cada fase se integra en `develop` y luego en `main` |
| `Fase1`…`Fase4` | Fases de la Unidad 2 (Fase 4: DI + checkout ACID + comisiones en goroutine) |
| `BackofficeU2` | Rama activa: cierre de brechas U1/U2 + back-office MLM (ver plan) |
| `LeccionU1`, `Practica24092026` | Trabajo de clase de la Unidad 1 |

## Documentos raíz

| Archivo | Contenido |
|---|---|
| `PROJECT_MAP.md` | Este archivo. |
| `REQUIREMENTS_CHECKLIST.md` | Avance por Unidad/Tema del sílabo (U1 SPA → U2 Go/Fiber → U3 FastAPI → U4 despliegue). |
| `ANALISIS_FUNCIONAL_U2.md` | Brecha funcional para operar un MLM real dentro de U1+U2. |
| `PLAN_IMPLEMENTACION_U2.md` | Fases checkeables del back-office (rama `BackofficeU2`). |
| `fase1.md`, `fase2.md`, `Fase 2/3/4.ipynb` | Documentos de requerimientos (DRS) de cada fase de la Unidad 2. |
| `Guia_Practica_Tema5_leccion.md` | Guía de la Práctica 03 (U1 Tema 5: interfaces full-screen + flujos MLM). |

---

## Frontend/ — SPA

Stack: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4 + React Router 7.
Comandos: `npm run dev` (:5175, `strictPort`) | `npm run build` | `npm run lint`.
Nombre del paquete: `multicatalogo-frontend`. URL de la API en `VITE_API_URL` (`.env`, plantilla `.env.example`; defecto `http://localhost:4000`).

| Ruta (`src/`) | Responsabilidad |
|---|---|
| `App.tsx` | Router; guardas `ProtectedRoute` (sesión) y `AdminRoute` (rol admin); `CartBoundary` remonta el carrito por usuario. |
| `main.tsx`, `index.css` | Bootstrap de React; Tailwind v4. |
| `context/AuthContext.tsx` | `AuthProvider`: sesión `{user: {email, role}, token, expiresAt}` en **sessionStorage** (`multicatalogo_session`); cierre automático al expirar y ante 401; verifica la sesión con `GET /api/me` al cargar y al volver a la pestaña (cuenta desactivada → login; rol cambiado → se aplica). |
| `context/auth.ts` | `AuthContext`, hook `useAuth` y tipos `Role`/`User` (separados del Provider para Fast Refresh). |
| `context/CartContext.tsx` | `CartProvider`: carrito por usuario en localStorage (`multicatalogo_cart_<email>`), tope por stock. |
| `context/cart.ts` | `CartContext`, hook `useCart` y tipo `CartItem`. |
| `services/apiClient.ts` | Cliente HTTP único (GET/POST/PUT/PATCH/DELETE): `apiFetch` con `Authorization: Bearer` automático, `ApiError{status, message, details}`, `setAuthToken`, `setUnauthorizedHandler`. |
| `services/productService.ts` | `getProducts()`, `getProductById()` → `GET /api/products[/:id]`; `getCategories()` → `GET /api/categories`; admin: `getAdminProducts()`, `createProduct()`, `updateProduct()` (PUT), `deactivateProduct()` (DELETE). |
| `services/networkService.ts` | `getNetwork()` → `GET /api/network` (JWT). |
| `services/payoutService.ts` | `getMyPayouts()`; admin: `getPendingDebts()`, `getPayouts()`, `createPayout()`. |
| `services/commissionService.ts` | `getMyCommissions()` → `GET /api/commissions/mine` (paginado, con totales). |
| `services/userService.ts` | `registerUser()` → `POST /api/users` (público); `getMe()` → `GET /api/me`; `getUsers()` → `GET /api/users`; `updateUser()` → `PATCH /api/users/:id` (admin). |
| `services/orderService.ts` | `createOrder()` → `POST /api/checkout`; `getPaymentMethods()`; `getMyOrders()`, `getOrder()`; admin: `getOrders()`, `updateOrderStatus()`. |
| `data/products.ts` | Tipos `Product` (incluye `stock`, `gallery`, `active`), `ProductInput`, `ProductUpdate`. |
| `data/payouts.ts` | Tipos `Payout`, `PendingDebt`. |
| `data/commissions.ts` | Tipos `CommissionEntry`, `CommissionLedger`; etiquetas y estilos de estado; función pura `inviteLink`. |
| `data/orders.ts` | Tipos `OrderSummary`, `OrderDetail`, `Page<T>`; etiquetas y estilos de estado; función pura `nextStatuses` (mismas transiciones que el backend). |
| `data/users.ts` | Tipos `UserAccount`, `RegisterPayload`, `UpdateUserPayload`. |
| `data/validation.ts` | Funciones puras `isValidEmail`, `PASSWORD_RULES`, `isStrongPassword` (misma lógica que `controllers/validation.go`). |
| `data/network.ts` | Tipos `NetworkNode` (con `referral_code` en la raíz)/`NetworkSummary` + funciones puras: `countNetwork`, `sumNetworkSales`, `getMonthlyCommissions` (lee `summary`), `getRank`. |
| `data/constants.ts` | `API_URL` (desde `import.meta.env.VITE_API_URL`), `COMMISSION_RATES` (10/5/2 %), `RANKS`, `ROLE_LABELS`, `LEVEL_STYLES`. |
| `constants/ui.ts` | Constantes visuales compartidas. |
| `vite-env.d.ts` | Tipado de `import.meta.env` (`VITE_API_URL`). |
| `components/Login.tsx` | `/login` — muestra `ApiError.message`; redirige: admin → `/`, cliente → `/store`; enlace "Crear cuenta" y aviso tras registrarse. |
| `components/Register.tsx` | `/register` (público) — nombre, email, contraseña (reglas que se marcan al escribir) y código de referido (precargado desde `?ref=`); errores por campo; luego `/login`. |
| `components/Storefront.tsx` | `/store` — hero full-screen, categorías, destacados, plan MLM. |
| `components/Catalog.tsx` | `/catalog` — búsqueda + filtro `?category=` (useSearchParams), aviso de stock. |
| `components/ProductDetail.tsx` | `/product/:id` — detalle + galería con lightbox (Escape cierra). |
| `components/Cart.tsx` | `/cart` — cantidades con tope de stock, total. |
| `components/Checkout.tsx` | `/checkout` — formulario → `POST /api/checkout`; muestra `ApiError` (409 stock, 422 referencia). |
| `components/Confirmation.tsx` | `/confirmation` — resumen con datos devueltos por el servidor (router state) y acceso a "Ver mis pedidos". |
| `components/MyOrders.tsx` | `/my-orders` (todos los roles) — historial paginado del usuario con detalle expandible. |
| `components/AdminPayouts.tsx` | `/admin/payouts` (**solo admin**) — deuda por distribuidor (lista para liquidar y en espera de entrega) con botón "Liquidar" (con confirmación) e historial de pagos paginado. |
| `components/AdminOrders.tsx` | `/admin/orders` (**solo admin**) — todos los pedidos, filtro por estado y cambio de estado (cancelar pide confirmación). |
| `components/OrderCard.tsx`, `Pagination.tsx` | Tarjeta de pedido (detalle al expandir, acciones del admin) y paginación reutilizables. |
| `components/Dashboard.tsx` | `/` (**solo admin**) — KPIs calculados en el cliente sobre `GET /api/network`. |
| `components/MyNetwork.tsx` | `/my-network` (todos los roles) — árbol multinivel, comisión por nodo y `summary`; en la red propia, link de invitación y paneles de comisiones y cobros; aviso si la cuenta no está afiliada. |
| `components/InviteLink.tsx` | Código de referido y link `/register?ref=CODIGO` con botón copiar. |
| `components/CommissionsPanel.tsx` | "Mis comisiones": totales por estado y ledger paginado. |
| `components/PayoutsPanel.tsx` | "Mis cobros": liquidaciones recibidas (fecha, monto, comisiones), paginado. |
| `components/AdminProducts.tsx` | `/admin/products` (**solo admin**) — todos los productos (activos e inactivos); crear, editar, dar de baja y reactivar con confirmación. |
| `components/ProductForm.tsx` | Formulario de alta/edición de productos (un campo por fila; categorías desde la API; galería como una URL por línea). |
| `components/AdminUsers.tsx` | `/admin/users` (**solo admin**) — cuentas con rol, estado, código y patrocinador; cambio de rol y activar/desactivar (no sobre la propia cuenta). |
| `components/Layout.tsx` (alto `h-dvh`; `<main>` relativo y con scroll propio), `Navbar.tsx`, `Sidebar.tsx`, `CustomSelect.tsx` | Shell: sidebar colapsable (Dashboard, Tienda, Catálogo, Mis Pedidos, Mi Red, Pedidos, Liquidaciones, Productos, Usuarios; las de admin se filtran por rol), navbar con carrito/avatar/logout, select personalizado. |

---

## Backend/ — API REST (Go/Fiber)

Stack: Go 1.26 + Fiber v2 + pgx v5 (`database/sql`) + go-redis v9 + golang-jwt v5 + bcrypt + godotenv.
Comandos: `docker compose up -d` (Postgres + Redis + API) | `docker compose up -d postgres redis` + `go run .` | `go test ./...`.
Capas: `routes` → `controllers` (structs con interfaces de `ports.go`) → `services` / `repository` → PostgreSQL; `cache` envuelve Redis.

| Ruta | Responsabilidad |
|---|---|
| `main.go` | Entry point (`/api healthcheck` = modo sonda para Docker) y **ensamblado de la DI**: config → pool → migraciones → Redis → JWT → `Repository` → `RedisCache` → `NetworkCacheInvalidator` → `CommissionService` (+ `RecoverPending`) → controladores; CORS; apagado ordenado que espera las goroutines. |
| `config/config.go` | `Load()` desde env/.env: `DATABASE_URL`, `REDIS_URL`, `PORT` (def. 4000), `APP_ENV` (`dev` muestra detalles técnicos; def. `production`), `CORS_ORIGIN`, `NETWORK_ROOT_EMAIL`, `JWT_SECRET` (obligatorio), `JWT_TTL` (def. 2h), `CHECKOUT_FAIL_AT`, `CHECKOUT_COMMIT_DELAY`. |
| `healthcheck.go` | Sonda del contenedor: `GET /api/health` en `$PORT`; sale con 0 si responde 200 (`ok`/`degraded`) y 1 si no. |
| `config/redis.go` | `NewRedisClient`: timeouts cortos; si Redis no responde solo avisa (la API sigue sin caché). |
| `auth/jwt.go` | `Manager`: firma/valida HS256, claims `{sub, email, role, iss, iat, nbf, exp}`, secreto ≥32 caracteres. |
| `database/db.go` | Pool pgx (25 conexiones, ping al arrancar). |
| `database/migrate.go` | Migraciones embebidas (`go:embed`), tabla `schema_migrations`, una transacción por archivo, bloqueo consultivo. |
| `database/migrations/0001_schema.sql` | Esquema 3FN: `roles`, `users`, `network_members` (+ trigger anticiclos), `categories`, `products`, `product_images`, `payment_methods`, `orders`, `order_items` (+ trigger de stock `fn_order_items_stock`), vistas `v_order_totals`, `v_user_sales`; pgcrypto. |
| `database/migrations/0002_seed.sql` | Seed: 9 usuarios (contraseña `123456`, bcrypt vía `crypt()`), red, productos, pedidos. |
| `database/migrations/0003_commissions.sql` | `commission_rates` (10/5/2 %), ledger `commissions` (`UNIQUE(order_id, level)`), vista `v_user_commissions`, comisiones del seed. |
| `database/migrations/0004_backoffice.sql` | Base del back-office: `network_members.referral_code` (generado por trigger), `products.active` (baja lógica; el trigger de stock rechaza inactivos), `orders.status` (`pending`…`cancelled`), `commissions.status` + `payout_id`, tabla `payouts`; `v_user_commissions` excluye revertidas. |
| `models/payouts.go` | `Payout`, `PendingDebt`, `CreatePayoutRequest`. |
| `models/commissions.go` | `CommissionEntry`, `CommissionTotals`, `CommissionLedger` (página + totales). |
| `models/orders.go` | Estados del pedido y reglas puras de transición (`OrderTransitionAllowed`, `NextOrderStatuses`), `Page[T]`, `OrderSummary`, `OrderDetail`, `OrderFilter`. |
| `models/models.go` | `LoginRequest`, `Product`, `ProductInput`, `ProductUpdate`, `User` (hash con `json:"-"`), `RegisterRequest` (`sponsor_id` o `referral_code`), `UpdateUserRequest`, `NetworkNode` (con `referral_code`)/`NetworkSummary`, `CreateOrderRequest`/`OrderItemInput`, `Order`/`OrderItem`, `PendingCommission`, `APIError`. |
| `routes/routes.go` | `SetupRoutes(app, Controllers)`; middleware por ruta (públicas nunca pasan por auth). |
| `controllers/ports.go` | Interfaces por consumidor: `ProductRepository`, `NetworkRepository`, `OrderRepository`, `UserRepository`, `CredentialRepository`, `Pinger`, `OrderQueryRepository`, `CommissionQueryRepository`, `PayoutRepository`, `AccountLookup`, `TokenIssuer`, `TokenParser`, `NetworkInvalidator`, `CommissionProcessor`. |
| `controllers/middleware.go` | `AuthMiddleware.RequireAuth` (Bearer → verifica en la base que la cuenta siga activa y toma su rol vigente → claims y cuenta en `Locals`) y `RequireRole(...)`. |
| `controllers/validation.go` | Funciones puras `validEmail`, `passwordProblems` (contraseña fuerte), `validateProductInput` y `validateProductUpdate`. |
| `controllers/helpers.go` | `apiError`, `pagination` (`?page`, `?limit` 1–50), `repoError` (errores de dominio → 400/404/409/422/503/500; detalle técnico solo con `APP_ENV=dev`), middleware `ErrorDetails`, `dbCtx` (timeout 5 s). |
| `controllers/authController.go` | `POST /api/login` — bcrypt + hash ficticio (anti-enumeración), 401 genérico; `GET /api/me` — cuenta autenticada vigente. |
| `controllers/productController.go` | Catálogo público con Cache-Aside `productos:all` (5 min, solo activos), `GET /api/categories`; admin: listado completo, `POST`, `PUT` (edición parcial/reactivación) y `DELETE` (baja lógica), invalidando la caché. |
| `controllers/networkController.go` | `GET /api/network` — red del token (admin: `?user_id=` o `NETWORK_ROOT_EMAIL`); Cache-Aside `red:tree:{email}` (10 min); "Tú" se personaliza tras la caché. |
| `controllers/checkoutController.go` | `POST /api/checkout` (+ alias `/api/orders`) y `GET /api/payment-methods`; comprador del JWT; cantidad ≤0 → 400 propio; tras COMMIT invalida caché y lanza comisiones. |
| `controllers/payoutController.go` | `POST /api/payouts`, `GET /api/payouts` y `GET /api/reports/pending-commissions` (admin); `GET /api/payouts/mine`. |
| `controllers/commissionController.go` | `GET /api/commissions/mine` — ledger del usuario del token. |
| `controllers/orderController.go` | `GET /api/orders/mine`, `GET /api/orders/:id` (dueño o admin), `GET /api/orders` y `PATCH /api/orders/:id/status` (admin; al cancelar invalida catálogo y red del comprador). |
| `controllers/userController.go` | `POST /api/users` (registro público; patrocinador por `sponsor_id` o `referral_code`; siempre queda afiliado), `GET /api/users` y `PATCH /api/users/:id` (admin: rol y `active`, nunca sobre sí mismo). |
| `controllers/healthController.go` | `GET /api/health` (ping a ambas dependencias: `ok`, `degraded` si cae Redis, 503 si cae PostgreSQL), `/api/health/db` y `/api/health/redis` (503 si cae). |
| `repository/` | Única capa con SQL: `products.go` (catálogo activo, listado admin, edición con bloqueo de fila, baja lógica, categorías), `users.go` (alta con afiliación, `UpdateUser`, `GetUserByID`), `network.go` (árbol `WITH RECURSIVE` + upline; comisiones sin revertidas), `orders.go` (transacción ACID + fallas simuladas), `order_queries.go` (listado paginado, detalle, cambio de estado y cancelación ACID), `commission_queries.go` (ledger del beneficiario con totales), `payouts.go` (liquidación de comisiones de pedidos entregados en transacción con bloqueo pedidos → comisiones, historial y deuda por distribuidor), `commissions.go` (inserción recursiva idempotente bajo `FOR SHARE` del pedido; ignora cancelados), `catalogs.go`, `errors.go` (SQLSTATE → `ErrNotFound`, `ErrDuplicate`, `ErrInvalidRef`, `ErrConstraint`, `ErrInsufficientStock`, `ErrInvalidQuantity`, `ErrProductInactive`, `ErrInvalidReferral`, `ErrInvalidTransition`, `ErrCommissionsPaid`, `ErrNothingToPay`; `DomainError.Public` marca el detalle apto para el usuario). |
| `services/commissions.go` | `CommissionService`: `ProcessAsync` (goroutine con contexto propio, recover), `RecoverPending`, `Shutdown` (WaitGroup). |
| `services/network_cache.go` | `NetworkCacheInvalidator`: borra `red:tree:*` del usuario y su upline (3 niveles). |
| `cache/cache.go`, `cache/redis.go` | Interfaz `Cache` + `GetOrLoad` genérico (HIT/MISS/BYPASS en `X-Cache`) + `Delete`; `RedisCache` la implementa. |
| `*_test.go` | `cache`, `config`, `controllers` (checkout, commission, health, helpers, middleware, order, payout, product, user, validation), `models` (orders), `services/commissions` — con dobles de prueba, sin BD ni Redis. |
| `Dockerfile`, `docker-compose.yml` | Imagen multi-etapa (binario estático en alpine) con `HEALTHCHECK`; compose con Postgres 16 + Redis + API, volumen `pgdata`, healthchecks en los tres servicios. |
| `.env` (gitignored) / `.env.example` | Variables de `config.go`; `POSTGRES_PORT`, `REDIS_PORT`, `API_PORT` para compose. |

## Endpoints

| Método y ruta | Acceso | Respuesta |
|---|---|---|
| `POST /api/login` | Público | `{token, email, role, expires_at}` |
| `GET /api/products`, `GET /api/products/:id` | Público | Catálogo / producto activos (`X-Cache`) |
| `GET /api/categories` | Público | Nombres de las categorías |
| `POST /api/users` | Público | Usuario creado (rol `customer`, afiliado y con su `referral_code`) |
| `GET /api/health`, `/api/health/db`, `/api/health/redis` | Público | `{status, database, redis}` (`ok` / `degraded` / `error`) / estado de cada dependencia |
| `GET /api/me` | JWT | Cuenta autenticada vigente (`401` si fue desactivada) |
| `GET /api/payouts/mine` | JWT | Cobros del distribuidor (paginado) |
| `GET /api/commissions/mine` | JWT | Ledger paginado del usuario + `totals` (pending, paid, reversed) |
| `GET /api/network` | JWT | Árbol con `commission` por nodo; `referral_code` y `summary` en la raíz |
| `GET /api/payment-methods` | JWT | Lista de métodos de pago |
| `POST /api/checkout` (alias `POST /api/orders`) | JWT | `201 {id, created_at, status, total, items}` |
| `GET /api/orders/mine`, `GET /api/orders/:id` | JWT | Pedidos propios paginados / detalle (dueño o admin; ajeno → 404) |
| `GET /api/users`, `POST /api/products` | JWT + admin | Listado de usuarios (con `referral_code`) / producto creado |
| `GET /api/orders`, `PATCH /api/orders/:id/status` | JWT + admin | Todos los pedidos (`?status=`) / cambio de estado (cancelar repone stock y revierte comisiones) |
| `GET /api/reports/pending-commissions` | JWT + admin | Deuda por distribuidor: `ready_*` (pedidos entregados) y `waiting_*` (en espera) |
| `POST /api/payouts`, `GET /api/payouts` | JWT + admin | Liquidar las comisiones de pedidos entregados de un distribuidor (`409` si no hay) / historial de pagos |
| `GET /api/admin/products` | JWT + admin | Todos los productos, incluidos los dados de baja |
| `PUT /api/products/:id`, `DELETE /api/products/:id` | JWT + admin | Producto editado o reactivado / dado de baja (`active: false`) |
| `PATCH /api/users/:id` | JWT + admin | Usuario actualizado (`role` y/o `active`) |

## Datos y contratos clave

- Errores: siempre `{"status": N, "message": "...", "details"?}` (`APIError`); los detalles técnicos solo con `APP_ENV=dev`.
- Checkout: `{payment_method, shipping_address, city, phone, items: [{product_id, quantity}]}`; el comprador sale del JWT, el precio y el total los calcula el servidor; cantidad ≤0 → 400 "cantidad debe ser mayor que cero", stock insuficiente → 409, producto dado de baja → 422 "Producto no disponible", producto/método inexistente → 422. Los pedidos nacen en `pending`.
- Comisiones: nivel 1 = 10 %, 2 = 5 %, 3 = 2 % del total del pedido, al patrocinador correspondiente (el comprador nunca cobra por su propia compra); solo se liquidan las de pedidos entregados; una fila por `(order_id, level)` en `commissions`, con estado `pending` / `paid` (con `payout_id`) / `reversed`.
- Cuentas demo (contraseña `123456`): `admin@upse.edu.ec` (admin), `cliente@upse.edu.ec` (raíz de la red) y 7 miembros `@multicatalogo.ec` (`diana.paz` es nivel 3).

## Notas operativas

- Puertos del host: PostgreSQL **5434** (5432 = Postgres local, 5433 = otro proyecto), Redis **6380** (6379 ocupado por un Redis local; `REDIS_PORT=6380` en `.env`), API **4000** (3000 ocupado por otro proyecto), Vite **5175**.
- Caché: `productos:all` (5 min) y `red:tree:{email}` (10 min); sin Redis la API responde desde PostgreSQL (`X-Cache: BYPASS`). Checkout, alta/edición/baja de productos y alta/edición de usuarios invalidan las claves afectadas.
- Demostración del ROLLBACK: `CHECKOUT_FAIL_AT=after_order|after_items` o `CHECKOUT_COMMIT_DELAY=10s` + `docker kill multicatalogo-db`. Desactivadas por defecto; nunca fuera de clase.
- Seguridad vigente: bcrypt, contraseña fuerte en el registro, JWT HS256 (2h por defecto) verificado contra la cuenta en cada petición (desactivación y cambio de rol inmediatos), rutas protegidas por rol, errores sanitizados fuera de desarrollo, identidad del comprador desde el token, cuentas inactivas rechazadas en login y checkout.
- Brechas abiertas (ver checklist y plan): verificación visual a 375px y recorrido en navegador de las vistas de las fases 2, 3, 5 y 6, y back-office (fases 7–8 del plan).
