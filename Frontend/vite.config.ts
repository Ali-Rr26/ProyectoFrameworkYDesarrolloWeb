/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { PWA_IDENTITY } from './src/constants/pwa.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: service worker propio (src/sw.ts) + manifest generado desde PWA_IDENTITY.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        id: PWA_IDENTITY.startUrl,
        name: PWA_IDENTITY.name,
        short_name: PWA_IDENTITY.shortName,
        description: PWA_IDENTITY.description,
        lang: PWA_IDENTITY.lang,
        start_url: PWA_IDENTITY.startUrl,
        scope: PWA_IDENTITY.scope,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: PWA_IDENTITY.themeColor,
        background_color: PWA_IDENTITY.backgroundColor,
        categories: ['shopping', 'business'],
        // Generados con `npm run icons` (pwa-assets.config.ts).
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Los íconos ya entran por globPatterns; evita duplicarlos en el precache.
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  server: {
    host: true,
    port: 5175,
    strictPort: true
  },
  // Vitest: pruebas de funciones puras y de la capa local (IndexedDB en memoria).
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts']
  }
})
