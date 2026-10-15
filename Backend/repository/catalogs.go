package repository

import "context"

// GetPaymentMethods devuelve los nombres del catálogo payment_methods en orden de alta.
func (r *Repository) GetPaymentMethods(ctx context.Context) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT name FROM payment_methods ORDER BY id`)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	methods := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		methods = append(methods, name)
	}
	return methods, rows.Err()
}
