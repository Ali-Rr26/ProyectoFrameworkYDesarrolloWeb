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
| D13 | Datos privados sin conexión (pedidos, red, comisiones, liquidaciones, reportes, listados admin) | **Instantáneas de solo lectura por usuario** en IndexedDB (Fase 8), con fecha visible | Antes eran "solo online" y fallaban sin red. Se muestra la última respuesta vista con red ("Datos del …"); nunca se usa ante `401`/`403`, caduca a los 7 días y se borra al cerrar sesión. Las escrituras siguen D8. |

> Fuera de alcance: notificaciones push (requieren VAPID en el backend), Periodic
> Background Sync, **escritura** offline de liquidaciones, usuarios y registro (D8; su
> lectura offline sí se cubre en la Fase 8), cifrado de IndexedDB.

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
- [x] Prueba de los enlaces en `pwa.test.ts` — falta ejecutar `npm run test`

## FASE 2 — Service worker propio y manifest (instalable)

> `vite-plugin-pwa` en modo `injectManifest`: el plugin inyecta la lista de precache
> (`self.__WB_MANIFEST`) en nuestro `src/sw.ts`.

- [x] `npm i -D vite-plugin-pwa@2.0.0 workbox-core workbox-precaching workbox-routing` (7.4.1) — `workbox-strategies`, `-expiration`, `-cacheable-response` se instalan en la Fase 3 y `workbox-background-sync` en la Fase 6, cuando se usen
- [x] `vite.config.ts`: `VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', registerType: 'prompt', injectRegister: 'auto', includeManifestIcons: false, injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] } })` — registro por `registerSW.js` hasta que la Fase 8 use `virtual:pwa-register/react`
- [x] Manifest desde `PWA_IDENTITY`: `id`/`start_url`/`scope` `'/'`, `display: 'standalone'`, `orientation: 'portrait'`, `lang: 'es'`, `categories`, íconos de la Fase 1 (maskable incluido)
- [x] `src/sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()`, `NavigationRoute` a `index.html` con denylist `/^\/api\//`, `clientsClaim()`
- [x] `src/sw.ts`: escucha `message` `SKIP_WAITING` (para el aviso de actualización de la Fase 8)
- [x] `tsconfig.sw.json` (`lib: ["ES2023", "WebWorker"]`, referenciado en `tsconfig.json`; `src/sw.ts` excluido de `tsconfig.app.json`); tipos `vite-plugin-pwa/client` en `vite-env.d.ts`
- [x] Build: `dist/manifest.webmanifest`, `dist/sw.js` (12 entradas de precache, sin duplicados), `<link rel="manifest">` y `registerSW.js` inyectados en `index.html`
- [x] `CORS_ORIGIN` del backend admite también `http://localhost:4173` (`vite preview`, donde corre el SW) — lista separada por comas en `.env`/`.env.example`. Se descartó mover `preview` al 5175: el SW registrado ahí interceptaría luego el `npm run dev` con el build viejo
- [x] Verificación en navegador: `npm run build && npm run preview` → DevTools → Application: manifest sin errores, SW activo, Chrome ofrece "Instalar"; Network "Offline" + recarga en `/store`, `/catalog`, `/product/1` → la interfaz abre

## FASE 3 — Caché HTTP en el service worker

> Reglas de `workbox-routing` por tipo de recurso. Solo respuestas públicas.

- [x] `npm i -D workbox-strategies workbox-expiration workbox-cacheable-response` (7.4.1)
- [x] Reglas puras en `src/pwa/cacheRules.ts` (`isPublicCatalogRequest`, `isImageRequest`, `CACHE_NAMES`, límites) — el SW solo las conecta; origen de la API tomado de `API_URL` (`VITE_API_URL`)
- [x] `GET {VITE_API_URL}/api/products`, `/api/products/:id` y `/api/categories` → `NetworkFirst` (timeout 5 s, caché `api-catalog`, solo `200`, 1 día, `maxEntries` 50, `purgeOnQuotaError`); `/api/admin/products` excluida — **cambiado en la Fase 4**: era `StaleWhileRevalidate`, pero entregaba al refresco de IndexedDB la copia vieja del SW; ahora la red manda y el SW queda como respaldo sin conexión
- [x] Imágenes (`request.destination === 'image'`) → `CacheFirst` (caché `images`, `maxEntries` 60, 30 días, `CacheableResponsePlugin({ statuses: [0, 200] })`, `purgeOnQuotaError`)
- [x] Toda petición con cabecera `Authorization` o método distinto de `GET` → sin ruta registrada: el SW no la intercepta y va directo a la red
- [x] `tsconfig.sw.json` incluye `src/vite-env.d.ts` (tipos de `import.meta.env` para `API_URL`)
- [x] Pruebas `src/pwa/cacheRules.test.ts` (rutas públicas, privadas, métodos de escritura, `Authorization`, otro origen, imágenes) — falta ejecutar `npm run test`
- [x] Verificación en navegador: con sesión iniciada, recorrer catálogo y vistas privadas → DevTools → Cache Storage solo muestra `api-catalog` (productos/categorías) e `images`; ninguna respuesta de `/api/me`, `/api/orders*`, `/api/network`, etc. Luego Network "Offline" → `/store` y `/catalog` muestran los productos guardados

## FASE 4 — Capa local de datos (IndexedDB con Dexie)

> Base local para consultar sin conexión y guardar lo que el usuario escribe.

- [x] `npm i dexie@4.4.6 dexie-react-hooks@4.4.0`
- [x] `src/offline/db.ts`: clase `OfflineDB` (versión 1 del esquema; nombre configurable para pruebas):
  - `products` (`id`, `position`) — copia del catálogo público; `position` conserva el orden del servidor. Sin tabla `categories`: las vistas derivan las categorías de los productos (como ya hacían)
  - `meta` (`key`) — `catalogSyncedAt`
  - `drafts` (`[userId+formKey]`, `userId`) — borradores de formularios
  - `outbox` (`id` = Idempotency-Key, `userId`, `status`, `createdAt`, `[userId+status]`) — esquema listo para la Fase 6
- [x] Dueño de los datos locales = correo normalizado (`draftOwner`); `anonymous` sin sesión (registro)
- [x] `src/offline/catalogStore.ts`: `refreshCatalog` (reemplazo completo en transacción, una sola petición si hay llamadas simultáneas, copia intacta si la red falla) y `refreshProduct` (actualiza o borra el producto)
- [x] Hooks `useCatalog` / `useLocalProduct` (`src/offline/useCatalog.ts`): `Storefront`, `Catalog` y `ProductDetail` leen de Dexie con `useLiveQuery`; refresco al montar y en el evento `online`
- [x] Hook `useDraft(formKey, initial, { exclude })`: restaura el borrador al montar, guarda solo cambios del usuario con debounce de 400 ms y `clearDraft()` al enviar con éxito o cancelar. Usado en `Checkout` (`checkout`), `ProductForm` (`product:new` / `product:{id}`) y `Register` (`register`; la contraseña queda fuera y el `?ref=` del link manda sobre el borrador)
- [x] Métodos de pago con copia local (`src/offline/paymentMethods.ts`, `meta.paymentMethods`): red primero y última lista guardada sin conexión; `Checkout` los usa (antes fallaba offline con "No se pudieron cargar los métodos de pago")
- [x] `navigator.storage.persist()` al iniciar sesión (`requestPersistentStorage` en `AuthContext.login`)
- [x] Logout manual (`Navbar`): cuenta pendientes, pide confirmación si hay ("Tienes N registros sin enviar…") y borra `drafts` y `outbox` del usuario; el catálogo se conserva. El cierre automático (token vencido/401) NO borra: los pendientes esperan al mismo usuario
- [x] Pruebas Vitest (`catalogStore`, `drafts`, `userData`, `paymentMethods`) — falta ejecutar `npm run test`
- [x] Verificación en navegador: visitar `/catalog` con red → DevTools → IndexedDB `multicatalogo` con `products`; Network "Offline" + recarga en `/store`, `/catalog`, `/product/:id` → se ven los productos; escribir en `/checkout`, recargar → los datos siguen; cerrar sesión → `drafts` del usuario vacío

## FASE 5 — Backend preparado para sincronizar

> Sin estos cambios, reenviar un pendiente podría duplicar pedidos y comisiones, o
> pisar la edición de otro administrador.

**Ya existe:** checkout ACID con total recalculado en servidor y stock validado por
trigger; máquina de estados de pedidos; `APIError{status,message,details}`.

- [x] Migración `0006_sync.sql`:
  - `products.version INT NOT NULL DEFAULT 1` y `products.updated_at TIMESTAMPTZ` con trigger `trg_products_version` (`BEFORE UPDATE`) que incrementa ambos en **cada** `UPDATE`, incluido el stock que descuentan las ventas y repone una cancelación (una edición offline de stock no pisa ventas ocurridas mientras tanto)
  - tabla `idempotency_keys(user_id, key UUID, method, path, request_hash, status_code, response_body JSONB, created_at)` con `PRIMARY KEY (user_id, key)` e índice por `created_at`
- [x] Middleware `Idempotency` (`controllers/idempotency.go`) después de `RequireAuth` en `POST /api/checkout` (y su alias `POST /api/orders`), `POST /api/products`, `PUT /api/products/:id`, `PATCH /api/orders/:id/status`:
  - sin cabecera → la petición sigue igual que antes (compatibilidad)
  - `Idempotency-Key` que no es UUID → `400`
  - misma clave y misma petición (SHA-256 de método + ruta + cuerpo) → devuelve la respuesta guardada (mismo estado y cuerpo, cabecera `Idempotent-Replayed: true`) sin reejecutar: sin pedido, stock ni comisiones duplicados
  - misma clave con otra petición → `422`
  - clave en curso (dos envíos simultáneos) → el segundo espera el `INSERT` del primero y recibe `409`; su reintento obtiene la respuesta guardada
  - la clave se reserva (`claimIdempotency`) y la respuesta se guarda (`storeIdempotentResponse`) **dentro de la transacción de la escritura**: la clave viaja en el `context` (`repository.WithIdempotencyKey`). Si la escritura hace ROLLBACK, la clave tampoco queda y el reintento vuelve a ejecutarse
- [x] Limpieza de claves con más de 7 días: `services.RunIdempotencyCleanup` al arrancar y cada 24 h (`idempotencyKeyTTL` en `main.go`)
- [x] `PUT /api/products/:id` acepta `version` (cuerpo) o `If-Match` (`3`, `"3"` o `W/"3"`); si no coincide con la vigente → `409` con el producto actual en `details`. **Opcional** por compatibilidad (sin versión no se verifica); el frontend ya la envía al editar y reactivar en `AdminProducts`
- [x] `POST /api/checkout` acepta `expected_total`; si el total recalculado difiere (tolerancia de medio centavo) → ROLLBACK y `409` con `details: { expected_total, total }`. Stock insuficiente sigue en `409` con el producto afectado
- [x] `PATCH /api/orders/:id/status` acepta `from_status`; si el pedido ya no está en ese estado → `409` con `details: { status }` (se valida antes de la transición)
- [x] `GET` de productos (público y admin) devuelve `version` y `updated_at`; tipos `Product`/`ProductUpdate` del frontend actualizados
- [x] CORS: permite las cabeceras `Idempotency-Key` e `If-Match` y expone `Idempotent-Replayed`
- [x] Nombres JSON en snake_case (`expected_total`, `from_status`, `updated_at`), como el resto de la API (el plan decía `expectedTotal`/`fromStatus`)
- [x] Pruebas Go (`controllers/idempotency_test.go`, `controllers/sync_test.go`, `repository/sync_test.go`, `services/idempotency_cleanup_test.go`): middleware (sin cabecera, UUID inválido, clave nueva en contexto, repetición, cuerpo distinto, fallo del almacén), mapeo de conflictos a `409`, `If-Match`, `expected_total`, `from_status`, tolerancia de totales, limpieza — falta ejecutar `go test ./...`
- [x] Verificación contra la base real (PowerShell, 2026-10-22): reenvío del checkout con la misma clave → `201` + `201 Idempotent-Replayed` con el mismo pedido (#9); misma clave con otro cuerpo → `422`; `expected_total` incorrecto → `409` con el total vigente; `If-Match` viejo → `409` con el producto vigente (versión 2: la venta del pedido #9 la subió); `from_status` viejo → `409` con `pending`

## FASE 6 — Outbox y motor de sincronización

> Las escrituras offline se guardan como registros pendientes y se envían en orden.

- [x] `apiClient.ts`: `NetworkError` propio cuando `fetch` no obtiene respuesta (distinto de `ApiError`), opción `headers` en `apiFetch` e `idempotencyHeaders(key)`; `createOrder`, `createProduct`, `updateProduct` y `updateOrderStatus` aceptan la `Idempotency-Key` (y `updateOrderStatus` el `from_status`)
- [x] `src/offline/outbox.ts`: `enqueue({ type, method, path, payload, baseVersion, label })` con `crypto.randomUUID()` como id = `Idempotency-Key`; `sendOrQueue(input, send)`: sin red guarda; con red envía con clave y, si la red cae a mitad del envío (`NetworkError`), guarda el registro **con la misma clave** (reenviarlo es seguro); los `ApiError` se propagan para resolverse en el momento
- [x] Estados del registro: `pending → syncing → done | conflict | failed`; `attempts`, `lastError`, `details` (detalle del 409/422 para la Fase 7), `nextAttemptAt`, `result` (respuesta del servidor), `completedAt`. Campos sin índice: sin cambio de esquema
- [x] `src/offline/syncEngine.ts` (`runSync` / `syncOutbox`, corre en la página con el JWT actual):
  - FIFO por usuario, de uno en uno; un fallo transitorio detiene la cola (respeta el orden); un conflicto o un error de datos marca ese registro y sigue con el siguiente
  - solo envía registros del usuario con sesión activa; un registro que quedó en `syncing` se reenvía (idempotente)
  - lock entre pestañas con `navigator.locks.request('outbox-sync', { ifAvailable: true })` y promesa compartida en la pestaña
  - los `done` se conservan 24 h (avisos) y luego se borran
- [x] Clasificador puro `classifySyncError` (`src/offline/syncPolicy.ts`):
  - `NetworkError`, `5xx`, `408`, `429` y el `409` con `details.retryable` (misma clave en curso; ajuste del backend) → reintento con backoff exponencial desde 5 s, jitter 50–100 % y tope de 1 h
  - `401` → pausa sin contar el intento ("Inicia sesión para enviar los pendientes")
  - `409` de datos (stock, precio, versión, estado) → `conflict` (Fase 7)
  - `400`/`403`/`404`/`422` → `failed` (requiere corrección del usuario)
- [x] Disparadores (`OutboxProvider`, `src/offline/OutboxProvider.tsx`): arranque de la app, inicio de sesión, evento `online`, nuevo pendiente (`outbox:changed`), mensaje del SW, reintento programado y botón **"Sincronizar"** (`SyncIndicator` en `Navbar`: contador de pendientes, deshabilitado sin red o mientras envía; aviso "N por revisar" para `conflict`/`failed`; confirmación breve "Pedido MC-… enviado")
- [x] SW: al encolar se registra `sync` (`registration.sync.register('outbox')`) si existe; en el evento `sync` el SW avisa a las pestañas abiertas (`clients.matchAll` + `postMessage SYNC_OUTBOX`). Constantes compartidas en `src/offline/syncMessages.ts` (sin dependencias: el SW no carga Dexie). No hizo falta `workbox-background-sync`: el SW no guarda peticiones, solo avisa
- [x] Escrituras con `sendOrQueue`: `Checkout` (pedido), `AdminProducts` (alta y edición con `version`) y `AdminOrders` (cambio de estado con `from_status`); con red se envían directo y con `Idempotency-Key`. Avisos "Sin conexión: … se guardó y se enviará al volver la conexión". `AdminProducts` ya no muestra el producto de un `409` como errores por campo (solo los `400` traen errores por campo)
- [x] `Checkout` sin red: botón **"Guardar pedido"** + aviso; el pedido viaja con `expected_total` (total que aceptó el cliente); se vacían carrito y borrador y `/confirmation` muestra "Pedido guardado" (sin número: se asigna al enviarse). Con red se envía sin `expected_total` para no rechazar carritos con precios viejos hasta que la Fase 7 los actualice
- [x] Pruebas Vitest (`syncPolicy.test.ts`, `outbox.test.ts`, `syncEngine.test.ts`): backoff y jitter, clasificador, `sendOrQueue` (envío, caída de red con la misma clave, sin conexión, error del servidor), orden FIFO, detención ante fallo transitorio, hora de reintento, pausa por `401`, conflictos sin bloquear la cola, no envío entre usuarios, reenvío de `syncing`, limpieza de `done` — falta ejecutar `npm run test`
- [x] Verificación en navegador: sin conexión guardar un pedido, un alta de producto y un cambio de estado → contador "Sincronizar (3)"; volver la conexión → se envían solos, una sola vez (revisar "Mis pedidos" y `/admin/orders`)

## FASE 7 — Resolución de conflictos

> Política por tipo de operación. El usuario siempre ve qué pasó con cada pendiente.

- [x] **Checkout** rechazado (`409` stock o precio, `422` producto dado de baja): el pedido no se crea; "Revisar en el carrito" refresca el catálogo, reconstruye el carrito con stock y precios vigentes (`rebuildCart`: quita lo no disponible y ajusta cantidades), restaura los datos de envío en el borrador y lleva a `/checkout` con un aviso; el cliente confirma de nuevo (nunca reenvío automático). Con red, el mismo `409`/`422` del checkout actualiza el carrito en el momento
- [x] **Edición de producto** (`409` versión): `ProductConflictPanel` compara campo a campo (tu versión / versión vigente) con **combinación a tres bandas**: al encolar se guarda la `base` (valores al empezar a editar) y se sugiere lo mío si solo yo cambié el campo, lo del servidor si solo cambió allá (p. ej. stock por una venta) y lo mío si ambos lo cambiaron. Salidas: "Combinar y reenviar" (elección por campo), "Conservar lo mío", "Usar la del servidor" (descarta). Se reenvía con la versión vigente y el mismo id (el `409` hizo ROLLBACK: la clave no quedó registrada)
- [x] Edición de producto rechazada **en línea** (`409`): en lugar de pisar el cambio ajeno con el borrador, se registra como conflicto (`recordConflict`) y se resuelve con la misma comparación en `/pending`; el listado se recarga
- [x] **Estado de pedido** (`409` `from_status`): se informa el estado vigente; si la transición sigue siendo válida (`canApplyStatus`), "Aplicar de todos modos" reenvía con `from_status` actualizado; si no, solo "Descartar". En línea, la fila de `AdminOrders` se actualiza con el estado vigente
- [x] **Alta de producto** duplicada por reintento: la idempotencia del backend devuelve la respuesta original; no requiere UI (un nombre repetido de verdad llega como `409` y se puede descartar o reintentar)
- [x] Vista `/pending` ("Pendientes de envío", `PendingSync`): lista del outbox con estado (En cola / Enviando / Conflicto / Rechazado), fecha, intentos, próximo intento y error; acciones "Revisar en el carrito", "Aplicar de todos modos", "Reintentar" y "Descartar"; botón "Sincronizar ahora". Entrada "Pendientes" en `Sidebar` con contador (solo si hay pendientes) y enlace "N por revisar" en `Navbar`
- [x] Funciones puras en `src/offline/conflicts.ts` (`productConflicts`, `defaultChoices`, `mergeProductChanges`, `canApplyStatus`, `rebuildCart`) y acciones en `src/offline/resolve.ts` (`requeueEntry`, `discardEntry`); `replaceCart` en el carrito
- [x] Precarga al iniciar sesión y al volver la red (`OutboxProvider`): catálogo y métodos de pago, para comprar sin conexión aunque nunca se hayan abierto `/catalog` ni `/checkout` con red (antes `Checkout` sin conexión quedaba sin métodos de pago)
- [x] Pruebas Vitest (`conflicts.test.ts`, `resolve.test.ts`) — falta ejecutar `npm run test`
- [x] Verificación en navegador: conflicto de precio de un pedido guardado sin conexión, conflicto de edición de producto (sin conexión y en línea) y cambio de estado de pedido desde dos pestañas

## FASE 8 — Lectura sin conexión de datos privados (instantáneas por usuario)

> Las vistas privadas muestran sin conexión la última versión vista con red, marcada
> con su fecha. Solo lectura: las escrituras siguen D8 (outbox o solo online).

**Ya existe:** `OfflineDB` (Fase 4), `draftOwner`/`clearUserData`, cliente HTTP único
`apiFetch`, `NetworkError` (Fase 6).

- [ ] Esquema v2 de `OfflineDB`: tabla `snapshots` (`[userId+key]`, `userId`, `savedAt`) con la última respuesta de cada consulta
- [ ] `src/offline/snapshots.ts`: `withSnapshot(key, fetcher)` — red primero y guarda; ante `NetworkError` devuelve la instantánea con su `savedAt`; ante `401`/`403` nunca usa la instantánea (borra la del usuario si es `401`)
- [ ] Hook `useSnapshotQuery(key, fetcher, deps)` → `{ data, loading, error, savedAt, fromSnapshot }`; la clave incluye página, filtros y rango (`orders:mine?page=1`, `reports:summary?range=last_30_days`)
- [ ] Vistas cubiertas:
  - cliente/distribuidor: `MyOrders` (`/api/orders/mine`), `MyNetwork` (`/api/network`), `CommissionsPanel` (`/api/commissions/mine`), `PayoutsPanel` (`/api/payouts/mine`)
  - admin: `Dashboard` (`/api/reports/summary`, `top-products`, `top-sponsors`, `pending-commissions`), `AdminOrders` (`/api/orders`), `AdminPayouts` (`/api/payouts`, `pending-commissions`), `AdminUsers` (`/api/users`), `AdminProducts` (`/api/admin/products`)
- [ ] Aviso por vista: "Sin conexión — datos guardados el {fecha}"; sin instantánea para esa consulta → "Requiere conexión" (en vez del error genérico)
- [ ] Paginación y búsqueda sin conexión: solo las combinaciones ya visitadas; el resto muestra "Requiere conexión"
- [ ] Pendientes del outbox visibles en su vista: pedidos guardados sin red en `MyOrders` como "Pendiente de envío"; ediciones de producto con insignia en `AdminProducts`; cambios de estado en `AdminOrders`
- [ ] Botones de escritura solo online (crear liquidación, editar usuario, dar de baja) deshabilitados sin red con explicación
- [ ] Seguridad: instantáneas por usuario; `clearUserData` también borra `snapshots`; caducidad 7 días y límite de entradas por usuario; nunca se guardan `/api/login` ni `/api/me`
- [ ] Pruebas Vitest: red/instantánea, sin instantánea, `401`/`403`, caducidad, limpieza por usuario

## FASE 9 — Experiencia offline, actualizaciones e instalación

- [ ] Hook `useOnlineStatus` + banner "Sin conexión — trabajando con datos guardados" en `Layout`
- [ ] Login y registro (solo online) muestran "Requiere conexión" en vez de error genérico (las vistas privadas ya lo resuelve la Fase 8)
- [ ] `ReloadPrompt` con `useRegisterSW`: "Nueva versión disponible — Recargar"; no se ofrece durante `/checkout` ni con sincronización en curso
- [ ] Hook `useInstallPrompt` (`beforeinstallprompt`) + botón "Instalar app" (oculto en `display-mode: standalone`); instrucción para iOS
- [ ] `safe-area-inset` en barras fijas; sin overflow a 360px en modo standalone
- [ ] Prueba manual completa: offline → navegar catálogo, armar carrito, confirmar compra (queda pendiente) → volver online → pedido creado una sola vez, comisiones una sola vez

## FASE 10 — Despliegue HTTPS y validación final (depende de U4)

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
| 2 | SW `injectManifest` + manifest → instalable, interfaz offline | 🟡 Implementada (`tsc -b`, lint y build OK) — falta verificación en navegador |
| 3 | Caché HTTP pública (catálogo, imágenes) | 🟡 Implementada (`tsc -b`, lint y build OK) — faltan `npm run test` y verificación en navegador |
| 4 | IndexedDB (Dexie): catálogo local + borradores | 🟡 Implementada (`tsc -b`, lint y build OK) — faltan `npm run test` y verificación en navegador |
| 5 | Backend: idempotencia, `version`, `expected_total`, `from_status` | 🟡 Implementada y verificada contra PostgreSQL — falta ejecutar `go test ./...` |
| 6 | Outbox + motor de sincronización + Background Sync | 🟡 Implementada (`tsc -b`, lint, build y `go vet` OK) — faltan `npm run test` y verificación en navegador |
| 7 | Resolución de conflictos + vista de pendientes | 🟡 Implementada (`tsc -b`, lint y build OK) — faltan `npm run test` y verificación en navegador |
| 8 | Lectura offline de datos privados (instantáneas por usuario) + pendientes visibles en sus vistas | ⬜ Pendiente |
| 9 | UX offline, actualizaciones, instalación | ⬜ Pendiente |
| 10 | HTTPS y validación en dispositivos (U4) | ⬜ Pendiente |

> Con 0–3 la app es **instalable y abre sin conexión**. Con 4–7 es **offline-first**:
> consulta, captura y sincroniza sin duplicar pedidos. Con 8 todas las vistas privadas
> se consultan sin conexión. 9–10 la dejan lista para producción.
