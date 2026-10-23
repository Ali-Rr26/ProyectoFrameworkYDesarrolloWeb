# REQUIREMENTS CHECKLIST — MultiCatálogo

> Fuente de verdad del progreso. Leer al inicio de cada sesión; marcar `- [x]`
> y actualizar "Estado General" al completar cualquier tarea.
>
> **Estructura:** el documento se divide en fases por **Unidad/Tema del sílabo**
> (`Silabo_Framework_Programacion_Web.md`). Cada fase trae un comentario con lo
> que se hará en esa clase. El producto integrador es UNO: MultiCatálogo —
> una tienda cosmética con red de ventas multinivel (MLM) que crece como
> **sistema políglota**: React (front) + Go/Fiber (núcleo transaccional, U2)
> + FastAPI (capa SaaS/multitenant, U3), desplegado contenerizado (U4).
>
> **Principios rectores (aplican a toda fase):**
> - Seguridad por defecto: ningún endpoint nuevo nace sin auth ni validación.
> - Inyección de dependencias: interfaces en los bordes; globals solo en el entry point.
> - Funciones puras para el dominio (comisiones, totales, validadores) — testeables sin I/O.
> - Mobile-first: UI a 360px, touch ≥44px, un campo por fila en formularios.

## Estado General

| Ítem | Valor |
|---|---|
| **Hito actual** | **Unidades 1 y 2 completadas** (SPA con sesión JWT persistida + backend seguro: bcrypt, JWT real, rutas protegidas, health con deps) |
| **Última tarea completada** | Seguridad U2-T4 (bcrypt + JWT + RequireAuth + identidad por token) + mejoras U1 (apiFetch, persistencia, mobile audit) (2026-10-16) |
| **Siguiente tarea pendiente** | Commit del trabajo actual; luego U3-T1: scaffold FastAPI `Unidad3_SaaS/` |
| **Bloqueadores** | Ninguno. `backend-haskell` detenido (`docker start backend-haskell` restaura); `postgres-funcional` en :5433 → Postgres propio en **5434** |

## Arquitectura objetivo del semestre

```
React SPA (:5173) ──► Caddy/Nginx (U4: proxy inverso + SSL)
                        ├─ /api/tx/*   → Go/Fiber  :3000  — núcleo transaccional (U2)
                        └─ /api/saas/* → FastAPI   :8000  — capa SaaS/multitenant (U3)
                                            │
                          PostgreSQL 16 (:5434) + Redis (:6379)
```

---

# UNIDAD 1 — FRAMEWORKS FRONTEND (SPA React + Vite + Tailwind)

## U1-T1 · Introducción a frameworks web y arquitectura de soluciones

> Se presenta la pila tecnológica del semestre, la inversión de control y los
> lineamientos del producto integrador MultiCatálogo (tienda + red MLM).

- [x] Pila definida y workspace estructurado (`Frontend/`, `Backend/`)

## U1-T2 · Entorno SPA con Vite + Tailwind CSS

> Scaffold del frontend: empaquetador Vite, Tailwind v4, estructura de carpetas
> por responsabilidad (`components/`, `context/`, `services/`, `data/`).

- [x] Entorno SPA con Vite + Tailwind CSS
- [x] `package.json` renombrado a `multicatalogo-frontend`
- [x] `VITE_API_URL` en `.env` + `import.meta.env` (cliente único en `services/apiClient.ts`)

## U1-T3 · Componentes y gestión de estado global

> Estado global con React Context: sesión de usuario y carrito por usuario.

- [x] `AuthContext` (sesión `{email, role}`) y `CartContext` (carrito en localStorage por email)
- [x] Persistencia de sesión en `AuthContext` (`multicatalogo_session`: usuario + JWT en sessionStorage)
- [x] Warnings eslint resueltos: split `context/auth.ts` + `context/cart.ts` (hooks/tipos separados del Provider); `npm run lint` → 0 errores, 0 warnings

## U1-T4 · Consumo de API RESTful y enrutamiento

> Promesas con fetch, capa de servicios desacoplada y guardas de ruta por rol.

- [x] `services/productService.ts`, `networkService.ts` + guardas `ProtectedRoute`/`AdminRoute`
- [x] `services/apiClient.ts`: `apiFetch` único con `Authorization: Bearer` automático, `ApiError` tipado con status y helpers de sesión

## U1-T5 · Interfaces full-screen y flujos MLM (Práctica 03)

> Vistas inmersivas del catálogo y flujo completo de compra y red multinivel.

- [x] F8 Login con rol + redirección por rol
- [x] F1 Storefront `/store` full-screen | F3 Catálogo con búsqueda/filtros | F2 Detalle `/product/:id` | F4 Lightbox
- [x] F5 Carrito + checkout + confirmación | F6 Árbol multinivel comisiones 10/5/2 % | F7 Dashboard KPIs
- [x] `Checkout.tsx` → `POST /api/checkout` real (sin simulación) + manejo de `ApiError`
- [ ] Audit mobile-first: 375px sin overflow en Dashboard/MyNetwork/Catalog; botones de acción ≥44px (`Añadir al Carrito`, steppers de `Cart`, `Cerrar Sesión`) — botones ≥44px listos; falta la verificación visual a 375px

---

# UNIDAD 2 — BACKEND ALTA TRANSACCIONALIDAD (Go/Fiber · "entornos bancarios")

## U2-T1 · Rendimiento, memoria y concurrencia

> Goroutines y contextos: procesos de misión crítica que no bloquean la respuesta HTTP.

- [x] Goroutine `CommissionService.ProcessAsync` tras el COMMIT del pedido (contexto propio, no el del request)

## U2-T2 · Microservicios y APIs robustas (Fiber)

> API REST en capas con contrato de error estándar y configuración por entorno.

- [x] Capas routes → controllers → repository; endpoints login/products/network/health
- [x] `APIError{status,message,details}` en todos los errores + validación de entrada (400/404)
- [-] Puerto de escucha configurable (`PORT`, defecto 3000) — descartado: el 3000 está ocupado por otro proyecto; `PORT` es configurable y el defecto se mantiene en 4000
- [x] `/api/health` real: `HealthController` con ping a Postgres (503 si cae) y Redis (`"degraded"` si cae)

## U2-T3 · Persistencia PostgreSQL + caché Redis

> Dockeriza la BD, SQL puro con pgx, reconstrucción del árbol y Cache-Aside.

- [x] `docker-compose` Postgres 16 + Redis alpine + volumen + healthchecks
- [x] `0001_schema.sql` + `0002_seed.sql` (users/products/network_members + seed), `repository/` a SQL real, árbol por `sponsor_id`
- [x] Cache-Aside: `productos:all` TTL 5 min, `red:tree:{email}` TTL 10 min, degradación sin caché
- [x] Índices: `network_members(sponsor_id)`, `orders(user_id)`, `order_items(order_id)` (PK), `products(category_id)` (migración `0001_schema.sql`)
- [x] Errores propagados: firmas del repo devuelven `error`; `ErrNotFound`→404/401, resto→500 (nunca lista vacía silenciosa)

## U2-T4 · Inyección de dependencias y microservicio seguro

> DI por interfaces en toda la cadena + transacción ACID del checkout + hardening.

- [x] Interfaces de `controllers/ports.go` (`ProductRepository`, `OrderRepository`, …)/`cache.Cache`; `repository.Repository`/`cache.RedisCache`; structs de controladores; `routes.Controllers` en `main.go`
- [x] `POST /api/checkout` ACID: trigger `fn_order_items_stock` (`UPDATE … WHERE stock >= cantidad`) + descuento de stock + `orders`/`order_items`, ROLLBACK → 409/422/500, total recalculado en servidor
- [x] Invalidación de caché tras compra (`productos:all`, `red:tree:*`) + tablas de checkout en `0001_schema.sql`
- [x] bcrypt de passwords (pgcrypto `crypt()/gen_salt('bf')` en `0001_schema.sql` + `0002_seed.sql`; login con `CompareHashAndPassword`)
- [x] JWT real (`JWT_SECRET` en env, claims `{sub,email,role,iat,exp}` 2h, HS256) + `AuthMiddleware.RequireAuth`/`RequireRole("admin")`
- [x] Protegidos `/api/network` y `/api/checkout` con el middleware (401 sin token / token adulterado)
- [x] Checkout toma la identidad del TOKEN (`c.Locals` desde claims) — verificado: `email` falso en body NO se persiste ni atribuye comisiones
- [x] Errores sanitizados: `Details` solo con `APP_ENV=dev`; `ErrInvalidQuantity` propio (400 "cantidad debe ser mayor que cero", distinto de stock)

---

# PWA — MultiCatálogo offline-first

> Plan detallado, decisiones (D1–D13) y verificación por ítem en **`PLAN_PWA.md`**.
> Resumen: `vite-plugin-pwa` en modo `injectManifest` (SW propio con Workbox),
> IndexedDB con Dexie, outbox con `Idempotency-Key` y motor de sincronización en la
> página (Background Sync solo como acelerador), conflictos resueltos por tipo de
> operación con el servidor como autoridad.

## PWA-F0 · Preparación y metadatos
- [x] `index.html` (`lang="es"`, título, `description`, `theme-color`), identidad PWA (`PWA_IDENTITY`), limpieza del scaffold
- [ ] Vitest + `fake-indexeddb` configurado — falta ejecutar `npm run test`

## PWA-F1 · Íconos
- [x] `@vite-pwa/assets-generator` (`npm run icons`) desde logo propio `favicon.svg`: 64, 192, 512, maskable, `apple-touch-icon`, `favicon.ico` + enlaces en `index.html`

## PWA-F2 · Service worker propio y manifest (instalable)
- [x] `injectManifest` con `src/sw.ts` (`precacheAndRoute`, `NavigationRoute`, `SKIP_WAITING`, `clientsClaim`) + manifest `standalone` desde `PWA_IDENTITY` + `tsconfig.sw.json`; build genera `sw.js` y `manifest.webmanifest`
- [ ] Verificación en navegador: instalable y la interfaz abre offline (`npm run build && npm run preview`)

## PWA-F3 · Caché HTTP pública
- [x] Catálogo `NetworkFirst` (antes `StaleWhileRevalidate`, cambiado en F4), imágenes `CacheFirst` (60 entradas), nada con `Authorization` ni métodos de escritura en Cache Storage — reglas puras en `src/pwa/cacheRules.ts`
- [ ] Pruebas de `cacheRules` (`npm run test`) y verificación de Cache Storage en navegador

## PWA-F4 · Capa local IndexedDB (Dexie)
- [x] `OfflineDB` (`products`, `meta`, `drafts`, `outbox`), catálogo local con `useLiveQuery` en `Storefront`/`Catalog`/`ProductDetail`, `useDraft` en `Checkout`/`ProductForm`/`Register`, `storage.persist()`, limpieza por usuario al cerrar sesión
- [ ] Pruebas de la capa local (`npm run test`) y verificación offline en navegador

## PWA-F5 · Backend preparado para sincronizar
- [x] Migración `0006_sync.sql` (`products.version`/`updated_at`, `idempotency_keys`), middleware `Idempotency` con la clave guardada en la misma transacción, limpieza a 7 días, `409` por `version`/`If-Match`, `expected_total` y `from_status`, CORS
- [x] Verificación contra PostgreSQL (idempotencia, `expected_total`, `If-Match`, `from_status`)
- [ ] Pruebas Go (`go test ./...`)

## PWA-F6 · Outbox y motor de sincronización
- [x] `NetworkError` en `apiClient`, `enqueue`/`sendOrQueue` con UUID como `Idempotency-Key`, estados `pending/syncing/done/conflict/failed`, FIFO por usuario, `navigator.locks`, backoff con jitter, pausa en `401`, disparo por arranque/login/`online`/Background Sync, botón "Sincronizar" en `Navbar`, `Checkout` sin red → "Guardar pedido", altas/ediciones de producto y cambios de estado encolables
- [ ] Pruebas (`npm run test`) y verificación offline → online en navegador

## PWA-F7 · Resolución de conflictos
- [x] Checkout rechazado → carrito reconstruido con stock/precio vigentes y re-confirmación; comparación campo a campo de productos con combinación a tres bandas (también para el `409` en línea); estado de pedido con "Aplicar de todos modos" si sigue siendo válido; vista `/pending` con contador en `Sidebar`/`Navbar`
- [ ] Pruebas (`npm run test`) y verificación de conflictos en navegador

## PWA-F8 · Lectura sin conexión de datos privados
- [ ] Tabla `snapshots` (esquema v2), `withSnapshot` + `useSnapshotQuery`, aviso "datos guardados el {fecha}" / "Requiere conexión" en `Dashboard`, `MyOrders`, `MyNetwork`, comisiones, liquidaciones y listados admin; pendientes del outbox visibles en su vista; limpieza al cerrar sesión y caducidad 7 días

## PWA-F9 · Experiencia offline, actualizaciones e instalación
- [ ] `useOnlineStatus` + banner, login/registro "Requiere conexión", `ReloadPrompt`, `useInstallPrompt`, `safe-area-inset`, prueba offline → online sin pedidos duplicados

## PWA-F10 · HTTPS y validación final (depende de U4)
- [ ] HTTPS mismo dominio, cabeceras de caché, imágenes con CORS, Lighthouse ≥ 90, pruebas en Android/escritorio/iOS, `PROJECT_MAP.md`
