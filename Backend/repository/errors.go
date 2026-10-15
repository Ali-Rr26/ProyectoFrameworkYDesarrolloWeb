package repository

import (
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// Errores del dominio: los controladores los traducen a códigos HTTP sin conocer PostgreSQL.
var (
	// ErrNotFound: el registro solicitado no existe (HTTP 404).
	ErrNotFound = errors.New("registro no encontrado")
	// ErrDuplicate: se violó una restricción UNIQUE (HTTP 409).
	ErrDuplicate = errors.New("registro duplicado")
	// ErrInvalidRef: se violó una FK o se referenció un catálogo inexistente (HTTP 422).
	ErrInvalidRef = errors.New("referencia inválida")
	// ErrConstraint: se violó una restricción CHECK, incluido el trigger anticiclos (HTTP 422).
	ErrConstraint = errors.New("restricción de datos violada")
	// ErrInsufficientStock: no hay unidades suficientes para completar la compra (HTTP 409).
	ErrInsufficientStock = errors.New("stock insuficiente")
)

// Códigos SQLSTATE de PostgreSQL que traducimos.
const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
	pgCheckViolation      = "23514"
	pgNotNullViolation    = "23502"
)

// mapError convierte errores del driver en errores del dominio, conservando el original envuelto.
func mapError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgUniqueViolation:
			return &DomainError{Kind: ErrDuplicate, Detail: pgErr.ConstraintName}
		case pgForeignKeyViolation:
			return &DomainError{Kind: ErrInvalidRef, Detail: pgErr.ConstraintName}
		case pgCheckViolation, pgNotNullViolation:
			detail := pgErr.ConstraintName
			if detail == "" {
				detail = pgErr.Message
			}
			return &DomainError{Kind: ErrConstraint, Detail: detail}
		}
	}
	return err
}

// DomainError añade detalle (p. ej. el nombre de la restricción) a un error del dominio.
// errors.Is(err, ErrDuplicate) sigue funcionando gracias a Unwrap.
type DomainError struct {
	Kind   error
	Detail string
}

func (e *DomainError) Error() string { return e.Kind.Error() + ": " + e.Detail }
func (e *DomainError) Unwrap() error { return e.Kind }
