package cache

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisCache implementa Cache sobre un cliente de go-redis.
type RedisCache struct {
	rdb *redis.Client
}

// NewRedisCache envuelve el cliente creado en config.NewRedisClient.
func NewRedisCache(rdb *redis.Client) *RedisCache {
	return &RedisCache{rdb: rdb}
}

// Get traduce redis.Nil (clave inexistente) a ErrMiss para que nadie fuera de este
// archivo dependa de go-redis.
func (c *RedisCache) Get(ctx context.Context, key string) ([]byte, error) {
	data, err := c.rdb.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrMiss
	}
	return data, err
}

func (c *RedisCache) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return c.rdb.Set(ctx, key, value, ttl).Err()
}

func (c *RedisCache) Del(ctx context.Context, keys ...string) error {
	return c.rdb.Del(ctx, keys...).Err()
}

func (c *RedisCache) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}
