# ANÁLISIS FUNCIONAL — MultiCatálogo al cierre de la Unidad 2

> Informe de brecha funcional: qué le falta al sistema para operar un
> **negocio multinivel real** dentro del alcance ya visto en clase
> (Unidad 1: SPA React · Unidad 2: API Go/Fiber + PostgreSQL + Redis).
>
> El análisis proyecta la arquitectura completa del semestre (U3 SaaS,
> U4 despliegue) pero **solo reporta las funcionalidades implementables
> hasta U2**. Lo que corresponde a U3/U4 se indica como "fuera de alcance".
>
> Contrastado con el código de la rama `BackofficeU2`. Identificadores en inglés;
> cuando antes se usaba otro nombre se indica `(antes: nombre)`.

---

## 1. Resumen ejecutivo

El sistema hoy tiene un **núcleo transaccional sólido y seguro**: login con
bcrypt + JWT real, catálogo cacheado, checkout con transacción ACID y
comisiones asíncronas registradas en un ledger. Como demostración técnica es excelente.

**Pero como negocio, el sistema está a medio camino:** el admin puede dar de alta
productos pero no editarlos ni darlos de baja; los clientes pueden registrarse por API
pero no hay pantalla de registro ni código de referido; nadie puede consultar un pedido
después de comprarlo; las comisiones se registran pero no se liquidan, y el cliente no
puede ver su propia red. Falta el **back-office** — que es donde vive el 80 % de
una aplicación comercial real.

**Respuestas rápidas a las preguntas típicas:**

| ¿Ya se puede...? | Respuesta | Qué falta |
|---|---|---|
| Ingresar nuevos productos | 🟡 Parcial: existe `POST /api/products` (admin) (antes: `POST /api/productos`) | Edición, baja lógica + vista admin |
| Registrar nuevos clientes | 🟡 Parcial: existe `POST /api/users` (antes: `POST /api/register`); el seed tiene 9 usuarios | Formulario `/register` |
| Ver pedidos realizados | ❌ El pedido se guarda pero nadie puede consultarlo | `GET /api/orders` + historial |
| Dar de alta distribuidores | 🟡 Parcial: afiliación con `sponsor_id` sobre la FK real `network_members` | Registro con código de referido |
| Ver reportes de ventas | ❌ El Dashboard calcula KPIs en el cliente sobre la red | Queries de agregación + pantallas |
| Liquidar comisiones | 🟡 Parcial: existe el ledger `commissions` con trazabilidad por pedido | Estado de comisión + liquidación |

---

## 2. Lo que SÍ existe (base construida U1+U2)

- Catálogo público con búsqueda/filtros, detalle, caché Redis (`productos:all`)
- Alta de productos por el admin: `POST /api/products`
- Registro de clientes con patrocinador opcional: `POST /api/users`; listado admin `GET /api/users`
- Carrito por usuario + checkout con transacción ACID real (trigger `fn_order_items_stock` bloquea la fila y descuenta stock, rollback)
- Comisiones asíncronas: goroutine (`CommissionService`) sube hasta 3 niveles por `sponsor_id` (antes: `parent_id`) y las registra en el ledger `commissions`
- Red del usuario del token: `GET /api/network` con `summary` de comisiones
- Autenticación real: bcrypt + JWT (8h por defecto) + middleware `RequireAuth`/`RequireRole("admin")` (antes: `RequireAdmin`)
- Vistas: Storefront, Catalog, ProductDetail, Cart, Checkout, Confirmation, Dashboard KPIs, MyNetwork (Dashboard y MyNetwork solo para admin)
- Persistencia: `users`, `products`, `network_members`, `orders`, `order_items`, `commissions` + índices (antes: `usuarios`, `productos`, `referidos`, `pedidos`, `pedido_items`)

---

## 3. Funcionalidades faltantes por dominio (alcance U1+U2)

Cada bloque indica: **Backend** (endpoint U2) + **Frontend** (vista U1) +
**Prioridad** de negocio.

### 3.1 Gestión de catálogo (CRUD de productos) — 🔴 CRÍTICO

Un negocio no puede depender de la migración de seed para editar mercadería.

| Capa | Falta implementar |
|---|---|
| Backend | Ya existe `POST /api/products` (crear). Falta `PUT /api/products/:id` (editar nombre/precio/descripción/categoría/stock), `DELETE /api/products/:id` (borrado lógico para no romper `order_items` históricos). Todas con `RequireAuth` + **`RequireRole("admin")`**. Invalidar `productos:all` en cada escritura. (antes: `/api/productos`) |
| Frontend | Ruta admin `/admin/products`: tabla con paginación + formulario de alta/edición + confirmación de borrado. Validación con los mismos tipos que el modelo. (antes: `/admin/productos`) |
| Datos | Columna `products.active BOOLEAN DEFAULT true` (borrado lógico) (antes: `activo`). Upload de imágenes queda fuera de alcance (storage/CDN → post-sílabo); hoy basta `image_url` con URL. |

> **Lección de diseño:** escribir en `products` exige decidir invalidación
> de caché (`DEL productos:all`) — mismo patrón que ya usan el checkout y el alta.

### 3.2 Gestión de clientes y usuarios — 🔴 CRÍTICO

Hoy existen 9 cuentas del seed y el registro solo se puede hacer por API.

| Capa | Falta implementar |
|---|---|
| Backend | Ya existen `POST /api/users` (email + password + nombre → bcrypt, rol `customer` fijo) (antes: `POST /api/register`) y `GET /api/users` (admin) (antes: `/api/usuarios`). Falta `PATCH /api/users/:id` (cambiar rol, activar/desactivar), protegida con `RequireRole("admin")`. |
| Frontend | Vista `/register` pública conectada al endpoint + enlace desde Login (antes: `/registro`). Vista admin `/admin/users` con tabla de cuentas (antes: `/admin/usuarios`). |
| Datos | Ya existen `users.active`, `users.name`, `users.created_at` (antes: `activo`, `nombre`, `creado_en`). Login ya rechaza cuentas inactivas con `401`. |

> **Regla de negocio:** el cliente que se registra **debería** poder hacerlo
> con código de referido (ver 3.4) — es la puerta de crecimiento del MLM.

### 3.3 Gestión y consulta de pedidos — 🔴 CRÍTICO

Los pedidos se guardan pero desaparecen: ni el cliente ni el admin pueden verlos.

| Capa | Falta implementar |
|---|---|
| Backend | `GET /api/orders/mine` (cliente ve SUS pedidos — filtrar por el usuario del claim JWT). `GET /api/orders` (admin, paginado `?page=&limit=`). `GET /api/orders/:id` con sus `order_items`. `PATCH /api/orders/:id/status` (admin: `pending→preparing→shipped→delivered`, `cancelled`). (antes: `/api/pedidos/...`, `estado`) |
| Frontend | `/my-orders` para el cliente (lista + detalle con ítems). `/admin/orders` para el admin con cambio de estado. (antes: `/mis-pedidos`, `/admin/pedidos`) |
| Datos | Columna `orders.status VARCHAR DEFAULT 'pending'` (antes: `pedidos.estado`). Ya existe `orders.user_id`, FK real al comprador (antes: `pedidos.usuario_id`). |

> **Regla de negocio MLM:** cancelar un pedido debe **devolver el stock**
> y revertir las comisiones — la transacción de cancelación es el espejo
> ACID del checkout.

### 3.4 Red multinivel real — 🔴 CRÍTICO (es el corazón del negocio)

La red ya está enlazada a los usuarios con una FK real (`network_members.sponsor_id`) y
crece con cada registro que trae `sponsor_id`. Un MLM real necesita que se afilie por
**código de invitación** y que cada distribuidor vea su red.

| Capa | Falta implementar |
|---|---|
| Backend | Al registrarse, afiliar por código de referido (`POST /api/users` con `referral_code`) además de `sponsor_id` (antes: `POST /api/register?ref=CODIGO`). Ya existe `GET /api/network` → árbol **del usuario del token** (antes: `GET /api/red/mia`). Ya existe el **ledger** `commissions(order_id, beneficiary_id, level, rate, amount)` (antes: `comisiones(pedido_id, referido_id, nivel, porcentaje, monto)`), insertado por la goroutine tras el COMMIT; falta su columna de estado. |
| Frontend | Link de referido visible en MyNetwork (`/register?ref=...`). Abrir MyNetwork a los clientes (hoy solo admin) con sus comisiones por nivel y por pedido. |
| Datos | Ya existe la FK real `network_members.sponsor_id` (antes: `usuarios.referido_id`). Falta `network_members.referral_code VARCHAR UNIQUE` para el link de invitación (antes: `referidos.codigo`). |

> **Advertencia de experto MLM:** sin ledger, las comisiones no son
> defendibles ante auditoría ni ante el distribuidor que reclama su pago.
> El ledger `commissions` ya cumple ese papel; falta su estado de pago.

### 3.5 Liquidaciones y pagos a distribuidores — 🟠 ALTO

| Capa | Falta implementar |
|---|---|
| Backend | `GET /api/commissions/mine` (cliente/distribuidor) (antes: `/api/comisiones/mias`), `POST /api/payouts` (admin marca comisiones `pending→paid`) (antes: `/api/liquidaciones`). Estados: `pending`, `paid`, `reversed`. |
| Datos | Tabla `payouts(id, beneficiary_id, total, created_at)` + `commissions.payout_id` nullable (antes: `liquidaciones`, `comisiones.liquidacion_id`). |

### 3.6 Reportes y KPIs reales — 🟠 ALTO

El Dashboard calcula sus KPIs en el navegador a partir de la red, no del negocio.

| Capa | Falta implementar |
|---|---|
| Backend | `GET /api/reports/summary?from&to` (total vendido, nº pedidos, ticket promedio), `GET /api/reports/top-products`, `GET /api/reports/top-sponsors`, `GET /api/reports/pending-commissions` (deuda de comisiones por distribuidor) (antes: `/api/reportes/*`). SQL de agregación (`SUM/GROUP BY`) sobre las vistas `v_order_totals`, `v_user_sales`, `v_user_commissions` — buen ejercicio U2-T3. |
| Frontend | Dashboard admin real: tarjetas KPI + tabla de top productos/vendedores. Gráficos opcionales (fuera de alcance estricto). |

### 3.7 Operaciones básicas de API — 🟡 MEDIO

- **Paginación** en los listados (`?page&limit` + `total`) — indispensable cuando el catálogo crece.
- **Validación central** de entrada (hoy cada controlador valida a mano).
- **Búsqueda server-side** (`?q=`) — la búsqueda actual es solo en cliente sobre la lista cacheada.
- `RequireRole("admin")` aplicado a TODAS las rutas de escritura nuevas (ya se usa en las existentes) (antes: `RequireAdmin`).
- **Emails transaccionales** (confirmación de pedido, bienvenida): fuera de alcance estricto — requiere SMTP/mailer, se puede simular con un `Mailer` inyectado que hoy haga `log.Println`.

### 3.8 Estado del pedido y cancelación — 🟠 ALTO

Hoy un pedido nace "pagado" de facto. Un flujo real mínimo:

```
pending → preparing → shipped → delivered
    └──────► cancelled (devuelve stock + revierte comisiones)
```

---

## 4. Matriz: funcionalidad → dónde encaja en el sílabo

| Funcionalidad | Backend (U2) | Frontend (U1) | Prioridad |
|---|---|---|---|
| CRUD productos (edición + baja lógica) | U2-T2/T4 (endpoints + `RequireRole("admin")`) | U1-T5 (vista admin) | 🔴 |
| Registro clientes (vista) + admin de usuarios | U2-T4 (bcrypt y `POST /api/users` ya existen) | U1-T5 (vistas) | 🔴 |
| Consulta/gestión pedidos | U2-T2 (endpoints + paginación) | U1-T5 (`/my-orders`, `/admin/orders`) | 🔴 |
| Red real: registro con código + red visible al cliente | U2-T4 (identidad por token ya lista) | U1-T5 (MyNetwork personal + link) | 🔴 |
| Ledger de comisiones | Ya existe (U2-T1: goroutine tras el COMMIT) | — | ✅ |
| Liquidaciones | U2-T4 | U1-T5 | 🟠 |
| Reportes/KPIs | U2-T3 (agregaciones SQL) | U1-T5 (Dashboard) | 🟠 |
| Paginación server-side | U2-T2 | U1-T4 | 🟡 |
| Pasarela de pago real | Post-sílabo | — | ⚪ |
| Multitenant/SaaS | **U3** | — | ⚪ fuera de alcance |
| Docker/proxy/OWASP | **U4** | — | ⚪ fuera de alcance |
| Outbox/worker, refresh tokens, emails reales | Roadmap post-sílabo | — | ⚪ |

---

## 5. Orden de implementación sugerido (dentro de U2)

1. **Registro (vista) + admin de usuarios** — sin clientes nuevos no hay nada que probar.
2. **Código de referido (`network_members.referral_code`) + registro con `?ref=`** — la red crece por invitación; es lo que convierte esto en MLM.
3. **CRUD productos (admin)** — catálogo administrable.
4. **`GET /api/orders` + estados** — el pedido deja de ser un agujero negro; cancelación devuelve stock.
5. **Estado del ledger `commissions`** — trazabilidad del pago; luego liquidaciones.
6. **Reportes** — el Dashboard pasa de demo a herramienta de gestión.

Con los pasos 1-5, el sistema ya **vende, referencia y paga comisiones
trazables**: es un MLM mínimo funcional real. Los pasos restantes son
escala (reportes, paginación) y el salto a producción (U3/U4 + roadmap).
El detalle checkeable está en `PLAN_IMPLEMENTACION_U2.md`.

---

## 6. Deuda técnica conocida (no bloquea, pero registrar)

- Ya no hay contador `ventas`: las ventas salen de la vista `v_user_sales` y el
  saldo de comisiones de `v_user_commissions`; el ledger `commissions` es la
  **fuente de verdad**.
- Goroutine fire-and-forget sigue siendo el mecanismo de comisiones —
  aceptable en el curso, con idempotencia (`UNIQUE(order_id, level)`) y
  `RecoverPending` al arrancar; el roadmap ya prevé Outbox persistente.
- La FK usuario↔red ya existe (`network_members.sponsor_id`); el código de
  referido (3.4) debe agregarse ANTES de poblar más usuarios.
