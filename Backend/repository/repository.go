// Declaramos el paquete repository: única capa que conoce SQL y la base de datos.
package repository

import (
	"context"
	"database/sql"
)

// Repository encapsula el pool de conexiones; los controladores lo reciben por inyección.
type Repository struct {
	db *sql.DB
}

// NewRepository construye el repositorio a partir de un pool ya abierto.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Ping verifica que la base de datos siga respondiendo (usado por el health check).
func (r *Repository) Ping(ctx context.Context) error {
	return r.db.PingContext(ctx)
}
