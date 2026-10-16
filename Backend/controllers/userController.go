package controllers

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
)

// referralCodePattern acepta los códigos que genera la base (letras y dígitos en mayúsculas).
var referralCodePattern = regexp.MustCompile(`^[A-Z0-9]{4,20}$`)

// Roles que el administrador puede asignar.
var validRoles = map[string]bool{"admin": true, "customer": true}

// UserController administra cuentas.
type UserController struct {
	repo    UserRepository
	network NetworkInvalidator
}

// NewUserController recibe sus dependencias por inyección.
func NewUserController(repo UserRepository, network NetworkInvalidator) *UserController {
	return &UserController{repo: repo, network: network}
}

// GetUsers lista las cuentas registradas (solo administrador; nunca expone el hash).
func (h *UserController) GetUsers(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	users, err := h.repo.GetUsers(ctx)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(users)
}

// RegisterUser crea una cuenta de cliente y, opcionalmente, la afilia a la red.
func (h *UserController) RegisterUser(c *fiber.Ctx) error {
	var req models.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}

	req.Email = strings.TrimSpace(req.Email)
	req.Name = strings.TrimSpace(req.Name)
	fieldErrors := map[string]string{}
	if !validEmail(req.Email) {
		fieldErrors["email"] = "formato inválido (ejemplo: nombre@dominio.com)"
	}
	// Contraseña fuerte: se informa qué reglas faltan (ver passwordProblems).
	if problems := passwordProblems(req.Password); len(problems) > 0 {
		fieldErrors["password"] = "requiere " + strings.Join(problems, ", ")
	}
	if req.Name == "" || len(req.Name) > 120 {
		fieldErrors["name"] = "es requerido (máximo 120 caracteres)"
	}
	// El código se normaliza (sin espacios, en mayúsculas); vacío equivale a no enviarlo.
	if req.ReferralCode != nil {
		code := strings.ToUpper(strings.TrimSpace(*req.ReferralCode))
		switch {
		case code == "":
			req.ReferralCode = nil
		case !referralCodePattern.MatchString(code):
			fieldErrors["referral_code"] = "formato inválido"
		default:
			req.ReferralCode = &code
		}
	}
	if req.ReferralCode != nil && req.SponsorID != nil {
		fieldErrors["referral_code"] = "envíe sponsor_id o referral_code, no ambos"
	}
	if len(fieldErrors) > 0 {
		return apiError(c, fiber.StatusBadRequest, "Datos de registro inválidos", fieldErrors)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	user, err := h.repo.CreateUser(ctx, req)
	if err != nil {
		return repoError(c, err)
	}
	// Un nuevo afiliado aparece en los árboles de su patrocinador y de los niveles superiores.
	if user.SponsorID != nil {
		h.network.InvalidateNetwork(ctx, user.ID)
	}
	return c.Status(fiber.StatusCreated).JSON(user)
}

// UpdateUser cambia el rol y/o el estado de una cuenta (PATCH /api/users/:id, solo admin).
// Un administrador no puede cambiar su propio rol ni desactivarse: perdería el acceso.
func (h *UserController) UpdateUser(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return apiError(c, fiber.StatusBadRequest, "ID inválido, debe ser un número", c.Params("id"))
	}

	var req models.UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}
	if req.Role == nil && req.Active == nil {
		return apiError(c, fiber.StatusBadRequest, "Indique role y/o active", nil)
	}
	if req.Role != nil {
		role := strings.ToLower(strings.TrimSpace(*req.Role))
		if !validRoles[role] {
			return apiError(c, fiber.StatusBadRequest, "Datos de usuario inválidos",
				map[string]string{"role": "debe ser admin o customer"})
		}
		req.Role = &role
	}

	requesterID, err := currentClaims(c).UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}
	if id == requesterID {
		return apiError(c, fiber.StatusBadRequest, "No puede cambiar su propio rol ni desactivar su propia cuenta", nil)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	user, err := h.repo.UpdateUser(ctx, id, req)
	if err != nil {
		return repoError(c, err)
	}
	// Los árboles en caché donde aparece la cuenta se reconstruyen con su estado nuevo.
	h.network.InvalidateNetwork(ctx, id)
	return c.JSON(user)
}
