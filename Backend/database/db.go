// Declaramos el paquete database: conexión a PostgreSQL y ejecución de migraciones.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	// Registra el driver "pgx" para database/sql (pgx es el driver PostgreSQL mantenido activamente).
	_ "github.com/jackc/pgx/v5/stdlib"
)

// InitDB abre el pool de conexiones a PostgreSQL y valida que la base responda.
func InitDB(dsn string) (*sql.DB, error) {
	// sql.Open no conecta todavía: solo prepara el pool.
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("abrir conexión: %w", err)
	}

	// Configuración del pool: limita conexiones simultáneas y recicla las antiguas.
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	// Ping fuerza una conexión real para detectar credenciales o host incorrectos en el arranque.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("conectar a PostgreSQL: %w", err)
	}
	return db, nil
}
