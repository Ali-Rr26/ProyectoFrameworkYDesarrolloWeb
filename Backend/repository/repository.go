// Declaramos el paquete repository: única capa que conoce SQL y la base de datos.
package repository

import (
	"context"
	"database/sql"
	"time"
)

// Faults configura las fallas simuladas del checkout (demostración del ROLLBACK en clase).
// El valor cero las desactiva.
type Faults struct {
	// FailAt es la etapa donde se aborta la transacción (config.FailAfterOrder / FailAfterItems).
	FailAt string
	// CommitDelay es la pausa antes del COMMIT.
	CommitDelay time.Duration
}

// Repository encapsula el pool de conexiones; los controladores lo reciben por inyección
// a través de interfaces pequeñas (ver controllers/ports.go).
type Repository struct {
	db     *sql.DB
	faults Faults
}

// NewRepository construye el repositorio a partir de un pool ya abierto.
func NewRepository(db *sql.DB, faults Faults) *Repository {
	return &Repository{db: db, faults: faults}
}

// Ping verifica que la base de datos siga respondiendo (usado por el health check).
func (r *Repository) Ping(ctx context.Context) error {
	return r.db.PingContext(ctx)
}
