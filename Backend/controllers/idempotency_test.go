package controllers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// fakeIdempotencyStore devuelve una respuesta guardada fija (o un error).
type fakeIdempotencyStore struct {
	rec   *models.IdempotencyRecord
	err   error
	calls int
}

func (f *fakeIdempotencyStore) GetIdempotencyRecord(context.Context, int, string) (*models.IdempotencyRecord, error) {
	f.calls++
	if f.rec == nil && f.err == nil {
		return nil, repository.ErrNotFound
	}
	return f.rec, f.err
}

const testKey = "3F2504E0-4F89-11D3-9A0C-0305E82C3301"

type idempotencyFixture struct {
	app     *fiber.App
	store   *fakeIdempotencyStore
	handled int
	seen    *repository.IdempotencyKey
}

// newIdempotencyFixture monta Idempotency antes de un controlador falso que registra si
// se ejecutó y qué clave recibió en el contexto.
func newIdempotencyFixture(store *fakeIdempotencyStore) *idempotencyFixture {
	f := &idempotencyFixture{store: store, app: fiber.New()}
	fakeAuth := func(c *fiber.Ctx) error {
		c.Locals(localsClaims, &auth.Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: "7"}})
		return c.Next()
	}
	handler := func(c *fiber.Ctx) error {
		f.handled++
		if k, ok := repository.IdempotencyKeyFrom(c.UserContext()); ok {
			f.seen = &k
		}
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": 99})
	}
	f.app.Post("/api/checkout", fakeAuth, NewIdempotency(store).Handle, handler)
	return f
}

func (f *idempotencyFixture) post(t *testing.T, key, body string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/checkout", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set(HeaderIdempotencyKey, key)
	}
	resp, err := f.app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestIdempotencyWithoutHeaderPassesThrough(t *testing.T) {
	f := newIdempotencyFixture(&fakeIdempotencyStore{})

	resp := f.post(t, "", `{}`)
	if resp.StatusCode != fiber.StatusCreated || f.handled != 1 || f.seen != nil || f.store.calls != 0 {
		t.Fatalf("status=%d handled=%d seen=%v calls=%d; sin cabecera la petición sigue igual que siempre",
			resp.StatusCode, f.handled, f.seen, f.store.calls)
	}
}

func TestIdempotencyRejectsKeyThatIsNotUUID(t *testing.T) {
	f := newIdempotencyFixture(&fakeIdempotencyStore{})

	resp := f.post(t, "pedido-1", `{}`)
	if resp.StatusCode != fiber.StatusBadRequest || f.handled != 0 {
		t.Fatalf("status=%d handled=%d; se esperaba 400 sin ejecutar el controlador", resp.StatusCode, f.handled)
	}
}

func TestIdempotencyNewKeyReachesRepositoryThroughContext(t *testing.T) {
	f := newIdempotencyFixture(&fakeIdempotencyStore{})

	resp := f.post(t, testKey, `{"a":1}`)
	if resp.StatusCode != fiber.StatusCreated || f.handled != 1 || f.seen == nil {
		t.Fatalf("status=%d handled=%d; la clave nueva debe llegar al controlador", resp.StatusCode, f.handled)
	}
	want := repository.IdempotencyKey{
		UserID:      7,
		Key:         strings.ToLower(testKey),
		Method:      http.MethodPost,
		Path:        "/api/checkout",
		RequestHash: requestHash(http.MethodPost, "/api/checkout", []byte(`{"a":1}`)),
	}
	if *f.seen != want {
		t.Fatalf("clave en contexto %+v; se esperaba %+v", *f.seen, want)
	}
}

func TestIdempotencyReplaysStoredResponseWithoutRunningHandler(t *testing.T) {
	stored := `{"id":42,"status":"pending"}`
	f := newIdempotencyFixture(&fakeIdempotencyStore{rec: &models.IdempotencyRecord{
		RequestHash: requestHash(http.MethodPost, "/api/checkout", []byte(`{"a":1}`)),
		StatusCode:  fiber.StatusCreated,
		Body:        []byte(stored),
	}})

	resp := f.post(t, testKey, `{"a":1}`)
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != fiber.StatusCreated || string(body) != stored || f.handled != 0 {
		t.Fatalf("status=%d body=%s handled=%d; se esperaba la respuesta guardada sin reejecutar",
			resp.StatusCode, body, f.handled)
	}
	if resp.Header.Get(HeaderIdempotentReplayed) != "true" {
		t.Fatalf("falta la cabecera %s en la respuesta repetida", HeaderIdempotentReplayed)
	}
}

func TestIdempotencyRejectsSameKeyWithDifferentBody(t *testing.T) {
	f := newIdempotencyFixture(&fakeIdempotencyStore{rec: &models.IdempotencyRecord{
		RequestHash: requestHash(http.MethodPost, "/api/checkout", []byte(`{"a":1}`)),
		StatusCode:  fiber.StatusCreated,
		Body:        []byte(`{}`),
	}})

	resp := f.post(t, testKey, `{"a":2}`)
	if resp.StatusCode != fiber.StatusUnprocessableEntity || f.handled != 0 {
		t.Fatalf("status=%d handled=%d; se esperaba 422 sin ejecutar el controlador", resp.StatusCode, f.handled)
	}
}

func TestIdempotencyStoreFailureIsServerError(t *testing.T) {
	f := newIdempotencyFixture(&fakeIdempotencyStore{err: errors.New("conexión perdida")})

	resp := f.post(t, testKey, `{}`)
	if resp.StatusCode != fiber.StatusInternalServerError || f.handled != 0 {
		t.Fatalf("status=%d handled=%d; se esperaba 500 sin ejecutar la escritura", resp.StatusCode, f.handled)
	}
}

func TestRequestHashDependsOnMethodPathAndBody(t *testing.T) {
	base := requestHash(http.MethodPost, "/api/checkout", []byte(`{"a":1}`))
	variants := []string{
		requestHash(http.MethodPut, "/api/checkout", []byte(`{"a":1}`)),
		requestHash(http.MethodPost, "/api/orders", []byte(`{"a":1}`)),
		requestHash(http.MethodPost, "/api/checkout", []byte(`{"a":2}`)),
	}
	for i, v := range variants {
		if v == base {
			t.Fatalf("variante %d produce el mismo hash que la petición original", i)
		}
	}
	if len(base) != 64 {
		t.Fatalf("hash de %d caracteres; se esperaba SHA-256 en hex (64)", len(base))
	}
}

func TestSyncConflictsAreMappedTo409WithDetails(t *testing.T) {
	cases := []struct {
		name, want string
		err        error
	}{
		{"versión de producto", `"version":5`, &repository.VersionConflictError{Current: &models.Product{ID: 1, Version: 5}}},
		{"precio cambiado", `"total":12.5`, &repository.PriceChangedError{Expected: 10, Total: 12.5}},
		{"estado cambiado", `"status":"shipped"`, &repository.StatusChangedError{Current: models.OrderShipped}},
		{"clave en curso", `"retryable":true`, &repository.DomainError{Kind: repository.ErrIdempotencyInProgress, Detail: testKey, Public: true}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/", func(c *fiber.Ctx) error { return repoError(c, tc.err) })
			resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil))
			if err != nil {
				t.Fatal(err)
			}
			body, _ := io.ReadAll(resp.Body)
			if resp.StatusCode != fiber.StatusConflict || !strings.Contains(string(body), tc.want) {
				t.Fatalf("status=%d body=%s; se esperaba 409 con %s", resp.StatusCode, body, tc.want)
			}
		})
	}
}
