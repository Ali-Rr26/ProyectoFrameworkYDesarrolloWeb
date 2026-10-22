/// <reference lib="webworker" />
// Service worker propio (vite-plugin-pwa, estrategia injectManifest).
// En el build, el plugin reemplaza `self.__WB_MANIFEST` por la lista de archivos
// del bundle (JS, CSS, HTML, íconos) con su hash de revisión.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

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

// 3. Actualizaciones con aviso (registerType: 'prompt'): la versión nueva queda en espera
// hasta que la app envíe SKIP_WAITING (lo hará el aviso de la Fase 8).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 4. En la primera instalación el SW toma el control sin esperar una recarga.
clientsClaim();
