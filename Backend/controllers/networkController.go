package controllers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/cache"
	"multicatalogo-backend/models"
)

// NetworkController atiende el árbol de referidos con Cache-Aside sobre red:tree:{email}.
type NetworkController struct {
	repo  NetworkRepository
	cache cache.Cache
	// rootEmail es la red que ve un admin cuando no envía ?user_id (NETWORK_ROOT_EMAIL).
	rootEmail string
}

// NewNetworkController recibe sus dependencias por inyección.
func NewNetworkController(repo NetworkRepository, c cache.Cache, rootEmail string) *NetworkController {
	return &NetworkController{repo: repo, cache: c, rootEmail: rootEmail}
}

// GetNetwork devuelve el árbol de referidos multinivel (requiere JWT), con Cache-Aside
// sobre la clave red:tree:{email de la raíz} (TTL 10 min).
// Raíz según el rol del token:
//   - customer: siempre su propia red (se ignora ?user_id para que no consulte redes ajenas).
//   - admin:    ?user_id=<id> si se envía; si no, el usuario configurado en NETWORK_ROOT_EMAIL.
//
// La clave identifica al árbol (su raíz), no a quien consulta: el cliente y el admin que
// miran la misma red comparten una sola entrada, y la invalidación siempre la encuentra.
func (h *NetworkController) GetNetwork(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	claims := currentClaims(c)
	requesterID, err := claims.UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}

	// 1. Resolver el email de la raíz (para la clave) y cómo obtener su ID ante un Cache Miss.
	var email string
	var rootID func() (int, error)
	switch q := c.Query("user_id"); {
	case claims.Role != "admin":
		// El email viaja en el JWT: no hace falta ninguna consulta para armar la clave.
		email = claims.Email
		rootID = func() (int, error) { return requesterID, nil }
	case q != "":
		id, err := strconv.Atoi(q)
		if err != nil {
			return apiError(c, fiber.StatusBadRequest, "user_id inválido, debe ser un número", q)
		}
		if email, err = h.repo.GetUserEmailByID(ctx, id); err != nil {
			return repoError(c, err)
		}
		rootID = func() (int, error) { return id, nil }
	default:
		// En un Cache Hit tampoco se busca al usuario raíz por email: se ahorran dos consultas.
		email = h.rootEmail
		rootID = func() (int, error) {
			user, err := h.repo.GetUserByEmail(ctx, email)
			if err != nil {
				return 0, err
			}
			return user.ID, nil
		}
	}

	// 2. Cache-Aside sobre el árbol neutro (sin personalizar para quien consulta).
	tree, status, err := cache.GetOrLoad(ctx, h.cache, cache.NetworkKey(email), cache.TTLNetwork,
		func() (*models.NetworkNode, error) {
			id, err := rootID()
			if err != nil {
				return nil, err
			}
			return h.repo.GetNetwork(ctx, id)
		})
	if err != nil {
		return repoError(c, err)
	}

	// 3. Personalizar después de la caché: "Tú" solo cuando la raíz es quien consulta; si un
	// admin ve la red de otro miembro se conserva el nombre real. Si esto se guardara en
	// caché, el admin vería "Tú" en la red que antes consultó su dueño.
	if requesterID == tree.ID {
		tree.Name = "Tú"
	}
	c.Set(cache.HeaderName, string(status))
	return c.JSON(tree)
}
