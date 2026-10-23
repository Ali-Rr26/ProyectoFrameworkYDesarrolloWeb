package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"multicatalogo-backend/models"
)

// IdempotencyKey identifica una escritura enviada con la cabecera Idempotency-Key.
// El middleware la deja en el contexto; las escrituras que la admiten la registran
// dentro de su propia transacción (claimIdempotency + storeIdempotentResponse).
type IdempotencyKey struct {
	UserID      int
	Key         string
	Method      string
	Path        string
	RequestHash string
}

type idempotencyCtxKey struct{}

// WithIdempotencyKey devuelve un contexto que lleva la clave de la petición.
func WithIdempotencyKey(ctx context.Context, k IdempotencyKey) context.Context {
	return context.WithValue(ctx, idempotencyCtxKey{}, k)
}

// IdempotencyKeyFrom devuelve la clave de la petición, si la hay.
func IdempotencyKeyFrom(ctx context.Context) (IdempotencyKey, bool) {
	k, ok := ctx.Value(idempotencyCtxKey{}).(IdempotencyKey)
	return k, ok
}

// claimIdempotency reserva la clave dentro de tx, antes de escribir. Si otra petición
// con la misma clave está en curso, este INSERT espera a que termine: si ella confirma,
// aquí falla por clave duplicada (ErrIdempotencyInProgress; el reintento recibirá la
// respuesta guardada); si ella deshace, la reserva sigue adelante. Sin clave no hace nada.
func claimIdempotency(ctx context.Context, tx *sql.Tx) error {
	k, ok := IdempotencyKeyFrom(ctx)
	if !ok {
		return nil
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO idempotency_keys (user_id, key, method, path, request_hash)
		VALUES ($1, $2, $3, $4, $5)`,
		k.UserID, k.Key, k.Method, k.Path, k.RequestHash)
	if errors.Is(mapError(err), ErrDuplicate) {
		return &DomainError{Kind: ErrIdempotencyInProgress, Detail: k.Key, Public: true}
	}
	if err != nil {
		return fmt.Errorf("reservar clave de idempotencia: %w", err)
	}
	return nil
}

// storeIdempotentResponse guarda, dentro de tx y antes del COMMIT, la respuesta exacta
// que devolverá el controlador. Sin clave no hace nada.
func storeIdempotentResponse(ctx context.Context, tx *sql.Tx, status int, body any) error {
	k, ok := IdempotencyKeyFrom(ctx)
	if !ok {
		return nil
	}
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("serializar respuesta idempotente: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE idempotency_keys SET status_code = $3, response_body = $4
		WHERE user_id = $1 AND key = $2`,
		k.UserID, k.Key, status, data); err != nil {
		return fmt.Errorf("guardar respuesta idempotente: %w", err)
	}
	return nil
}

// GetIdempotencyRecord devuelve la respuesta guardada de una clave del usuario, o
// ErrNotFound si esa clave no se usó (o su escritura no llegó a confirmarse).
func (r *Repository) GetIdempotencyRecord(ctx context.Context, userID int, key string) (*models.IdempotencyRecord, error) {
	var rec models.IdempotencyRecord
	err := r.db.QueryRowContext(ctx, `
		SELECT request_hash, status_code, response_body
		FROM idempotency_keys
		WHERE user_id = $1 AND key = $2 AND status_code IS NOT NULL`,
		userID, key,
	).Scan(&rec.RequestHash, &rec.StatusCode, &rec.Body)
	if err != nil {
		return nil, mapError(err)
	}
	return &rec, nil
}

// PurgeIdempotencyKeys borra las claves con más antigüedad que maxAge y devuelve cuántas.
func (r *Repository) PurgeIdempotencyKeys(ctx context.Context, maxAge time.Duration) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(secs => $1)`,
		maxAge.Seconds())
	if err != nil {
		return 0, mapError(err)
	}
	return res.RowsAffected()
}
