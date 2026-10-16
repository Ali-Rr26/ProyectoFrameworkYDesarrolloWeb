// Seguimos dentro del paquete controllers, ya que maneja la lógica de otra sección del negocio.
package controllers

import (
	"errors"
	"strconv"
	"strings"

	// Importamos Fiber para manejar la respuesta HTTP.
	"github.com/gofiber/fiber/v2"
	"multicatalogo-backend/cache"
	// Importamos nuestro paquete de modelos para usar la estructura Product.
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// GetProducts devuelve el catálogo completo aplicando Cache-Aside sobre la clave
// productos:all (TTL 5 min): en un Cache Hit no se consulta PostgreSQL.
func (h *Handler) GetProducts(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	products, status, err := cache.GetOrLoad(ctx, h.rdb, cache.KeyProducts, cache.TTLProducts,
		func() ([]models.Product, error) { return h.repo.GetProducts(ctx) })
	if err != nil {
		return repoError(c, err)
	}
	c.Set(cache.HeaderName, string(status))
	// Fiber convierte automáticamente el slice de estructuras a formato JSON.
	return c.JSON(products)
}

// GetProductByID obtiene un producto específico por su ID.
func (h *Handler) GetProductByID(c *fiber.Ctx) error {
	// Obtenemos el parámetro 'id' de la URL.
	idParam := c.Params("id")

	// Convertimos el string a entero.
	id, err := strconv.Atoi(idParam)
	if err != nil {
		// Si la conversión falla (e.g., texto no numérico), devolvemos error 400.
		return apiError(c, fiber.StatusBadRequest, "ID inválido, debe ser un número", idParam)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	product, err := h.repo.GetProductByID(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		// Mismo mensaje que en la Fase 1.
		return apiError(c, fiber.StatusNotFound, "Producto no encontrado", id)
	}
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(product)
}

// CreateProduct crea un producto nuevo (solo administrador).
func (h *Handler) CreateProduct(c *fiber.Ctx) error {
	var in models.ProductInput
	if err := c.BodyParser(&in); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}

	// Validamos antes de tocar la base: errores claros por campo.
	in.Name = strings.TrimSpace(in.Name)
	in.Category = strings.TrimSpace(in.Category)
	in.Image = strings.TrimSpace(in.Image)
	fieldErrors := map[string]string{}
	if in.Name == "" {
		fieldErrors["name"] = "es requerido"
	} else if len(in.Name) > 120 {
		fieldErrors["name"] = "máximo 120 caracteres"
	}
	if in.Price <= 0 {
		fieldErrors["price"] = "debe ser mayor a 0"
	}
	if in.Stock < 0 {
		fieldErrors["stock"] = "no puede ser negativo"
	}
	if in.Category == "" {
		fieldErrors["category"] = "es requerida"
	}
	if in.Image == "" {
		fieldErrors["image"] = "es requerida"
	}
	if len(fieldErrors) > 0 {
		return apiError(c, fiber.StatusBadRequest, "Datos de producto inválidos", fieldErrors)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	product, err := h.repo.CreateProduct(ctx, in)
	if err != nil {
		return repoError(c, err)
	}
	// El catálogo en caché ya no incluye el producto nuevo: se invalida.
	cache.Delete(h.rdb, cache.KeyProducts)
	return c.Status(fiber.StatusCreated).JSON(product)
}
