
Este primer bloque de instrucciones está diseñado para inyectarse directamente en el contexto de tu IDE. Establece las reglas base del proyecto y ejecuta la refactorización inicial del código estático existente en `repository.go` y los controladores.

### Configuración del Entorno (`.windsurfrules` / Prompt de Sistema)

Guarda este bloque como contexto global para que la IA entienda el objetivo general antes de empezar a codificar.

```markdown
# Contexto del Proyecto: Motor Backend para Billetera/Catálogo (Unidad 2)
Actúas como un desarrollador backend Senior en Go. Estamos construyendo el core transaccional de un sistema SaaS Multitenant usando Go y Fiber. 
El frontend en React (Vite + Tailwind) ya está finalizado y consume la API en el puerto 3000. Tu objetivo estricto es modificar SOLO el backend (`Unidad2_Backend/multicatalogo-backend`).

## Reglas Arquitectónicas
1. **Separación de Responsabilidades:** Mantén el patrón de diseño actual. `routes.go` define los endpoints, `controllers` maneja la lógica HTTP (req/res), `models` define las estructuras, y `repository` maneja los datos.
2. **Estandarización de Respuestas:** Todas las respuestas HTTP deben seguir una estructura JSON predecible.
3. **Estabilidad del Frontend:** Está estrictamente prohibido cambiar las firmas de los endpoints existentes (`/api/login`, `/api/productos`, `/api/red`) o la estructura de los JSON que el frontend ya espera.

```

### Instrucciones de Ejecución para la IA (Fase 1)

Copia y pega este texto como tu primer requerimiento (prompt) para iniciar el desarrollo.

> **Objetivo:** Refactorizar el código base para manejar respuestas HTTP estructuradas y validaciones de entrada, preparando el terreno para la persistencia relacional.
> **Paso 1: Estandarización de Respuestas (`models/models.go`)**
> Crea una nueva estructura llamada `APIError` que estandarice los mensajes de error HTTP. Debe contener los campos `Status` (int), `Message` (string) y `Details` (interface{}, opcional).
> **Paso 2: Validaciones en el Controlador (`controllers/authController.go`)**
> Modifica la función `Login` para validar explícitamente que los campos `Email` y `Password` no vengan vacíos antes de enviarlos al repositorio. Si están vacíos, devuelve un HTTP 400 usando la nueva estructura `APIError`.
> 
> 
> **Paso 3: Refactorización de Tipos (`controllers/prodController.go`)**
> En `GetProductoPorID`, asegura que la conversión de `c.Params("id")` maneje correctamente el error devolviendo la estructura `APIError` con un HTTP 400 si el usuario envía texto en lugar de un número.
> 
> 
> **Paso 4: Verificación de Estado**
> Crea un nuevo controlador `healthController.go` con un endpoint `GET /api/health` que devuelva un estado HTTP 200 y un JSON `{"status": "ok", "message": "Servidor Go/Fiber operativo"}`. Regístralo en `routes.go`.
> 
> 

---

Al aplicar este primer bloque, tendrás la validación visual inmediata: si envías un login vacío desde React o Postman, la terminal de red mostrará el nuevo formato de error estructurado en lugar de fallar genéricamente.