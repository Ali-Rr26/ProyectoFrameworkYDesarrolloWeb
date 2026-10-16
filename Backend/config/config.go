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
}

// Load lee el archivo .env (si existe) y las variables de entorno, aplicando valores por defecto.
func Load() (*Config, error) {
	// Si no existe .env no es un error: las variables pueden venir del sistema operativo.
	_ = godotenv.Load()

	ttl, err := time.ParseDuration(getEnv("JWT_TTL", "8h"))
	if err != nil {
		return nil, fmt.Errorf("JWT_TTL inválido: %w", err)
	}

	cfg := &Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379/0"),
		Port:             getEnv("PORT", "4000"),
		CORSOrigin:       getEnv("CORS_ORIGIN", "http://localhost:5175"),
		NetworkRootEmail: getEnv("NETWORK_ROOT_EMAIL", "cliente@upse.edu.ec"),
		JWTSecret:        os.Getenv("JWT_SECRET"),
		JWTTTL:           ttl,
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
