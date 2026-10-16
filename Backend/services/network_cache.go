// Declaramos el paquete services: lógica de negocio que no es HTTP ni SQL
// (procesos en segundo plano e invalidación de caché compartida entre controladores).
package services

import (
	"context"
	"log"

	"multicatalogo-backend/cache"
)

// UplineFinder obtiene los emails de un usuario y de sus patrocinadores (repositorio).
type UplineFinder interface {
	GetUplineEmails(ctx context.Context, userID int) ([]string, error)
}

// NetworkCacheInvalidator borra de la caché los árboles de red en los que aparece un usuario.
type NetworkCacheInvalidator struct {
	repo  UplineFinder
	cache cache.Cache
}

// NewNetworkCacheInvalidator recibe sus dependencias por inyección.
func NewNetworkCacheInvalidator(repo UplineFinder, c cache.Cache) *NetworkCacheInvalidator {
	return &NetworkCacheInvalidator{repo: repo, cache: c}
}

// InvalidateNetwork borra los árboles en los que aparece userID: el suyo y los de sus
// patrocinadores hasta MaxNetworkLevel niveles arriba. Se llama tras una escritura ya
// confirmada, por eso un fallo solo se registra (el TTL acota el dato desactualizado).
func (i *NetworkCacheInvalidator) InvalidateNetwork(ctx context.Context, userID int) {
	emails, err := i.repo.GetUplineEmails(ctx, userID)
	if err != nil {
		log.Printf("cache: no se pudo calcular la red de %d para invalidar: %v", userID, err)
		return
	}
	keys := make([]string, len(emails))
	for idx, e := range emails {
		keys[idx] = cache.NetworkKey(e)
	}
	cache.Delete(i.cache, keys...)
}
