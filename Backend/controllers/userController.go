package controllers

import (
	"net/mail"
	"strings"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
)

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
	if _, err := mail.ParseAddress(req.Email); err != nil || len(req.Email) > 254 {
		fieldErrors["email"] = "formato inválido"
	}
	// bcrypt solo considera los primeros 72 bytes: rechazamos contraseñas más largas.
	if len(req.Password) < 6 || len(req.Password) > 72 {
		fieldErrors["password"] = "debe tener entre 6 y 72 caracteres"
	}
	if req.Name == "" || len(req.Name) > 120 {
		fieldErrors["name"] = "es requerido (máximo 120 caracteres)"
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
	if req.SponsorID != nil {
		h.network.InvalidateNetwork(ctx, user.ID)
	}
	return c.Status(fiber.StatusCreated).JSON(user)
}
