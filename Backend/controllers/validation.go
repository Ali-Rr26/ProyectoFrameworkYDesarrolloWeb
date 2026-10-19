package controllers

import (
	"fmt"
	"net/mail"
	"strings"
	"unicode"
	"unicode/utf8"

	"multicatalogo-backend/models"
)

// Reglas de validación de cuentas y productos: funciones puras, sin I/O, para probarlas aisladas.

// maxEmailLength es el máximo de una dirección de correo (RFC 5321).
const maxEmailLength = 254

// Límites de la contraseña. bcrypt solo considera los primeros 72 bytes: más largas
// se rechazan para que dos contraseñas distintas no terminen con el mismo hash.
const (
	minPasswordLength = 8
	maxPasswordBytes  = 72
)

// validEmail acepta solo una dirección simple (usuario@dominio.tld): sin nombre ni
// "<...>" (formatos que net/mail también admite) y con un dominio que tenga punto.
func validEmail(email string) bool {
	if email == "" || len(email) > maxEmailLength {
		return false
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Name != "" || addr.Address != email {
		return false
	}
	at := strings.LastIndex(email, "@")
	domain := email[at+1:]
	return strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}

// passwordProblems devuelve las reglas que la contraseña no cumple (vacío si es fuerte):
// 8 o más caracteres, mayúscula, minúscula, número y carácter especial; máximo 72 bytes.
func passwordProblems(password string) []string {
	var upper, lower, digit, special bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			upper = true
		case unicode.IsLower(r):
			lower = true
		case unicode.IsDigit(r):
			digit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			special = true
		}
	}

	var problems []string
	if utf8.RuneCountInString(password) < minPasswordLength {
		problems = append(problems, "mínimo 8 caracteres")
	}
	if len(password) > maxPasswordBytes {
		problems = append(problems, "máximo 72 bytes")
	}
	if !upper {
		problems = append(problems, "una mayúscula")
	}
	if !lower {
		problems = append(problems, "una minúscula")
	}
	if !digit {
		problems = append(problems, "un número")
	}
	if !special {
		problems = append(problems, "un carácter especial")
	}
	return problems
}

// Límites de las columnas de products (0001_schema.sql).
const (
	maxProductName = 120
	maxURLLength   = 500
	maxPrice       = 99999999.99 // NUMERIC(10,2)
)

// productFieldErrors valida los campos de un producto; un puntero nil significa "no
// enviado" y solo es error si required es true (alta). En la edición parcial solo se
// validan los campos presentes. Normaliza los textos quitando espacios.
func productFieldErrors(name, category, image *string, price *float64, stock *int, gallery *[]string, required bool) map[string]string {
	errs := map[string]string{}
	text := func(field string, v *string, max int, missing string) {
		if v == nil {
			if required {
				errs[field] = missing
			}
			return
		}
		*v = strings.TrimSpace(*v)
		switch {
		case *v == "":
			errs[field] = missing
		case utf8.RuneCountInString(*v) > max:
			errs[field] = fmt.Sprintf("máximo %d caracteres", max)
		}
	}
	text("name", name, maxProductName, "es requerido")
	text("category", category, maxProductName, "es requerida")
	text("image", image, maxURLLength, "es requerida")

	if price != nil || required {
		if price == nil || *price <= 0 {
			errs["price"] = "debe ser mayor a 0"
		} else if *price > maxPrice {
			errs["price"] = "excede el máximo permitido"
		}
	}
	if stock != nil && *stock < 0 {
		errs["stock"] = "no puede ser negativo"
	}
	if gallery != nil {
		for i, url := range *gallery {
			(*gallery)[i] = strings.TrimSpace(url)
			if (*gallery)[i] == "" || len((*gallery)[i]) > maxURLLength {
				errs[fmt.Sprintf("gallery[%d]", i)] = "URL vacía o demasiado larga"
			}
		}
	}
	return errs
}

// validateProductInput valida el alta de un producto (todos los campos obligatorios
// salvo descripción, stock y galería).
func validateProductInput(in *models.ProductInput) map[string]string {
	return productFieldErrors(&in.Name, &in.Category, &in.Image, &in.Price, &in.Stock, &in.Gallery, true)
}

// validateProductUpdate valida una edición parcial: solo los campos enviados.
func validateProductUpdate(in *models.ProductUpdate) map[string]string {
	errs := productFieldErrors(in.Name, in.Category, in.Image, in.Price, in.Stock, in.Gallery, false)
	if in.Name == nil && in.Description == nil && in.Category == nil && in.Price == nil &&
		in.Stock == nil && in.Image == nil && in.Gallery == nil && in.Active == nil {
		errs["body"] = "no se envió ningún campo para modificar"
	}
	return errs
}
