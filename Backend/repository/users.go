package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"multicatalogo-backend/models"
)

// selectUser une la cuenta con su rol y, si está afiliado, con su patrocinador y su código.
const selectUser = `
	SELECT u.id, u.email, u.password_hash, u.name, r.name, u.active, nm.sponsor_id, nm.referral_code
	FROM users u
	JOIN roles r ON r.id = u.role_id
	LEFT JOIN network_members nm ON nm.user_id = u.id`

// scanUser lee una fila de selectUser en un models.User.
func scanUser(s scanner) (models.User, error) {
	var u models.User
	err := s.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.Active, &u.SponsorID, &u.ReferralCode)
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

// GetUserByID devuelve una cuenta por su ID, o ErrNotFound.
func (r *Repository) GetUserByID(ctx context.Context, id int) (*models.User, error) {
	u, err := scanUser(r.db.QueryRowContext(ctx, selectUser+` WHERE u.id = $1`, id))
	if err != nil {
		return nil, mapError(err)
	}
	return &u, nil
}

// GetUserEmailByID devuelve solo el correo de una cuenta (consulta por PK), o ErrNotFound.
func (r *Repository) GetUserEmailByID(ctx context.Context, id int) (string, error) {
	var email string
	if err := r.db.QueryRowContext(ctx, `SELECT email FROM users WHERE id = $1`, id).Scan(&email); err != nil {
		return "", mapError(err)
	}
	return email, nil
}

// CreateUser registra un cliente con la contraseña hasheada (bcrypt) y lo afilia a la
// red: bajo el patrocinador indicado por ID o por código de referido, o como raíz de su
// propia red si no trae ninguno. Al afiliarse, el trigger trg_network_referral_code le
// genera su propio código. Todo va en una sola transacción: si el patrocinador no
// existe (FK) o el código es inválido, tampoco queda creada la cuenta.
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

	sponsorID := in.SponsorID
	if in.ReferralCode != nil {
		var sponsor int
		err := tx.QueryRowContext(ctx,
			`SELECT user_id FROM network_members WHERE referral_code = $1`, *in.ReferralCode,
		).Scan(&sponsor)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &DomainError{Kind: ErrInvalidReferral, Detail: *in.ReferralCode, Public: true}
		}
		if err != nil {
			return nil, mapError(err)
		}
		sponsorID = &sponsor
	}

	// La FK sponsor_id -> network_members rechaza patrocinadores inexistentes o no afiliados.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO network_members (user_id, sponsor_id) VALUES ($1, $2)`, id, sponsorID,
	); err != nil {
		return nil, mapError(err)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetUserByEmail(ctx, in.Email)
}

// UpdateUser cambia el rol y/o el estado de una cuenta (los nil no se modifican) y
// devuelve la cuenta actualizada, o ErrNotFound si no existe.
func (r *Repository) UpdateUser(ctx context.Context, id int, in models.UpdateUserRequest) (*models.User, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE users
		SET role_id = COALESCE((SELECT id FROM roles WHERE name = $2), role_id),
		    active  = COALESCE($3, active)
		WHERE id = $1`,
		id, in.Role, in.Active,
	)
	if err != nil {
		return nil, mapError(err)
	}
	if n, err := res.RowsAffected(); err != nil {
		return nil, err
	} else if n == 0 {
		return nil, ErrNotFound
	}
	return r.GetUserByID(ctx, id)
}
