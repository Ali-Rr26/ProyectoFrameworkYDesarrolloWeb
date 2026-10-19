// Declaramos que este es el paquete principal (main), es decir, el archivo ejecutable que inicia el programa.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	// Importamos el framework principal Fiber.
	"github.com/gofiber/fiber/v2"
	// Importamos el middleware CORS para gestionar la seguridad entre distintos puertos/dominios.
	"github.com/gofiber/fiber/v2/middleware/cors"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/cache"
	"multicatalogo-backend/config"
	"multicatalogo-backend/controllers"
	"multicatalogo-backend/database"
	"multicatalogo-backend/repository"
	// Importamos nuestro propio paquete de rutas para delegarle la configuración de los endpoints.
	"multicatalogo-backend/routes"
	"multicatalogo-backend/services"
)

// shutdownTimeout es lo máximo que se espera a las goroutines de comisiones al apagar.
const shutdownTimeout = 15 * time.Second

// func main es el punto de entrada de la aplicación en Go. Todo comienza a ejecutarse aquí.
func main() {
	// Modo sonda para el HEALTHCHECK de Docker: verifica el servidor ya en marcha y termina
	// (no carga configuración ni abre conexiones).
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(runHealthcheck())
	}

	// 1. Configuración desde variables de entorno (.env en desarrollo).
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	// 2. Pool de conexiones a PostgreSQL (falla al arrancar si la BD no responde).
	db, err := database.InitDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 3. Migraciones versionadas antes de aceptar peticiones.
	if err := database.RunMigrations(db); err != nil {
		log.Fatal(err)
	}

	// 4. Cliente de Redis para la caché (si no responde, la API funciona sin caché).
	rdb, err := config.NewRedisClient(cfg.RedisURL)
	if err != nil {
		log.Fatal(err)
	}
	defer rdb.Close()

	// 5. Gestor de tokens JWT (falla si el secreto es demasiado corto).
	jwtManager, err := auth.NewManager(cfg.JWTSecret, cfg.JWTTTL)
	if err != nil {
		log.Fatal(err)
	}

	// Fallas simuladas del checkout (solo para la demostración del ROLLBACK en clase).
	if cfg.CheckoutFailAt != "" || cfg.CheckoutCommitDelay > 0 {
		log.Printf("AVISO: modo demostración activo (CHECKOUT_FAIL_AT=%q, CHECKOUT_COMMIT_DELAY=%s): las compras pueden fallar a propósito",
			cfg.CheckoutFailAt, cfg.CheckoutCommitDelay)
	}

	// 6. Inyección de dependencias: se construye cada pieza una sola vez y se entrega a
	// quien la necesita. Los controladores solo ven interfaces (controllers/ports.go).
	repo := repository.NewRepository(db, repository.Faults{
		FailAt:      cfg.CheckoutFailAt,
		CommitDelay: cfg.CheckoutCommitDelay,
	})
	redisCache := cache.NewRedisCache(rdb)
	networkCache := services.NewNetworkCacheInvalidator(repo, redisCache)
	commissions := services.NewCommissionService(repo, networkCache)
	// Pedidos que quedaron sin comisiones si el servidor se detuvo a mitad del cálculo.
	commissions.RecoverPending()

	ctrls := routes.Controllers{
		Auth:        controllers.NewAuthMiddleware(jwtManager, repo),
		Login:       controllers.NewAuthController(repo, jwtManager),
		Products:    controllers.NewProductController(repo, redisCache),
		Network:     controllers.NewNetworkController(repo, redisCache, cfg.NetworkRootEmail),
		Checkout:    controllers.NewCheckoutController(repo, redisCache, networkCache, commissions, cfg.CheckoutCommitDelay),
		Orders:      controllers.NewOrderController(repo, redisCache, networkCache),
		Commissions: controllers.NewCommissionController(repo),
		Payouts:     controllers.NewPayoutController(repo),
		Users:       controllers.NewUserController(repo, networkCache),
		Health:      controllers.NewHealthController(repo, redisCache),
	}

	// Instanciamos una nueva aplicación de Fiber y la guardamos en la variable 'app'.
	app := fiber.New()

	// Implementamos el middleware CORS a nivel global usando app.Use() para interceptar todas las peticiones entrantes.
	app.Use(cors.New(cors.Config{
		// Permitimos únicamente peticiones provenientes del frontend configurado.
		AllowOrigins: cfg.CORSOrigin,
		// Declaramos de forma explícita qué cabeceras (Headers) se permitirán en la comunicación.
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		// Permitimos que el frontend lea X-Cache (HIT/MISS/BYPASS): sin esto CORS la oculta a JavaScript.
		ExposeHeaders: "X-Cache",
	}))

	// Detalle técnico de los errores solo en desarrollo (APP_ENV=dev).
	app.Use(controllers.ErrorDetails(cfg.IsDev()))

	routes.SetupRoutes(app, ctrls)

	// 7. Cierre ordenado: ante Ctrl+C se dejan de aceptar peticiones, se espera a las
	// goroutines de comisiones y luego se cierran el pool y Redis (defer).
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
		<-quit
		log.Println("apagando servidor...")
		if err := app.Shutdown(); err != nil {
			log.Printf("error al apagar: %v", err)
		}
	}()

	// Ponemos a la aplicación a escuchar peticiones (bloquea hasta Shutdown).
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Printf("servidor detenido: %v", err)
	}

	// Las comisiones en curso usan el pool: hay que esperarlas antes de que el defer lo cierre.
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := commissions.Shutdown(ctx); err != nil {
		log.Printf("%v (se recuperarán al volver a arrancar)", err)
	}
	log.Println("cerrando conexiones a PostgreSQL y Redis")
}
