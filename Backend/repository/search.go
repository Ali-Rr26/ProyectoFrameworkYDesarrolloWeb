package repository

import "strings"

// likeEscaper escapa los comodines de LIKE (% y _) y el propio carácter de escape (\),
// que es el que PostgreSQL usa por defecto en LIKE/ILIKE.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// containsPattern convierte el texto buscado en un patrón ILIKE "contiene": lo que
// escribe el usuario se busca literal ("50%" no es un comodín). Cadena vacía = sin filtro.
func containsPattern(query string) string {
	if query == "" {
		return ""
	}
	return "%" + likeEscaper.Replace(query) + "%"
}
