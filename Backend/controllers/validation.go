package controllers

import (
	"net/mail"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Reglas de validación de cuentas: funciones puras, sin I/O, para probarlas aisladas.

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
