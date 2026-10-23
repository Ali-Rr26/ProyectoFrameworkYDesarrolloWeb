import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'
import { PWA_IDENTITY } from './src/constants/pwa.ts'

// Genera los íconos de la PWA desde public/favicon.svg (`npm run icons`).
// Salida en public/: favicon.ico 48, pwa-64/192/512, maskable-icon-512, apple-touch-icon-180.
// Maskable y Apple llevan fondo de marca (sharp usa blanco por defecto) y el margen
// de la zona segura del preset (30 %), así el logo no se recorta en Android ni iOS.
const brandBackground = { background: PWA_IDENTITY.themeColor, fit: 'contain' } as const

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: brandBackground },
    apple: { ...minimal2023Preset.apple, resizeOptions: brandBackground },
  },
  images: ['public/favicon.svg'],
})
