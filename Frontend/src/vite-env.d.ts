/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

// Variables de entorno expuestas al cliente (solo las que empiezan con VITE_).
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BUSINESS_TIMEZONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
