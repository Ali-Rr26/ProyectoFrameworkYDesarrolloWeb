// Declaramos el paquete routes, cuya única responsabilidad es registrar los endpoints de la API.
package routes

import (
	// Importamos Fiber para poder recibir y configurar la instancia principal de la aplicación.
	"github.com/gofiber/fiber/v2"
	// Importamos nuestro paquete de controladores, donde residen las funciones que se ejecutarán en cada ruta.
	"multicatalogo-backend/controllers"
)

// Controllers agrupa los controladores ya construidos en main con sus dependencias inyectadas.
type Controllers struct {
	Auth     *controllers.AuthMiddleware
	Login    *controllers.AuthController
	Products *controllers.ProductController
	Network  *controllers.NetworkController
	Checkout *controllers.CheckoutController
	Users    *controllers.UserController
	Health   *controllers.HealthController
}

// SetupRoutes recibe la aplicación Fiber y los controladores para registrar las rutas.
func SetupRoutes(app *fiber.App, c Controllers) {
	// ===== Rutas públicas =====
	// Inicio de sesión: devuelve el JWT.
	app.Post("/api/login", c.Login.Login)

	// Catálogo de productos y detalle por ID.
	app.Get("/api/products", c.Products.GetProducts)
	app.Get("/api/products/:id", c.Products.GetProductByID)

	// Estado del servidor con sus dependencias (ok / degraded / 503) y pings individuales.
	app.Get("/api/health", c.Health.Health)
	app.Get("/api/health/db", c.Health.HealthDB)
	app.Get("/api/health/redis", c.Health.HealthRedis)

	// Registro público de clientes (rol customer fijo).
	app.Post("/api/users", c.Users.RegisterUser)

	// ===== Rutas autenticadas: exigen "Authorization: Bearer <JWT>" =====
	// El middleware se declara por ruta (no por grupo) para que las rutas públicas
	// nunca pasen por él, sin depender del orden de registro.
	auth := c.Auth.RequireAuth
	adminOnly := c.Auth.RequireRole("admin")

	// Cuenta autenticada (el frontend valida la sesión al cargar).
	app.Get("/api/me", auth, c.Login.Me)

	// Red de referidos: el cliente ve la suya; el admin puede consultar cualquiera.
	app.Get("/api/network", auth, c.Network.GetNetwork)

	// Compra: el comprador se toma del token. /api/orders se conserva como alias de
	// /api/checkout para no romper clientes de la Fase 2.
	app.Get("/api/payment-methods", auth, c.Checkout.GetPaymentMethods)
	app.Post("/api/checkout", auth, c.Checkout.Checkout)
	app.Post("/api/orders", auth, c.Checkout.Checkout)

	// Solo administrador.
	app.Get("/api/users", auth, adminOnly, c.Users.GetUsers)
	app.Patch("/api/users/:id", auth, adminOnly, c.Users.UpdateUser)
	app.Post("/api/products", auth, adminOnly, c.Products.CreateProduct)
}
