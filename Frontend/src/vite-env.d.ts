/// <reference types="vite/client" />

// Variables de entorno expuestas al cliente (solo las que empiezan con VITE_).
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
