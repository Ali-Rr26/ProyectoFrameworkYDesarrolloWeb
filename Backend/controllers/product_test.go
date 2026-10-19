package controllers

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/cache"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// fakeProducts es un ProductRepository en memoria que registra lo que recibe.
type fakeProducts struct {
	updatedID   int
	updated     *models.ProductUpdate
	deactivated int
	err         error
	listed      *models.ListFilter
}

func (f *fakeProducts) GetProducts(context.Context) ([]models.Product, error) { return nil, nil }
func (f *fakeProducts) ListAllProducts(_ context.Context, filter models.ListFilter) (*models.Page[models.Product], error) {
	f.listed = &filter
	return &models.Page[models.Product]{Data: []models.Product{}, Page: filter.Page, Limit: filter.Limit}, nil
}
func (f *fakeProducts) GetProductByID(context.Context, int) (*models.Product, error) {
	return nil, repository.ErrNotFound
}
func (f *fakeProducts) GetCategories(context.Context) ([]string, error) {
	return []string{"Serum"}, nil
}
func (f *fakeProducts) CreateProduct(context.Context, models.ProductInput) (*models.Product, error) {
	return &models.Product{ID: 1, Active: true}, f.err
}

func (f *fakeProducts) UpdateProduct(_ context.Context, id int, in models.ProductUpdate) (*models.Product, error) {
	f.updatedID, f.updated = id, &in
	if f.err != nil {
		return nil, f.err
	}
	return &models.Product{ID: id, Active: true}, nil
}

func (f *fakeProducts) DeactivateProduct(_ context.Context, id int) (*models.Product, error) {
	f.deactivated = id
	if f.err != nil {
		return nil, f.err
	}
	return &models.Product{ID: id, Active: false}, nil
}

func newProductApp(repo *fakeProducts, c *fakeCache) *fiber.App {
	ctrl := NewProductController(repo, c)
	app := fiber.New()
	app.Get("/api/admin/products", ctrl.GetAdminProducts)
	app.Post("/api/products", ctrl.CreateProduct)
	app.Put("/api/products/:id", ctrl.UpdateProduct)
	app.Delete("/api/products/:id", ctrl.DeleteProduct)
	return app
}

func TestUpdateProductValidation(t *testing.T) {
	cases := []struct{ name, path, body string }{
		{"id no numérico", "/api/products/abc", `{"stock":5}`},
		{"sin campos", "/api/products/1", `{}`},
		{"stock negativo", "/api/products/1", `{"stock":-1}`},
		{"precio cero", "/api/products/1", `{"price":0}`},
		{"nombre vacío", "/api/products/1", `{"name":"   "}`},
		{"url de galería vacía", "/api/products/1", `{"gallery":["https://x/a.jpg",""]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo, c := &fakeProducts{}, &fakeCache{}
			status, body := send(t, newProductApp(repo, c), http.MethodPut, tc.path, tc.body)
			if status != fiber.StatusBadRequest {
				t.Fatalf("status=%d body=%s; se esperaba 400", status, body)
			}
			if repo.updated != nil || len(c.deleted) != 0 {
				t.Fatal("una edición inválida no debe tocar la base ni la caché")
			}
		})
	}
}

func TestUpdateProductAppliesPartialChangesAndInvalidatesCache(t *testing.T) {
	repo, c := &fakeProducts{}, &fakeCache{}
	status, body := send(t, newProductApp(repo, c), http.MethodPut, "/api/products/3", `{"name":"  Sérum Nuevo ","stock":10,"active":true}`)
	if status != fiber.StatusOK {
		t.Fatalf("status=%d body=%s; se esperaba 200", status, body)
	}
	u := repo.updated
	if repo.updatedID != 3 || *u.Name != "Sérum Nuevo" || *u.Stock != 10 || !*u.Active || u.Price != nil || u.Category != nil {
		t.Fatalf("edición recibida %+v; se esperaban solo nombre normalizado, stock y active", u)
	}
	if len(c.deleted) != 1 || c.deleted[0] != cache.KeyProducts {
		t.Fatalf("claves invalidadas %v; se esperaba %s", c.deleted, cache.KeyProducts)
	}
}

func TestDeleteProductIsLogicalAndInvalidatesCache(t *testing.T) {
	repo, c := &fakeProducts{}, &fakeCache{}
	status, body := send(t, newProductApp(repo, c), http.MethodDelete, "/api/products/4", "")
	if status != fiber.StatusOK || !strings.Contains(body, `"active":false`) {
		t.Fatalf("status=%d body=%s; se esperaba 200 con active=false", status, body)
	}
	if repo.deactivated != 4 || len(c.deleted) != 1 {
		t.Fatalf("baja de %d, caché %v; se esperaba baja del 4 e invalidación", repo.deactivated, c.deleted)
	}
}

func TestProductNotFound(t *testing.T) {
	for _, method := range []string{http.MethodPut, http.MethodDelete} {
		repo, c := &fakeProducts{err: repository.ErrNotFound}, &fakeCache{}
		status, _ := send(t, newProductApp(repo, c), method, "/api/products/999", `{"stock":1}`)
		if status != fiber.StatusNotFound || len(c.deleted) != 0 {
			t.Fatalf("%s: status=%d; se esperaba 404 sin invalidar la caché", method, status)
		}
	}
}

func TestCreateProductKeepsValidation(t *testing.T) {
	repo, c := &fakeProducts{}, &fakeCache{}
	status, body := send(t, newProductApp(repo, c), http.MethodPost, "/api/products", `{"name":"","price":0,"stock":-2}`)
	if status != fiber.StatusBadRequest {
		t.Fatalf("status=%d; se esperaba 400", status)
	}
	for _, field := range []string{"name", "price", "stock", "category", "image"} {
		if !strings.Contains(body, `"`+field+`"`) {
			t.Errorf("falta el error del campo %s en %s", field, body)
		}
	}
}
