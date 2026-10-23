package services

import (
	"context"
	"sync"
	"testing"
	"time"
)

type fakePurger struct {
	mu     sync.Mutex
	calls  int
	maxAge time.Duration
}

func (f *fakePurger) PurgeIdempotencyKeys(_ context.Context, maxAge time.Duration) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.maxAge = maxAge
	return 0, nil
}

func (f *fakePurger) snapshot() (int, time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls, f.maxAge
}

func TestIdempotencyCleanupPurgesAtStartAndStopsOnCancel(t *testing.T) {
	repo := &fakePurger{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		RunIdempotencyCleanup(ctx, repo, 7*24*time.Hour, time.Hour)
		close(done)
	}()

	deadline := time.Now().Add(time.Second)
	for {
		if calls, _ := repo.snapshot(); calls >= 1 || time.Now().After(deadline) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("la limpieza no se detuvo al cancelar el contexto")
	}

	calls, maxAge := repo.snapshot()
	if calls != 1 || maxAge != 7*24*time.Hour {
		t.Fatalf("calls=%d maxAge=%s; se esperaba una purga inicial con 7 días", calls, maxAge)
	}
}
