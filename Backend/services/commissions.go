package services

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"multicatalogo-backend/models"
)

// commissionTimeout es el presupuesto de cada cálculo en segundo plano.
const commissionTimeout = 10 * time.Second

// CommissionRepository es lo que el servicio necesita de la base de datos.
type CommissionRepository interface {
	CreateCommissions(ctx context.Context, orderID int) (int, error)
	GetPendingCommissions(ctx context.Context) ([]models.PendingCommission, error)
}

// NetworkInvalidator borra los árboles de red en caché donde aparece un usuario.
type NetworkInvalidator interface {
	InvalidateNetwork(ctx context.Context, userID int)
}

// CommissionService calcula las comisiones multinivel en goroutines, fuera del ciclo
// petición/respuesta: el cliente recibe su confirmación sin esperar este trabajo.
type CommissionService struct {
	repo    CommissionRepository
	network NetworkInvalidator

	// wg cuenta las goroutines en curso para esperarlas al apagar el servidor.
	wg sync.WaitGroup
	// mu protege closed: tras Shutdown no se aceptan trabajos nuevos.
	mu     sync.Mutex
	closed bool
}

// NewCommissionService recibe sus dependencias por inyección.
func NewCommissionService(repo CommissionRepository, network NetworkInvalidator) *CommissionService {
	return &CommissionService{repo: repo, network: network}
}

// ProcessAsync lanza una goroutine que registra las comisiones del pedido y luego
// invalida la caché de la red. Retorna de inmediato.
func (s *CommissionService) ProcessAsync(orderID, buyerID int) {
	if !s.track() {
		// El pedido ya está confirmado: RecoverPending lo procesará al volver a arrancar.
		log.Printf("comisiones: servidor apagándose, pedido %d queda pendiente", orderID)
		return
	}
	go func() {
		defer s.wg.Done()
		s.process(orderID, buyerID)
	}()
}

// RecoverPending procesa en segundo plano los pedidos que quedaron sin comisiones
// (p. ej. el servidor se detuvo entre el COMMIT del pedido y el fin de la goroutine).
func (s *CommissionService) RecoverPending() {
	if !s.track() {
		return
	}
	go func() {
		defer s.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), commissionTimeout)
		pending, err := s.repo.GetPendingCommissions(ctx)
		cancel()
		if err != nil {
			log.Printf("comisiones: no se pudieron buscar pedidos pendientes: %v", err)
			return
		}
		if len(pending) > 0 {
			log.Printf("comisiones: recuperando %d pedido(s) pendiente(s)", len(pending))
		}
		for _, p := range pending {
			s.process(p.OrderID, p.BuyerID)
		}
	}()
}

// Shutdown deja de aceptar trabajos y espera a que terminen los que están en curso
// (o a que venza ctx). Debe llamarse antes de cerrar el pool de PostgreSQL.
func (s *CommissionService) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	s.closed = true
	s.mu.Unlock()

	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return errors.New("comisiones: quedaron cálculos en curso al apagar")
	}
}

// track registra un trabajo nuevo en el WaitGroup si el servicio sigue abierto.
// Add se hace bajo el mutex para que no compita con el Wait de Shutdown.
func (s *CommissionService) track() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	s.wg.Add(1)
	return true
}

// process es el trabajo de cada goroutine. Usa su propio contexto: el de la petición
// HTTP se cancela en cuanto Fiber responde, y este cálculo ocurre después.
func (s *CommissionService) process(orderID, buyerID int) {
	// Un panic en una goroutine sin recover tumbaría todo el servidor.
	defer func() {
		if r := recover(); r != nil {
			log.Printf("comisiones: panic procesando pedido %d: %v", orderID, r)
		}
	}()

	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), commissionTimeout)
	defer cancel()

	n, err := s.repo.CreateCommissions(ctx, orderID)
	if err != nil {
		// No se reintenta aquí: el pedido queda pendiente y RecoverPending lo retoma.
		log.Printf("comisiones: pedido %d falló: %v", orderID, err)
		return
	}
	log.Printf("comisiones: pedido %d -> %d comisión(es) registrada(s) en %s (segundo plano)",
		orderID, n, time.Since(start).Round(time.Millisecond))

	// Los saldos de los patrocinadores cambiaron: sus árboles en caché quedan obsoletos.
	if n > 0 {
		s.network.InvalidateNetwork(ctx, buyerID)
	}
}
