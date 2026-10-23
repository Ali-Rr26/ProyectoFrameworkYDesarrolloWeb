// Identidad de la PWA: fuente única para index.html (theme-color), el manifest
// que genera vite-plugin-pwa (Fase 2) y los textos de instalación (Fase 8).
// Colores alineados con la paleta de la app: turquesa de marca y fondo slate-50 del Layout.
export const PWA_IDENTITY = {
  name: 'MultiCatálogo',
  shortName: 'MultiCatálogo',
  description: 'Tienda cosmética y red de ventas multinivel: catálogo, pedidos y comisiones.',
  themeColor: '#20b2aa',
  backgroundColor: '#f8fafc',
  lang: 'es',
  startUrl: '/',
  scope: '/',
} as const;
