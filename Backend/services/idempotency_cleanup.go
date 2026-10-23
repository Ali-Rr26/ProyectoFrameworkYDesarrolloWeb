package services

import (
	"context"
	"log"
	"time"
)

// IdempotencyPurger borra las claves de idempotencia más antiguas que maxAge (repositorio).
type IdempotencyPurger interface {
	PurgeIdempotencyKeys(ctx context.Context, maxAge time.Duration) (int64, error)
}

// RunIdempotencyCleanup purga las claves vencidas al arrancar y luego cada `every`, hasta
// que se cancele ctx. Un fallo solo se registra: las claves viejas no afectan a las nuevas
// (cada una es un UUID distinto), solo ocupan espacio.
func RunIdempotencyCleanup(ctx context.Context, repo IdempotencyPurger, maxAge, every time.Duration) {
	purge := func() {
		purgeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		n, err := repo.PurgeIdempotencyKeys(purgeCtx, maxAge)
		if err != nil {
			log.Printf("limpieza de claves de idempotencia: %v", err)
			return
		}
		if n > 0 {
			log.Printf("limpieza de claves de idempotencia: %d claves vencidas borradas", n)
		}
	}

	purge()
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			purge()
		}
	}
}
