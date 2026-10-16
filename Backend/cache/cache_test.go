package cache

import (
	"context"
	"errors"
	"testing"
	"time"
)

// memCache es una Cache en memoria para probar Cache-Aside sin Redis.
type memCache struct {
	data   map[string][]byte
	getErr error
}

func newMemCache() *memCache { return &memCache{data: map[string][]byte{}} }

func (m *memCache) Get(_ context.Context, key string) ([]byte, error) {
	if m.getErr != nil {
		return nil, m.getErr
	}
	v, ok := m.data[key]
	if !ok {
		return nil, ErrMiss
	}
	return v, nil
}

func (m *memCache) Set(_ context.Context, key string, value []byte, _ time.Duration) error {
	m.data[key] = value
	return nil
}

func (m *memCache) Del(_ context.Context, keys ...string) error {
	for _, k := range keys {
		delete(m.data, k)
	}
	return nil
}

func (m *memCache) Ping(context.Context) error { return nil }

func TestGetOrLoadMissThenHit(t *testing.T) {
	c := newMemCache()
	calls := 0
	load := func() ([]string, error) { calls++; return []string{"a", "b"}, nil }

	v, status, err := GetOrLoad(context.Background(), c, "k", time.Minute, load)
	if err != nil || status != Miss || len(v) != 2 {
		t.Fatalf("primera lectura: v=%v status=%s err=%v; se esperaba MISS", v, status, err)
	}
	v, status, err = GetOrLoad(context.Background(), c, "k", time.Minute, load)
	if err != nil || status != Hit || len(v) != 2 {
		t.Fatalf("segunda lectura: v=%v status=%s err=%v; se esperaba HIT", v, status, err)
	}
	if calls != 1 {
		t.Fatalf("la BD se consultó %d veces; en un HIT no debe consultarse", calls)
	}
}

func TestGetOrLoadBypassWhenCacheFails(t *testing.T) {
	c := newMemCache()
	c.getErr = errors.New("redis caído")

	_, status, err := GetOrLoad(context.Background(), c, "k", time.Minute,
		func() (int, error) { return 42, nil })
	if err != nil || status != Bypass {
		t.Fatalf("status=%s err=%v; se esperaba BYPASS", status, err)
	}
	if _, ok := c.data["k"]; ok {
		t.Fatal("con la caché fallando no se debe guardar nada")
	}
}

func TestGetOrLoadDoesNotCacheErrors(t *testing.T) {
	c := newMemCache()
	_, _, err := GetOrLoad(context.Background(), c, "k", time.Minute,
		func() (int, error) { return 0, errors.New("BD caída") })
	if err == nil {
		t.Fatal("se esperaba el error de la BD")
	}
	if _, ok := c.data["k"]; ok {
		t.Fatal("los errores no deben quedar en caché")
	}
}

func TestDeleteRemovesKeys(t *testing.T) {
	c := newMemCache()
	c.data[KeyProducts] = []byte("[]")
	Delete(c, KeyProducts)
	if _, ok := c.data[KeyProducts]; ok {
		t.Fatal("la clave debió invalidarse")
	}
}
