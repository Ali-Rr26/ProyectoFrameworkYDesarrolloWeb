// Declaramos el paquete routes, cuya única responsabilidad es registrar los endpoints de la API.
package routes

import (
	// Importamos Fiber para poder recibir y configurar la instancia principal de la aplicación.
	"github.com/gofiber/fiber/v2"
	// Importamos nuestro paquete de controladores, donde residen las funciones que se ejecutarán en cada ruta.
	"multicatalogo-backend/controllers"
)

// SetupRoutes recibe la aplicación Fiber y el Handler (con el repositorio inyectado) para registrar las rutas.
func SetupRoutes(app *fiber.App, h *controllers.Handler) {
	// ===== Rutas públicas =====
	// Inicio de sesión: devuelve el JWT.
	app.Post("/api/login", h.Login)

	// Catálogo de productos y detalle por ID.
	app.Get("/api/products", h.GetProducts)
	app.Get("/api/products/:id", h.GetProductByID)

	// Estado del servidor y de la conexión a PostgreSQL.
	app.Get("/api/health", controllers.Health)
	app.Get("/api/health/db", h.HealthDB)

	// Registro público de clientes (rol customer fijo).
	app.Post("/api/users", h.RegisterUser)

	// ===== Rutas autenticadas: exigen "Authorization: Bearer <JWT>" =====
	// El middleware se declara por ruta (no por grupo) para que las rutas públicas
	// nunca pasen por él, sin depender del orden de registro.
	auth := h.RequireAuth
	adminOnly := h.RequireRole("admin")

	// Red de referidos: el cliente ve la suya; el admin puede consultar cualquiera.
	app.Get("/api/network", auth, h.GetNetwork)

	// Compra: el comprador se toma del token.
	app.Get("/api/payment-methods", auth, h.GetPaymentMethods)
	app.Post("/api/orders", auth, h.CreateOrder)

	// Solo administrador.
	app.Get("/api/users", auth, adminOnly, h.GetUsers)
	app.Post("/api/products", auth, adminOnly, h.CreateProduct)
}
