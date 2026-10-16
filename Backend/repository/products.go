package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"multicatalogo-backend/models"
)

// selectProduct arma el JSON que espera el frontend en una sola consulta:
// la categoría sale del JOIN y la galería se agrega con json_agg (evita N+1).
// COALESCE garantiza "gallery": [] en lugar de null cuando no hay imágenes.
const selectProduct = `
	SELECT p.id,
	       p.name,
	       p.description,
	       c.name,
	       p.price::float8,
	       p.image_url,
	       p.stock,
	       COALESCE(
	           (SELECT json_agg(pi.url ORDER BY pi.position)
	            FROM product_images pi
	            WHERE pi.product_id = p.id),
	           '[]'::json)
	FROM products p
	JOIN categories c ON c.id = p.category_id`

// scanner abstrae *sql.Row y *sql.Rows para reutilizar scanProduct.
type scanner interface {
	Scan(dest ...any) error
}

// scanProduct lee una fila de selectProduct en un models.Product.
func scanProduct(s scanner) (models.Product, error) {
	var p models.Product
	var gallery []byte
	if err := s.Scan(&p.ID, &p.Name, &p.Description, &p.Category, &p.Price, &p.Image, &p.Stock, &gallery); err != nil {
		return p, err
	}
	if err := json.Unmarshal(gallery, &p.Gallery); err != nil {
		return p, fmt.Errorf("decodificar galería: %w", err)
	}
	return p, nil
}

// GetProducts devuelve el catálogo completo ordenado por ID.
func (r *Repository) GetProducts(ctx context.Context) ([]models.Product, error) {
	rows, err := r.db.QueryContext(ctx, selectProduct+` ORDER BY p.id`)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	// Slice inicializado: si no hay productos se serializa como [] y no como null.
	products := []models.Product{}
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, rows.Err()
}

// GetProductByID devuelve un producto o ErrNotFound si no existe.
func (r *Repository) GetProductByID(ctx context.Context, id int) (*models.Product, error) {
	p, err := scanProduct(r.db.QueryRowContext(ctx, selectProduct+` WHERE p.id = $1`, id))
	if err != nil {
		return nil, mapError(err)
	}
	return &p, nil
}

// CreateProduct crea un producto con su galería en una transacción (todo o nada).
func (r *Repository) CreateProduct(ctx context.Context, in models.ProductInput) (*models.Product, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// La categoría debe existir en el catálogo; se busca sin distinguir mayúsculas.
	var categoryID int
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM categories WHERE lower(name) = lower($1)`, in.Category,
	).Scan(&categoryID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &DomainError{Kind: ErrInvalidRef, Detail: "categoría inexistente: " + in.Category, Public: true}
	}
	if err != nil {
		return nil, err
	}

	var id int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO products (name, description, price, stock, category_id, image_url)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id`,
		in.Name, in.Description, in.Price, in.Stock, categoryID, in.Image,
	).Scan(&id)
	if err != nil {
		return nil, mapError(err)
	}

	for i, url := range in.Gallery {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)`, id, url, i,
		); err != nil {
			return nil, mapError(err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetProductByID(ctx, id)
}
