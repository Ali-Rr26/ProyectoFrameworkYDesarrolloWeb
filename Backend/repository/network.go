package repository

import (
	"context"

	"multicatalogo-backend/models"
)

// MaxNetworkLevel limita la profundidad del árbol: la red paga comisiones hasta el 3.er nivel.
const MaxNetworkLevel = 3

// networkQuery recorre la lista de adyacencia network_members desde la raíz ($1).
//   - level se calcula durante el recorrido (relativo a quien consulta), no se almacena.
//   - sales sale de la vista v_user_sales (suma de pedidos), no se almacena.
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
	       COALESCE(s.sales, 0)::float8
	FROM tree
	JOIN users u ON u.id = tree.user_id
	LEFT JOIN v_user_sales s ON s.user_id = tree.user_id
	WHERE NOT tree.is_cycle
	ORDER BY tree.level, tree.user_id`

// treeNode es un nodo auxiliar con punteros para armar el árbol en una sola pasada.
type treeNode struct {
	node     models.NetworkNode
	children []*treeNode
}

// GetNetwork devuelve el árbol de referidos con raíz en rootUserID, o ErrNotFound si
// ese usuario no está afiliado a la red.
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
		if err := rows.Scan(&n.node.ID, &n.node.Name, &sponsorID, &n.node.Level, &n.node.Sales); err != nil {
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
	return &tree, nil
}

// toNetworkNode transforma el árbol de punteros en la estructura models.NetworkNode que se serializa.
func toNetworkNode(n *treeNode) models.NetworkNode {
	node := n.node
	for _, child := range n.children {
		node.Children = append(node.Children, toNetworkNode(child))
	}
	return node
}
