# Imagen del frontend en dos etapas:
#   1) build: compila la PWA con Vite (las VITE_* se fijan en el bundle al compilar);
#   2) runtime: Caddy sirve los estáticos y obtiene/renueva el certificado HTTPS.
FROM node:22-alpine AS build
WORKDIR /app
# Primero las dependencias: esta capa se reutiliza mientras package*.json no cambien.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vienen de deploy/.env vía docker-compose (build.args).
ARG VITE_API_URL
ARG VITE_BUSINESS_TIMEZONE=America/Guayaquil
ENV VITE_API_URL=$VITE_API_URL \
    VITE_BUSINESS_TIMEZONE=$VITE_BUSINESS_TIMEZONE
RUN npm run build

FROM caddy:2-alpine
# El Caddyfile se monta desde deploy/ (ver docker-compose.prod.yml).
COPY --from=build /app/dist /srv
