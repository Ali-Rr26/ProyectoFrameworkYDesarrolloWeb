package services

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"multicatalogo-backend/models"
)

type fakeCommissionRepo struct {
	mu       sync.Mutex
	inserted int
	err      error
	panics   bool
	delay    time.Duration
	orders   []int
	pending  []models.PendingCommission
}

func (f *fakeCommissionRepo) CreateCommissions(_ context.Context, orderID int) (int, error) {
	time.Sleep(f.delay)
	if f.panics {
		panic("fallo inesperado")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.orders = append(f.orders, orderID)
	return f.inserted, f.err
}

func (f *fakeCommissionRepo) GetPendingCommissions(context.Context) ([]models.PendingCommission, error) {
	return f.pending, nil
}

type fakeNetwork struct {
	mu    sync.Mutex
	users []int
}

func (f *fakeNetwork) InvalidateNetwork(_ context.Context, userID int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.users = append(f.users, userID)
}

func shutdown(t *testing.T, s *CommissionService) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := s.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestProcessAsyncDoesNotBlockAndInvalidatesNetwork(t *testing.T) {
	repo := &fakeCommissionRepo{inserted: 3, delay: 100 * time.Millisecond}
	network := &fakeNetwork{}
	s := NewCommissionService(repo, network)

	start := time.Now()
	s.ProcessAsync(10, 7)
	if time.Since(start) > 50*time.Millisecond {
		t.Fatal("ProcessAsync debe retornar sin esperar el cálculo")
	}

	shutdown(t, s) // espera a la goroutine
	if len(repo.orders) != 1 || repo.orders[0] != 10 {
		t.Fatalf("pedidos procesados %v; se esperaba [10]", repo.orders)
	}
	if len(network.users) != 1 || network.users[0] != 7 {
		t.Fatalf("red invalidada para %v; se esperaba [7]", network.users)
	}
}

func TestNoInvalidationWithoutCommissions(t *testing.T) {
	for name, repo := range map[string]*fakeCommissionRepo{
		"comprador sin patrocinador": {inserted: 0},
		"error de la BD":             {err: errors.New("BD caída")},
		"panic":                      {panics: true},
	} {
		t.Run(name, func(t *testing.T) {
			network := &fakeNetwork{}
			s := NewCommissionService(repo, network)
			s.ProcessAsync(1, 7)
			shutdown(t, s)
			if len(network.users) != 0 {
				t.Fatalf("no se esperaba invalidación, hubo %v", network.users)
			}
		})
	}
}

func TestShutdownRejectsNewWork(t *testing.T) {
	repo := &fakeCommissionRepo{inserted: 1}
	s := NewCommissionService(repo, &fakeNetwork{})
	shutdown(t, s)

	s.ProcessAsync(1, 7)
	shutdown(t, s)
	if len(repo.orders) != 0 {
		t.Fatal("tras Shutdown no se deben lanzar goroutines")
	}
}

func TestRecoverPendingProcessesEachOrder(t *testing.T) {
	repo := &fakeCommissionRepo{
		inserted: 1,
		pending:  []models.PendingCommission{{OrderID: 4, BuyerID: 3}, {OrderID: 5, BuyerID: 6}},
	}
	network := &fakeNetwork{}
	s := NewCommissionService(repo, network)

	s.RecoverPending()
	shutdown(t, s)
	if len(repo.orders) != 2 || len(network.users) != 2 {
		t.Fatalf("procesados %v, invalidados %v; se esperaban 2 y 2", repo.orders, network.users)
	}
}
