package controllers

import (
	"context"
	"time"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/models"
)

// Interfaces que los controladores necesitan de sus dependencias (inyección de dependencias).
// Se declaran aquí, del lado de quien las usa, y cada una pide solo los métodos que usa
// su controlador. *repository.Repository las cumple todas sin saber que existen; en los
// tests se reemplazan por implementaciones falsas sin PostgreSQL ni Redis.

// ProductRepository es el acceso a datos del catálogo.
type ProductRepository interface {
	GetProducts(ctx context.Context) ([]models.Product, error)
	GetAllProducts(ctx context.Context) ([]models.Product, error)
	GetProductByID(ctx context.Context, id int) (*models.Product, error)
	GetCategories(ctx context.Context) ([]string, error)
	CreateProduct(ctx context.Context, in models.ProductInput) (*models.Product, error)
	UpdateProduct(ctx context.Context, id int, in models.ProductUpdate) (*models.Product, error)
	DeactivateProduct(ctx context.Context, id int) (*models.Product, error)
}

// NetworkRepository es el acceso a datos de la red de referidos.
type NetworkRepository interface {
	GetNetwork(ctx context.Context, rootUserID int) (*models.NetworkNode, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUserEmailByID(ctx context.Context, id int) (string, error)
}

// OrderRepository es el acceso a datos del checkout.
type OrderRepository interface {
	CreateOrder(ctx context.Context, userID int, req models.CreateOrderRequest) (*models.Order, error)
	GetPaymentMethods(ctx context.Context) ([]string, error)
}

// OrderQueryRepository es el acceso a datos de la consulta y gestión de pedidos.
type OrderQueryRepository interface {
	ListOrders(ctx context.Context, f models.OrderFilter) (*models.Page[models.OrderSummary], error)
	GetOrder(ctx context.Context, id int) (*models.OrderDetail, error)
	UpdateOrderStatus(ctx context.Context, id int, status string) (*models.OrderDetail, error)
}

// CommissionQueryRepository es la consulta del ledger de comisiones de un distribuidor.
type CommissionQueryRepository interface {
	ListUserCommissions(ctx context.Context, userID, page, limit int) (*models.CommissionLedger, error)
}

// UserRepository es el acceso a datos de cuentas.
type UserRepository interface {
	GetUsers(ctx context.Context) ([]models.User, error)
	CreateUser(ctx context.Context, in models.RegisterRequest) (*models.User, error)
	UpdateUser(ctx context.Context, id int, in models.UpdateUserRequest) (*models.User, error)
}

// CredentialRepository busca la cuenta con la que se inicia sesión.
type CredentialRepository interface {
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
}

// Pinger verifica que la base de datos responda.
type Pinger interface {
	Ping(ctx context.Context) error
}

// TokenIssuer emite JWT (login).
type TokenIssuer interface {
	Generate(userID int, email, role string) (string, time.Time, error)
}

// AccountLookup consulta el estado vigente de una cuenta (middleware de autenticación):
// el JWT dice quién es el usuario, la base dice si sigue activo y con qué rol.
type AccountLookup interface {
	GetUserByID(ctx context.Context, id int) (*models.User, error)
}

// TokenParser valida JWT (middleware).
type TokenParser interface {
	Parse(tokenStr string) (*auth.Claims, error)
}

// NetworkInvalidator borra los árboles de red en caché donde aparece un usuario.
type NetworkInvalidator interface {
	InvalidateNetwork(ctx context.Context, userID int)
}

// CommissionProcessor calcula las comisiones de un pedido en segundo plano.
type CommissionProcessor interface {
	ProcessAsync(orderID, buyerID int)
}
