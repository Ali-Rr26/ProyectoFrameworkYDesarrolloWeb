/// <reference lib="webworker" />
// Service worker propio (vite-plugin-pwa, estrategia injectManifest).
// En el build, el plugin reemplaza `self.__WB_MANIFEST` por la lista de archivos
// del bundle (JS, CSS, HTML, íconos) con su hash de revisión.
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { API_URL } from './data/constants';
import {
  CACHE_NAMES,
  CATALOG_CACHE,
  IMAGES_CACHE,
  isImageRequest,
  isPublicCatalogRequest,
  type CacheableRequest,
} from './pwa/cacheRules';

declare let self: ServiceWorkerGlobalScope;

const API_ORIGIN = new URL(API_URL).origin;

const toCacheable = (request: Request, url: URL): CacheableRequest => ({
  url,
  method: request.method,
  destination: request.destination,
  hasAuthorization: request.headers.has('Authorization'),
});

// 1. Precache del shell de la app y limpieza de precaches de versiones anteriores.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// 2. Navegación SPA: cualquier ruta de React Router (/store, /product/:id, ...) responde
// con el index.html precacheado, también sin conexión. La API nunca pasa por aquí.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
);

// 3. Catálogo público (productos, detalle, categorías): responde al instante con la copia
// guardada y la refresca en segundo plano. Solo se guardan respuestas 200.
registerRoute(
  ({ request, url }) => isPublicCatalogRequest(toCacheable(request, url), API_ORIGIN),
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.catalog,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ ...CATALOG_CACHE, purgeOnQuotaError: true }),
    ],
  }),
);

// 4. Imágenes (de producto y externas): primero caché. Las externas llegan como
// respuestas opacas (status 0), que ocupan mucha cuota: de ahí el límite bajo de entradas.
registerRoute(
  ({ request, url }) => isImageRequest(toCacheable(request, url)),
  new CacheFirst({
    cacheName: CACHE_NAMES.images,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ ...IMAGES_CACHE, purgeOnQuotaError: true }),
    ],
  }),
);

// Todo lo demás (rutas con JWT, login, checkout, escrituras) no tiene ruta registrada:
// el SW no lo intercepta y va directo a la red, sin pasar por Cache Storage.

// 5. Actualizaciones con aviso (registerType: 'prompt'): la versión nueva queda en espera
// hasta que la app envíe SKIP_WAITING (lo hará el aviso de la Fase 8).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 6. En la primera instalación el SW toma el control sin esperar una recarga.
clientsClaim();
