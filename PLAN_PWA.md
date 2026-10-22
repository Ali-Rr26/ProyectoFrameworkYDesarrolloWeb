# PLAN DE IMPLEMENTACIÓN — PWA offline-first de MultiCatálogo

> Plan checkeable para convertir la SPA (`Frontend/`) en una Progressive Web App
> **offline-first**: interfaz disponible sin conexión, datos guardados en el navegador
> (catálogo, borradores de formularios, registros pendientes) y sincronización con el
> servidor al volver Internet, con resolución de conflictos.
>
> **Fuentes:** `REQUIREMENTS_CHECKLIST.md` (sección PWA), `PROJECT_MAP.md` (lo que ya
> existe), `PLAN_IMPLEMENTACION_U2.md` (reglas de dominio del backend: checkout ACID,
> máquina de estados de pedidos, baja lógica de productos).
>
> **Regla:** un ítem se marca `[x]` solo cuando su verificación pasa (DevTools →
> Application/Network "Offline", Lighthouse, `go test`, `npm run test`, flujo en navegador).
> Al cerrar cada fase se actualizan `REQUIREMENTS_CHECKLIST.md` y `PROJECT_MAP.md`.
>
> **Principios:** los del checklist (seguridad por defecto, DI por interfaces, funciones
> puras, mobile-first) más tres propios de la PWA:
> - **El servidor manda.** Stock, precios, comisiones y estados de pedido se deciden en el
>   backend; el cliente propone, nunca impone (nada de "last write wins" sobre dinero).
> - **Toda escritura offline es idempotente.** Cada registro pendiente lleva una
>   `Idempotency-Key` (UUID) generada al crearlo; reenviarlo nunca duplica un pedido.
> - **Cero datos privados en Cache Storage.** Lo privado vive en IndexedDB, por usuario,
>   y se borra al cerrar sesión.
>
> **Convención:** identificadores en inglés, textos de UI en español.

---

## Decisiones de diseño

| # | Decisión | Elegido | Motivo |
|---|---|---|---|
| D1 | Generación del service worker | `vite-plugin-pwa` con **`injectManifest`** | Se necesita código propio en el SW (Background Sync, mensajes a la app, rutas a medida). Se sigue usando Workbox por módulos (`workbox-precaching`, `-routing`, `-strategies`, `-expiration`, `-background-sync`), así que el precache no se escribe a mano. |
| D2 | Actualización de la app | `registerType: 'prompt'` | Una recarga forzada a mitad de `/checkout` o con sincronización en curso perdería trabajo. |
| D3 | Alcance offline | Lectura (shell + catálogo) **y escritura** con cola (outbox) | Requisito: formularios y registros pendientes se envían al volver la red. |
| D4 | Almacenamiento local | **IndexedDB con Dexie** (+ `dexie-react-hooks`) | Migraciones de esquema versionadas, índices y consultas reactivas (`useLiveQuery`); escala mejor que `localStorage` (síncrono, 5 MB, solo texto). |
| D5 | Dónde corre la sincronización | **En la página** (motor `syncEngine`); el SW solo la dispara | El JWT vive en `sessionStorage`, que el SW no puede leer. Guardar el token en IndexedDB para que el SW lo use aumentaría la exposición. |
| D6 | Background Sync | Acelerador, **no** mecanismo principal | Solo existe en Chromium; Safari y Firefox no lo tienen. La base es: sincronizar al arrancar la app, en el evento `online` y con reintentos con backoff mientras la app está abierta. |
| D7 | Resolución de conflictos | Por tipo de operación (ver Fase 7) | Checkout: el servidor manda (stock/precio). Edición de producto: concurrencia optimista con `version` y resolución manual. Estado de pedido: lo valida la máquina de estados. |
| D8 | Operaciones permitidas offline | Checkout (cliente), alta/edición de producto y cambio de estado de pedido (admin), borradores de cualquier formulario | Login, registro de usuario y liquidaciones (`POST /api/payouts`) quedan **solo online**: dependen de unicidad (correo, código de referido) o mueven dinero. |
| D9 | Sesión en la app instalada | JWT sigue en `sessionStorage` | Al cerrar la app hay que volver a iniciar sesión; los pendientes se conservan y se envían tras el login **del mismo usuario**. Refresh token en cookie `httpOnly` queda como trabajo futuro (U3/U4). |
| D10 | Origen de la API | `urlPattern` construido desde `VITE_API_URL` ahora; mismo dominio (`/api` tras el proxy) en U4 | Mismo origen simplifica las reglas del SW y elimina CORS. |
| D11 | Imágenes externas | `CacheFirst` con `maxEntries: 60` ahora; origen propio/CDN con CORS en U4 | Las respuestas opacas (picsum, URLs del admin) ocupan ~7 MB de cuota cada una en Chrome. |
| D12 | Pruebas del frontend | Añadir **Vitest** (+ `fake-indexeddb`) | El motor de sync, el clasificador de errores y el backoff son funciones puras y deben probarse sin navegador. |

> Fuera de alcance: notificaciones push (requieren VAPID en el backend), Periodic
> Background Sync, sincronización de reportes/red/comisiones offline (solo lectura online),
> cifrado de IndexedDB.

---

## FASE 0 — Preparación y metadatos

> Limpia restos del scaffold y deja `index.html` listo para instalación.

**Ya existe:** `index.html` con `viewport` y `favicon.svg`; diseño responsive con Tailwind.

- [x] `index.html`: `lang="es"`, `<title>MultiCatálogo</title>`, `<meta name="description">`, `<meta name="theme-color">` — un solo `theme-color` (`#20b2aa`): la app no tiene modo oscuro
- [x] Identidad PWA en `src/constants/pwa.ts` (`PWA_IDENTITY`): `name`/`shortName` "MultiCatálogo", `themeColor` `#20b2aa` (turquesa de marca), `backgroundColor` `#f8fafc` (slate-50 del `Layout`); la Fase 2 la importa en el manifest
- [x] Eliminados assets del scaffold sin referencias: `src/assets/{hero.png,react.svg,vite.svg}` y `public/icons.svg` (`favicon.svg` se conserva hasta la Fase 1)
- [ ] Vitest 5 configurado en `vite.config.ts` (`environment: 'node'`, `src/**/*.test.ts`, setup con `fake-indexeddb/auto`), scripts `npm run test` / `test:watch`, prueba `src/constants/pwa.test.ts` — falta ejecutar `npm run test`

## FASE 1 — Íconos

> Set de íconos para el prompt de instalación en Chrome/Android/iOS.

- [x] `@vite-pwa/assets-generator` 2.0 + `pwa-assets.config.ts` (preset `minimal2023`) + script `npm run icons` desde `public/favicon.svg`
- [x] Logo propio en `public/favicon.svg` (reemplaza el logo de Vite): "M" blanca con nodos de red sobre turquesa de marca
- [x] `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` (margen 30 %, fondo de marca), `apple-touch-icon-180x180.png` (fondo de marca), `favicon.ico` 48 — revisados visualmente
- [x] `index.html`: `favicon.ico` de respaldo, `favicon.svg` (`sizes="any"`) y `<link rel="apple-touch-icon">`
- [ ] Prueba de los enlaces en `pwa.test.ts` — falta ejecutar `npm run test`

## FASE 2 — Service worker propio y manifest (instalable)

> `vite-plugin-pwa` en modo `injectManifest`: el plugin inyecta la lista de precache
> (`self.__WB_MANIFEST`) en nuestro `src/sw.ts`.

- [ ] `npm i -D vite-plugin-pwa workbox-precaching workbox-routing workbox-strategies workbox-expiration workbox-cacheable-response workbox-background-sync`
- [ ] `vite.config.ts`: `VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', registerType: 'prompt', manifest: {...}, injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] } })`
- [ ] Manifest: `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`, `lang: 'es'`, íconos de la Fase 1
- [ ] `src/sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()`, `NavigationRoute` a `index.html` con denylist `/^\/api\//`
- [ ] `src/sw.ts`: escucha `message` `SKIP_WAITING` (para el aviso de actualización de la Fase 8)
- [ ] `tsconfig` del SW con `lib: ["WebWorker"]`; tipos `vite-plugin-pwa/client` en `vite-env.d.ts`
- [ ] Verificación: `npm run build && npm run preview` → manifest válido, SW activo, Chrome ofrece "Instalar"; con Network "Offline" la interfaz abre en cualquier ruta

## FASE 3 — Caché HTTP en el service worker

> Reglas de `workbox-routing` por tipo de recurso. Solo respuestas públicas.

- [ ] `GET {VITE_API_URL}/api/products*` y `/api/categories` → `StaleWhileRevalidate` (caché `api-catalog`, 1 día, `maxEntries` 50)
- [ ] Imágenes (`request.destination === 'image'`) → `CacheFirst` (caché `images`, `maxEntries` 60, 30 días, `CacheableResponsePlugin({ statuses: [0, 200] })`)
- [ ] Toda petición con cabecera `Authorization` o método distinto de `GET` → sin caché (`NetworkOnly` o sin ruta)
- [ ] Verificación: DevTools → Cache Storage sin respuestas privadas

## FASE 4 — Capa local de datos (IndexedDB con Dexie)

> Base local para consultar sin conexión y guardar lo que el usuario escribe.

- [ ] `npm i dexie dexie-react-hooks`
- [ ] `src/offline/db.ts`: clase `OfflineDB` con esquema versionado:
  - `products` (`id`, `categoryId`, `name`) y `categories` — copia del catálogo público
  - `meta` (`key`) — `catalogSyncedAt`, versión de esquema
  - `drafts` (`[userId+formKey]`) — borradores de formularios
  - `outbox` (`id` = Idempotency-Key, `userId`, `status`, `createdAt`) — registros pendientes
- [ ] `src/offline/catalogStore.ts`: refresco completo del catálogo al iniciar y al volver online; `Catalog`, `Storefront` y `ProductDetail` leen de Dexie (`useLiveQuery`) con la red como fuente de refresco
- [ ] Hook `useDraft(formKey)`: autoguardado con debounce en `Checkout`, `ProductForm` y `Register` (nunca se guardan contraseñas)
- [ ] `navigator.storage.persist()` al instalar/iniciar sesión, para que el navegador no borre los datos por presión de espacio
- [ ] Logout: borra `drafts` y `outbox` del usuario; si hay pendientes, confirmación previa ("Tienes N registros sin enviar")
- [ ] Pruebas Vitest: esquema, borradores, limpieza por usuario

## FASE 5 — Backend preparado para sincronizar

> Sin estos cambios, reenviar un pendiente podría duplicar pedidos y comisiones, o
> pisar la edición de otro administrador.

**Ya existe:** checkout ACID con total recalculado en servidor y stock validado por
trigger; máquina de estados de pedidos; `APIError{status,message,details}`.

- [ ] Migración `0006_sync.sql`:
  - `products.version INT NOT NULL DEFAULT 1` y `products.updated_at TIMESTAMPTZ` con trigger que incrementa ambos en cada `UPDATE`
  - tabla `idempotency_keys(key UUID, user_id, method, path, request_hash, status_code, response_body JSONB, created_at)` con `PRIMARY KEY (user_id, key)`
- [ ] Middleware `Idempotency` (Fiber) en `POST /api/checkout`, `POST /api/products`, `PUT /api/products/:id`, `PATCH /api/orders/:id/status`:
  - misma clave y mismo cuerpo → devuelve la respuesta guardada sin reejecutar
  - misma clave con cuerpo distinto → `422`
  - clave en curso → `409`
  - la clave se guarda **en la misma transacción** que la escritura
- [ ] Limpieza de claves con más de 7 días (al arrancar o con un ticker)
- [ ] `PUT /api/products/:id` exige `version` (cuerpo o `If-Match`); si no coincide → `409` con el producto actual en `details`
- [ ] `POST /api/checkout` acepta `expectedTotal`; si el total recalculado difiere → `409 price_changed` con el total nuevo (stock insuficiente sigue en `409` con los productos afectados)
- [ ] `PATCH /api/orders/:id/status` acepta `fromStatus`; si el pedido ya no está en ese estado → `409` con el estado actual
- [ ] `GET` de productos devuelve `version` y `updatedAt`
- [ ] Pruebas Go: idempotencia (reenvío, cuerpo distinto, concurrencia), versión de producto, `expectedTotal`, `fromStatus`

## FASE 6 — Outbox y motor de sincronización

> Las escrituras offline se guardan como registros pendientes y se envían en orden.

- [ ] `src/offline/outbox.ts`: `enqueue({ type, method, path, payload, baseVersion })` genera el UUID (`crypto.randomUUID()`) que viaja como `Idempotency-Key`
- [ ] Estados del registro: `pending → syncing → done | conflict | failed`; `attempts`, `lastError`, `nextAttemptAt`
- [ ] `src/offline/syncEngine.ts` (corre en la página, usa `apiFetch` con el JWT actual):
  - FIFO por usuario, de uno en uno (un alta de producto va antes que su edición)
  - solo envía registros del usuario con sesión activa
  - lock entre pestañas con `navigator.locks.request('outbox-sync', ...)`
- [ ] Clasificador puro de respuestas (`classifySyncResult`):
  - red caída o `5xx` → reintento con backoff exponencial + jitter (máx. 1 h)
  - `401` → pausa hasta nuevo login ("Inicia sesión para enviar N pendientes")
  - `409` → `conflict` (Fase 7)
  - `400`/`403`/`422` → `failed` (requiere corrección del usuario)
- [ ] Disparadores: arranque de la app, evento `online`, tras login, botón "Sincronizar ahora"
- [ ] SW: al encolar, la página registra `sync` (`registration.sync.register('outbox')`) si existe; en el evento `sync` el SW avisa a las pestañas abiertas (`clients.matchAll` + `postMessage`) para que ejecuten el motor
- [ ] Componentes con escritura offline usan `enqueue` cuando no hay red: `Checkout`, `ProductForm`, cambio de estado en `AdminOrders`; con red siguen enviando directo (con `Idempotency-Key` igualmente)
- [ ] Pruebas Vitest: orden FIFO, backoff, clasificador, pausa por `401`, no envío entre usuarios

## FASE 7 — Resolución de conflictos

> Política por tipo de operación. El usuario siempre ve qué pasó con cada pendiente.

- [ ] **Checkout** (`409` stock o `price_changed`): el pedido no se crea; el carrito se actualiza con stock y precios del servidor y el usuario confirma de nuevo (nunca reenvío automático)
- [ ] **Edición de producto** (`409` versión): pantalla de comparación campo a campo (mío / servidor) con tres salidas: "Conservar lo mío" (reenvía con la versión nueva), "Usar el del servidor" (descarta), "Combinar" (elige por campo)
- [ ] **Estado de pedido** (`409` `fromStatus`): se descarta el cambio y se informa el estado actual; si la transición sigue siendo válida, opción "Aplicar de todos modos"
- [ ] **Alta de producto** duplicada por reintento: la idempotencia del backend devuelve la respuesta original; no requiere UI
- [ ] Vista `/pending` ("Pendientes de envío"): lista del outbox con estado, error, reintentar, editar o descartar; contador en `Navbar`/`Sidebar`
- [ ] Funciones puras de comparación/combinación con pruebas Vitest

## FASE 8 — Experiencia offline, actualizaciones e instalación

- [ ] Hook `useOnlineStatus` + banner "Sin conexión — trabajando con datos guardados" en `Layout`
- [ ] `apiClient.ts`: distinguir fallo de red (`TypeError` de `fetch`) de `ApiError`; marca `NetworkError` para que los componentes decidan encolar
- [ ] Vistas solo online (reportes, red, comisiones, liquidaciones, usuarios admin, registro, login) muestran "Requiere conexión" en vez de error genérico
- [ ] `ReloadPrompt` con `useRegisterSW`: "Nueva versión disponible — Recargar"; no se ofrece durante `/checkout` ni con sincronización en curso
- [ ] Hook `useInstallPrompt` (`beforeinstallprompt`) + botón "Instalar app" (oculto en `display-mode: standalone`); instrucción para iOS
- [ ] `safe-area-inset` en barras fijas; sin overflow a 360px en modo standalone
- [ ] Prueba manual completa: offline → navegar catálogo, armar carrito, confirmar compra (queda pendiente) → volver online → pedido creado una sola vez, comisiones una sola vez

## FASE 9 — Despliegue HTTPS y validación final (depende de U4)

> El SW funciona en `localhost`; en producción exige HTTPS.

- [ ] Frontend y API por HTTPS tras Caddy/Nginx; idealmente mismo dominio (`/api`) — simplifica reglas del SW y elimina CORS
- [ ] `CORS_ORIGIN` con el dominio final si se mantiene origen separado
- [ ] Cabeceras: `sw.js`, `index.html` y `manifest.webmanifest` con `Cache-Control: no-cache`; assets con hash `immutable`
- [ ] Imágenes servidas desde origen propio/CDN con CORS (adiós respuestas opacas)
- [ ] Lighthouse móvil: instalable ✔; Performance/Accessibility/Best Practices ≥ 90
- [ ] Prueba real en Android (Chrome, incluye Background Sync), escritorio, iOS Safari (sin Background Sync: sincroniza al abrir la app)
- [ ] `PROJECT_MAP.md` actualizado: SW, Dexie, outbox, middleware de idempotencia, migración `0006`

---

## Estado de fases

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Metadatos, identidad PWA, Vitest | 🟡 Implementada (`tsc -b` y lint OK) — falta ejecutar `npm run test` |
| 1 | Íconos generados | 🟡 Implementada (`tsc -b` y lint OK) — falta ejecutar `npm run test` |
| 2 | SW `injectManifest` + manifest → instalable, interfaz offline | ⬜ Pendiente |
| 3 | Caché HTTP pública (catálogo, imágenes) | ⬜ Pendiente |
| 4 | IndexedDB (Dexie): catálogo local + borradores | ⬜ Pendiente |
| 5 | Backend: idempotencia, `version`, `expectedTotal`, `fromStatus` | ⬜ Pendiente |
| 6 | Outbox + motor de sincronización + Background Sync | ⬜ Pendiente |
| 7 | Resolución de conflictos + vista de pendientes | ⬜ Pendiente |
| 8 | UX offline, actualizaciones, instalación | ⬜ Pendiente |
| 9 | HTTPS y validación en dispositivos (U4) | ⬜ Pendiente |

> Con 0–3 la app es **instalable y abre sin conexión**. Con 4–7 es **offline-first**:
> consulta, captura y sincroniza sin duplicar pedidos. 8–9 la dejan lista para producción.
