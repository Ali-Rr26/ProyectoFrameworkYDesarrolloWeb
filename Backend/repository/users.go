package repository

import (
	"context"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"multicatalogo-backend/models"
)

// selectUser une la cuenta con su rol y, si está afiliado, con su patrocinador.
const selectUser = `
	SELECT u.id, u.email, u.password_hash, u.name, r.name, u.active, nm.sponsor_id
	FROM users u
	JOIN roles r ON r.id = u.role_id
	LEFT JOIN network_members nm ON nm.user_id = u.id`

// scanUser lee una fila de selectUser en un models.User.
func scanUser(s scanner) (models.User, error) {
	var u models.User
	err := s.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.Active, &u.SponsorID)
	return u, err
}

// GetUsers lista todas las cuentas (el hash nunca se serializa gracias a json:"-").
func (r *Repository) GetUsers(ctx context.Context) ([]models.User, error) {
	rows, err := r.db.QueryContext(ctx, selectUser+` ORDER BY u.id`)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// GetUserByEmail busca una cuenta por correo (sin distinguir mayúsculas).
// Usa el índice único ux_users_email sobre lower(email).
func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	u, err := scanUser(r.db.QueryRowContext(ctx, selectUser+` WHERE lower(u.email) = lower($1)`, email))
	if err != nil {
		return nil, mapError(err)
	}
	return &u, nil
}

// CreateUser registra un cliente con la contraseña hasheada (bcrypt) y, si trae
// patrocinador, lo afilia a la red. Ambas inserciones van en una sola transacción:
// si el patrocinador no existe (FK) tampoco queda creada la cuenta.
func (r *Repository) CreateUser(ctx context.Context, in models.RegisterRequest) (*models.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hashear contraseña: %w", err)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// El registro público siempre crea cuentas con rol customer.
	var id int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO users (email, password_hash, name, role_id)
		SELECT $1, $2, $3, id FROM roles WHERE name = 'customer'
		RETURNING id`,
		in.Email, string(hash), in.Name,
	).Scan(&id)
	if err != nil {
		return nil, mapError(err)
	}

	if in.SponsorID != nil {
		// La FK sponsor_id -> network_members rechaza patrocinadores inexistentes o no afiliados.
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO network_members (user_id, sponsor_id) VALUES ($1, $2)`, id, *in.SponsorID,
		); err != nil {
			return nil, mapError(err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetUserByEmail(ctx, in.Email)
}
