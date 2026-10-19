package main

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"multicatalogo-backend/config"
)

// healthcheckTimeout es el plazo de la sonda: debe ser menor que el "timeout" del
// HEALTHCHECK de Docker para que el fallo lo reporte la sonda y no Docker.
const healthcheckTimeout = 3 * time.Second

// runHealthcheck es la sonda de Docker (`/api healthcheck`): consulta GET /api/health
// en el puerto local y devuelve 0 si responde 200 ("ok" o "degraded": sin Redis la API
// sigue atendiendo) o 1 si no responde o responde 503 (PostgreSQL caído).
// Va dentro del binario porque la imagen runtime no trae curl ni wget garantizados.
func runHealthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = config.DefaultPort
	}

	client := http.Client{Timeout: healthcheckTimeout}
	resp, err := client.Get("http://127.0.0.1:" + port + "/api/health")
	if err != nil {
		fmt.Fprintf(os.Stderr, "healthcheck: %v\n", err)
		return 1
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "healthcheck: /api/health respondió %d\n", resp.StatusCode)
		return 1
	}
	return 0
}
