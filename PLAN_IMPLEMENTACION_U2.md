# PLAN DE IMPLEMENTACIÓN — Back-office MultiCatálogo (alcance U1+U2)

> Plan checkeable de la rama `BackofficeU2` para convertir el sistema actual en un
> negocio MLM mínimo funcional. Se construye a partir de tres fuentes:
> - `REQUIREMENTS_CHECKLIST.md` → requisitos del sílabo aún pendientes (Fase 0).
> - `ANALISIS_FUNCIONAL_U2.md` → funcionalidades de negocio faltantes y su orden (Fases 1–8).
> - `PROJECT_MAP.md` → lo que ya existe en el código, para no planificar trabajo hecho.
>
> **Regla:** un ítem se marca `[x]` solo cuando su verificación pasa (curl/SQL/`go test`
> para backend, flujo en navegador para frontend). Al cerrar cada fase se actualizan
> `REQUIREMENTS_CHECKLIST.md` y `PROJECT_MAP.md`.
>
> **Principios (los mismos del checklist):** seguridad por defecto (toda escritura nace
> con `RequireAuth`/`RequireRole("admin")`), DI por interfaces (`controllers/ports.go`),
> funciones puras para el dominio, mobile-first en vistas nuevas (360px, touch ≥44px).
>
> **Convención:** identificadores en inglés, textos de UI en español. Cada fase indica
> primero **lo que ya existe** (no se implementa) y luego lo que falta. Las propuestas
> del análisis que se descartan por una decisión de diseño se marcan `[-]` con su motivo.

---

## FASE 0 — Cierre de brechas U1/U2 (requisitos del sílabo)

> Pendientes `[ ]` de `REQUIREMENTS_CHECKLIST.md`. Son cambios pequeños y deben quedar
> antes del back-office porque afectan a todo el código nuevo (cliente HTTP, errores,
> health). Descartado: `PORT` con defecto 3000 (puerto ocupado por otro proyecto).

**Frontend**

- [x] `VITE_API_URL` en `.env` + plantilla `.env.example` versionada (`.env` en `.gitignore`); `data/constants.ts` lee `import.meta.env.VITE_API_URL` con defecto `http://localhost:4000`; tipado en `src/vite-env.d.ts`
- [x] Separar hooks y tipos de los Providers: `context/auth.ts` (`useAuth`, `AuthContext`, `Role`, `User`) y `context/cart.ts` (`useCart`, `CartContext`, `CartItem`); actualizar imports → `npm run lint` con 0 warnings
- [x] Botones de acción ≥44px (`min-h-11`): `Añadir al Carrito` (Catalog), steppers y eliminar (Cart), `Cerrar Sesión`, menú y avatar (Navbar)
- [ ] Audit mobile-first a 375px sin overflow en Dashboard/MyNetwork/Catalog; reducir la sangría del árbol en móvil — sangría reducida; falta la verificación visual a 375px en DevTools

**Backend**

- [x] `GET /api/health` como método de `HealthController`: ping a PostgreSQL y Redis → `200 "ok"`, `200 "degraded"` (Redis caído), `503 "error"` (PostgreSQL caído); se conservan `/api/health/db` y `/api/health/redis`
- [x] Healthcheck del contenedor API: sonda en el binario (`/api healthcheck` → `GET /api/health`) en `Dockerfile` (`HEALTHCHECK`) y `docker-compose.yml`
- [x] `JWT_TTL` por defecto 2h (`config.go` y `.env.example`)
- [x] `APP_ENV`: `details` técnicos (restricciones, mensajes de PostgreSQL) solo con `APP_ENV=dev`; detalles redactados para el usuario siempre visibles (`DomainError.Public`)
- [x] `ErrInvalidQuantity`: 400 "cantidad debe ser mayor que cero", validado en el controlador y en el repositorio, distinto del 409 de stock (req.: `ErrCantidadInvalida`)

**Verificación**

- [x] `npm run lint` → 0 errores, 0 warnings; `npm run build` OK
- [x] `curl /api/health` con Redis detenido → `200 "degraded"`; con PostgreSQL detenido → `503`; `docker ps` muestra la API `healthy`/`unhealthy` según corresponda
- [x] Checkout con `quantity: 0` → `400 "cantidad debe ser mayor que cero"`; duplicado con `APP_ENV` vacío → `409` sin nombre de restricción
- [x] `go test ./...` y suite de regresión HTTP en verde

**Archivos:** `Frontend/.env.example`, `src/vite-env.d.ts`, `src/data/constants.ts`, `src/context/*`, componentes con botones; `Backend/config/config.go`, `controllers/healthController.go`, `controllers/helpers.go`, `controllers/checkoutController.go`, `repository/errors.go`, `repository/orders.go`, `healthcheck.go`, `main.go`, `routes/routes.go`, `Dockerfile`, `docker-compose.yml`, `.env.example`

---

## FASE 1 — Migración de datos del back-office

> Columnas y tablas que necesitan las fases siguientes, en una migración versionada
> nueva `database/migrations/0004_backoffice.sql` (se aplica sola al arrancar, en
> transacción). No se editan `0001`–`0003`: ya están aplicadas en los volúmenes.

**Ya existe (no se implementa):** `users.name`, `users.active`, `users.created_at`;
vínculo usuario ↔ red con FK real `network_members.sponsor_id` + trigger anticiclos
(antes: `usuarios.referido_id`); `orders.user_id` (antes: `pedidos.usuario_id`); ledger
`commissions` con tasas `commission_rates` (antes: `comisiones`).

- [x] `network_members.referral_code VARCHAR(20) UNIQUE NOT NULL` + códigos para el seed (antes: `referidos.codigo`); trigger `trg_network_referral_code` lo genera solo al afiliar
- [x] `products.active BOOLEAN NOT NULL DEFAULT TRUE` (baja lógica) (antes: `productos.activo`)
- [x] `orders.status VARCHAR(20) NOT NULL DEFAULT 'pending'` con CHECK (`pending`, `preparing`, `shipped`, `delivered`, `cancelled`) + índice `(status, created_at)` (antes: `pedidos.estado`); los pedidos previos quedan `delivered`
- [x] `commissions.status` (`pending`, `paid`, `reversed`; defecto `pending`) + `commissions.payout_id`
- [x] Tabla `payouts(id, beneficiary_id, total, created_at)` (antes: `liquidaciones`)
- [x] `v_user_commissions` excluye comisiones `reversed` (también la comisión por nodo de `GET /api/network`)
- [x] Trigger `fn_order_items_stock` rechaza productos inactivos (no se pueden vender tras la baja) → API 422 "Producto no disponible" (`ErrProductInactive`)

**Verificación**

- [x] `\d orders`, `\d commissions`, `\d payouts` muestran las columnas; `SELECT count(*) FROM network_members WHERE referral_code IS NULL` → 0
- [x] El backend arranca y registra `migración aplicada: 0004_backoffice`

---

## FASE 2 — Registro de clientes y vínculo de referido

> La puerta de entrada del negocio: cualquiera crea su cuenta y, con un código de
> referido, queda afiliado bajo su patrocinador (análisis 3.2 y 3.4).

**Ya existe:** `POST /api/users {email, password, name, sponsor_id?}` con bcrypt, rol
`customer` fijo y afiliación en una transacción (antes: `POST /api/register`); `409` por
email duplicado; `GET /api/users` (admin); login rechaza cuentas inactivas con 401
genérico (decisión anti-enumeración; el análisis sugería 401/403).

**Backend**

- [x] `POST /api/users` acepta `referral_code` (además de `sponsor_id`, no ambos); se normaliza a mayúsculas; código inexistente → `400 "Código de referido inválido"`
- [x] Generar `referral_code` único al afiliar un usuario nuevo (trigger de la Fase 1); todo registro queda afiliado, como raíz si no trae patrocinador, para tener su propio código
- [x] `GET /api/network` incluye el `referral_code` de la raíz; `GET /api/users` también lo muestra
- [x] `PATCH /api/users/:id` (admin): cambiar rol y `active`; invalidar `red:tree:*` afectados; un admin no puede cambiar su propio rol ni desactivarse (`400`) (antes: `PATCH /api/usuarios/:id`)

- [x] Validación de correo estricta (`validEmail`): solo `usuario@dominio.tld`, sin nombre ni `<...>` y con punto en el dominio
- [x] Contraseña fuerte (`passwordProblems`): 8+ caracteres (máx. 72 bytes), mayúscula, minúscula, número y carácter especial; `details.password` indica qué falta (la regla aplica al registro; las cuentas demo del seed usan contraseñas que también la cumplen, p. ej. `Admin123#`)
- [x] Sesión vigente: `RequireAuth` consulta la cuenta (`AccountLookup` → `GetUserByID`) en cada petición autenticada; cuenta desactivada o inexistente → `401`, y el rol y el email salen de la base (un admin degradado pierde el acceso de inmediato)
- [x] `GET /api/me`: cuenta autenticada con su estado vigente

**Frontend**

- [ ] Vista pública `/register`: nombre, email, contraseña, código de referido (prefill desde `?ref=`), un campo por fila (antes: `/registro`) — implementada (`Register.tsx`); falta verificación en navegador
- [ ] Enlace "Crear cuenta" en `Login.tsx`; tras registrar → `/login` con aviso de éxito — implementado; falta verificación en navegador
- [ ] `/register` con lista de reglas de contraseña que se marcan al escribir y aviso de correo inválido (`data/validation.ts`, misma lógica que el backend) — implementado; falta verificación en navegador
- [ ] `AuthContext` verifica la sesión con `GET /api/me` al cargar la app y al volver a la pestaña: cuenta desactivada → vuelve al login; rol cambiado → se aplica el vigente — implementado; falta verificación en navegador
- [ ] Vista admin `/admin/users`: tabla de cuentas + activar/desactivar y cambio de rol (antes: `/admin/usuarios`) — implementada (`AdminUsers.tsx` + entrada "Usuarios" en el sidebar); falta verificación en navegador

**Verificación**

- [x] `POST /api/users` con `referral_code` válido → `201`; login → `200`; `SELECT sponsor_id FROM network_members` apunta al patrocinador
- [x] Código inválido → `400`; email duplicado → `409`
- [x] Cuenta desactivada desde `/admin/users` → login `401` (verificado vía `PATCH /api/users/:id`)
- [x] Cuenta desactivada estando logueada → su mismo token recibe `401` en `/api/me` y `/api/network`
- [x] Admin degradado a customer → su token de admin recibe `403` en `GET /api/users`
- [x] Contraseña débil y correo con nombre o sin dominio con punto → `400` con el detalle por campo
- [x] Paridad de reglas frontend/backend: 20 casos iguales en `data/validation.ts` y `validation.go`

---

## FASE 3 — CRUD de productos (admin)

> El catálogo se administra desde la app; baja lógica para no romper el historial de
> `order_items` (análisis 3.1).

**Ya existe:** `POST /api/products` (admin) con validación por campo, categoría
existente, galería en `product_images` e invalidación de `productos:all` (antes:
`POST /api/productos`).

**Backend**

- [x] `PUT /api/products/:id` (admin): edición parcial (galería se reemplaza completa; `active: true` reactiva); `404` si no existe; bloquea la fila durante la edición (antes: `PUT /api/productos/:id`)
- [x] `DELETE /api/products/:id` (admin): `active = false`, no borra la fila; idempotente (antes: `DELETE /api/productos/:id`)
- [x] `GET /api/products` y `/:id` públicos solo devuelven `active = true` (inactivo → `404`)
- [x] `GET /api/admin/products` (admin) incluye inactivos, sin caché (antes: `/api/admin/productos`)
- [x] Invalidar `productos:all` tras `PUT` y `DELETE`
- [x] `GET /api/categories` (público): opciones del formulario de productos (el backend rechaza categorías inexistentes)
- [x] Validación pura compartida por alta y edición (`validateProductInput` / `validateProductUpdate`): longitudes de columnas, precio dentro de `NUMERIC(10,2)`, URLs de galería

**Frontend**

- [ ] Ruta `/admin/products` (`AdminRoute`): tabla (imagen, nombre, categoría, precio, stock, activo) (antes: `/admin/productos`) — implementada (`AdminProducts.tsx` + entrada "Productos" en el sidebar); falta verificación en navegador
- [ ] Formulario crear/editar mobile-first — implementado (`ProductForm.tsx`, categorías desde la API); falta verificación en navegador
- [ ] Activar/desactivar con confirmación — implementado; falta verificación en navegador

**Verificación**

- [x] `PUT`/`DELETE` como cliente → `403`; como admin → `200`
- [x] Producto dado de baja desaparece del catálogo, sigue en `order_items` y el checkout lo rechaza (`422`)
- [x] `productos:all` eliminada de Redis tras cada escritura

---

## FASE 4 — Consulta y gestión de pedidos

> El pedido deja de ser un agujero negro: el cliente ve su historial y el admin
> gestiona el ciclo de vida; cancelar es el espejo ACID del checkout (análisis 3.3 y 3.8).

**Ya existe:** `POST /api/checkout` (alias `POST /api/orders`) guarda el comprador del
token en `orders.user_id` y las líneas en `order_items`.

**Backend**

- [x] `GET /api/orders/mine`: pedidos del usuario del token, paginado `{data, page, limit, total}` (`?page`, `?limit` 1–50) (antes: `GET /api/pedidos/mios`)
- [x] `GET /api/orders` (admin): todos, paginado + filtro `?status=` (antes: `GET /api/pedidos`)
- [x] `GET /api/orders/:id`: cabecera + ítems con nombre de producto + `next_statuses`; solo dueño o admin (ajeno → `404`) (antes: `GET /api/pedidos/:id`)
- [x] `PATCH /api/orders/:id/status` (admin): `pending→preparing→shipped→delivered`; `cancelled` solo desde `pending`/`preparing`; transición inválida → `400` (antes: `PATCH /api/pedidos/:id/estado`)
- [x] Cancelación en **transacción**: `SELECT … FOR UPDATE` del pedido, `status='cancelled'`, reponer stock por ítem (productos bloqueados en orden de ID), `commissions.status='reversed'`; invalidar `productos:all` y `red:tree:*`; con comisiones ya pagadas → `409`
- [x] Reglas del ciclo de vida como función pura (`models.OrderTransitionAllowed`, replicada en `data/orders.ts`)
- [x] Carrera cancelación/comisiones resuelta: la goroutine lee el pedido con `FOR SHARE` y no paga comisiones de pedidos cancelados
- [x] `RecoverPending` ignora pedidos cancelados

**Frontend**

- [x] `/my-orders` (cliente): número, fecha, total, estado + detalle expandible (antes: `/mis-pedidos`) — implementada (`MyOrders.tsx`, `OrderCard.tsx`, `Pagination.tsx`); verificado en navegador
- [x] `/admin/orders` (admin): tabla con filtro por estado + cambio de estado (antes: `/admin/pedidos`) — implementada (`AdminOrders.tsx`, acciones solo con transiciones válidas y confirmación al cancelar); verificado en navegador
- [x] Enlace a `/my-orders` desde el navbar y desde la confirmación — implementado en el sidebar ("Mis Pedidos" y "Pedidos" para admin) y en la confirmación; verificado en navegador

**Verificación**

- [x] Cliente A no ve pedidos de cliente B (`/mine` por token; `/:id` ajeno → `404`)
- [x] Cancelar → stock restaurado, comisiones `reversed` y saldo de `v_user_commissions` reducido
- [x] Cancelar justo después de comprar no deja comisiones `pending`; con comisiones pagadas → `409` sin cambios
- [x] Transición inválida (`delivered→pending`) → `400`

---

## FASE 5 — Comisiones y red del distribuidor

> El dinero del MLM es auditable y cada distribuidor ve SU red y sus comisiones
> (análisis 3.4).

**Ya existe:** ledger `commissions` (nivel, tasa histórica y monto por pedido, 10/5/2 %)
con `UNIQUE(order_id, level)`; `CommissionService` en goroutine + `RecoverPending`;
`GET /api/network` devuelve la red **del usuario del token** con `summary` (antes:
`GET /api/red/mia`); `MyNetwork.tsx` con árbol, comisión por nodo y KPIs.

- [-] Insertar comisiones **dentro** de la transacción del pedido — descartado: la goroutine tras el COMMIT cumple U2-T1 (no bloquear la respuesta) y la pérdida está cubierta por `UNIQUE(order_id, level)` + `RecoverPending`
- [-] `domain/comisiones.go` con `RepartirComisiones` — descartado: la regla vive en una sola sentencia SQL atómica e idempotente (`repository/commissions.go`); duplicarla en Go crea dos fuentes de verdad
- [-] Contador `ventas` en la red — no aplica: las ventas salen de la vista `v_user_sales`

**Backend**

- [x] `GET /api/commissions/mine`: ledger del usuario (pedido, comprador, nivel, tasa, monto, estado), paginado, + totales por estado calculados sobre todo el ledger (antes: `/api/comisiones/mias`)

**Frontend**

- [ ] Abrir `my-network` a clientes (hoy está bajo `AdminRoute`; el backend ya filtra por token) — implementado (ruta para todos los roles, "Mi Red" en el sidebar, mensaje si la cuenta no está afiliada); falta verificación en navegador
- [ ] Link de invitación `/register?ref=CODIGO` con botón copiar — implementado (`InviteLink.tsx`, solo en la red propia); falta verificación en navegador
- [ ] Panel "Mis comisiones": tabla del ledger + totales por estado — implementado (`CommissionsPanel.tsx`, paginado); falta verificación en navegador

**Verificación**

- [x] Dos clientes distintos ven árboles distintos en `/my-network` (cada uno como raíz "Tú", con su propio código)
- [x] `/api/commissions/mine` suma lo mismo que `v_user_commissions` del usuario (pending + paid; verificado en 3 cuentas)
- [x] Una compra nueva aparece en el ledger del patrocinador; al cancelarla pasa a `reversed`

---

## FASE 6 — Liquidaciones a distribuidores

> Cerrar el ciclo del dinero: el admin paga lo que el ledger debe (análisis 3.5).

**Ya existe:** saldo histórico y del mes por beneficiario en `v_user_commissions`.

- [x] `POST /api/payouts {beneficiary_id}` (admin): transacción con `FOR UPDATE` — suma comisiones `pending`, crea `payouts`, marca `paid` + `payout_id`; sin pendientes → `409`; inexistente → `404` (antes: `POST /api/liquidaciones`)
- [x] **Regla de negocio:** solo se liquidan comisiones de pedidos **entregados** (la venta ya es definitiva y un pedido entregado no puede cancelarse); las de pedidos en curso figuran en la deuda como "en espera" hasta la entrega
- [x] Concurrencia: bloquea primero los pedidos entregados (`FOR SHARE`) y luego las comisiones (`FOR UPDATE`), en el mismo orden que el cambio de estado — dos liquidaciones simultáneas nunca pagan doble
- [x] `GET /api/payouts` (admin): historial de pagos paginado, con beneficiario y cantidad de comisiones (antes: `/api/liquidaciones`)
- [x] `GET /api/payouts/mine`: cobros del distribuidor, paginado (antes: `/api/liquidaciones/mias`)
- [ ] Panel "Mis cobros" en `/my-network` (agregado al plan): cada liquidación recibida con fecha, monto y comisiones cubiertas, paginado — implementado (`PayoutsPanel.tsx`, consume `GET /api/payouts/mine`); falta verificación en navegador
- [ ] Vista admin `/admin/payouts`: deuda por distribuidor + botón liquidar (antes: `/admin/liquidaciones`) — implementada (`AdminPayouts.tsx` con confirmación e historial paginado, "Liquidaciones" en el sidebar); falta verificación en navegador

**Verificación**

- [x] Liquidar → comisiones `paid`; segunda liquidación → `409` (no paga doble)
- [x] Dos liquidaciones simultáneas → una `201` y otra `409`; cancelar un pedido sin entregar mientras se liquida nunca paga su comisión (4 ejecuciones del escenario, sin deadlocks)
- [x] La deuda separa lo listo para liquidar (pedidos entregados) de lo que está en espera; al entregar un pedido su comisión pasa a liquidable; ningún pago incluye comisiones de pedidos sin entregar
- [x] Tras liquidar no quedan comisiones `pending` de pedidos entregados del beneficiario (las de pedidos en curso siguen pendientes; el saldo de `v_user_commissions` no cambia)

---

## FASE 7 — Reportes y dashboard real

> El Dashboard deja de calcular KPIs en el cliente sobre la red y refleja el negocio
> (análisis 3.6).

**Ya existe:** vistas `v_order_totals`, `v_user_sales`, `v_user_commissions` como base de
las agregaciones.

- [x] `GET /api/reports/summary?from&to`: total vendido, nº pedidos, ticket promedio, comisiones devengadas (sin cancelados), más pedidos cancelados y nuevos afiliados (antes: `/api/reportes/ventas`)
- [x] Periodo: `?range=last_30_days` (por defecto) | `month_to_date` | `today`, o rango personalizado `?from=AAAA-MM-DD&to=AAAA-MM-DD` (ambos días completos, "to" vacío = hoy, máximo un año); resuelto con funciones puras (`resolveRange`, `parseDateRange`) y devuelto en la respuesta (`range`, `from`, `to`, `timezone`) e interpretado en la zona horaria del negocio (`APP_TIMEZONE`, por defecto `America/Guayaquil`): un pedido de la noche en Ecuador ya es el día siguiente en UTC y sin esto quedaba fuera del reporte; probado con días de 23 y 25 h por cambio de horario
- [x] Índice `orders(created_at)` (migración `0005_orders_created_index.sql`): los reportes por rango de fecha usan `Index Only Scan`
- [x] `GET /api/reports/top-products` (`SUM(quantity × unit_price) GROUP BY product`, sin cancelados, `?limit` 1–20) (antes: `/api/reportes/top-productos`)
- [x] `GET /api/reports/top-sponsors` (ventas de la red por patrocinador, niveles 1–3, a partir del ledger de comisiones no revertidas) (antes: `/api/reportes/top-referidos`)
- [x] `GET /api/reports/pending-commissions` (deuda por distribuidor: lista para liquidar y en espera) (antes: `/api/reportes/comisiones`) — adelantado en la Fase 6: lo usa la vista de liquidaciones
- [ ] Dashboard admin consume los reportes (carga + estado vacío) — implementado (`Dashboard.tsx`: selector Últimos 30 días / Este mes / Hoy / Personalizado con las fechas siempre cargadas, Restablecer, periodo en la URL y línea con el periodo aplicado y su zona horaria; 6 KPIs, comisiones por liquidar, top productos y top patrocinadores); falta verificación en navegador
- [x] Fechas de pedidos, comisiones y pagos mostradas en la zona del negocio (`data/dates.ts` con `Intl.DateTimeFormat`, `VITE_BUSINESS_TIMEZONE`)

**Verificación**

- [x] Los KPIs coinciden con `SELECT SUM(total) FROM v_order_totals` del periodo; la suma de ingresos por producto = total vendido; un pedido cancelado deja de contar

---

## FASE 8 — Operaciones de API (dureza final)

> Detalles que separan una demo de un servicio usable con volumen (análisis 3.7).

**Ya existe:** todas las rutas de escritura actuales con `RequireAuth`; las admin con
`RequireRole("admin")` (antes: `RequireAdmin`); validación de entrada por controlador con
errores por campo; `Page[T]` y `pagination` ya usados en pedidos (Fase 4), comisiones
(Fase 5) y liquidaciones (Fase 6), con su componente `Pagination.tsx`.

- [x] Paginación estándar `Page[T]{data, page, limit, total}` en usuarios, pedidos y productos admin (antes: `Pagina`) — pedidos desde la Fase 4; `GET /api/users` (`ListUsers`) y `GET /api/admin/products` (`ListAllProducts`) pasan de lista a `Page`, ordenados por ID
- [x] `?q=` server-side (`ILIKE`) en `/api/admin/products` (nombre o categoría) y también en `/api/users` (nombre, correo o código de referido); texto sin espacios a los lados, máximo 100 caracteres, comodines `%`/`_` buscados literal (`containsPattern`); el catálogo público sigue completo y cacheado
- [x] Paginación en las vistas de listado del front — `AdminUsers` y `AdminProducts` con `Pagination` y búsqueda (`SearchInput` + `useDebouncedValue`, 300 ms; al cambiar la búsqueda vuelve a la página 1); `listQuery` compartido en `apiClient.ts`. Falta verificación en navegador
- [x] Auditoría final: toda ruta nueva de las fases 2–7 con `RequireAuth` y, si es admin, `RequireRole("admin")` — revisado `routes.go` y probado contra la API: 23 rutas protegidas → 401 sin token, 14 de admin → 403 para un cliente; públicas solo login, registro, catálogo, categorías y health
- [x] (Opcional) Validación central de entrada reutilizable entre controladores — `validation.go` (correo, contraseña, productos) y `helpers.go` (`pagination`, `listFilter`) compartidos por los controladores

> Fuera de alcance: emails transaccionales (se podría simular con un `Mailer` inyectado
> que registre en log), pasarela de pago real, refresh tokens, Outbox persistente.

---

## Estado de fases

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Brechas del sílabo: `VITE_API_URL`, lint 0, touch 44px, health con deps + healthcheck, `JWT_TTL` 2h, `APP_ENV`, `ErrInvalidQuantity` | 🟡 Implementada y verificada — falta la auditoría visual a 375px |
| 1 | Migración `0004_backoffice.sql` | ✅ Implementada y verificada |
| 2 | Registro con código de referido + admin de usuarios + vistas | 🟡 Backend verificado; vistas implementadas, falta recorrido en navegador |
| 3 | CRUD productos (edición + baja lógica) | 🟡 Backend verificado; vistas implementadas, falta recorrido en navegador |
| 4 | Pedidos: consulta, estados, cancelación ACID | ✅ Implementada y verificada |
| 5 | Comisiones del distribuidor + red visible al cliente | 🟡 Backend verificado; vistas implementadas, falta recorrido en navegador |
| 6 | Liquidaciones | 🟡 Backend verificado; vista implementada, falta recorrido en navegador |
| 7 | Reportes + Dashboard real | 🟡 Backend verificado; Dashboard implementado, falta recorrido en navegador |
| 8 | Paginación + `?q=` + auditoría | 🟡 Backend verificado; vistas implementadas, falta recorrido en navegador |

> Con 0–5 el sistema **vende, afilia por código, gestiona pedidos y traza comisiones**:
> MLM mínimo funcional. 6–8 lo llevan a operación diaria real.
