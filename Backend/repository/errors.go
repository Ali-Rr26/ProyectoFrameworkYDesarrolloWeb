package repository

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"

	"multicatalogo-backend/models"
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
	// ErrInvalidQuantity: la cantidad de una línea es cero o negativa (HTTP 400).
	// Es un error de entrada, distinto de ErrInsufficientStock (falta de inventario).
	ErrInvalidQuantity = errors.New("cantidad inválida")
	// ErrProductInactive: el producto fue dado de baja y ya no se vende (HTTP 422).
	ErrProductInactive = errors.New("producto no disponible")
	// ErrInvalidReferral: el código de referido no corresponde a ningún afiliado (HTTP 400).
	ErrInvalidReferral = errors.New("código de referido inválido")
	// ErrInvalidTransition: el pedido no puede pasar a ese estado (HTTP 400).
	ErrInvalidTransition = errors.New("transición de estado inválida")
	// ErrCommissionsPaid: el pedido tiene comisiones ya liquidadas y no se cancela (HTTP 409).
	ErrCommissionsPaid = errors.New("comisiones ya liquidadas")
	// ErrNothingToPay: el distribuidor no tiene comisiones de pedidos entregados por liquidar (HTTP 409).
	ErrNothingToPay = errors.New("sin comisiones pendientes")
	// ErrIdempotencyInProgress: otra petición con la misma Idempotency-Key se está
	// procesando o acaba de confirmarse (HTTP 409; el reintento recibe la respuesta guardada).
	ErrIdempotencyInProgress = errors.New("petición con la misma clave en curso")
	// ErrVersionConflict: el producto cambió desde la versión que editó el cliente (HTTP 409).
	ErrVersionConflict = errors.New("versión del producto desactualizada")
	// ErrPriceChanged: el total recalculado no coincide con el que vio el cliente (HTTP 409).
	ErrPriceChanged = errors.New("los precios cambiaron")
	// ErrStatusChanged: el pedido ya no está en el estado que vio el cliente (HTTP 409).
	ErrStatusChanged = errors.New("el estado del pedido cambió")
)

// VersionConflictError lleva el producto vigente para que el cliente compare y decida.
type VersionConflictError struct{ Current *models.Product }

func (e *VersionConflictError) Error() string {
	return fmt.Sprintf("%v: versión vigente %d", ErrVersionConflict, e.Current.Version)
}
func (e *VersionConflictError) Unwrap() error { return ErrVersionConflict }

// PriceChangedError lleva el total que vio el cliente y el total vigente.
type PriceChangedError struct{ Expected, Total float64 }

func (e *PriceChangedError) Error() string {
	return fmt.Sprintf("%v: esperado %.2f, vigente %.2f", ErrPriceChanged, e.Expected, e.Total)
}
func (e *PriceChangedError) Unwrap() error { return ErrPriceChanged }

// StatusChangedError lleva el estado vigente del pedido.
type StatusChangedError struct{ Current string }

func (e *StatusChangedError) Error() string {
	return fmt.Sprintf("%v: %s", ErrStatusChanged, e.Current)
}
func (e *StatusChangedError) Unwrap() error { return ErrStatusChanged }

// Códigos SQLSTATE de PostgreSQL que traducimos.
const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
	pgCheckViolation      = "23514"
	pgNotNullViolation    = "23502"
)

// stockConstraint es la restricción que lanza el trigger de inventario
// (fn_order_items_stock) cuando no hay unidades suficientes.
const stockConstraint = "ck_products_stock_available"

// quantityConstraint es el CHECK (quantity > 0) de order_items (nombre generado por PostgreSQL).
const quantityConstraint = "order_items_quantity_check"

// inactiveProductConstraint es la restricción que lanza el trigger de inventario
// cuando se intenta vender un producto dado de baja (migración 0004).
const inactiveProductConstraint = "ck_products_active"

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
			// El trigger de inventario usa check_violation con una restricción propia.
			switch pgErr.ConstraintName {
			case stockConstraint:
				return &DomainError{Kind: ErrInsufficientStock, Detail: pgErr.Message}
			case quantityConstraint:
				return &DomainError{Kind: ErrInvalidQuantity, Detail: pgErr.ConstraintName}
			case inactiveProductConstraint:
				return &DomainError{Kind: ErrProductInactive, Detail: pgErr.Message}
			}
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
	// Public indica que Detail fue redactado para el usuario ("producto 3") y puede
	// mostrarse siempre. Si es false (nombres de restricciones o mensajes de PostgreSQL
	// que arma mapError) solo se expone con APP_ENV=dev.
	Public bool
}

func (e *DomainError) Error() string { return e.Kind.Error() + ": " + e.Detail }
func (e *DomainError) Unwrap() error { return e.Kind }
