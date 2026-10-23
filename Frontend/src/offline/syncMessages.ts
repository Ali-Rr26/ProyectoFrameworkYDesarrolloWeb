// Constantes compartidas entre la página y el service worker (src/sw.ts). Sin
// dependencias: el SW las importa sin arrastrar Dexie ni el cliente HTTP a su bundle.

// Etiqueta de Background Sync y mensaje del SW a las pestañas.
export const OUTBOX_SYNC_TAG = 'outbox';
export const SYNC_OUTBOX_MESSAGE = 'SYNC_OUTBOX';
