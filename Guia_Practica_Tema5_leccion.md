# Guía de Laboratorio — Práctica 03 (Unidad 1, Tema 5)
## Implementación de interfaces interactivas a pantalla completa y flujos para catálogos de venta multinivel

> Asignatura: Framework Programación Web — Periodo 2026-02
> Proyecto: MultiCatálogo — React 19 + Vite + Tailwind CSS + React Router v7 (TypeScript) + API Go/Fiber
> Planificación de referencia: `Planificacion_Unidad1_Tema5.md`
> Documento de uso: los estudiantes (o una IA) pueden seguir esta guía desde el estado del proyecto al final del Tema 4 y reproducir la Práctica 03 paso a paso.

---

## 1. Objetivos de la práctica

Alineados con los resultados de aprendizaje de la planificación (sección 3):

| Tipo | Objetivo |
|---|---|
| **Saber** | Aplicar los patrones de interfaz a pantalla completa (hero full-screen, overlays, lightbox) y los flujos transaccionales de un catálogo de venta multinivel (exploración → detalle → pedido → red de referidos). |
| **Saber Hacer** | Construir vistas inmersivas y flujos completos de compra y de red multinivel en React, integrando estado global, rutas dinámicas y consumo de servicios. |
| **Saber Hacer (roles)** | Introducir roles de usuario (`admin` y `cliente`) con guardas de ruta por rol y una API que devuelva el rol al autenticar. |
| **Saber Ser / Convivir** | Aplicar buenas prácticas de usabilidad, accesibilidad y aislamiento de datos por usuario, con honestidad académica. |

---

## 2. Punto de partida (estado del proyecto al final del Tema 4)

El proyecto ya cuenta con lo siguiente (temas 2, 3 y 4 del sílabo):

| Archivo | Estado al terminar el Tema 4 |
|---|---|
| `src/App.tsx` | Rutas `/login` (pública) y `/`, `/catalogo`, `/mi-red`, `/carrito` protegidas con `ProtectedRoute`. Sin roles. |
| `src/context/AuthContext.tsx` | `isAuthenticated` + `userEmail`; funciones `login(email)` y `logout()`. |
| `src/context/CartContext.tsx` | Carrito **en memoria**: `addToCart`, `removeFromCart`, `totalItems`, `totalPrice`. Sin persistencia ni cantidades. Exporta la interfaz `Producto` (`id`, `nombre`, `precio`, `img`). |
| `src/components/Login.tsx` | `fetch` a `POST /api/login`; guarda `userEmail`; navega a `/`. |
| `src/components/Catalogo.tsx` | `fetch` a `GET /api/productos`; grilla de tarjetas con "Añadir al Carrito". |
| `src/components/Carrito.tsx` | Lista de ítems, eliminar y total. Botón "Proceder al Pago" sin función. |
| `src/components/MiRed.tsx` | Tabla/tarjetas con datos estáticos (3 referidos). |
| `src/components/Dashboard.tsx` | 3 tarjetas con valores estáticos. |
| `src/components/Layout.tsx`, `Navbar.tsx`, `Sidebar.tsx` | Layout responsive (sidebar colapsable + móvil), carrito en Navbar, avatar con logout. |
| Backend `controllers/authController.go` | `POST /api/login` valida solo `admin@upse.edu.ec/123456` y devuelve `token` + `email`. |
| Backend `controllers/prodController.go` | `GET /api/productos` devuelve 4 productos hardcodeados (`id`, `nombre`, `precio`, `img`). |

**Qué obtendrás al final** (entregables del checklist de la planificación, sección 6):

| # | Entregable | Ruta / vista | Concepto aplicado |
|---|---|---|---|
| F1 | Storefront a pantalla completa con hero + secciones | `/tienda` | Full-viewport, diseño inmersivo |
| F2 | Ruta dinámica de detalle | `/producto/:id` | `useParams`, rutas anidadas |
| F3 | Búsqueda + filtros del catálogo | `/catalogo` | `useMemo`, estado de UI |
| F4 | Galería/lightbox en el detalle | `DetalleProducto` | Overlay/modal, accesibilidad |
| F5 | Carrito persistente por usuario + checkout | `Carrito`, `Checkout`, `Confirmacion` | Persistencia, flujo transaccional |
| F6 | Árbol multinivel de referidos con comisiones | `/mi-red` | Jerarquía, cálculo derivado |
| F7 | Dashboard con KPIs dinámicos | `/` | Estado global + derivación |
| F8 | Login con rol y navegación por rol | `Login`, `Sidebar`, `Navbar` | Autenticación por perfil |

---

## 3. Puesta en marcha

### Arrancar el backend (puerto 3000)

```bash
cd Unidad2_Backend/multicatalogo-backend
go run .
```

### Arrancar el frontend (puerto 5173)

```bash
cd Unidad1_Frontend/Proyecto_base
npm install   # primera vez (o npm ci si existe package-lock.json)
npm run dev
```

Abrir `http://localhost:5173` (o la IP que indique Vite).

### Cuentas de prueba (se crearán en el Paso 1)

| Rol | Correo | Contraseña |
|---|---|---|
| Admin | `admin@upse.edu.ec` | `123456` |
| Cliente | `cliente@upse.edu.ec` | `123456` |

---

## 4. Correspondencia de los pasos con la planificación

| Paso | Entregable | Componente (planificación) |
|---|---|---|
| 1 — Rol en la API | base de F8 | ACD 2 |
| 2 — Datos de productos | base de F1, F3, F4 | ACD 1 |
| 3 — Datos de la red MLM | base de F6, F7 | AA 2 |
| 4 — Servicio de productos | base de F1, F3 | ACD 1 |
| 5 — Autenticación con rol | F8 | ACD 2 |
| 6 — Rutas y guardas | base | ACD 2 |
| 7 — Storefront full-screen | F1 | ACD 1 |
| 8 — Catálogo con filtros | F3 | APD |
| 9 — Detalle y lightbox | F2, F4 | ACD 2 |
| 10 — Carrito persistente por usuario | F5 | APD |
| 11 — Checkout y confirmación | F5 | AA 1 |
| 12 — Red multinivel | F6 | AA 2 |
| 13 — Dashboard con KPIs | F7 | AA 2 |
| 14 — Navegación por rol | F8 | ACD 2 |

---

## 5. Pasos de implementación

> Cada paso indica el archivo a crear o modificar, el **código final** y cómo probarlo. Se recomienda seguir el orden propuesto y verificar cada paso antes de continuar.

---

### Paso 1 — La API devuelve el rol del usuario (admin / cliente)

**Concepto:** la autenticación distingue dos perfiles: `admin` (gestiona el negocio) y `cliente` (compra en línea). El backend sigue con datos hardcodeados; la persistencia real con PostgreSQL se abordará en la Unidad 2 (Tema 3).

**Archivo:** `Unidad2_Backend/multicatalogo-backend/controllers/authController.go` (modificar)

```go
// Declaramos el paquete controllers para agrupar las funciones que manejan la lógica de negocio de las rutas.
package controllers

import (
	// Importamos el framework Fiber para tener acceso al contexto (c *fiber.Ctx) de la petición HTTP.
	"github.com/gofiber/fiber/v2"
	// Importamos nuestro paquete de modelos para poder usar la estructura LoginRequest.
	"multicatalogo-backend/models"
)

// Login es la función controladora que se ejecutará cuando el cliente envíe sus credenciales.
func Login(c *fiber.Ctx) error {
	// Creamos una variable 'req' del tipo LoginRequest (ubicada en nuestro paquete models) para almacenar los datos.
	var req models.LoginRequest

	// Intentamos parsear (transformar) el cuerpo JSON entrante y guardarlo en la variable 'req'.
	if err := c.BodyParser(&req); err != nil {
		// Si ocurre un error al parsear (ej. JSON mal formado), retornamos un estado HTTP 400 (Bad Request).
		return c.Status(400).JSON(fiber.Map{"error": "Cuerpo de petición inválido"})
	}

	// Evaluamos si el email y la contraseña coinciden con las credenciales predefinidas.
	// Nota: al estar hardcodeado, distinguimos dos roles: admin y cliente.
	switch {
	case req.Email == "admin@upse.edu.ec" && req.Password == "123456":
		// Si es el administrador, retornamos un estado HTTP 200 (por defecto) con token ficticio, correo y rol admin.
		return c.JSON(fiber.Map{"token": "fake-jwt-token-123", "email": req.Email, "rol": "admin"})
	case req.Email == "cliente@upse.edu.ec" && req.Password == "123456":
		// Si es un cliente registrado, retornamos un estado HTTP 200 con token ficticio, correo y rol cliente.
		return c.JSON(fiber.Map{"token": "fake-jwt-token-456", "email": req.Email, "rol": "cliente"})
	default:
		// Si las credenciales son incorrectas, retornamos un estado HTTP 401 (No autorizado) con un mensaje de error.
		return c.Status(401).JSON(fiber.Map{"error": "Credenciales incorrectas"})
	}
}
```

**Probar:**

```bash
cd Unidad2_Backend/multicatalogo-backend && go build ./...
curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" \
  -d '{"email":"admin@upse.edu.ec","password":"123456"}'
# → {"email":"admin@upse.edu.ec","rol":"admin","token":"fake-jwt-token-123"}
```

---

### Paso 2 — Datos de ejemplo del catálogo

**Concepto:** el detalle con galería y los filtros necesitan más campos que los 4 productos actuales de la API (`descripción`, `categoría`, varias imágenes). Como esta unidad es de frontend, definimos un **mock** que simula la API; en la Unidad 2 estos datos saldrán de PostgreSQL.

**Archivo nuevo:** `src/data/productos.ts`

```ts
// src/data/productos.ts
// Datos de ejemplo (mock) del catálogo.
// NOTA: en la Unidad 2 estos datos se reemplazarán por los registros reales
// de PostgreSQL consultados a través de GET /api/productos.

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: string;
  img: string;        // Imagen principal (portada)
  galeria: string[];  // Imágenes adicionales para la galería/lightbox
}

// Lista de categorías derivada de los productos (se usa para los filtros)
export const categorias = [
  "Serum",
  "Crema",
  "Tónico",
  "Mascarilla",
  "Kit",
];

export const productosMock: Producto[] = [
  {
    id: 1,
    nombre: "Serum Revitalizante",
    descripcion:
      "Serum concentrado con vitamina C y ácido hialurónico. Ilumina la piel, reduce manchas y aporta hidratación profunda desde la primera aplicación.",
    precio: 45.0,
    categoria: "Serum",
    img: "https://picsum.photos/seed/serum/600",
    galeria: [
      "https://picsum.photos/seed/serum1/600",
      "https://picsum.photos/seed/serum2/600",
      "https://picsum.photos/seed/serum3/600",
    ],
  },
  {
    id: 2,
    nombre: "Crema Hidratante Pro",
    descripcion:
      "Crema facial de textura ligera con niacinamida y manteca de karité. Hidratación de 24 horas y barrera cutánea fortalecida para todo tipo de piel.",
    precio: 32.5,
    categoria: "Crema",
    img: "https://picsum.photos/seed/crema/600",
    galeria: [
      "https://picsum.photos/seed/crema1/600",
      "https://picsum.photos/seed/crema2/600",
      "https://picsum.photos/seed/crema3/600",
    ],
  },
  {
    id: 3,
    nombre: "Tónico Purificante",
    descripcion:
      "Tónico sin alcohol con hamamelis y agua de rosas. Limpia poros, equilibra el pH y prepara la piel para el resto de la rutina diaria.",
    precio: 28.0,
    categoria: "Tónico",
    img: "https://picsum.photos/seed/tonico/600",
    galeria: [
      "https://picsum.photos/seed/tonico1/600",
      "https://picsum.photos/seed/tonico2/600",
      "https://picsum.photos/seed/tonico3/600",
    ],
  },
  {
    id: 4,
    nombre: "Mascarilla Nocturna",
    descripcion:
      "Mascarilla de noche con colágeno y vitamina E. Repara la piel mientras duermes y recupera la luminosidad al despertar.",
    precio: 50.0,
    categoria: "Mascarilla",
    img: "https://picsum.photos/seed/mascarilla/600",
    galeria: [
      "https://picsum.photos/seed/mascarilla1/600",
      "https://picsum.photos/seed/mascarilla2/600",
      "https://picsum.photos/seed/mascarilla3/600",
    ],
  },
  {
    id: 5,
    nombre: "Serum Anti-Edad Retinol",
    descripcion:
      "Serum de retinol encapsulado que suaviza líneas de expresión y mejora la firmeza. Uso nocturno recomendado.",
    precio: 58.0,
    categoria: "Serum",
    img: "https://picsum.photos/seed/retinol/600",
    galeria: [
      "https://picsum.photos/seed/retinol1/600",
      "https://picsum.photos/seed/retinol2/600",
      "https://picsum.photos/seed/retinol3/600",
    ],
  },
  {
    id: 6,
    nombre: "Crema Contorno de Ojos",
    descripcion:
      "Contorno de ojos con cafeína y péptidos. Reduce bolsas y ojeras, hidrata la zona más delicada del rostro.",
    precio: 26.0,
    categoria: "Crema",
    img: "https://picsum.photos/seed/ojos/600",
    galeria: [
      "https://picsum.photos/seed/ojos1/600",
      "https://picsum.photos/seed/ojos2/600",
      "https://picsum.photos/seed/ojos3/600",
    ],
  },
  {
    id: 7,
    nombre: "Tónico Exfoliante AHA-BHA",
    descripcion:
      "Exfoliación química suave con ácidos AHA y BHA. Renueva la textura de la piel y desobstruye los poros.",
    precio: 34.0,
    categoria: "Tónico",
    img: "https://picsum.photos/seed/exfoliante/600",
    galeria: [
      "https://picsum.photos/seed/exfoliante1/600",
      "https://picsum.photos/seed/exfoliante2/600",
      "https://picsum.photos/seed/exfoliante3/600",
    ],
  },
  {
    id: 8,
    nombre: "Kit Rutina Completa",
    descripcion:
      "Kit integral con serum, crema, tónico y mascarilla. La rutina perfecta para comenzar: limpieza, tratamiento e hidratación.",
    precio: 129.0,
    categoria: "Kit",
    img: "https://picsum.photos/seed/kit/600",
    galeria: [
      "https://picsum.photos/seed/kit1/600",
      "https://picsum.photos/seed/kit2/600",
      "https://picsum.photos/seed/kit3/600",
    ],
  },
];
```

> La interfaz `Producto` ahora vive aquí. En el Paso 10 se ajustará `CartContext` para importarla desde este archivo.

---

### Paso 3 — Datos de ejemplo de la red multinivel

**Concepto:** la red de referidos es un **árbol jerárquico**. Definimos la estructura de datos y **funciones puras** (sin efectos) que calculan comisiones, totales y el nivel alcanzado. Estas funciones serán la única fuente de verdad para `MiRed` y `Dashboard`.

**Archivo nuevo:** `src/data/red.ts`

```ts
// src/data/red.ts
// Datos de ejemplo (mock) de la red multinivel de referidos.
// Incluye la estructura jerárquica (árbol) y funciones puras para calcular
// comisiones, totales y el nivel alcanzado por el usuario.

export interface Referido {
  id: number;
  nombre: string;
  nivel: number;     // 1 = directo, 2 = indirecto, 3 = tercer nivel
  ventas: number;    // ventas mensuales en dólares
  hijos?: Referido[]; // referidos de un nivel más abajo
}

// Porcentaje de comisión que recibe el usuario por las ventas de cada nivel
export const TASA_COMISION: Record<number, number> = {
  1: 0.10, // 10 % de las ventas de nivel 1
  2: 0.05, // 5 % de las ventas de nivel 2
  3: 0.02, // 2 % de las ventas de nivel 3
};

// Raíz del árbol: el usuario autenticado (nivel 0) con sus referidos
export const redInicial: Referido = {
  id: 0,
  nombre: "Tú",
  nivel: 0,
  ventas: 2400,
  hijos: [
    {
      id: 1,
      nombre: "Ana García",
      nivel: 1,
      ventas: 1200,
      hijos: [
        {
          id: 4,
          nombre: "Carlos Ruiz",
          nivel: 2,
          ventas: 500,
          hijos: [
            { id: 7, nombre: "Diana Paz", nivel: 3, ventas: 300 },
          ],
        },
        { id: 5, nombre: "Sofía León", nivel: 2, ventas: 430 },
      ],
    },
    {
      id: 2,
      nombre: "Luis Poveda",
      nivel: 1,
      ventas: 850,
      hijos: [
        { id: 6, nombre: "Marco Díaz", nivel: 2, ventas: 380 },
      ],
    },
    { id: 3, nombre: "Marta Sánchez", nivel: 1, ventas: 430 },
  ],
};

// Total de referidos de la red (sin contar al usuario raíz)
export const contarRed = (raiz: Referido): number => {
  const directos = raiz.hijos ?? [];
  return directos.reduce((total, hijo) => total + 1 + contarRed(hijo), 0);
};

// Suma de ventas de toda la red (excluye las ventas propias del usuario raíz)
export const sumarVentasRed = (raiz: Referido): number => {
  const directos = raiz.hijos ?? [];
  return directos.reduce((total, hijo) => total + hijo.ventas + sumarVentasRed(hijo), 0);
};

// Comisión que recibe el usuario por las ventas de cada referido (ventas * tasa del nivel)
export const comisionDeReferido = (ref: Referido): number =>
  ref.ventas * (TASA_COMISION[ref.nivel] ?? 0);

// Comisiones totales del mes acumuladas sobre toda la red
export const sumarComisiones = (raiz: Referido): number => {
  const directos = raiz.hijos ?? [];
  return directos.reduce(
    (total, hijo) => total + comisionDeReferido(hijo) + sumarComisiones(hijo),
    0
  );
};

// Nivel alcanzado por el usuario según la cantidad de referidos directos
export const nivelAlcanzado = (referidosDirectos: number): string => {
  if (referidosDirectos >= 6) return "Diamante";
  if (referidosDirectos >= 4) return "Oro";
  if (referidosDirectos >= 2) return "Plata";
  return "Bronce";
};
```

**Verificación del cálculo esperado:** Ana (nivel 1, $1200) → $120.00; Carlos (nivel 2, $500) → $25.00; Diana (nivel 3, $300) → $6.00. **Total red: $319.50** y 7 referidos.

---

### Paso 4 — Capa de servicios del catálogo

**Concepto:** separar la obtención de datos de los componentes. Las funciones devuelven `Promise` (como haría `fetch`), por lo que los componentes se escriben igual que contra una API real. En la Unidad 2 solo se cambiará el cuerpo de estas funciones.

**Archivo nuevo:** `src/services/productosService.ts`

```ts
// src/services/productosService.ts
// Capa de servicios del catálogo.
// Actualmente devuelve datos de ejemplo (mock) simulando una llamada asíncrona.
// En la Unidad 2, estas funciones se reemplazarán por fetch a GET /api/productos
// sin necesidad de modificar los componentes que las consumen.

import { productosMock, type Producto } from "../data/productos";

// Simula GET /api/productos (lista completa)
export const getProductos = (): Promise<Producto[]> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(productosMock), 400);
  });
};

// Simula GET /api/productos/:id (detalle de un producto)
export const getProductoById = (id: number): Promise<Producto | undefined> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(productosMock.find((p) => p.id === id)), 300);
  });
};
```

---

### Paso 5 — Autenticación con rol

**Concepto:** el estado global de autenticación guarda el usuario completo (`email` + `rol`). El login normaliza el rol recibido de la API y redirige según el perfil: admin → Dashboard (`/`), cliente → Tienda (`/tienda`).

**Archivo:** `src/context/AuthContext.tsx` (reemplazar)

```tsx
// src/context/AuthContext.tsx
import { createContext, useContext, useState, type ReactNode } from 'react';

// 1. Tipos de rol que maneja la aplicación
export type Rol = 'admin' | 'cliente';

// 2. Usuario autenticado: correo + rol (lo entrega la API en /api/login)
export interface Usuario {
  email: string;
  rol: Rol;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: Usuario | null;
  login: (usuario: Usuario) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser usado dentro de un AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<Usuario | null>(null);

  const login = (usuario: Usuario) => {
    setIsAuthenticated(true);
    setUser(usuario);
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

**Archivo:** `src/components/Login.tsx` (reemplazar)

```tsx
// src/components/Login.tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type Rol } from "../context/AuthContext";

const Login = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    // Consumo de API RESTful usando promesas (Tema 4)
    fetch("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Credenciales incorrectas");
        return response.json();
      })
      .then((data) => {
        setError("");
        // La API devuelve el rol (admin | cliente) junto al correo (Tema 5)
        const rol: Rol = data.rol === "admin" ? "admin" : "cliente";
        login({ email: data.email, rol });

        // Redirigimos según el rol: admin al Dashboard, cliente a la Tienda
        navigate(rol === "admin" ? "/" : "/tienda");
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-slate-200">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900">MultiCatálogo</h2>
          <p className="text-slate-500 mt-2">
            Ingresa a tu cuenta para continuar
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition"
              placeholder="admin@upse.edu.ec"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition"
              placeholder="••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Validando..." : "Iniciar Sesión"}
          </button>
        </form>

        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Cuentas de prueba:</p>
          <p>👑 Admin: <span className="font-mono">admin@upse.edu.ec / 123456</span></p>
          <p>🛍️ Cliente: <span className="font-mono">cliente@upse.edu.ec / 123456</span></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
```

> Nota: ajusta la URL de la API (`localhost:3000`) a la IP de tu aula si es distinta.

**Probar:** iniciar sesión con cada cuenta → admin cae en `/`, cliente en `/tienda` (la ruta `/tienda` aún no existe; se crea en el Paso 7 — por ahora el cliente verá el comodín `*` que redirige a `/`).

---

### Paso 6 — Rutas y guardas por rol

**Concepto:** dos guardas anidadas:
- `ProtectedRoute`: exige estar autenticado (cualquier rol).
- `AdminRoute`: exige rol `admin`; si un cliente intenta entrar a una ruta de admin, es redirigido a `/tienda`.

Además se introduce `CartBoundary`: un proveedor intermedio que **remonta** `CartProvider` con `key={user?.email}` cuando cambia el usuario. Esto asegura que cada cuenta lea y persista **su propio** carrito (se explica en el Paso 10).

**Archivo:** `src/App.tsx` (reemplazar)

```tsx
// src/App.tsx
import { type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Catalogo from './components/Catalogo';
import Storefront from './components/Storefront';
import DetalleProducto from './components/DetalleProducto';
import MiRed from './components/MiRed';
import Carrito from './components/Carrito';
import Checkout from './components/Checkout';
import Confirmacion from './components/Confirmacion';
import Login from './components/Login';
import { CartProvider } from './context/CartContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Componente para proteger las rutas privadas: exige estar autenticado
const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();

  // Si no está autenticado, lo enviamos al login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si está autenticado, renderiza las rutas hijas (Outlet)
  return <Outlet />;
};

// Componente para rutas exclusivas del administrador (Tema 5: roles)
const AdminRoute = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si el usuario no es admin, lo enviamos a la tienda (su vista por defecto)
  if (user?.rol !== 'admin') {
    return <Navigate to="/tienda" replace />;
  }

  return <Outlet />;
};

// Proveedor intermedio del carrito: al cambiar de usuario se remonta con key,
// de modo que cada cuenta lea y persista SU propio carrito en localStorage.
const CartBoundary = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  return (
    <CartProvider key={user?.email ?? "anonimo"}>
      {children}
    </CartProvider>
  );
};

function App() {
  return (
    <AuthProvider> {/* Proveedor de Autenticación */}
      <CartBoundary> {/* Proveedor del Carrito (uno por usuario) */}
        <BrowserRouter>
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />

            {/* Rutas protegidas (requieren login) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                {/* Solo administrador: Dashboard y Red multinivel */}
                <Route element={<AdminRoute />}>
                  <Route index element={<Dashboard />} />
                  <Route path="mi-red" element={<MiRed />} />
                </Route>

                {/* Ambos roles: flujo de compra en línea */}
                <Route path="tienda" element={<Storefront />} />
                <Route path="catalogo" element={<Catalogo />} />
                <Route path="producto/:id" element={<DetalleProducto />} />
                <Route path="carrito" element={<Carrito />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="confirmacion" element={<Confirmacion />} />
              </Route>
            </Route>

            {/* Ruta comodín para capturar 404 y redirigir */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CartBoundary>
    </AuthProvider>
  );
}

export default App;
```

**Mapa de rutas resultante:**

| Ruta | Acceso |
|---|---|
| `/login` | público |
| `/` (Dashboard), `/mi-red` | solo admin |
| `/tienda`, `/catalogo`, `/producto/:id`, `/carrito`, `/checkout`, `/confirmacion` | admin y cliente |

---

### Paso 7 — Storefront a pantalla completa (F1)

**Concepto:** interfaces full-screen: el hero usa `min-h-screen` (todo el viewport) con degradados, y el resto de la página se compone de secciones (`<section>`). El CTA "Conocer el Plan Multinivel" enlaza a `/mi-red` (exclusiva del admin), por lo que solo se renderiza para el rol `admin`; el botón final se etiqueta según su destino real (ya estamos en `/tienda`).

**Archivo nuevo:** `src/components/Storefront.tsx`

```tsx
// src/components/Storefront.tsx
// Tienda pública a pantalla completa (Tema 5):
// - Hero full-viewport con llamada a la acción
// - Sección de categorías
// - Productos destacados
// - Explicación del modelo multinivel
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProductos } from '../services/productosService';
import type { Producto } from '../data/productos';
import { categorias } from '../data/productos';

const Storefront = () => {
  const { user } = useAuth();
  const [destacados, setDestacados] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Consumimos el servicio de productos (mock que simula la API)
    getProductos()
      .then((data) => {
        setDestacados(data.slice(0, 4)); // mostramos solo 4 destacados
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* ===== HERO: ocupa toda la pantalla (min-h-screen) ===== */}
      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-700 via-purple-700 to-slate-900 text-white overflow-hidden">
        {/* Decoración de fondo (círculos difuminados) */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] bg-purple-500/30 rounded-full blur-3xl" />

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <p className="text-sm md:text-base uppercase tracking-widest text-indigo-200 mb-4">
            Catálogo de venta multinivel
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
            Belleza que se comparte,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-pink-300">
              ganancias que crecen
            </span>
          </h1>
          <p className="text-lg md:text-xl text-indigo-100 mb-10 max-w-2xl mx-auto">
            Explora nuestra línea de cosméticos premium y descubre cómo tu red de
            referidos genera comisiones en cada nivel.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/catalogo"
              className="bg-white text-indigo-700 font-bold px-8 py-4 rounded-lg hover:bg-indigo-50 transition shadow-lg"
            >
              Ver Catálogo Completo
            </Link>
            {/* La red multinivel (Mi Red) es exclusiva del administrador:
                no se muestra a los clientes para evitar enlaces no funcionales */}
            {user?.rol === "admin" && (
              <Link
                to="/mi-red"
                className="border-2 border-white/60 text-white font-bold px-8 py-4 rounded-lg hover:bg-white/10 transition"
              >
                Conocer el Plan Multinivel
              </Link>
            )}
          </div>
        </div>

        {/* Indicador de scroll */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-indigo-200 animate-bounce">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* ===== SECCIÓN DE CATEGORÍAS ===== */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center mb-10">
          Explora por Categoría
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {categorias.map((cat) => (
            <Link
              key={cat}
              to={`/catalogo?categoria=${encodeURIComponent(cat)}`}
              className="bg-white border border-slate-200 rounded-xl p-6 text-center shadow-sm hover:shadow-md hover:border-indigo-300 hover:-translate-y-1 transition-all"
            >
              <p className="font-semibold text-slate-700">{cat}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== PRODUCTOS DESTACADOS ===== */}
      <section className="py-16 px-6 bg-slate-100">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center mb-10">
            Productos Destacados
          </h2>

          {loading ? (
            <p className="text-center text-slate-500">Cargando destacados...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {destacados.map((prod) => (
                <Link
                  key={prod.id}
                  to={`/producto/${prod.id}`}
                  className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group"
                >
                  <img
                    src={prod.img}
                    alt={prod.nombre}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="p-4">
                    <p className="text-xs uppercase tracking-wide text-indigo-500 font-semibold">
                      {prod.categoria}
                    </p>
                    <h3 className="font-semibold text-slate-800 mt-1">{prod.nombre}</h3>
                    <p className="text-indigo-600 font-bold mt-2">${prod.precio.toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA (PLAN MULTINIVEL) ===== */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center mb-12">
          ¿Cómo funciona el plan multinivel?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              paso: "1",
              titulo: "Explora y compra",
              texto: "Elige tus productos favoritos del catálogo y genera tu primera venta.",
            },
            {
              paso: "2",
              titulo: "Invita a tu red",
              texto: "Comparte tu enlace de referido. Cada invitado suma un nivel en tu red.",
            },
            {
              paso: "3",
              titulo: "Gana comisiones",
              texto: "Recibe 10 %, 5 % y 2 % de las ventas de tus niveles 1, 2 y 3.",
            },
          ].map((item) => (
            <div
              key={item.paso}
              className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-indigo-600 text-white font-bold text-xl flex items-center justify-center mb-4">
                {item.paso}
              </div>
              <h3 className="font-bold text-slate-800 mb-2">{item.titulo}</h3>
              <p className="text-slate-500 text-sm">{item.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== LLAMADA FINAL ===== */}
      <section className="py-20 px-6 bg-slate-900 text-center">
        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
          Comienza tu propia red hoy
        </h2>
        <p className="text-slate-300 mb-8 max-w-xl mx-auto">
          Únete a MultiCatálogo y transforma tu red de contactos en un negocio
          de cosméticos premium.
        </p>
        {/* El texto del botón debe reflejar su destino: ya estamos en /tienda */}
        <Link
          to="/catalogo"
          className="inline-block bg-indigo-600 text-white font-bold px-10 py-4 rounded-lg hover:bg-indigo-500 transition shadow-lg"
        >
          Explorar el Catálogo
        </Link>
      </section>
    </div>
  );
};

export default Storefront;
```

**Probar:** navegar a `/tienda` y verificar que el hero ocupa toda la pantalla; con rol cliente el botón del plan multinivel no aparece; con rol admin sí.

---

### Paso 8 — Catálogo con búsqueda y filtros (F3)

**Concepto:** `useMemo` recalcula el filtrado solo cuando cambian `productos`, `busqueda` o `categoria`, evitando trabajo innecesario en cada render. Se usa `useSearchParams` para leer el filtro enviado desde el Storefront (`?categoria=Serum`) y para mantener la URL compartible.

**Archivo:** `src/components/Catalogo.tsx` (reemplazar)

```tsx
// src/components/Catalogo.tsx
// Catálogo interactivo con búsqueda y filtros (Tema 5):
// - useMemo para filtrar la lista sin recalcular en cada render
// - Estado de carga y estado vacío
// - Tarjetas enlazadas al detalle /producto/:id
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { getProductos } from '../services/productosService';
import { categorias, type Producto } from '../data/productos';

const Catalogo = () => {
  const { addToCart } = useCart();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Lectura del query string (?categoria=...) enviado desde el Storefront
  const [searchParams, setSearchParams] = useSearchParams();

  // Estado de los filtros
  const [busqueda, setBusqueda] = useState<string>("");
  const [categoria, setCategoria] = useState<string>(searchParams.get("categoria") ?? "Todas");

  useEffect(() => {
    // Consumimos el servicio de productos (mock que simula la API)
    getProductos()
      .then((data) => {
        setProductos(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filtrado con useMemo: solo se recalcula cuando cambian busqueda/categoria/productos
  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((prod) => {
      const coincideCategoria = categoria === "Todas" || prod.categoria === categoria;
      const coincideTexto =
        texto === "" ||
        prod.nombre.toLowerCase().includes(texto) ||
        prod.descripcion.toLowerCase().includes(texto);
      return coincideCategoria && coincideTexto;
    });
  }, [productos, busqueda, categoria]);

  const handleCategoriaChange = (value: string) => {
    setCategoria(value);
    // Sincronizamos el query string para que la URL sea compartible
    if (value === "Todas") {
      setSearchParams({});
    } else {
      setSearchParams({ categoria: value });
    }
  };

  if (loading) {
    return <div className="text-center p-8">Cargando catálogo...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Catálogo de Productos</h1>
      <p className="text-slate-500 mb-6">
        {productosFiltrados.length} producto(s) encontrado(s)
      </p>

      {/* ===== BARRA DE BÚSQUEDA Y FILTROS ===== */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o descripción..."
          className="flex-1 px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition"
        />
        <select
          value={categoria}
          onChange={(e) => handleCategoriaChange(e.target.value)}
          className="px-4 py-3 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition"
        >
          <option value="Todas">Todas las categorías</option>
          {categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* ===== GRILLA DE PRODUCTOS ===== */}
      {productosFiltrados.length === 0 ? (
        <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500">
            No hay productos que coincidan con tu búsqueda.
          </p>
          <button
            onClick={() => {
              setBusqueda("");
              setCategoria("Todas");
              setSearchParams({});
            }}
            className="mt-4 text-indigo-600 font-semibold hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {productosFiltrados.map((prod) => (
            <div
              key={prod.id}
              className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm flex flex-col"
            >
              <Link to={`/producto/${prod.id}`}>
                <img
                  src={prod.img}
                  alt={prod.nombre}
                  className="w-full h-40 object-cover hover:opacity-90 transition"
                />
              </Link>
              <div className="p-4 flex flex-col flex-1">
                <p className="text-xs uppercase tracking-wide text-indigo-500 font-semibold">
                  {prod.categoria}
                </p>
                <Link to={`/producto/${prod.id}`}>
                  <h3 className="font-semibold text-slate-700 hover:text-indigo-600 transition">
                    {prod.nombre}
                  </h3>
                </Link>
                <p className="text-indigo-600 font-bold mt-2 mb-4">
                  ${prod.precio.toFixed(2)}
                </p>

                <button
                  onClick={() => addToCart(prod)}
                  className="mt-auto w-full bg-slate-900 text-white py-2 rounded text-sm hover:bg-indigo-600 transition"
                >
                  Añadir al Carrito
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Catalogo;
```

> Nota: `addToCart` recibe ahora el `Producto` enriquecido (con `descripcion`, `categoria`, `galeria`). En el Paso 10 se actualiza `CartContext` para importar ese tipo.

**Probar:** buscar "serum", filtrar por categoría y verificar que la URL refleja `?categoria=...`; probar el estado vacío con una búsqueda sin resultados.

---

### Paso 9 — Detalle de producto con galería y lightbox (F2, F4)

**Concepto:** ruta dinámica con `useParams`; la galería muestra una imagen activa con miniaturas; el **lightbox** es un overlay fijo (`fixed inset-0`) a pantalla completa con navegación anterior/siguiente y cierre con la tecla `Escape` (se registra un listener en `window` dentro de un `useEffect` con su limpieza).

**Archivo nuevo:** `src/components/DetalleProducto.tsx`

```tsx
// src/components/DetalleProducto.tsx
// Detalle de producto con ruta dinámica (Tema 5):
// - useParams para leer el :id de la URL (/producto/:id)
// - Galería de imágenes con lightbox a pantalla completa
// - Estados de carga, error y "no encontrado"
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getProductoById } from '../services/productosService';
import type { Producto } from '../data/productos';
import { useCart } from '../context/CartContext';

const DetalleProducto = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [producto, setProducto] = useState<Producto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [imagenActiva, setImagenActiva] = useState<number>(0);
  const [lightboxAbierto, setLightboxAbierto] = useState<boolean>(false);
  const [agregado, setAgregado] = useState<boolean>(false);

  useEffect(() => {
    // La ruta dinámica nos da el id como string; lo convertimos a número.
    // La bandera "activo" evita actualizar estado si el componente se desmonta.
    let activo = true;
    getProductoById(Number(id))
      .then((data) => {
        if (!activo) return;
        setProducto(data ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [id]);

  // Cerrar el lightbox con la tecla Escape
  useEffect(() => {
    if (!lightboxAbierto) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxAbierto(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxAbierto]);

  if (loading) {
    return <div className="text-center p-8">Cargando producto...</div>;
  }

  if (!producto) {
    return (
      <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
        <p className="text-slate-600 text-lg mb-4">Producto no encontrado.</p>
        <Link to="/catalogo" className="text-indigo-600 font-semibold hover:underline">
          ← Volver al catálogo
        </Link>
      </div>
    );
  }

  // Todas las imágenes de la galería: principal + adicionales
  const imagenes = [producto.img, ...producto.galeria];

  const handleAddToCart = () => {
    addToCart(producto);
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1500);
  };

  const handlePrev = () =>
    setImagenActiva((prev) => (prev === 0 ? imagenes.length - 1 : prev - 1));
  const handleNext = () =>
    setImagenActiva((prev) => (prev === imagenes.length - 1 ? 0 : prev + 1));

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-indigo-600 font-semibold hover:underline mb-6"
      >
        ← Volver
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ===== GALERÍA DE IMÁGENES ===== */}
        <div>
          <img
            src={imagenes[imagenActiva]}
            alt={producto.nombre}
            onClick={() => setLightboxAbierto(true)}
            className="w-full h-80 md:h-96 object-cover rounded-xl border border-slate-200 cursor-zoom-in"
          />
          <div className="flex gap-3 mt-4">
            {imagenes.map((img, idx) => (
              <button
                key={img}
                onClick={() => setImagenActiva(idx)}
                className={`rounded-lg overflow-hidden border-2 transition ${idx === imagenActiva
                    ? "border-indigo-600"
                    : "border-transparent opacity-70 hover:opacity-100"
                  }`}
              >
                <img src={img} alt={`Vista ${idx + 1}`} className="w-20 h-16 object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* ===== INFORMACIÓN DEL PRODUCTO ===== */}
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-500 font-semibold">
            {producto.categoria}
          </p>
          <h1 className="text-3xl font-bold text-slate-800 mt-1 mb-3">{producto.nombre}</h1>
          <p className="text-3xl font-bold text-indigo-600 mb-6">
            ${producto.precio.toFixed(2)}
          </p>
          <p className="text-slate-600 leading-relaxed mb-8">{producto.descripcion}</p>

          <button
            onClick={handleAddToCart}
            className={`w-full md:w-auto px-10 py-4 rounded-lg font-bold transition shadow-md ${agregado
                ? "bg-green-600 text-white"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
          >
            {agregado ? "✓ Añadido al carrito" : "Añadir al Carrito"}
          </button>
        </div>
      </div>

      {/* ===== LIGHTBOX: imagen a pantalla completa ===== */}
      {lightboxAbierto && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center"
          onClick={() => setLightboxAbierto(false)}
        >
          <button
            className="absolute top-5 right-5 text-white text-4xl hover:text-slate-300 transition"
            onClick={() => setLightboxAbierto(false)}
            aria-label="Cerrar"
          >
            ×
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-4 md:left-10 text-white text-4xl hover:text-indigo-400 transition"
            aria-label="Anterior"
          >
            ‹
          </button>

          <img
            src={imagenes[imagenActiva]}
            alt={producto.nombre}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg"
          />

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-4 md:right-10 text-white text-4xl hover:text-indigo-400 transition"
            aria-label="Siguiente"
          >
            ›
          </button>

          <p className="absolute bottom-6 text-white/80 text-sm">
            {imagenActiva + 1} / {imagenes.length}
          </p>
        </div>
      )}
    </div>
  );
};

export default DetalleProducto;
```

**Probar:** abrir `/producto/1`, cambiar de imagen con las miniaturas, abrir el lightbox, navegar con ‹ › y cerrar con Escape o la ✕; probar `/producto/999` (estado "no encontrado").

---

### Paso 10 — Carrito persistente por usuario (F5)

**Concepto:**
1. El carrito se inicializa leyendo `localStorage` y se guarda en cada cambio con `useEffect` → sobrevive a recargas y al cierre del navegador.
2. La clave de persistencia incluye el **correo del usuario** (`multicatalogo_carrito_<email>`): cada cuenta tiene su propio carrito y no se mezclan. El remontaje de `CartProvider` con `key` (Paso 6, `CartBoundary`) reinicia el estado con el carrito del usuario correcto al cambiar de cuenta.
3. Se agregan controles de cantidad (`incrementQuantity`, `decrementQuantity`) y `clearCart` (para vaciarlo al confirmar el pedido).

**Archivo:** `src/context/CartContext.tsx` (reemplazar)

```tsx
// src/context/CartContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Producto } from '../data/productos';
import { useAuth } from './AuthContext';

// 1. Elemento del carrito: un producto + la cantidad seleccionada
export interface CartItem extends Producto {
  cantidad: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (producto: Producto) => void;
  removeFromCart: (id: number) => void;
  incrementQuantity: (id: number) => void;
  decrementQuantity: (id: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

// 2. Prefijo de la clave de persistencia en localStorage.
// Se completa con el correo del usuario para que CADA CUENTA tenga su propio carrito.
const CART_STORAGE_PREFIX = "multicatalogo_carrito_";

// 3. Creamos el contexto indicando que puede ser CartContextType o undefined
const CartContext = createContext<CartContextType | undefined>(undefined);

// 4. Hook personalizado con validación de tipo
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe ser usado dentro de un CartProvider");
  }
  return context;
};

// 5. Tipamos los props del Provider
interface CartProviderProps {
  children: ReactNode;
}

// 6. El Provider
export const CartProvider = ({ children }: CartProviderProps) => {
  const { user } = useAuth();

  // Clave de almacenamiento según el usuario autenticado.
  // App.tsx remonta este provider con key={user?.email} al cambiar de cuenta,
  // por lo que el estado siempre se inicializa con el carrito de ESTE usuario.
  const storageKey = user
    ? `${CART_STORAGE_PREFIX}${user.email}`
    : `${CART_STORAGE_PREFIX}anonimo`;

  // Inicializamos el estado leyendo el carrito guardado del usuario actual
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  // Persistimos el carrito del usuario en cada cambio (Tema 5: carrito persistente)
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart, storageKey]);

  const addToCart = (producto: Producto) => {
    setCart((prevCart) => {
      const itemExists = prevCart.find((item) => item.id === producto.id);
      if (itemExists) {
        return prevCart.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [...prevCart, { ...producto, cantidad: 1 }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  const incrementQuantity = (id: number) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === id ? { ...item, cantidad: item.cantidad + 1 } : item
      )
    );
  };

  const decrementQuantity = (id: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.id === id ? { ...item, cantidad: item.cantidad - 1 } : item
        )
        .filter((item) => item.cantidad > 0) // si llega a 0, se elimina
    );
  };

  // Vacía el carrito tras confirmar el pedido
  const clearCart = () => {
    setCart([]);
  };

  const totalItems = cart.reduce((total, item) => total + item.cantidad, 0);
  const totalPrice = cart.reduce((total, item) => total + item.precio * item.cantidad, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        incrementQuantity,
        decrementQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
```

> 💡 **Concepto clave:** usar `key` para reiniciar el estado de un componente es un patrón de React: cuando la `key` cambia, el componente se remonta desde cero y el inicializador de `useState` vuelve a ejecutarse. Así no hay que sincronizar carritos a mano entre cuentas.

**Archivo:** `src/components/Carrito.tsx` (reemplazar)

```tsx
// src/components/Carrito.tsx
// Carrito de compras con controles de cantidad (Tema 5):
// - incrementQuantity / decrementQuantity desde el contexto
// - Enlace al flujo de checkout
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

const Carrito = () => {
  const {
    cart,
    removeFromCart,
    incrementQuantity,
    decrementQuantity,
    totalPrice,
  } = useCart();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Tu Carrito de Compras</h1>

      {cart.length === 0 ? (
        <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm text-center">
          <p className="text-slate-500">Tu carrito está vacío actualmente.</p>
          <Link
            to="/catalogo"
            className="inline-block mt-4 bg-indigo-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
          >
            Explorar Catálogo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de productos */}
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-white p-4 rounded-lg border border-slate-200 shadow-sm gap-4"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={item.img}
                    alt={item.nombre}
                    className="w-16 h-16 object-cover rounded-md"
                  />
                  <div>
                    <Link to={`/producto/${item.id}`}>
                      <h3 className="font-semibold text-slate-800 hover:text-indigo-600 transition">
                        {item.nombre}
                      </h3>
                    </Link>
                    <p className="text-sm text-slate-500">${item.precio.toFixed(2)} c/u</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Control de cantidad */}
                  <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => decrementQuantity(item.id)}
                      className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition"
                      aria-label="Disminuir cantidad"
                    >
                      −
                    </button>
                    <span className="px-3 py-2 text-sm font-semibold text-slate-800 border-x border-slate-200">
                      {item.cantidad}
                    </span>
                    <button
                      onClick={() => incrementQuantity(item.id)}
                      className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition"
                      aria-label="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>

                  <p className="font-bold text-indigo-600 w-20 text-right">
                    ${(item.precio * item.cantidad).toFixed(2)}
                  </p>

                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-500 hover:text-red-700 transition"
                    title="Eliminar producto"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Resumen de pago */}
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm h-fit">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Resumen del Pedido</h2>
            <div className="flex justify-between border-b border-slate-100 pb-4 mb-4">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-semibold">${totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-slate-800 font-bold">Total a Pagar</span>
              <span className="text-2xl font-bold text-indigo-600">
                ${totalPrice.toFixed(2)}
              </span>
            </div>
            <Link
              to="/checkout"
              className="block w-full text-center bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Proceder al Pago
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carrito;
```

**Probar:** agregar productos, recargar la página (el carrito persiste), cambiar de usuario (cada cuenta tiene el suyo), y usar los controles − / +.

---

### Paso 11 — Checkout y confirmación (F5)

**Concepto:** el checkout es un formulario de envío con validación básica y resumen del pedido en vivo. Al confirmar se simula el procesamiento (retraso de 1,2 s), se vacía el carrito (`clearCart`) y se navega a `/confirmacion` pasando los datos del pedido por `location.state`. La confirmación muestra el número de pedido y el detalle.

**Archivo nuevo:** `src/components/Checkout.tsx`

```tsx
// src/components/Checkout.tsx
// Flujo de checkout simulado (Tema 5):
// - Formulario de envío con validación básica
// - Resumen del pedido en tiempo real
// - Simula el procesamiento del pago y redirige a /confirmacion
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

interface DatosEnvio {
  nombre: string;
  email: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  metodoPago: string;
}

const METODOS_PAGO = ["Tarjeta de crédito", "Transferencia bancaria", "Efectivo contra entrega"];

const Checkout = () => {
  const { cart, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();

  const [datos, setDatos] = useState<DatosEnvio>({
    nombre: "",
    email: "",
    direccion: "",
    ciudad: "",
    telefono: "",
    metodoPago: METODOS_PAGO[0],
  });
  const [procesando, setProcesando] = useState<boolean>(false);

  // Si el carrito está vacío, mostramos un aviso en lugar del formulario
  if (cart.length === 0) {
    return (
      <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
        <p className="text-slate-600 text-lg mb-4">No tienes productos en el carrito.</p>
        <Link to="/catalogo" className="text-indigo-600 font-semibold hover:underline">
          ← Ir al catálogo
        </Link>
      </div>
    );
  }

  const handleChange = (campo: keyof DatosEnvio, valor: string) => {
    setDatos((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcesando(true);

    // Simulamos el procesamiento del pago con un pequeño retraso
    setTimeout(() => {
      const pedido = {
        numero: `MC-${Date.now().toString().slice(-6)}`,
        items: cart.map((item) => ({
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio: item.precio,
        })),
        total: totalPrice,
        cliente: { nombre: datos.nombre, email: datos.email, ciudad: datos.ciudad },
        fecha: new Date().toLocaleString("es-EC"),
      };

      // Vaciamos el carrito y pasamos los datos del pedido a la confirmación
      clearCart();
      navigate("/confirmacion", { state: { pedido } });
    }, 1200);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Finalizar Compra</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== FORMULARIO DE ENVÍO ===== */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Datos de Envío</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  value={datos.nombre}
                  onChange={(e) => handleChange("nombre", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={datos.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none transition"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Dirección *
                </label>
                <input
                  type="text"
                  required
                  value={datos.direccion}
                  onChange={(e) => handleChange("direccion", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Ciudad *
                </label>
                <input
                  type="text"
                  required
                  value={datos.ciudad}
                  onChange={(e) => handleChange("ciudad", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  required
                  value={datos.telefono}
                  onChange={(e) => handleChange("telefono", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none transition"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Método de Pago</h2>
            <div className="space-y-3">
              {METODOS_PAGO.map((metodo) => (
                <label
                  key={metodo}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:border-indigo-300 transition"
                >
                  <input
                    type="radio"
                    name="metodoPago"
                    value={metodo}
                    checked={datos.metodoPago === metodo}
                    onChange={(e) => handleChange("metodoPago", e.target.value)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-slate-700">{metodo}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={procesando}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {procesando ? "Procesando pago..." : "Confirmar Pedido"}
          </button>
        </form>

        {/* ===== RESUMEN DEL PEDIDO ===== */}
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Resumen del Pedido</h2>
          <div className="space-y-3 border-b border-slate-100 pb-4 mb-4">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {item.nombre} × {item.cantidad}
                </span>
                <span className="font-semibold text-slate-800">
                  ${(item.precio * item.cantidad).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-800 font-bold">Total</span>
            <span className="text-2xl font-bold text-indigo-600">
              ${totalPrice.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
```

**Archivo nuevo:** `src/components/Confirmacion.tsx`

```tsx
// src/components/Confirmacion.tsx
// Pantalla de confirmación de pedido (Tema 5):
// - Lee los datos del pedido enviados desde Checkout (location.state)
// - Muestra el número de pedido y el resumen
import { Link, useLocation } from 'react-router-dom';

interface PedidoConfirmado {
  numero: string;
  items: { nombre: string; cantidad: number; precio: number }[];
  total: number;
  cliente: { nombre: string; email: string; ciudad: string };
  fecha: string;
}

const Confirmacion = () => {
  const location = useLocation();
  const pedido = (location.state as { pedido?: PedidoConfirmado } | null)?.pedido;

  // Si no hay datos de pedido (acceso directo a la URL), mostramos un mensaje genérico
  if (!pedido) {
    return (
      <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">¡Gracias por tu compra!</h1>
        <p className="text-slate-500 mb-6">Tu pedido ha sido registrado correctamente.</p>
        <Link
          to="/tienda"
          className="inline-block bg-indigo-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
        >
          Volver a la Tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-green-600 text-white p-8 text-center">
          <div className="text-5xl mb-3">✓</div>
          <h1 className="text-2xl font-bold">¡Pedido confirmado!</h1>
          <p className="text-green-100 mt-1">
            Número de pedido: <span className="font-mono font-bold">{pedido.numero}</span>
          </p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <p className="text-slate-500">Cliente</p>
              <p className="font-semibold text-slate-800">{pedido.cliente.nombre}</p>
            </div>
            <div>
              <p className="text-slate-500">Fecha</p>
              <p className="font-semibold text-slate-800">{pedido.fecha}</p>
            </div>
            <div>
              <p className="text-slate-500">Correo</p>
              <p className="font-semibold text-slate-800">{pedido.cliente.email}</p>
            </div>
            <div>
              <p className="text-slate-500">Ciudad</p>
              <p className="font-semibold text-slate-800">{pedido.cliente.ciudad}</p>
            </div>
          </div>

          <h2 className="font-bold text-slate-800 mb-3">Detalle del pedido</h2>
          <div className="space-y-2 border-b border-slate-100 pb-4 mb-4">
            {pedido.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {item.nombre} × {item.cantidad}
                </span>
                <span className="font-semibold">
                  ${(item.precio * item.cantidad).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mb-8">
            <span className="font-bold text-slate-800">Total pagado</span>
            <span className="text-2xl font-bold text-green-600">
              ${pedido.total.toFixed(2)}
            </span>
          </div>

          <div className="flex gap-4">
            <Link
              to="/tienda"
              className="flex-1 text-center bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition"
            >
              Seguir Comprando
            </Link>
            <Link
              to="/catalogo"
              className="flex-1 text-center border border-slate-300 text-slate-700 font-semibold py-3 rounded-lg hover:bg-slate-50 transition"
            >
              Ver Catálogo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Confirmacion;
```

**Probar el flujo completo:** catálogo → añadir al carrito → carrito → checkout → llenar formulario → confirmar → ver el número de pedido y el carrito vacío.

---

### Paso 12 — Red multinivel visual (F6)

**Concepto:** un **componente recursivo** renderiza el árbol de referidos: cada `NodoReferido` se dibuja a sí mismo y, si tiene hijos, los dibuja debajo con indentación y borde lateral. Las comisiones se calculan con las funciones puras del Paso 3.

> ⚠️ **Trampa típica (React 19):** la prop del nodo NO puede llamarse `ref` (es una prop reservada). Por eso se llama `nodo`.

**Archivo:** `src/components/MiRed.tsx` (reemplazar)

```tsx
// src/components/MiRed.tsx
// Red multinivel visual (Tema 5):
// - Resumen: referidos activos, ventas de la red, comisiones del mes y nivel alcanzado
// - Árbol jerárquico recursivo de referidos con comisión calculada por nivel
import { redInicial, contarRed, sumarVentasRed, sumarComisiones, nivelAlcanzado, comisionDeReferido, TASA_COMISION, type Referido } from '../data/red';

// Colores y etiquetas por nivel para el árbol
const NIVEL_ESTILO: Record<number, { badge: string; border: string; tasa: string }> = {
  1: { badge: "bg-indigo-100 text-indigo-700", border: "border-indigo-200", tasa: "10 %" },
  2: { badge: "bg-purple-100 text-purple-700", border: "border-purple-200", tasa: "5 %" },
  3: { badge: "bg-pink-100 text-pink-700", border: "border-pink-200", tasa: "2 %" },
};

// Componente recursivo: renderiza un referido y, debajo, a sus hijos
// Nota: la prop se llama "nodo" porque "ref" es una prop reservada en React 19
const NodoReferido = ({ nodo }: { nodo: Referido }) => {
  const estilo = NIVEL_ESTILO[nodo.nivel] ?? NIVEL_ESTILO[1];
  const comision = comisionDeReferido(nodo);

  return (
    <li>
      <div className={`bg-white rounded-lg border ${estilo.border} shadow-sm p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
            {nodo.nombre.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{nodo.nombre}</p>
            <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${estilo.badge}`}>
              Nivel {nodo.nivel} · {estilo.tasa} comisión
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">Ventas</p>
          <p className="font-bold text-slate-800">${nodo.ventas.toLocaleString()}</p>
          <p className="text-xs text-indigo-600 font-semibold mt-1">
            +${comision.toFixed(2)} para ti
          </p>
        </div>
      </div>

      {/* Hijos del referido (más profundidad en el árbol) */}
      {nodo.hijos && nodo.hijos.length > 0 && (
        <ul className="mt-3 ml-6 space-y-3 border-l-2 border-slate-200 pl-4">
          {nodo.hijos.map((hijo) => (
            <NodoReferido key={hijo.id} nodo={hijo} />
          ))}
        </ul>
      )}
    </li>
  );
};

const MiRed = () => {
  // KPIs derivados de los datos de la red (funciones puras en data/red.ts)
  const referidosActivos = contarRed(redInicial);
  const ventasRed = sumarVentasRed(redInicial);
  const comisionesMes = sumarComisiones(redInicial);
  const nivel = nivelAlcanzado(redInicial.hijos?.length ?? 0);

  const resumen = [
    { etiqueta: "Referidos Activos", valor: referidosActivos.toString(), color: "text-indigo-600" },
    { etiqueta: "Ventas de la Red", valor: `$${ventasRed.toLocaleString()}`, color: "text-indigo-600" },
    { etiqueta: "Comisiones del Mes", valor: `$${comisionesMes.toFixed(2)}`, color: "text-green-600" },
    { etiqueta: "Nivel Alcanzado", valor: nivel, color: "text-amber-600" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Mi Red de Referidos</h1>
      <p className="text-slate-500 mb-6">
        Estructura multinivel: gana el {TASA_COMISION[1] * 100} % de nivel 1, {TASA_COMISION[2] * 100} % de nivel 2 y {TASA_COMISION[3] * 100} % de nivel 3.
      </p>

      {/* ===== TARJETAS DE RESUMEN ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {resumen.map((item) => (
          <div key={item.etiqueta} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500 uppercase font-semibold">{item.etiqueta}</p>
            <p className={`text-3xl font-bold mt-2 ${item.color}`}>{item.valor}</p>
          </div>
        ))}
      </div>

      {/* ===== ÁRBOL DE REFERIDOS ===== */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Jerarquía de tu Red</h2>

        {/* Raíz: el usuario */}
        <div className="bg-slate-900 text-white rounded-lg p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center font-bold">
              {redInicial.nombre.charAt(0)}
            </div>
            <div>
              <p className="font-semibold">{redInicial.nombre}</p>
              <p className="text-xs text-slate-300">Nivel alcanzado: {nivel}</p>
            </div>
          </div>
          <p className="font-bold text-green-400">
            Comisiones del mes: ${comisionesMes.toFixed(2)}
          </p>
        </div>

        <ul className="space-y-3">
          {redInicial.hijos?.map((hijo) => (
            <NodoReferido key={hijo.id} nodo={hijo} />
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MiRed;
```

**Probar:** entrar a `/mi-red` como admin y verificar el resumen (7 referidos, $4,090 ventas, $319.50 comisiones, nivel Plata) y el árbol con los 3 niveles.

---

### Paso 13 — Dashboard con KPIs dinámicos (F7)

**Concepto:** los valores ya no son estáticos; se calculan con las mismas funciones puras de `data/red.ts` (una sola fuente de verdad compartida con `MiRed`). Incluye el top de referidos por ventas y una barra de progreso al siguiente nivel.

**Archivo:** `src/components/Dashboard.tsx` (reemplazar)

```tsx
// src/components/Dashboard.tsx
// Resumen general con KPIs calculados desde el estado real (Tema 5):
// - Funciones puras de data/red.ts en lugar de valores estáticos
import { redInicial, contarRed, sumarVentasRed, sumarComisiones, nivelAlcanzado, comisionDeReferido } from '../data/red';

const Dashboard = () => {
  const referidosDirectos = redInicial.hijos?.length ?? 0;
  const referidosActivos = contarRed(redInicial);
  const ventasRed = sumarVentasRed(redInicial);
  const comisionesMes = sumarComisiones(redInicial);
  const nivel = nivelAlcanzado(referidosDirectos);

  const kpis = [
    { etiqueta: "Ventas de la Red", valor: `$${ventasRed.toLocaleString()}`, color: "text-indigo-600" },
    { etiqueta: "Referidos Activos", valor: referidosActivos.toString(), color: "text-indigo-600" },
    { etiqueta: "Comisiones del Mes", valor: `$${comisionesMes.toFixed(2)}`, color: "text-green-600" },
    { etiqueta: "Nivel Actual", valor: nivel, color: "text-amber-600" },
  ];

  // Top 3 referidos por ventas (sin recursión: solo nivel 1)
  const topReferidos = [...(redInicial.hijos ?? [])]
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, 3);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Resumen General</h1>

      {/* ===== KPIs DERIVADOS DEL ESTADO ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.etiqueta} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500 uppercase font-semibold">{kpi.etiqueta}</p>
            <p className={`text-3xl font-bold mt-2 ${kpi.color}`}>{kpi.valor}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== TOP REFERIDOS ===== */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Top Referidos del Mes</h2>
          <div className="space-y-3">
            {topReferidos.map((ref, idx) => (
              <div
                key={ref.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800">{ref.nombre}</p>
                    <p className="text-xs text-slate-500">Nivel {ref.nivel}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">${ref.ventas.toLocaleString()}</p>
                  <p className="text-xs text-indigo-600 font-semibold">
                    +${comisionDeReferido(ref).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== PROGRESO DE NIVEL ===== */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Progreso al Siguiente Nivel</h2>
          <p className="text-slate-500 text-sm mb-4">
            {referidosDirectos} referidos directos. El nivel se calcula con:
          </p>
          <ul className="space-y-2 text-sm text-slate-600 mb-6">
            <li className="flex justify-between"><span>Bronce</span><span>0 – 1 directos</span></li>
            <li className="flex justify-between"><span>Plata</span><span>2 – 3 directos</span></li>
            <li className="flex justify-between"><span>Oro</span><span>4 – 5 directos</span></li>
            <li className="flex justify-between"><span>Diamante</span><span>6+ directos</span></li>
          </ul>

          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
              style={{ width: `${Math.min((referidosDirectos / 6) * 100, 100)}%` }}
            />
          </div>
          <p className="text-center text-sm text-slate-500 mt-2 font-semibold">
            Nivel actual: {nivel} ({referidosDirectos} / 6 directos para Diamante)
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

**Probar:** entrar al Dashboard como admin y verificar los KPIs: $4,090 ventas, 7 referidos, $319.50 comisiones, nivel Plata.

---

### Paso 14 — Navegación según el rol (F8)

**Concepto:** el Sidebar filtra las opciones según el rol y resalta la opción activa con `useLocation`. El Navbar muestra el correo, una insignia de rol y un título acorde al perfil.

**Archivo:** `src/components/Sidebar.tsx` (reemplazar)

```tsx
// src/components/Sidebar.tsx
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// NUEVO: Agregamos la función a la interfaz de props
interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  closeMobileMenu: () => void;
}

// Definimos las opciones de navegación según el rol (Tema 5)
interface NavItem {
  to: string;
  label: string;
  title: string;
  icon: string; // ruta del icono SVG (stroke)
  soloAdmin?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    title: "Dashboard",
    soloAdmin: true,
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    to: "/tienda",
    label: "Tienda",
    title: "Tienda",
    icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  },
  {
    to: "/catalogo",
    label: "Catálogo",
    title: "Catálogo",
    icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  },
  {
    to: "/mi-red",
    label: "Mi Red",
    title: "Mi Red",
    soloAdmin: true,
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  },
];

const Sidebar = ({ isCollapsed, isMobileOpen, closeMobileMenu }: SidebarProps) => {
  const { user } = useAuth();
  const { pathname } = useLocation();

  // Filtramos las opciones según el rol del usuario
  const items = NAV_ITEMS.filter((item) => !item.soloAdmin || user?.rol === "admin");

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 transform bg-red-900 text-white flex flex-col transition-all duration-300 ease-in-out
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        w-64
        md:relative md:translate-x-0
        ${isCollapsed ? "md:w-20" : "md:w-64"}
      `}
    >
      <div className={`p-4 md:p-6 text-xl font-bold border-b border-slate-700 flex items-center ${isCollapsed ? 'md:justify-center' : 'justify-start'} whitespace-nowrap`}>
        <span className="md:hidden">MultiCatálogo</span>
        <span className="hidden md:inline">{isCollapsed ? "MC" : "MultiCatálogo"}</span>
      </div>

      <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
        {items.map((item) => {
          // Resaltamos la opción activa según la ruta actual
          const esActivo =
            item.to === "/"
              ? pathname === "/"
              : pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={closeMobileMenu}
              className={`flex items-center gap-3 p-3 rounded transition ${
                esActivo
                  ? "bg-indigo-600 text-white"
                  : "hover:bg-slate-800"
              } ${isCollapsed ? 'md:justify-center' : ''}`}
              title={item.title}
            >
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className={`whitespace-nowrap ${isCollapsed ? 'md:hidden' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-700 text-xs text-slate-300">
        {isCollapsed ? (
          <p className="text-center uppercase">{user?.rol}</p>
        ) : (
          <p>
            Conectado como <span className="font-semibold uppercase">{user?.rol}</span>
          </p>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
```

**Archivo:** `src/components/Navbar.tsx` (modificar)

Sustituir el uso de `userEmail` por `user` (que incluye `email` y `rol`) y hacer el título dependiente del rol:

```tsx
// src/components/Navbar.tsx
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

// Definimos la interfaz para las props
interface NavbarProps {
  toggleSidebar: () => void;
}

const Navbar = ({ toggleSidebar }: NavbarProps) => {
  const { totalItems } = useCart();
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
      <div className="flex items-center gap-2 md:gap-4">
        {/* Botón Hamburguesa siempre visible */}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-md hover:bg-slate-100 transition text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Alternar menú"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="text-slate-600 font-medium text-base md:text-lg hidden sm:block">
          {user?.rol === "admin" ? "Panel de Administración" : "Tienda MultiCatálogo"}
        </h2>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <Link
          to="/carrito"
          className="relative p-2 hover:bg-slate-100 rounded-full transition"
        >
          <span className="text-xl">🛒</span>
          {totalItems > 0 && (
            <span className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full transform translate-x-1 -translate-y-1">
              {totalItems}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 md:gap-4">
          <span className="text-xs md:text-sm text-slate-500 hidden sm:block">{user?.email}</span>
          <span
            className={`hidden md:inline-block text-xs font-semibold px-2 py-1 rounded-full uppercase ${
              user?.rol === "admin"
                ? "bg-amber-100 text-amber-700"
                : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {user?.rol}
          </span>

          <div className="relative group cursor-pointer pb-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300 flex items-center justify-center">
              <img
                src="https://fastly.picsum.photos/id/64/4326/2884.jpg?hmac=9_SzX666YRpR_fOyYStXpfSiJ_edO3ghlSRnH2w09Kg"
                alt="Avatar del usuario"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 font-semibold hover:bg-red-50 rounded-md transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
```

**Probar:** admin ve Dashboard, Tienda, Catálogo y Mi Red; cliente ve solo Tienda y Catálogo. El título del Navbar y la insignia de rol cambian según el perfil.

---

## 6. Verificación final

### 6.1 Lint y build

```bash
cd Unidad1_Frontend/Proyecto_base
npm run lint    # 0 errores (los warnings de fast-refresh en los context son aceptables)
npm run build   # compilación TypeScript + bundle Vite
```

> Si `npm run lint` falla con `Cannot find module './prefer-optional-chain-utils/analyzeChain'`, ejecuta `npm ci` (la instalación de `node_modules` está incompleta).

### 6.2 Prueba manual con ambos roles

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Login como `admin@upse.edu.ec` | Redirige a Dashboard; sidebar con Dashboard, Tienda, Catálogo, Mi Red; badge ADMIN |
| 2 | Login como `cliente@upse.edu.ec` | Redirige a Tienda; sidebar solo Tienda y Catálogo; badge CLIENTE |
| 3 | Cliente escribe `/mi-red` o `/` | Es redirigido a `/tienda` (guarda AdminRoute) |
| 4 | `/tienda` | Hero a pantalla completa, 5 categorías, 4 destacados |
| 5 | `/catalogo` | Búsqueda y filtro funcionan; URL refleja `?categoria=` |
| 6 | `/producto/1` | Galería con miniaturas; lightbox abre/cierra (Escape incluido) |
| 7 | Añadir al carrito y recargar | El carrito persiste (localStorage) |
| 8 | Checkout → Confirmar | Muestra número de pedido; carrito vaciado |
| 9 | `/mi-red` (admin) | Resumen + árbol jerárquico con comisiones |
| 10 | `/` (admin) | KPIs calculados: $4,090 ventas, 7 referidos, $319.50 comisiones, nivel Plata |
| 11 | Admin agrega al carrito → logout → login cliente | El cliente inicia con el carrito **vacío** (no arrastra el del admin) |
| 12 | Cliente agrega → logout → login admin | El admin recupera **su** carrito (aislamiento por usuario) |
| 13 | Storefront como cliente | No aparece "Conocer el Plan Multinivel"; el CTA final dice "Explorar el Catálogo" |
| 14 | Navbar como cliente / admin | "Tienda MultiCatálogo" (cliente) / "Panel de Administración" (admin) |

### 6.3 API

```bash
cd Unidad2_Backend/multicatalogo-backend
go build ./...   # compila sin errores
```

---

## 7. Criterios de evaluación (rúbrica de la planificación, sección 8)

| Criterio | % |
|---|---|
| Funcionalidad de los flujos (compra + red MLM) | 30 % |
| Calidad del código (componentes, hooks, tipado) | 25 % |
| UX a pantalla completa (responsive + accesibilidad) | 25 % |
| Integración con API y estado global | 20 % |

---

## 8. Notas finales

- El **storefront** (`/tienda`) usa datos mock del frontend; la API aún entrega 4 productos con los campos básicos del Tema 4. En la Unidad 2, `getProductos()`/`getProductoById()` se cambiarán por `fetch` a `GET /api/productos` sin tocar los componentes (por eso existe la capa de servicios del Paso 4).
- El **login** sigue consumiendo `POST /api/login` de la API (IP del aula: `localhost:3000`); ajusta la URL en `Login.tsx` si tu entorno es otro.
- Los **roles** (admin/cliente) son la semilla de la autenticación real con JWT que se profundizará en la Unidad 2, junto con la persistencia en PostgreSQL.

---
