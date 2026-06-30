/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HASH_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
