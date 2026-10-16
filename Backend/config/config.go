// Declaramos el paquete config, responsable de leer la configuración desde variables de entorno.
package config

import (
	"errors"
	"fmt"
	"os"
	"time"

	// godotenv carga un archivo .env (solo útil en desarrollo; en producción se usan variables reales).
	"github.com/joho/godotenv"
)

// Config agrupa todos los parámetros de arranque de la aplicación.
type Config struct {
	// DatabaseURL es la cadena de conexión a PostgreSQL.
	DatabaseURL string
	// RedisURL es la URI del servidor Redis usado como caché (redis://host:puerto/bd).
	RedisURL string
	// Port es el puerto HTTP donde escucha Fiber.
	Port string
	// CORSOrigin es el origen permitido para el frontend.
	CORSOrigin string
	// NetworkRootEmail es la raíz por defecto de GET /api/network cuando consulta un admin.
	NetworkRootEmail string
	// JWTSecret es la clave HMAC con la que se firman los tokens (mínimo 32 caracteres).
	JWTSecret string
	// JWTTTL es la vigencia de cada token emitido.
	JWTTTL time.Duration
	// CheckoutFailAt activa una falla simulada en la transacción del checkout para
	// demostrar el ROLLBACK en clase ("" desactivada, "after_order" o "after_items").
	CheckoutFailAt string
	// CheckoutCommitDelay pausa la transacción justo antes del COMMIT para poder
	// detener el contenedor de PostgreSQL a mitad de la compra (0 desactivada).
	CheckoutCommitDelay time.Duration
}

// Etapas válidas de CHECKOUT_FAIL_AT.
const (
	// FailAfterOrder falla después de insertar la cabecera del pedido.
	FailAfterOrder = "after_order"
	// FailAfterItems falla después de insertar las líneas (el stock ya se descontó).
	FailAfterItems = "after_items"
)

// Load lee el archivo .env (si existe) y las variables de entorno, aplicando valores por defecto.
func Load() (*Config, error) {
	// Si no existe .env no es un error: las variables pueden venir del sistema operativo.
	_ = godotenv.Load()

	ttl, err := time.ParseDuration(getEnv("JWT_TTL", "8h"))
	if err != nil {
		return nil, fmt.Errorf("JWT_TTL inválido: %w", err)
	}

	commitDelay, err := time.ParseDuration(getEnv("CHECKOUT_COMMIT_DELAY", "0s"))
	if err != nil || commitDelay < 0 {
		return nil, fmt.Errorf("CHECKOUT_COMMIT_DELAY inválido: %q", os.Getenv("CHECKOUT_COMMIT_DELAY"))
	}
	failAt := os.Getenv("CHECKOUT_FAIL_AT")
	if failAt != "" && failAt != FailAfterOrder && failAt != FailAfterItems {
		return nil, fmt.Errorf("CHECKOUT_FAIL_AT inválido: %q (use %s o %s)", failAt, FailAfterOrder, FailAfterItems)
	}

	cfg := &Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379/0"),
		Port:             getEnv("PORT", "4000"),
		CORSOrigin:       getEnv("CORS_ORIGIN", "http://localhost:5175"),
		NetworkRootEmail: getEnv("NETWORK_ROOT_EMAIL", "cliente@upse.edu.ec"),
		JWTSecret:        os.Getenv("JWT_SECRET"),
		JWTTTL:           ttl,

		CheckoutFailAt:      failAt,
		CheckoutCommitDelay: commitDelay,
	}

	// Sin base de datos ni secreto JWT la aplicación no puede funcionar: fallamos al arrancar.
	if cfg.DatabaseURL == "" {
		return nil, errors.New("la variable de entorno DATABASE_URL es obligatoria")
	}
	if cfg.JWTSecret == "" {
		return nil, errors.New("la variable de entorno JWT_SECRET es obligatoria")
	}
	return cfg, nil
}

// getEnv devuelve el valor de la variable o el valor por defecto si está vacía.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
