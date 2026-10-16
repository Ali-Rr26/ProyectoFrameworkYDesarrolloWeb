// Declaramos el paquete cache: implementa el patrón Cache-Aside sobre Redis.
// El repositorio sigue siendo la única capa que conoce SQL; la caché lo envuelve desde fuera.
package cache

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Claves y tiempos de expiración definidos por el DRS de la Fase 3.
const (
	// KeyProducts guarda el catálogo completo (GET /api/products).
	KeyProducts = "productos:all"
	// NetworkKeyPrefix antecede al email de la raíz del árbol (GET /api/network).
	NetworkKeyPrefix = "red:tree:"
	// TTLProducts es la vigencia del catálogo en caché.
	TTLProducts = 5 * time.Minute
	// TTLNetwork es la vigencia del árbol: la consulta recursiva es la más costosa.
	TTLNetwork = 10 * time.Minute
)

// HeaderName es la cabecera con la que se informa al cliente el origen de la respuesta.
const HeaderName = "X-Cache"

// opTimeout es el presupuesto de cada operación contra Redis. Va separado del contexto
// de la petición: si Redis cae, los reintentos del cliente no deben consumir el tiempo
// que necesita PostgreSQL para responder en su lugar.
const opTimeout = 300 * time.Millisecond

// Status indica de dónde salió la respuesta; se expone en la cabecera X-Cache.
type Status string

const (
	// Hit: la respuesta se leyó de Redis sin tocar PostgreSQL.
	Hit Status = "HIT"
	// Miss: no estaba en Redis; se leyó de PostgreSQL y se guardó con su TTL.
	Miss Status = "MISS"
	// Bypass: Redis no está disponible; se leyó de PostgreSQL sin guardar.
	Bypass Status = "BYPASS"
)

// NetworkKey arma la clave del árbol de referidos. El email se guarda en minúsculas
// porque el login no distingue mayúsculas: así cada árbol tiene una sola entrada.
func NetworkKey(email string) string {
	return NetworkKeyPrefix + strings.ToLower(strings.TrimSpace(email))
}

// GetOrLoad implementa Cache-Aside:
//  1. intenta leer key desde Redis (Hit: deserializa y retorna sin tocar la BD);
//  2. si no existe (Miss), ejecuta load, serializa el resultado a JSON y lo guarda con ttl;
//  3. si Redis falla (Bypass), ejecuta load sin guardar: la caché nunca tumba la API.
//
// Si load falla no se guarda nada (los errores no se cachean) y el error se devuelve tal cual.
func GetOrLoad[T any](ctx context.Context, rdb *redis.Client, key string, ttl time.Duration, load func() (T, error)) (T, Status, error) {
	if rdb == nil {
		v, err := load()
		return v, Bypass, err
	}

	getCtx, cancel := context.WithTimeout(ctx, opTimeout)
	data, err := rdb.Get(getCtx, key).Bytes()
	cancel()
	switch {
	case err == nil:
		var v T
		if jsonErr := json.Unmarshal(data, &v); jsonErr == nil {
			return v, Hit, nil
		}
		// Contenido corrupto o de una versión anterior del modelo: se reconstruye.
		log.Printf("cache: valor inválido en %s, se recarga desde la BD", key)
	case errors.Is(err, redis.Nil):
		// La clave no existe: Cache Miss normal.
	default:
		// Redis caído o lento: se sirve desde la BD sin intentar guardar.
		log.Printf("cache: GET %s falló: %v", key, err)
		v, loadErr := load()
		return v, Bypass, loadErr
	}

	v, err := load()
	if err != nil {
		return v, Miss, err
	}
	payload, err := json.Marshal(v)
	if err != nil {
		log.Printf("cache: no se pudo serializar %s: %v", key, err)
		return v, Bypass, nil
	}
	setCtx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	if err := rdb.Set(setCtx, key, payload, ttl).Err(); err != nil {
		log.Printf("cache: SET %s falló: %v", key, err)
		return v, Bypass, nil
	}
	return v, Miss, nil
}

// Delete invalida las claves indicadas tras una escritura confirmada en PostgreSQL.
// Usa su propio contexto para borrar aunque el cliente HTTP ya haya cortado la conexión.
// Los errores solo se registran: la escritura ya se confirmó y el TTL acota el dato viejo.
func Delete(rdb *redis.Client, keys ...string) {
	if rdb == nil || len(keys) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	if err := rdb.Del(ctx, keys...).Err(); err != nil {
		log.Printf("cache: DEL %v falló: %v", keys, err)
	}
}
