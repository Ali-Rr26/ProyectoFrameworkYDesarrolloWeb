// Seguimos dentro del paquete controllers, ya que maneja la lógica de otra sección del negocio.
package controllers

import (
	// Importamos Fiber para manejar la respuesta HTTP.
	"github.com/gofiber/fiber/v2"
	// Importamos strconv para convertir strings a números.
	"strconv"
	// Importamos nuestro paquete de modelos para usar la estructura Producto.
	"multicatalogo-backend/models"
)

// GetProductos es la función controladora encargada de devolver el catálogo de artículos.
func GetProductos(c *fiber.Ctx) error {
	// Declaramos e inicializamos un 'slice' (arreglo dinámico) usando nuestro modelo models.Producto.
	productos := []models.Producto{
		{
			ID:           1,
			Nombre:       "Serum Revitalizante",
			Descripcion:  "Serum concentrado con vitamina C y ácido hialurónico. Ilumina la piel, reduce manchas y aporta hidratación profunda desde la primera aplicación.",
			Categoria:    "Serum",
			Precio:       45.00,
			Img:          "https://picsum.photos/seed/serum/600",
			Galeria:      []string{"https://picsum.photos/seed/serum1/600", "https://picsum.photos/seed/serum2/600", "https://picsum.photos/seed/serum3/600"},
		},
		{
			ID:           2,
			Nombre:       "Crema Hidratante Pro",
			Descripcion:  "Crema facial de textura ligera con niacinamida y manteca de karité. Hidratación de 24 horas y barrera cutánea fortalecida para todo tipo de piel.",
			Categoria:    "Crema",
			Precio:       32.50,
			Img:          "https://picsum.photos/seed/crema/600",
			Galeria:      []string{"https://picsum.photos/seed/crema1/600", "https://picsum.photos/seed/crema2/600", "https://picsum.photos/seed/crema3/600"},
		},
		{
			ID:           3,
			Nombre:       "Tónico Purificante",
			Descripcion:  "Tónico sin alcohol con hamamelis y agua de rosas. Limpia poros, equilibra el pH y prepara la piel para el resto de la rutina diaria.",
			Categoria:    "Tónico",
			Precio:       28.00,
			Img:          "https://picsum.photos/seed/tonico/600",
			Galeria:      []string{"https://picsum.photos/seed/tonico1/600", "https://picsum.photos/seed/tonico2/600", "https://picsum.photos/seed/tonico3/600"},
		},
		{
			ID:           4,
			Nombre:       "Mascarilla Nocturna",
			Descripcion:  "Mascarilla de noche con colágeno y vitamina E. Repara la piel mientras duermes y recupera la luminosidad al despertar.",
			Categoria:    "Mascarilla",
			Precio:       50.00,
			Img:          "https://picsum.photos/seed/mascarilla/600",
			Galeria:      []string{"https://picsum.photos/seed/mascarilla1/600", "https://picsum.photos/seed/mascarilla2/600", "https://picsum.photos/seed/mascarilla3/600"},
		},
		{
			ID:           5,
			Nombre:       "Serum Anti-Edad Retinol",
			Descripcion:  "Serum de retinol encapsulado que suaviza líneas de expresión y mejora la firmeza. Uso nocturno recomendado.",
			Categoria:    "Serum",
			Precio:       58.00,
			Img:          "https://picsum.photos/seed/retinol/600",
			Galeria:      []string{"https://picsum.photos/seed/retinol1/600", "https://picsum.photos/seed/retinol2/600", "https://picsum.photos/seed/retinol3/600"},
		},
		{
			ID:           6,
			Nombre:       "Crema Contorno de Ojos",
			Descripcion:  "Contorno de ojos con cafeína y péptidos. Reduce bolsas y ojeras, hidrata la zona más delicada del rostro.",
			Categoria:    "Crema",
			Precio:       26.00,
			Img:          "https://picsum.photos/seed/ojos/600",
			Galeria:      []string{"https://picsum.photos/seed/ojos1/600", "https://picsum.photos/seed/ojos2/600", "https://picsum.photos/seed/ojos3/600"},
		},
		{
			ID:           7,
			Nombre:       "Tónico Exfoliante AHA-BHA",
			Descripcion:  "Exfoliación química suave con ácidos AHA y BHA. Renueva la textura de la piel y desobstruye los poros.",
			Categoria:    "Tónico",
			Precio:       34.00,
			Img:          "https://picsum.photos/seed/exfoliante/600",
			Galeria:      []string{"https://picsum.photos/seed/exfoliante1/600", "https://picsum.photos/seed/exfoliante2/600", "https://picsum.photos/seed/exfoliante3/600"},
		},
		{
			ID:           8,
			Nombre:       "Kit Rutina Completa",
			Descripcion:  "Kit integral con serum, crema, tónico y mascarilla. La rutina perfecta para comenzar: limpieza, tratamiento e hidratación.",
			Categoria:    "Kit",
			Precio:       129.00,
			Img:          "https://picsum.photos/seed/kit/600",
			Galeria:      []string{"https://picsum.photos/seed/kit1/600", "https://picsum.photos/seed/kit2/600", "https://picsum.photos/seed/kit3/600"},
		},
	}

	// Fiber convierte automáticamente el slice de estructuras a formato JSON y lo envía como respuesta al cliente.
	return c.JSON(productos)
}

// GetProductoPorID obtiene un producto específico por su ID.
func GetProductoPorID(c *fiber.Ctx) error {
	// Obtenemos el parámetro 'id' de la URL.
	idStr := c.Params("id")

	// Convertimos el string a entero.
	id, err := strconv.Atoi(idStr)
	if err != nil {
		// Si la conversión falla (e.g., texto no numérico), devolvemos error 400.
		return c.Status(400).JSON(models.APIError{
			Status:  400,
			Message: "ID inválido, debe ser un número",
			Details: idStr,
		})
	}

	// Datos hardcodeados de productos (mismo array que GetProductos).
	productos := []models.Producto{
		{
			ID:           1,
			Nombre:       "Serum Revitalizante",
			Descripcion:  "Serum concentrado con vitamina C y ácido hialurónico. Ilumina la piel, reduce manchas y aporta hidratación profunda desde la primera aplicación.",
			Categoria:    "Serum",
			Precio:       45.00,
			Img:          "https://picsum.photos/seed/serum/600",
			Galeria:      []string{"https://picsum.photos/seed/serum1/600", "https://picsum.photos/seed/serum2/600", "https://picsum.photos/seed/serum3/600"},
		},
		{
			ID:           2,
			Nombre:       "Crema Hidratante Pro",
			Descripcion:  "Crema facial de textura ligera con niacinamida y manteca de karité. Hidratación de 24 horas y barrera cutánea fortalecida para todo tipo de piel.",
			Categoria:    "Crema",
			Precio:       32.50,
			Img:          "https://picsum.photos/seed/crema/600",
			Galeria:      []string{"https://picsum.photos/seed/crema1/600", "https://picsum.photos/seed/crema2/600", "https://picsum.photos/seed/crema3/600"},
		},
		{
			ID:           3,
			Nombre:       "Tónico Purificante",
			Descripcion:  "Tónico sin alcohol con hamamelis y agua de rosas. Limpia poros, equilibra el pH y prepara la piel para el resto de la rutina diaria.",
			Categoria:    "Tónico",
			Precio:       28.00,
			Img:          "https://picsum.photos/seed/tonico/600",
			Galeria:      []string{"https://picsum.photos/seed/tonico1/600", "https://picsum.photos/seed/tonico2/600", "https://picsum.photos/seed/tonico3/600"},
		},
		{
			ID:           4,
			Nombre:       "Mascarilla Nocturna",
			Descripcion:  "Mascarilla de noche con colágeno y vitamina E. Repara la piel mientras duermes y recupera la luminosidad al despertar.",
			Categoria:    "Mascarilla",
			Precio:       50.00,
			Img:          "https://picsum.photos/seed/mascarilla/600",
			Galeria:      []string{"https://picsum.photos/seed/mascarilla1/600", "https://picsum.photos/seed/mascarilla2/600", "https://picsum.photos/seed/mascarilla3/600"},
		},
		{
			ID:           5,
			Nombre:       "Serum Anti-Edad Retinol",
			Descripcion:  "Serum de retinol encapsulado que suaviza líneas de expresión y mejora la firmeza. Uso nocturno recomendado.",
			Categoria:    "Serum",
			Precio:       58.00,
			Img:          "https://picsum.photos/seed/retinol/600",
			Galeria:      []string{"https://picsum.photos/seed/retinol1/600", "https://picsum.photos/seed/retinol2/600", "https://picsum.photos/seed/retinol3/600"},
		},
		{
			ID:           6,
			Nombre:       "Crema Contorno de Ojos",
			Descripcion:  "Contorno de ojos con cafeína y péptidos. Reduce bolsas y ojeras, hidrata la zona más delicada del rostro.",
			Categoria:    "Crema",
			Precio:       26.00,
			Img:          "https://picsum.photos/seed/ojos/600",
			Galeria:      []string{"https://picsum.photos/seed/ojos1/600", "https://picsum.photos/seed/ojos2/600", "https://picsum.photos/seed/ojos3/600"},
		},
		{
			ID:           7,
			Nombre:       "Tónico Exfoliante AHA-BHA",
			Descripcion:  "Exfoliación química suave con ácidos AHA y BHA. Renueva la textura de la piel y desobstruye los poros.",
			Categoria:    "Tónico",
			Precio:       34.00,
			Img:          "https://picsum.photos/seed/exfoliante/600",
			Galeria:      []string{"https://picsum.photos/seed/exfoliante1/600", "https://picsum.photos/seed/exfoliante2/600", "https://picsum.photos/seed/exfoliante3/600"},
		},
		{
			ID:           8,
			Nombre:       "Kit Rutina Completa",
			Descripcion:  "Kit integral con serum, crema, tónico y mascarilla. La rutina perfecta para comenzar: limpieza, tratamiento e hidratación.",
			Categoria:    "Kit",
			Precio:       129.00,
			Img:          "https://picsum.photos/seed/kit/600",
			Galeria:      []string{"https://picsum.photos/seed/kit1/600", "https://picsum.photos/seed/kit2/600", "https://picsum.photos/seed/kit3/600"},
		},
	}

	// Buscar producto por ID.
	for _, prod := range productos {
		if prod.ID == id {
			return c.JSON(prod)
		}
	}

	// Si no encontramos el producto, retornamos error 404.
	return c.Status(404).JSON(models.APIError{
		Status:  404,
		Message: "Producto no encontrado",
		Details: id,
	})
}