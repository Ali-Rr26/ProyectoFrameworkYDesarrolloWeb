# Imagen del frontend en dos etapas:
#   1) build: compila la PWA con Vite (las VITE_* se fijan en el bundle al compilar);
#   2) runtime: Caddy sirve los estáticos por HTTP interno (el HTTPS lo ponen Cloudflare
#      y, en Heroku, su router).
FROM node:22.23.4-alpine AS build
WORKDIR /app
# Primero las dependencias: esta capa se reutiliza mientras package*.json no cambien.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vienen de deploy/.env vía docker-compose (build.args) o de .github/workflows/deploy.yml.
ARG VITE_API_URL
ARG VITE_BUSINESS_TIMEZONE=America/Guayaquil
ENV VITE_API_URL=$VITE_API_URL \
    VITE_BUSINESS_TIMEZONE=$VITE_BUSINESS_TIMEZONE
RUN npm run build

FROM caddy:2.11.7-alpine
# Caddyfile propio (escucha en $PORT, como pide Heroku). En la VM, docker-compose.prod.yml
# monta deploy/Caddyfile encima.
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
