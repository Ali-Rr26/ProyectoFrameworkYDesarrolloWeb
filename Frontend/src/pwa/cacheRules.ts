// Reglas de caché en tiempo de ejecución del service worker (src/sw.ts).
// Funciones puras: deciden QUÉ se cachea a partir de datos simples de la petición,
// así se prueban con Vitest sin service worker ni navegador.
//
// Regla de seguridad: solo se cachean respuestas públicas. Cualquier petición con
// cabecera Authorization o con un método de escritura va siempre a la red.

export const CACHE_NAMES = {
  catalog: 'api-catalog',
  images: 'images',
} as const;

export const CATALOG_CACHE = { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 } as const;
export const IMAGES_CACHE = { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 } as const;

// Datos mínimos de una petición para decidir su estrategia.
export interface CacheableRequest {
  url: URL;
  method: string;
  destination: string;
  hasAuthorization: boolean;
}

// Rutas públicas del catálogo: listado, detalle por id y categorías.
// /api/admin/products queda fuera (es privada y además no coincide con el patrón).
const PUBLIC_CATALOG_PATH = /^\/api\/(products(\/\d+)?|categories)$/;

const isPublicGet = (req: CacheableRequest): boolean =>
  req.method === 'GET' && !req.hasAuthorization;

export const isPublicCatalogRequest = (req: CacheableRequest, apiOrigin: string): boolean =>
  isPublicGet(req) && req.url.origin === apiOrigin && PUBLIC_CATALOG_PATH.test(req.url.pathname);

export const isImageRequest = (req: CacheableRequest): boolean =>
  isPublicGet(req) && req.destination === 'image';
