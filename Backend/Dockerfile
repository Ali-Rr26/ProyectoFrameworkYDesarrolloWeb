# Imagen del backend Go/Fiber en dos etapas:
#   1) build: compila un binario estático (pgx y go-redis son Go puro, sin CGO);
#   2) runtime: solo el binario. Las migraciones van embebidas con go:embed.
FROM golang:1.26-alpine AS build
WORKDIR /src
# Primero las dependencias: esta capa se reutiliza mientras go.mod/go.sum no cambien.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /api .

FROM alpine:3.20
# Certificados por si la BD o Redis se configuran con TLS.
RUN apk add --no-cache ca-certificates
COPY --from=build /api /api
EXPOSE 4000
# Sonda incluida en el binario (`/api healthcheck` -> GET /api/health en $PORT): no depende
# de curl/wget. Unhealthy solo si PostgreSQL cae (503); Redis caído = "degraded" = sano.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD ["/api", "healthcheck"]
ENTRYPOINT ["/api"]
