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
	       p.active,
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
	if err := s.Scan(&p.ID, &p.Name, &p.Description, &p.Category, &p.Price, &p.Image, &p.Stock, &p.Active, &gallery); err != nil {
		return p, err
	}
	if err := json.Unmarshal(gallery, &p.Gallery); err != nil {
		return p, fmt.Errorf("decodificar galería: %w", err)
	}
	return p, nil
}

// GetProducts devuelve el catálogo público (solo productos activos) ordenado por ID.
func (r *Repository) GetProducts(ctx context.Context) ([]models.Product, error) {
	return r.listProducts(ctx, selectProduct+` WHERE p.active ORDER BY p.id`)
}

// GetAllProducts devuelve todos los productos, incluidos los dados de baja (vista admin).
func (r *Repository) GetAllProducts(ctx context.Context) ([]models.Product, error) {
	return r.listProducts(ctx, selectProduct+` ORDER BY p.id`)
}

// listProducts ejecuta una consulta basada en selectProduct y lee todas sus filas.
func (r *Repository) listProducts(ctx context.Context, query string) ([]models.Product, error) {
	rows, err := r.db.QueryContext(ctx, query)
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

// GetProductByID devuelve un producto activo, o ErrNotFound si no existe o fue dado de
// baja (para el público un producto inactivo ya no existe).
func (r *Repository) GetProductByID(ctx context.Context, id int) (*models.Product, error) {
	return r.findProduct(ctx, selectProduct+` WHERE p.id = $1 AND p.active`, id)
}

// getAnyProduct devuelve un producto activo o inactivo (respuestas del admin).
func (r *Repository) getAnyProduct(ctx context.Context, id int) (*models.Product, error) {
	return r.findProduct(ctx, selectProduct+` WHERE p.id = $1`, id)
}

func (r *Repository) findProduct(ctx context.Context, query string, id int) (*models.Product, error) {
	p, err := scanProduct(r.db.QueryRowContext(ctx, query, id))
	if err != nil {
		return nil, mapError(err)
	}
	return &p, nil
}

// GetCategories devuelve los nombres del catálogo de categorías en orden de alta.
func (r *Repository) GetCategories(ctx context.Context) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT name FROM categories ORDER BY id`)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	categories := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		categories = append(categories, name)
	}
	return categories, rows.Err()
}

// findCategoryID busca una categoría por nombre (sin distinguir mayúsculas) dentro de tx.
func findCategoryID(ctx context.Context, tx *sql.Tx, name string) (int, error) {
	var id int
	err := tx.QueryRowContext(ctx, `SELECT id FROM categories WHERE lower(name) = lower($1)`, name).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, &DomainError{Kind: ErrInvalidRef, Detail: "categoría inexistente: " + name, Public: true}
	}
	return id, err
}

// replaceGallery reemplaza la galería de un producto dentro de tx (posición = orden recibido).
func replaceGallery(ctx context.Context, tx *sql.Tx, productID int, urls []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM product_images WHERE product_id = $1`, productID); err != nil {
		return mapError(err)
	}
	for i, url := range urls {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)`, productID, url, i,
		); err != nil {
			return mapError(err)
		}
	}
	return nil
}

// CreateProduct crea un producto con su galería en una transacción (todo o nada).
func (r *Repository) CreateProduct(ctx context.Context, in models.ProductInput) (*models.Product, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// La categoría debe existir en el catálogo; se busca sin distinguir mayúsculas.
	categoryID, err := findCategoryID(ctx, tx, in.Category)
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

	if err := replaceGallery(ctx, tx, id, in.Gallery); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.getAnyProduct(ctx, id)
}

// UpdateProduct aplica una edición parcial en una transacción (los nil no cambian) y
// devuelve el producto actualizado, o ErrNotFound si no existe. Bloquea la fila para que
// una edición de stock no se mezcle con una compra en curso.
func (r *Repository) UpdateProduct(ctx context.Context, id int, in models.ProductUpdate) (*models.Product, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var locked int
	if err := tx.QueryRowContext(ctx, `SELECT id FROM products WHERE id = $1 FOR UPDATE`, id).Scan(&locked); err != nil {
		return nil, mapError(err)
	}

	var categoryID *int
	if in.Category != nil {
		cid, err := findCategoryID(ctx, tx, *in.Category)
		if err != nil {
			return nil, err
		}
		categoryID = &cid
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE products
		SET name        = COALESCE($2, name),
		    description = COALESCE($3, description),
		    price       = COALESCE($4, price),
		    stock       = COALESCE($5, stock),
		    category_id = COALESCE($6, category_id),
		    image_url   = COALESCE($7, image_url),
		    active      = COALESCE($8, active)
		WHERE id = $1`,
		id, in.Name, in.Description, in.Price, in.Stock, categoryID, in.Image, in.Active,
	); err != nil {
		return nil, mapError(err)
	}

	if in.Gallery != nil {
		if err := replaceGallery(ctx, tx, id, *in.Gallery); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.getAnyProduct(ctx, id)
}

// DeactivateProduct da de baja un producto (baja lógica: no se borra la fila, así el
// historial de order_items se conserva). Es idempotente; ErrNotFound si no existe.
func (r *Repository) DeactivateProduct(ctx context.Context, id int) (*models.Product, error) {
	res, err := r.db.ExecContext(ctx, `UPDATE products SET active = FALSE WHERE id = $1`, id)
	if err != nil {
		return nil, mapError(err)
	}
	if n, err := res.RowsAffected(); err != nil {
		return nil, err
	} else if n == 0 {
		return nil, ErrNotFound
	}
	return r.getAnyProduct(ctx, id)
}
