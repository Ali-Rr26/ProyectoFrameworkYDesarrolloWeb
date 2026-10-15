package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"sort"
	"strings"
)

// Los archivos SQL se incrustan en el binario: no dependen del directorio de trabajo.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// Clave del bloqueo consultivo: evita que dos instancias migren a la vez.
const migrationLockKey = 726354001

// RunMigrations aplica, en orden, las migraciones que aún no estén registradas
// en la tabla schema_migrations. Cada migración corre en su propia transacción
// (PostgreSQL admite DDL transaccional): o se aplica completa o no se aplica.
func RunMigrations(db *sql.DB) error {
	ctx := context.Background()

	// Usamos una única conexión para que el bloqueo consultivo aplique a toda la ejecución.
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("obtener conexión: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "SELECT pg_advisory_lock($1)", migrationLockKey); err != nil {
		return fmt.Errorf("bloqueo de migraciones: %w", err)
	}
	defer conn.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", migrationLockKey)

	// Tabla de control: registra qué versiones ya se aplicaron.
	if _, err := conn.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("crear schema_migrations: %w", err)
	}

	files, err := fs.Glob(migrationsFS, "migrations/*.sql")
	if err != nil {
		return err
	}
	// Los nombres empiezan con número de versión (0001_, 0002_...), así que el orden alfabético es el correcto.
	sort.Strings(files)

	for _, file := range files {
		version := strings.TrimSuffix(strings.TrimPrefix(file, "migrations/"), ".sql")

		var applied bool
		if err := conn.QueryRowContext(ctx,
			"SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", version,
		).Scan(&applied); err != nil {
			return fmt.Errorf("consultar versión %s: %w", version, err)
		}
		if applied {
			continue
		}

		content, err := migrationsFS.ReadFile(file)
		if err != nil {
			return err
		}

		if err := applyMigration(ctx, conn, version, string(content)); err != nil {
			return err
		}
		log.Printf("migración aplicada: %s", version)
	}
	return nil
}

// applyMigration ejecuta un archivo SQL y registra su versión dentro de la misma transacción.
func applyMigration(ctx context.Context, conn *sql.Conn, version, script string) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("iniciar transacción %s: %w", version, err)
	}
	// Rollback tras un Commit exitoso no hace nada; asegura limpieza ante cualquier error.
	defer tx.Rollback()

	// Sin argumentos, pgx usa el protocolo simple, que admite varias sentencias por llamada.
	if _, err := tx.ExecContext(ctx, script); err != nil {
		return fmt.Errorf("ejecutar migración %s: %w", version, err)
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
		return fmt.Errorf("registrar migración %s: %w", version, err)
	}
	return tx.Commit()
}
