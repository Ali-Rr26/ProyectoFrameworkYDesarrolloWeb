// Declaramos el paquete models para agrupar las estructuras de datos de la aplicación.
package models

import "time"

// LoginRequest define la estructura esperada para el cuerpo de la petición (JSON) al iniciar sesión.
type LoginRequest struct {
	// Email representa el correo del usuario; la etiqueta `json:"email"` indica cómo se mapea el JSON a esta variable.
	Email string `json:"email"`
	// Password representa la contraseña del usuario; se extrae del campo "password" del JSON entrante.
	Password string `json:"password"`
}

// Product define la estructura de los datos de un artículo en nuestro catálogo.
type Product struct {
	// ID es el identificador único numérico del producto.
	ID int `json:"id"`
	// Name es el nombre comercial del producto.
	Name string `json:"name"`
	// Description es una explicación detallada del producto.
	Description string `json:"description"`
	// Category clasifica el producto en grupos temáticos.
	Category string `json:"category"`
	// Price es el costo del producto, almacenado como un número con decimales (float64).
	Price float64 `json:"price"`
	// Image es la URL de la fotografía principal del producto.
	Image string `json:"image"`
	// Gallery contiene URLs adicionales para la galería/lightbox del producto.
	Gallery []string `json:"gallery"`
	// Stock son las unidades disponibles (el frontend lo usa para avisar "Agotado").
	Stock int `json:"stock"`
}

// APIError estandariza respuestas de error HTTP.
type APIError struct {
	// Status es el código HTTP de error.
	Status int `json:"status"`
	// Message es la descripción del error (en español, la ve el usuario).
	Message string `json:"message"`
	// Details contiene información adicional (opcional).
	Details interface{} `json:"details,omitempty"`
}

// NetworkNode define un nodo del árbol multinivel de referidos.
type NetworkNode struct {
	// ID es el identificador del usuario que representa el nodo.
	ID int `json:"id"`
	// Name es el nombre del miembro de la red.
	Name string `json:"name"`
	// Level indica la profundidad en el árbol (0=raíz, 1=directo, 2=indirecto, 3=tercer nivel).
	Level int `json:"level"`
	// Sales son las ventas acumuladas del miembro en dólares.
	Sales float64 `json:"sales"`
	// Children son los referidos que este miembro ha traído (un nivel más abajo).
	Children []NetworkNode `json:"children,omitempty"`
}

// User representa una cuenta almacenada en la tabla users (junto al nombre de su rol).
type User struct {
	// ID es la clave sustituta del usuario.
	ID int `json:"id"`
	// Email es el correo único del usuario.
	Email string `json:"email"`
	// PasswordHash es el hash bcrypt; json:"-" garantiza que nunca se serialice en una respuesta.
	PasswordHash string `json:"-"`
	// Name es el nombre visible del usuario.
	Name string `json:"name"`
	// Role es el nombre del rol (admin | customer), resuelto desde la tabla roles.
	Role string `json:"role"`
	// Active indica si la cuenta está habilitada (borrado lógico).
	Active bool `json:"active"`
	// SponsorID es el patrocinador en la red MLM (nil si es raíz o no está afiliado).
	SponsorID *int `json:"sponsor_id"`
}

// ProductInput es el cuerpo esperado para crear un producto (POST /api/products).
type ProductInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	// Category es el nombre de una categoría existente.
	Category string   `json:"category"`
	Price    float64  `json:"price"`
	Stock    int      `json:"stock"`
	Image    string   `json:"image"`
	Gallery  []string `json:"gallery"`
}

// RegisterRequest es el cuerpo esperado para registrar un cliente (POST /api/users).
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	// SponsorID es opcional: si viene, el usuario se afilia a la red bajo ese patrocinador.
	SponsorID *int `json:"sponsor_id"`
}

// OrderItemInput es una línea del pedido enviada por el cliente (el precio lo pone el servidor).
type OrderItemInput struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

// CreateOrderRequest es el cuerpo esperado para registrar un pedido (POST /api/orders).
// El comprador no viaja en el cuerpo: se toma del JWT.
type CreateOrderRequest struct {
	PaymentMethod   string           `json:"payment_method"`
	ShippingAddress string           `json:"shipping_address"`
	City            string           `json:"city"`
	Phone           string           `json:"phone"`
	Items           []OrderItemInput `json:"items"`
}

// OrderItem es una línea del pedido ya registrado, con el precio aplicado.
type OrderItem struct {
	ProductID int     `json:"product_id"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
}

// Order es la respuesta tras registrar una compra.
type Order struct {
	ID        int         `json:"id"`
	CreatedAt time.Time   `json:"created_at"`
	Total     float64     `json:"total"`
	Items     []OrderItem `json:"items"`
}
