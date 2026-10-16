package controllers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// errorResponse ejecuta repoError(err) con APP_ENV dev o producción y devuelve el APIError.
func errorResponse(t *testing.T, dev bool, err error) models.APIError {
	t.Helper()
	app := fiber.New()
	app.Use(ErrorDetails(dev))
	app.Get("/", func(c *fiber.Ctx) error { return repoError(c, err) })

	resp, testErr := app.Test(httptest.NewRequest(http.MethodGet, "/", nil))
	if testErr != nil {
		t.Fatal(testErr)
	}
	var body models.APIError
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	return body
}

func TestRepoErrorHidesInternalDetailsOutsideDev(t *testing.T) {
	internal := &repository.DomainError{Kind: repository.ErrDuplicate, Detail: "ux_users_email"}

	if got := errorResponse(t, false, internal); got.Details != nil {
		t.Fatalf("en producción no se debe exponer la restricción, llegó %v", got.Details)
	}
	if got := errorResponse(t, true, internal); got.Details != "ux_users_email" {
		t.Fatalf("con APP_ENV=dev se esperaba el detalle, llegó %v", got.Details)
	}
}

func TestRepoErrorAlwaysShowsPublicDetails(t *testing.T) {
	public := &repository.DomainError{Kind: repository.ErrInsufficientStock, Detail: "producto 3", Public: true}

	got := errorResponse(t, false, public)
	if got.Status != fiber.StatusConflict || got.Details != "producto 3" {
		t.Fatalf("got=%+v; se esperaba 409 con el detalle redactado para el usuario", got)
	}
}

func TestRepoErrorInvalidQuantityIsBadRequest(t *testing.T) {
	err := &repository.DomainError{Kind: repository.ErrInvalidQuantity, Detail: "producto 1", Public: true}

	got := errorResponse(t, false, err)
	if got.Status != fiber.StatusBadRequest || got.Message != msgInvalidQuantity {
		t.Fatalf("got=%+v; se esperaba 400 %q", got, msgInvalidQuantity)
	}
}
