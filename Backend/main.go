// Declaramos que este es el paquete principal (main), es decir, el archivo ejecutable que inicia el programa.
package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	// Importamos el framework principal Fiber.
	"github.com/gofiber/fiber/v2"
	// Importamos el middleware CORS para gestionar la seguridad entre distintos puertos/dominios.
	"github.com/gofiber/fiber/v2/middleware/cors"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/config"
	"multicatalogo-backend/controllers"
	"multicatalogo-backend/database"
	"multicatalogo-backend/repository"
	// Importamos nuestro propio paquete de rutas para delegarle la configuración de los endpoints.
	"multicatalogo-backend/routes"
)

// func main es el punto de entrada de la aplicación en Go. Todo comienza a ejecutarse aquí.
func main() {
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

	// 6. Inyección de dependencias: db -> repositorio -> handler (+ caché) -> rutas.
	repo := repository.NewRepository(db)
	handler := controllers.NewHandler(repo, rdb, cfg, jwtManager)

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

	routes.SetupRoutes(app, handler)

	// 7. Cierre ordenado: ante Ctrl+C se dejan de aceptar peticiones y luego se cierran el pool y Redis.
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
	log.Println("cerrando conexiones a PostgreSQL y Redis")
}
