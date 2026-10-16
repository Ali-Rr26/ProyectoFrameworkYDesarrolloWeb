package config

import (
	"context"
	"fmt"
	"log"
	"time"

	// Cliente oficial de Redis para Go.
	"github.com/redis/go-redis/v9"
)

// NewRedisClient crea el cliente de Redis a partir de la URI (REDIS_URL).
// Una URI mal escrita es un error de configuración y detiene el arranque; en cambio,
// si Redis no responde solo se registra un aviso: la caché es una optimización y la
// API debe seguir sirviendo desde PostgreSQL. go-redis reconecta solo cuando vuelve.
func NewRedisClient(url string) (*redis.Client, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("REDIS_URL inválida: %w", err)
	}
	// Tiempos cortos: con Redis caído cada petición no debe esperar segundos antes
	// de ir a PostgreSQL (los valores por defecto de go-redis son de 3 a 5 s).
	opts.DialTimeout = 500 * time.Millisecond
	opts.ReadTimeout = 200 * time.Millisecond
	opts.WriteTimeout = 200 * time.Millisecond
	// Un solo reintento: con Redis caído es preferible ir pronto a PostgreSQL.
	opts.MaxRetries = 1

	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("aviso: Redis no disponible en %s (%v); se servirá sin caché", opts.Addr, err)
	} else {
		log.Printf("conectado a Redis en %s", opts.Addr)
	}
	return rdb, nil
}
