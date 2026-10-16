package repository

import (
	"context"
	"database/sql"
	"errors"

	"multicatalogo-backend/models"
)

// MaxNetworkLevel limita la profundidad del árbol: la red paga comisiones hasta el 3.er nivel.
const MaxNetworkLevel = 3

// networkQuery recorre la lista de adyacencia network_members desde la raíz ($1).
//   - level se calcula durante el recorrido (relativo a quien consulta), no se almacena.
//   - sales sale de la vista v_user_sales (suma de pedidos), no se almacena.
//   - commission es lo que las compras de cada miembro pagaron a la raíz (tabla commissions, sin revertidas).
//   - CYCLE corta el recorrido si existiera un ciclo (defensa adicional al trigger).
const networkQuery = `
	WITH RECURSIVE tree AS (
	    SELECT nm.user_id, nm.sponsor_id, 0 AS level
	    FROM network_members nm
	    WHERE nm.user_id = $1
	  UNION ALL
	    SELECT nm.user_id, nm.sponsor_id, tree.level + 1
	    FROM network_members nm
	    JOIN tree ON nm.sponsor_id = tree.user_id
	    WHERE tree.level < $2
	) CYCLE user_id SET is_cycle USING path
	SELECT tree.user_id,
	       u.name,
	       tree.sponsor_id,
	       tree.level,
	       COALESCE(s.sales, 0)::float8,
	       COALESCE(cm.amount, 0)::float8
	FROM tree
	JOIN users u ON u.id = tree.user_id
	LEFT JOIN v_user_sales s ON s.user_id = tree.user_id
	LEFT JOIN (
	    SELECT o.user_id, SUM(c.amount) AS amount
	    FROM commissions c
	    JOIN orders o ON o.id = c.order_id
	    WHERE c.beneficiary_id = $1 AND c.status <> 'reversed'
	    GROUP BY o.user_id
	) cm ON cm.user_id = tree.user_id
	WHERE NOT tree.is_cycle
	ORDER BY tree.level, tree.user_id`

// treeNode es un nodo auxiliar con punteros para armar el árbol en una sola pasada.
type treeNode struct {
	node     models.NetworkNode
	children []*treeNode
}

// GetNetwork devuelve el árbol de referidos con raíz en rootUserID (con el resumen de
// comisiones de la raíz), o ErrNotFound si ese usuario no está afiliado a la red.
func (r *Repository) GetNetwork(ctx context.Context, rootUserID int) (*models.NetworkNode, error) {
	rows, err := r.db.QueryContext(ctx, networkQuery, rootUserID, MaxNetworkLevel)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	nodes := map[int]*treeNode{}
	var root *treeNode
	for rows.Next() {
		var n treeNode
		var sponsorID *int
		if err := rows.Scan(&n.node.ID, &n.node.Name, &sponsorID, &n.node.Level, &n.node.Sales, &n.node.Commission); err != nil {
			return nil, err
		}
		nodes[n.node.ID] = &n

		// Las filas llegan ordenadas por nivel: el padre siempre se procesó antes que el hijo.
		if n.node.Level == 0 {
			root = &n
		} else if parent, ok := nodes[*sponsorID]; ok {
			parent.children = append(parent.children, &n)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if root == nil {
		return nil, ErrNotFound
	}

	tree := toNetworkNode(root)
	summary, err := r.getCommissionSummary(ctx, rootUserID)
	if err != nil {
		return nil, err
	}
	tree.Summary = summary
	return &tree, nil
}

// getCommissionSummary lee el saldo de comisiones de un usuario desde la vista
// v_user_commissions (cero si todavía no ha cobrado ninguna).
func (r *Repository) getCommissionSummary(ctx context.Context, userID int) (*models.NetworkSummary, error) {
	var s models.NetworkSummary
	err := r.db.QueryRowContext(ctx,
		`SELECT total::float8, month_total::float8 FROM v_user_commissions WHERE user_id = $1`, userID,
	).Scan(&s.CommissionsTotal, &s.CommissionsMonth)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, mapError(err)
	}
	return &s, nil
}

// toNetworkNode transforma el árbol de punteros en la estructura models.NetworkNode que se serializa.
func toNetworkNode(n *treeNode) models.NetworkNode {
	node := n.node
	for _, child := range n.children {
		node.Children = append(node.Children, toNetworkNode(child))
	}
	return node
}

// uplineQuery recorre network_members hacia arriba (hijo -> patrocinador) desde $1.
// Es la consulta simétrica de networkQuery y toca como máximo MaxNetworkLevel+1 filas por PK.
const uplineQuery = `
	WITH RECURSIVE up AS (
	    SELECT nm.user_id, nm.sponsor_id, 0 AS level
	    FROM network_members nm
	    WHERE nm.user_id = $1
	  UNION ALL
	    SELECT nm.user_id, nm.sponsor_id, up.level + 1
	    FROM network_members nm
	    JOIN up ON nm.user_id = up.sponsor_id
	    WHERE up.level < $2
	) CYCLE user_id SET is_cycle USING path
	SELECT u.email
	FROM up
	JOIN users u ON u.id = up.user_id
	WHERE NOT up.is_cycle`

// GetUplineEmails devuelve el email de userID y de sus patrocinadores hasta MaxNetworkLevel
// niveles arriba: son las raíces de todos los árboles en los que aparece userID, es decir,
// los árboles cuya caché queda obsoleta cuando cambian sus ventas o se afilia a la red.
// Si userID no está afiliado devuelve un slice vacío.
func (r *Repository) GetUplineEmails(ctx context.Context, userID int) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, uplineQuery, userID, MaxNetworkLevel)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	emails := []string{}
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return nil, err
		}
		emails = append(emails, email)
	}
	return emails, rows.Err()
}
