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
ENTRYPOINT ["/api"]
