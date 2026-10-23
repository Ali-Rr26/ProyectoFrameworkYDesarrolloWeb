// Setup global de Vitest: IndexedDB en memoria para probar la capa local
// (Dexie, outbox) sin navegador. Cada archivo de prueba arranca con una BD vacía.
import 'fake-indexeddb/auto';
