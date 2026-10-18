// Seguimos dentro del paquete controllers, ya que maneja la lógica de otra sección del negocio.
package controllers

import (
	"errors"
	"strconv"

	// Importamos Fiber para manejar la respuesta HTTP.
	"github.com/gofiber/fiber/v2"
	"multicatalogo-backend/cache"
	// Importamos nuestro paquete de modelos para usar la estructura Product.
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// ProductController atiende el catálogo con Cache-Aside sobre productos:all.
type ProductController struct {
	repo  ProductRepository
	cache cache.Cache
}

// NewProductController recibe el repositorio y la caché por inyección.
func NewProductController(repo ProductRepository, c cache.Cache) *ProductController {
	return &ProductController{repo: repo, cache: c}
}

// GetProducts devuelve el catálogo completo aplicando Cache-Aside sobre la clave
// productos:all (TTL 5 min): en un Cache Hit no se consulta PostgreSQL.
func (h *ProductController) GetProducts(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	products, status, err := cache.GetOrLoad(ctx, h.cache, cache.KeyProducts, cache.TTLProducts,
		func() ([]models.Product, error) { return h.repo.GetProducts(ctx) })
	if err != nil {
		return repoError(c, err)
	}
	c.Set(cache.HeaderName, string(status))
	// Fiber convierte automáticamente el slice de estructuras a formato JSON.
	return c.JSON(products)
}

// GetCategories lista las categorías del catálogo (público; las usa el formulario de productos).
func (h *ProductController) GetCategories(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	categories, err := h.repo.GetCategories(ctx)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(categories)
}

// GetAdminProducts lista todos los productos, incluidos los dados de baja (solo admin).
// No usa la caché: el administrador siempre ve el estado actual.
func (h *ProductController) GetAdminProducts(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	products, err := h.repo.GetAllProducts(ctx)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(products)
}

// GetProductByID obtiene un producto específico por su ID.
func (h *ProductController) GetProductByID(c *fiber.Ctx) error {
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
func (h *ProductController) CreateProduct(c *fiber.Ctx) error {
	var in models.ProductInput
	if err := c.BodyParser(&in); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}

	// Validamos antes de tocar la base: errores claros por campo.
	if fieldErrors := validateProductInput(&in); len(fieldErrors) > 0 {
		return apiError(c, fiber.StatusBadRequest, "Datos de producto inválidos", fieldErrors)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	product, err := h.repo.CreateProduct(ctx, in)
	if err != nil {
		return repoError(c, err)
	}
	// El catálogo en caché ya no incluye el producto nuevo: se invalida.
	cache.Delete(h.cache, cache.KeyProducts)
	return c.Status(fiber.StatusCreated).JSON(product)
}

// UpdateProduct edita un producto de forma parcial (PUT /api/products/:id, solo admin).
// También permite reactivar un producto dado de baja con {"active": true}.
func (h *ProductController) UpdateProduct(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return apiError(c, fiber.StatusBadRequest, "ID inválido, debe ser un número", c.Params("id"))
	}

	var in models.ProductUpdate
	if err := c.BodyParser(&in); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}
	if fieldErrors := validateProductUpdate(&in); len(fieldErrors) > 0 {
		return apiError(c, fiber.StatusBadRequest, "Datos de producto inválidos", fieldErrors)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	product, err := h.repo.UpdateProduct(ctx, id, in)
	if errors.Is(err, repository.ErrNotFound) {
		return apiError(c, fiber.StatusNotFound, "Producto no encontrado", id)
	}
	if err != nil {
		return repoError(c, err)
	}
	cache.Delete(h.cache, cache.KeyProducts)
	return c.JSON(product)
}

// DeleteProduct da de baja un producto (DELETE /api/products/:id, solo admin). Es una
// baja lógica: deja de venderse y de mostrarse, pero se conserva en los pedidos.
func (h *ProductController) DeleteProduct(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return apiError(c, fiber.StatusBadRequest, "ID inválido, debe ser un número", c.Params("id"))
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	product, err := h.repo.DeactivateProduct(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return apiError(c, fiber.StatusNotFound, "Producto no encontrado", id)
	}
	if err != nil {
		return repoError(c, err)
	}
	cache.Delete(h.cache, cache.KeyProducts)
	return c.JSON(product)
}
