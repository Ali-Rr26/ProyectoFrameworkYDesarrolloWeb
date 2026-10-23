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
> Actualizado contra el código de la rama `BackofficeU2` (base `Fase4`, `0ff974f`) — 2026-10-16;
> PWA offline-first (`PLAN_PWA.md`, fases 0–10) — 2026-10-23.

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
| `PLAN_PWA.md` | Plan de la PWA offline-first (decisiones D1–D13 y fases 0–10). |
| `fase1.md`, `fase2.md`, `Fase 2/3/4.ipynb` | Documentos de requerimientos (DRS) de cada fase de la Unidad 2. |
| `Guia_Practica_Tema5_leccion.md` | Guía de la Práctica 03 (U1 Tema 5: interfaces full-screen + flujos MLM). |

---

## Frontend/ — SPA

Stack: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4 + React Router 7.
Comandos: `npm run dev` (:5175, `strictPort`) | `npm run build` | `npm run preview` (:4173, donde corre el service worker) | `npm run lint` | `npm run test` (Vitest) | `npm run icons`.
Nombre del paquete: `multicatalogo-frontend`. URL de la API en `VITE_API_URL` (`.env`, plantilla `.env.example`; defecto `http://localhost:4000`).

| Ruta (`src/`) | Responsabilidad |
|---|---|
| `App.tsx` | Router; guardas `ProtectedRoute` (sesión) y `AdminRoute` (rol admin); `CartBoundary` remonta el carrito por usuario. |
| `main.tsx`, `index.css` | Bootstrap de React; Tailwind v4. |
| `context/AuthContext.tsx` | `AuthProvider`: sesión `{user: {email, role}, token, expiresAt}` en **sessionStorage** (`multicatalogo_session`); cierre automático al expirar y ante 401; verifica la sesión con `GET /api/me` al cargar y al volver a la pestaña (cuenta desactivada → login; rol cambiado → se aplica). |
| `context/auth.ts` | `AuthContext`, hook `useAuth` y tipos `Role`/`User` (separados del Provider para Fast Refresh). |
| `context/CartContext.tsx` | `CartProvider`: carrito por usuario en localStorage (`multicatalogo_cart_<email>`), tope por stock. |
| `context/cart.ts` | `CartContext`, hook `useCart` y tipo `CartItem`. |
| `services/apiClient.ts` | Cliente HTTP único (GET/POST/PUT/PATCH/DELETE): `apiFetch` con `Authorization: Bearer` automático, `ApiError{status, message, details}`, `setAuthToken`, `setUnauthorizedHandler`, `listQuery` (`?page&limit` + filtros no vacíos). |
| `services/productService.ts` | `getProducts()`, `getProductById()` → `GET /api/products[/:id]`; `getCategories()` → `GET /api/categories`; admin: `getAdminProducts(page, limit, q)` (`Page`), `createProduct()`, `updateProduct()` (PUT), `deactivateProduct()` (DELETE). |
| `services/networkService.ts` | `getNetwork()` → `GET /api/network` (JWT). |
| `services/reportService.ts` | `getSummary()`, `getTopProducts()`, `getTopSponsors()` → `/api/reports/*` (admin), con `?range=` o `?from&to`. |
| `services/payoutService.ts` | `getMyPayouts()`; admin: `getPendingDebts()`, `getPayouts()`, `createPayout()`. |
| `services/commissionService.ts` | `getMyCommissions()` → `GET /api/commissions/mine` (paginado, con totales). |
| `services/userService.ts` | `registerUser()` → `POST /api/users` (público); `getMe()` → `GET /api/me`; `getUsers(page, limit, q)` → `GET /api/users` (`Page`); `updateUser()` → `PATCH /api/users/:id` (admin). |
| `services/orderService.ts` | `createOrder()` → `POST /api/checkout`; `getPaymentMethods()`; `getMyOrders()`, `getOrder()`; admin: `getOrders()`, `updateOrderStatus()`. |
| `data/products.ts` | Tipos `Product` (incluye `stock`, `gallery`, `active`), `ProductInput`, `ProductUpdate`. |
| `data/reports.ts` | Tipos `SalesSummary`, `TopProduct`, `TopSponsor`; periodos del selector (`RangePreset`, `RANGE_LABELS`) y funciones puras `presetDays`, `money`. |
| `data/dates.ts` | Funciones puras de fecha en la zona del negocio: `formatDateTime`, `formatDate`, `todayIn`, `addDays`, `formatDay`. |
| `data/payouts.ts` | Tipos `Payout`, `PendingDebt`. |
| `data/commissions.ts` | Tipos `CommissionEntry`, `CommissionLedger`; etiquetas y estilos de estado; función pura `inviteLink`. |
| `data/orders.ts` | Tipos `OrderSummary`, `OrderDetail`, `Page<T>`; etiquetas y estilos de estado; función pura `nextStatuses` (mismas transiciones que el backend). |
| `data/users.ts` | Tipos `UserAccount`, `RegisterPayload`, `UpdateUserPayload`. |
| `data/validation.ts` | Funciones puras `isValidEmail`, `PASSWORD_RULES`, `isStrongPassword` (misma lógica que `controllers/validation.go`). |
| `data/network.ts` | Tipos `NetworkNode` (con `referral_code` en la raíz)/`NetworkSummary` + funciones puras: `countNetwork`, `sumNetworkSales`, `getMonthlyCommissions` (lee `summary`), `getRank`. |
| `data/constants.ts` | `API_URL` (desde `import.meta.env.VITE_API_URL`), `BUSINESS_TIMEZONE` (`VITE_BUSINESS_TIMEZONE`, debe coincidir con `APP_TIMEZONE`), `COMMISSION_RATES` (10/5/2 %), `RANKS`, `ROLE_LABELS`, `LEVEL_STYLES`. |
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
| `components/Dashboard.tsx` | `/` (**solo admin**) — reportes del backend para el periodo elegido (Últimos 30 días por defecto; Este mes, Hoy o Personalizado, con las fechas siempre cargadas y el periodo en la URL): ventas, pedidos, ticket promedio, comisiones devengadas, cancelados, nuevos afiliados, comisiones por liquidar, top productos y top patrocinadores. |
| `components/MyNetwork.tsx` | `/my-network` (todos los roles) — árbol multinivel, comisión por nodo y `summary`; en la red propia, link de invitación y paneles de comisiones y cobros; aviso si la cuenta no está afiliada. |
| `components/InviteLink.tsx` | Código de referido y link `/register?ref=CODIGO` con botón copiar. |
| `components/CommissionsPanel.tsx` | "Mis comisiones": totales por estado y ledger paginado. |
| `components/PayoutsPanel.tsx` | "Mis cobros": liquidaciones recibidas (fecha, monto, comisiones), paginado. |
| `components/AdminProducts.tsx` | `/admin/products` (**solo admin**) — productos paginados (activos e inactivos) con búsqueda por nombre o categoría; crear, editar, dar de baja y reactivar con confirmación. |
| `components/ProductForm.tsx` | Formulario de alta/edición de productos (un campo por fila; categorías desde la API; galería como una URL por línea). |
| `components/SearchInput.tsx`, `hooks/useDebouncedValue.ts` | Campo de búsqueda de los listados admin y hook que espera 300 ms sin cambios antes de consultar `?q=`. |
| `components/AdminUsers.tsx` | `/admin/users` (**solo admin**) — cuentas paginadas con búsqueda por nombre, correo o código; rol, estado, código y patrocinador; cambio de rol y activar/desactivar (no sobre la propia cuenta). |
| `components/Layout.tsx` (alto `h-dvh`; `<main>` relativo y con scroll propio; áreas seguras `safe-area-inset`), `Navbar.tsx`, `Sidebar.tsx`, `CustomSelect.tsx` | Shell: sidebar colapsable (Dashboard, Tienda, Catálogo, Mis Pedidos, Mi Red, **Pendientes** con contador si hay, Pedidos, Liquidaciones, Productos, Usuarios; las de admin se filtran por rol), navbar con `SyncIndicator`, carrito y menú del avatar ("Instalar app", cerrar sesión con confirmación si hay pendientes), select personalizado. |

### PWA offline-first (ver `PLAN_PWA.md`)

`vite-plugin-pwa` en modo `injectManifest` (SW propio con Workbox), IndexedDB con Dexie y
outbox con `Idempotency-Key`. El SW **no** guarda datos privados: lo privado vive en IndexedDB, por usuario.

| Ruta | Responsabilidad |
|---|---|
| `src/sw.ts` (+ `tsconfig.sw.json`) | Service worker: precache del build, `NavigationRoute` a `index.html` (salvo `/api`), catálogo público `NetworkFirst` (`api-catalog`), imágenes `CacheFirst` (`images`, 60), `SKIP_WAITING`, Background Sync `outbox` → avisa a las pestañas (`SYNC_OUTBOX`). |
| `src/pwa/cacheRules.ts` | Reglas puras de qué se cachea (`isPublicCatalogRequest`, `isImageRequest`); nada con `Authorization` ni métodos de escritura. |
| `src/pwa/installPrompt.ts`, `src/pwa/updatePolicy.ts` | Captura de `beforeinstallprompt` (importado en `main.tsx`) + `useInstallPrompt`; reglas puras `shouldOfferReload` y `detectIOS`. |
| `src/constants/pwa.ts`, `pwa-assets.config.ts`, `public/` | `PWA_IDENTITY` (nombre, colores, `start_url`) para manifest e `index.html`; íconos generados desde `public/favicon.svg`. |
| `src/offline/db.ts` | `OfflineDB` (Dexie, `multicatalogo`): v1 `products`, `meta`, `drafts`, `outbox`; v2 `snapshots`. |
| `src/offline/catalogStore.ts`, `useCatalog.ts`, `paymentMethods.ts` | Catálogo local (refresco completo, una sola petición simultánea) leído con `useLiveQuery` por `Storefront`/`Catalog`/`ProductDetail`; métodos de pago con copia local. |
| `src/offline/drafts.ts`, `useDraft.ts`, `userData.ts` | Borradores de formularios por usuario (`Checkout`, `ProductForm`, `Register`; nunca contraseñas); `countPending`, `clearUserData` (cierre de sesión manual), `requestPersistentStorage`. |
| `src/offline/outbox.ts`, `syncPolicy.ts`, `syncEngine.ts`, `syncMessages.ts` | Outbox (`enqueue`, `sendOrQueue`, `recordConflict`), clasificador de errores con backoff (`classifySyncError`), motor FIFO por usuario con Web Locks (`runSync`/`syncOutbox`), constantes compartidas con el SW. |
| `src/offline/OutboxProvider.tsx`, `outboxContext.ts` | Disparadores de la sincronización (arranque, login, `online`, nuevo pendiente, SW, reintento) y precarga de catálogo y métodos de pago; hook `useOutbox`. |
| `src/offline/conflicts.ts`, `resolve.ts`, `cartRecovery.ts` | Resolución de conflictos: comparación a tres bandas de productos, `canApplyStatus`, `rebuildCart`; `requeueEntry`/`discardEntry`; `recoverCart`. |
| `src/offline/snapshots.ts`, `snapshotStatus.ts`, `src/services/snapshotClient.ts` | Instantáneas de solo lectura de datos privados por usuario (7 días, máx. 200; nunca ante 401/403); `snapshotGet` en los GET privados de los servicios. |
| `src/hooks/useOnlineStatus.ts` | Estado de red del navegador (`useSyncExternalStore`). |
| `components/PendingSync.tsx`, `ProductConflictPanel.tsx` | `/pending` ("Pendientes de envío"): estado de cada pendiente y acciones (revisar en el carrito, combinar, aplicar de todos modos, reintentar, descartar). |
| `components/SyncIndicator.tsx`, `ConnectionBanner.tsx`, `OfflineDataBanner.tsx`, `ReloadPrompt.tsx` | Botón "Sincronizar (N)" y "N por revisar"; franja "Sin conexión"; aviso "datos guardados el {fecha}"; registro del SW y aviso "Nueva versión disponible" (montado en la raíz de `App`). |
| `src/**/*.test.ts` | Vitest (`environment: node`, `fake-indexeddb`): reglas de caché, catálogo, borradores, outbox, motor, conflictos, instantáneas, políticas de actualización. |
| `Dockerfile`, `.dockerignore` | Imagen de producción: build de Vite (las `VITE_*` llegan como `build.args`) servido por Caddy. |

---

## Backend/ — API REST (Go/Fiber)

Stack: Go 1.26 + Fiber v2 + pgx v5 (`database/sql`) + go-redis v9 + golang-jwt v5 + bcrypt + godotenv.
Comandos: `docker compose up -d` (Postgres + Redis + API) | `docker compose up -d postgres redis` + `go run .` | `go test ./...`.
Capas: `routes` → `controllers` (structs con interfaces de `ports.go`) → `services` / `repository` → PostgreSQL; `cache` envuelve Redis.

| Ruta | Responsabilidad |
|---|---|
| `main.go` | Entry point (`/api healthcheck` = modo sonda para Docker) y **ensamblado de la DI**: config → pool → migraciones → Redis → JWT → `Repository` → `RedisCache` → `NetworkCacheInvalidator` → `CommissionService` (+ `RecoverPending`) → controladores; CORS; apagado ordenado que espera las goroutines. |
| `config/config.go` | `Load()` desde env/.env: `DATABASE_URL`, `REDIS_URL`, `PORT` (def. 4000), `APP_TIMEZONE` (zona del negocio para los reportes; def. `America/Guayaquil`), `APP_ENV` (`dev` muestra detalles técnicos; def. `production`), `CORS_ORIGIN`, `NETWORK_ROOT_EMAIL`, `JWT_SECRET` (obligatorio), `JWT_TTL` (def. 2h), `CHECKOUT_FAIL_AT`, `CHECKOUT_COMMIT_DELAY`. |
| `healthcheck.go` | Sonda del contenedor: `GET /api/health` en `$PORT`; sale con 0 si responde 200 (`ok`/`degraded`) y 1 si no. |
| `config/redis.go` | `NewRedisClient`: timeouts cortos; si Redis no responde solo avisa (la API sigue sin caché). |
| `auth/jwt.go` | `Manager`: firma/valida HS256, claims `{sub, email, role, iss, iat, nbf, exp}`, secreto ≥32 caracteres. |
| `database/db.go` | Pool pgx (25 conexiones, ping al arrancar). |
| `database/migrate.go` | Migraciones embebidas (`go:embed`), tabla `schema_migrations`, una transacción por archivo, bloqueo consultivo. |
| `database/migrations/0001_schema.sql` | Esquema 3FN: `roles`, `users`, `network_members` (+ trigger anticiclos), `categories`, `products`, `product_images`, `payment_methods`, `orders`, `order_items` (+ trigger de stock `fn_order_items_stock`), vistas `v_order_totals`, `v_user_sales`; pgcrypto. |
| `database/migrations/0002_seed.sql` | Seed: 9 usuarios (contraseña `123456`, bcrypt vía `crypt()`), red, productos, pedidos. |
| `database/migrations/0003_commissions.sql` | `commission_rates` (10/5/2 %), ledger `commissions` (`UNIQUE(order_id, level)`), vista `v_user_commissions`, comisiones del seed. |
| `database/migrations/0005_orders_created_index.sql` | Índice `orders(created_at)` para los reportes por rango de fecha. |
| `database/migrations/0006_sync.sql` | Sincronización offline: `products.version`/`updated_at` (trigger que sube la versión en cada `UPDATE`, incluidas las ventas) y `idempotency_keys` (PK `user_id, key`). |
| `database/migrations/0004_backoffice.sql` | Base del back-office: `network_members.referral_code` (generado por trigger), `products.active` (baja lógica; el trigger de stock rechaza inactivos), `orders.status` (`pending`…`cancelled`), `commissions.status` + `payout_id`, tabla `payouts`; `v_user_commissions` excluye revertidas. |
| `models/reports.go` | `DateRange`, `ResolvedRange`, periodos `Range*`, `SalesSummary`, `TopProduct`, `TopSponsor`. |
| `models/payouts.go` | `Payout`, `PendingDebt`, `CreatePayoutRequest`. |
| `models/commissions.go` | `CommissionEntry`, `CommissionTotals`, `CommissionLedger` (página + totales). |
| `models/orders.go` | Estados del pedido y reglas puras de transición (`OrderTransitionAllowed`, `NextOrderStatuses`), `Page[T]`, `ListFilter` (`?q` + página), `OrderSummary`, `OrderDetail`, `OrderFilter`. |
| `models/models.go` | `LoginRequest`, `Product`, `ProductInput`, `ProductUpdate`, `User` (hash con `json:"-"`), `RegisterRequest` (`sponsor_id` o `referral_code`), `UpdateUserRequest`, `NetworkNode` (con `referral_code`)/`NetworkSummary`, `CreateOrderRequest`/`OrderItemInput`, `Order`/`OrderItem`, `PendingCommission`, `APIError`. |
| `routes/routes.go` | `SetupRoutes(app, Controllers)`; middleware por ruta (públicas nunca pasan por auth). |
| `controllers/ports.go` | Interfaces por consumidor: `ProductRepository`, `NetworkRepository`, `OrderRepository`, `UserRepository`, `CredentialRepository`, `Pinger`, `OrderQueryRepository`, `CommissionQueryRepository`, `PayoutRepository`, `ReportRepository`, `AccountLookup`, `TokenIssuer`, `TokenParser`, `NetworkInvalidator`, `CommissionProcessor`. |
| `controllers/middleware.go` | `AuthMiddleware.RequireAuth` (Bearer → verifica en la base que la cuenta siga activa y toma su rol vigente → claims y cuenta en `Locals`) y `RequireRole(...)`. |
| `controllers/validation.go` | Funciones puras `validEmail`, `passwordProblems` (contraseña fuerte), `validateProductInput` y `validateProductUpdate`. |
| `controllers/idempotency.go` | Middleware `Idempotency` (tras `RequireAuth`) en checkout, alta/edición de productos y cambio de estado: repite la respuesta guardada de una `Idempotency-Key` ya usada (`Idempotent-Replayed: true`), `422` si cambió la petición; la clave nueva viaja en el `context` y el repositorio la registra en la misma transacción. |
| `controllers/helpers.go` | `apiError`, `pagination` (`?page`, `?limit` 1–50), `listFilter` (paginación + `?q=` hasta 100 caracteres), `repoError` (errores de dominio → 400/404/409/422/503/500; detalle técnico solo con `APP_ENV=dev`), middleware `ErrorDetails`, `dbCtx` (timeout 5 s). |
| `controllers/authController.go` | `POST /api/login` — bcrypt + hash ficticio (anti-enumeración), 401 genérico; `GET /api/me` — cuenta autenticada vigente. |
| `controllers/productController.go` | Catálogo público con Cache-Aside `productos:all` (5 min, solo activos), `GET /api/categories`; admin: listado paginado con `?q=` (sin caché), `POST`, `PUT` (edición parcial/reactivación) y `DELETE` (baja lógica), invalidando la caché. |
| `controllers/networkController.go` | `GET /api/network` — red del token (admin: `?user_id=` o `NETWORK_ROOT_EMAIL`); Cache-Aside `red:tree:{email}` (10 min); "Tú" se personaliza tras la caché. |
| `controllers/checkoutController.go` | `POST /api/checkout` (+ alias `/api/orders`) y `GET /api/payment-methods`; comprador del JWT; cantidad ≤0 → 400 propio; tras COMMIT invalida caché y lanza comisiones. |
| `controllers/reportController.go` | `GET /api/reports/summary`, `/top-products`, `/top-sponsors` (admin); periodo con las funciones puras `resolveRange` y `parseDateRange` en la zona del negocio. |
| `controllers/payoutController.go` | `POST /api/payouts`, `GET /api/payouts` y `GET /api/reports/pending-commissions` (admin); `GET /api/payouts/mine`. |
| `controllers/commissionController.go` | `GET /api/commissions/mine` — ledger del usuario del token. |
| `controllers/orderController.go` | `GET /api/orders/mine`, `GET /api/orders/:id` (dueño o admin), `GET /api/orders` y `PATCH /api/orders/:id/status` (admin; al cancelar invalida catálogo y red del comprador). |
| `controllers/userController.go` | `POST /api/users` (registro público; patrocinador por `sponsor_id` o `referral_code`; siempre queda afiliado), `GET /api/users` (paginado, `?q=`) y `PATCH /api/users/:id` (admin: rol y `active`, nunca sobre sí mismo). |
| `controllers/healthController.go` | `GET /api/health` (ping a ambas dependencias: `ok`, `degraded` si cae Redis, 503 si cae PostgreSQL), `/api/health/db` y `/api/health/redis` (503 si cae). |
| `repository/` | Única capa con SQL: `products.go` (catálogo activo, listado admin paginado con búsqueda, edición con bloqueo de fila, baja lógica, categorías), `users.go` (listado paginado con búsqueda, alta con afiliación, `UpdateUser`, `GetUserByID`), `search.go` (`containsPattern`: patrón ILIKE con `%`/`_` escapados), `network.go` (árbol `WITH RECURSIVE` + upline; comisiones sin revertidas), `orders.go` (transacción ACID + fallas simuladas), `order_queries.go` (listado paginado, detalle, cambio de estado y cancelación ACID), `commission_queries.go` (ledger del beneficiario con totales), `reports.go` (KPIs y rankings sin pedidos cancelados), `payouts.go` (liquidación de comisiones de pedidos entregados en transacción con bloqueo pedidos → comisiones, historial y deuda por distribuidor), `commissions.go` (inserción recursiva idempotente bajo `FOR SHARE` del pedido; ignora cancelados), `catalogs.go`, `errors.go` (SQLSTATE → `ErrNotFound`, `ErrDuplicate`, `ErrInvalidRef`, `ErrConstraint`, `ErrInsufficientStock`, `ErrInvalidQuantity`, `ErrProductInactive`, `ErrInvalidReferral`, `ErrInvalidTransition`, `ErrCommissionsPaid`, `ErrNothingToPay`; `DomainError.Public` marca el detalle apto para el usuario). |
| `services/commissions.go` | `CommissionService`: `ProcessAsync` (goroutine con contexto propio, recover), `RecoverPending`, `Shutdown` (WaitGroup). |
| `repository/idempotency.go`, `services/idempotency_cleanup.go` | `claimIdempotency`/`storeIdempotentResponse` dentro de la transacción de cada escritura, `GetIdempotencyRecord`, `PurgeIdempotencyKeys`; limpieza de claves de más de 7 días al arrancar y cada 24 h. |
| `services/network_cache.go` | `NetworkCacheInvalidator`: borra `red:tree:*` del usuario y su upline (3 niveles). |
| `cache/cache.go`, `cache/redis.go` | Interfaz `Cache` + `GetOrLoad` genérico (HIT/MISS/BYPASS en `X-Cache`) + `Delete`; `RedisCache` la implementa. |
| `*_test.go` | `cache`, `config`, `controllers` (checkout, commission, health, helpers, list, middleware, order, payout, product, report, user, validation), `models` (orders), `repository` (search), `services/commissions` — con dobles de prueba, sin BD ni Redis. |
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
| `GET /api/users`, `POST /api/products` | JWT + admin | `Page` de usuarios (con `referral_code`; `?page&limit&q`) / producto creado |
| `GET /api/orders`, `PATCH /api/orders/:id/status` | JWT + admin | Todos los pedidos (`?status=`) / cambio de estado (cancelar repone stock y revierte comisiones) |
| `GET /api/reports/summary`, `/top-products`, `/top-sponsors` | JWT + admin | KPIs y rankings del periodo `?range=last_30_days\|month_to_date\|today` o `?from&to`, en la zona horaria del negocio (sin cancelados; máximo un año) |
| `GET /api/reports/pending-commissions` | JWT + admin | Deuda por distribuidor: `ready_*` (pedidos entregados) y `waiting_*` (en espera) |
| `POST /api/payouts`, `GET /api/payouts` | JWT + admin | Liquidar las comisiones de pedidos entregados de un distribuidor (`409` si no hay) / historial de pagos |
| `GET /api/admin/products` | JWT + admin | `Page` de productos, incluidos los dados de baja (`?page&limit&q`) |
| `PUT /api/products/:id`, `DELETE /api/products/:id` | JWT + admin | Producto editado o reactivado / dado de baja (`active: false`); `version` o `If-Match` desactualizado → `409` con el producto vigente |
| `PATCH /api/users/:id` | JWT + admin | Usuario actualizado (`role` y/o `active`) |

## Datos y contratos clave

- Errores: siempre `{"status": N, "message": "...", "details"?}` (`APIError`); los detalles técnicos solo con `APP_ENV=dev`.
- Checkout: `{payment_method, shipping_address, city, phone, items: [{product_id, quantity}]}`; el comprador sale del JWT, el precio y el total los calcula el servidor; cantidad ≤0 → 400 "cantidad debe ser mayor que cero", stock insuficiente → 409, producto dado de baja → 422 "Producto no disponible", producto/método inexistente → 422. Los pedidos nacen en `pending`.
- Sincronización offline: `POST /api/checkout`, `POST /api/products`, `PUT /api/products/:id` y `PATCH /api/orders/:id/status` aceptan `Idempotency-Key` (UUID). Conflictos `409` con detalle: `expected_total` del checkout distinto (`{expected_total, total}`), versión de producto (producto vigente), `from_status` del pedido (`{status}`); "operación en curso" trae `{retryable: true}`. Los productos devuelven `version` y `updated_at`.
- Comisiones: nivel 1 = 10 %, 2 = 5 %, 3 = 2 % del total del pedido, al patrocinador correspondiente (el comprador nunca cobra por su propia compra); solo se liquidan las de pedidos entregados; una fila por `(order_id, level)` en `commissions`, con estado `pending` / `paid` (con `payout_id`) / `reversed`.
- Cuentas demo (contraseña `123456`): `admin@upse.edu.ec` (admin), `cliente@upse.edu.ec` (raíz de la red) y 7 miembros `@multicatalogo.ec` (`diana.paz` es nivel 3).

## Notas operativas

- Puertos del host: PostgreSQL **5434** (5432 = Postgres local, 5433 = otro proyecto), Redis **6380** (6379 ocupado por un Redis local; `REDIS_PORT=6380` en `.env`), API **4000** (3000 ocupado por otro proyecto), Vite **5175**.
- Caché: `productos:all` (5 min) y `red:tree:{email}` (10 min); sin Redis la API responde desde PostgreSQL (`X-Cache: BYPASS`). Checkout, alta/edición/baja de productos y alta/edición de usuarios invalidan las claves afectadas.
- Demostración del ROLLBACK: `CHECKOUT_FAIL_AT=after_order|after_items` o `CHECKOUT_COMMIT_DELAY=10s` + `docker kill multicatalogo-db`. Desactivadas por defecto; nunca fuera de clase.
- Seguridad vigente: bcrypt, contraseña fuerte en el registro, JWT HS256 (2h por defecto) verificado contra la cuenta en cada petición (desactivación y cambio de rol inmediatos), rutas protegidas por rol, errores sanitizados fuera de desarrollo, identidad del comprador desde el token, cuentas inactivas rechazadas en login y checkout.
- Despliegue (`deploy/`): `docker-compose.prod.yml` (PostgreSQL + Redis + API + Caddy; solo Caddy publica 80/443), `Caddyfile` (HTTPS automático con Let's Encrypt para `DOMAIN` y `API_DOMAIN`; `no-cache` en todo salvo `/assets/*` `immutable`; 404 para assets inexistentes) y `.env.example` (`DOMAIN`, `API_DOMAIN`, `ACME_EMAIL`, credenciales). La API va en un subdominio propio: `CORS_ORIGIN=https://DOMAIN` y `VITE_API_URL=https://API_DOMAIN`.
- Brechas abiertas (ver checklist y plan): verificación visual a 375px y recorrido en navegador de las vistas de las fases 2, 3, 5, 6 y 7, y la Fase 8 del plan (paginación y búsqueda).
