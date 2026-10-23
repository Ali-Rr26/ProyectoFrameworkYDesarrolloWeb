// Reglas puras de actualización e instalación de la PWA (Fase 9).

// Cada cuánto se pregunta al servidor si hay un service worker nuevo con la app abierta.
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

// El aviso "Nueva versión disponible" no se ofrece donde recargar haría perder trabajo:
// a mitad del checkout ni mientras se envían pendientes.
export const shouldOfferReload = (needRefresh: boolean, pathname: string, syncing: boolean): boolean =>
  needRefresh && pathname !== '/checkout' && !syncing;

// iPhone/iPad (incluido el iPad que se presenta como Mac): Safari no emite
// beforeinstallprompt, así que se explican los pasos "Compartir → Agregar a inicio".
export const detectIOS = (userAgent: string, maxTouchPoints: number): boolean =>
  /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
