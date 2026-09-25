// Declaramos el paquete models para agrupar las estructuras de datos de la aplicación.
package models

// LoginRequest define la estructura esperada para el cuerpo de la petición (JSON) al iniciar sesión.
type LoginRequest struct {
	// Email representa el correo del usuario; la etiqueta `json:"email"` indica cómo se mapea el JSON a esta variable.
	Email    string `json:"email"`
	// Password representa la contraseña del usuario; se extrae del campo "password" del JSON entrante.
	Password string `json:"password"`
}

// Producto define la estructura de los datos de un artículo en nuestro catálogo.
type Producto struct {
	// ID es el identificador único numérico del producto.
	ID     int     `json:"id"`
	// Nombre es la descripción en texto del producto.
	Nombre string  `json:"nombre"`
	// Descripcion es una explicación detallada del producto.
	Descripcion string `json:"descripcion"`
	// Categoria clasifica el producto en grupos temáticos.
	Categoria string `json:"categoria"`
	// Precio es el costo del producto, almacenado como un número con decimales (float64).
	Precio float64 `json:"precio"`
	// Img es la URL o ruta que apunta a la fotografía o imagen del producto.
	Img    string  `json:"img"`
	// Galeria contiene URLs adicionales para galería/lightbox del producto.
	Galeria []string `json:"galeria"`
}

// Referido define la estructura de un nodo en el árbol multinivel de referidos.
type Referido struct {
	// ID es el identificador único del referido.
	ID     int        `json:"id"`
	// Nombre es el nombre del referido.
	Nombre string     `json:"nombre"`
	// Nivel indica la profundidad en el árbol (0=usuario raíz, 1=directo, 2=indirecto, 3=tercer nivel).
	Nivel  int        `json:"nivel"`
	// Ventas son las ventas mensuales del referido en dólares.
	Ventas float64    `json:"ventas"`
	// Hijos es el slice de referidos que este usuario ha traído (referidos de un nivel más abajo).
	Hijos  []Referido `json:"hijos,omitempty"`
}