package controllers

import (
	"errors"
	"strings"

	// Importamos el framework Fiber para tener acceso al contexto (c *fiber.Ctx) de la petición HTTP.
	"github.com/gofiber/fiber/v2"
	// bcrypt compara la contraseña recibida con el hash almacenado.
	"golang.org/x/crypto/bcrypt"
	// Importamos nuestro paquete de modelos para poder usar la estructura LoginRequest.
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// dummyHash se compara cuando el email no existe, para que el tiempo de respuesta
// sea similar al de un email válido (evita enumerar cuentas midiendo tiempos).
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-password"), bcrypt.DefaultCost)

// Login valida las credenciales contra la tabla users y devuelve {token, email, role}.
func (h *Handler) Login(c *fiber.Ctx) error {
	// Creamos una variable 'req' del tipo LoginRequest (ubicada en nuestro paquete models) para almacenar los datos.
	var req models.LoginRequest

	// Intentamos parsear (transformar) el cuerpo JSON entrante y guardarlo en la variable 'req'.
	if err := c.BodyParser(&req); err != nil {
		// Si ocurre un error al parsear (ej. JSON mal formado), retornamos un estado HTTP 400 (Bad Request).
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}

	// Validar que email y password no estén vacíos.
	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		return apiError(c, fiber.StatusBadRequest, "Email y password son requeridos", nil)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	// SELECT parametrizado por email (lower(email) usa el índice único).
	user, err := h.repo.GetUserByEmail(ctx, req.Email)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return repoError(c, err)
	}

	// Email inexistente, cuenta inactiva o contraseña incorrecta devuelven el MISMO 401
	// para no revelar qué correos están registrados.
	hash := dummyHash
	if user != nil {
		hash = []byte(user.PasswordHash)
	}
	passwordOK := bcrypt.CompareHashAndPassword(hash, []byte(req.Password)) == nil
	if user == nil || !user.Active || !passwordOK {
		return apiError(c, fiber.StatusUnauthorized, "Credenciales incorrectas", nil)
	}

	// Emitimos un JWT firmado (HS256) con el ID, email y rol del usuario.
	token, exp, err := h.jwt.Generate(user.ID, user.Email, user.Role)
	if err != nil {
		return repoError(c, err)
	}

	// Misma forma de respuesta que la Fase 1 ({token, email, role}) más la expiración del token.
	return c.JSON(fiber.Map{
		"token":      token,
		"email":      user.Email,
		"role":       user.Role,
		"expires_at": exp,
	})
}
