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
	GetProductByID(ctx context.Context, id int) (*models.Product, error)
	CreateProduct(ctx context.Context, in models.ProductInput) (*models.Product, error)
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

// UserRepository es el acceso a datos de cuentas.
type UserRepository interface {
	GetUsers(ctx context.Context) ([]models.User, error)
	CreateUser(ctx context.Context, in models.RegisterRequest) (*models.User, error)
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
