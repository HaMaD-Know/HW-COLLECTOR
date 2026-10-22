/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the identification proxy. Not a secret. */
  readonly VITE_AI_PROXY_URL?: string;
  /** Optional low-value client token. Ships in the bundle; not a secret. */
  readonly VITE_AI_CLIENT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
