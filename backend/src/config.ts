export interface ServerConfig {
  port: number;
  /** Provider key. Read from the server environment only — never shipped to the app. */
  anthropicApiKey: string | null;
  model: string;
  effort: 'low' | 'medium' | 'high';
  allowedOrigins: string[];
  /** Optional low-value token the app sends as X-Client-Token. Not a secret (it ships in the app). */
  clientToken: string | null;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  maxConcurrent: number;
  requestTimeoutMs: number;
  trustProxy: boolean;
}

const DEFAULT_ORIGINS = [
  'capacitor://localhost', // iOS app
  'https://localhost', // Android app (androidScheme https)
  'http://localhost',
  'http://localhost:5173', // vite dev server
];

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const effort = env.AI_EFFORT === 'low' || env.AI_EFFORT === 'high' ? env.AI_EFFORT : 'medium';
  return {
    port: int(env.PORT, 8787, 1, 65535),
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: env.AI_MODEL?.trim() || 'claude-opus-5-5',
    effort,
    allowedOrigins: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
      : DEFAULT_ORIGINS,
    clientToken: env.APP_CLIENT_TOKEN?.trim() || null,
    rateLimitPerMinute: int(env.RATE_LIMIT_PER_MINUTE, 6, 1, 1000),
    rateLimitPerDay: int(env.RATE_LIMIT_PER_DAY, 60, 1, 100000),
    maxConcurrent: int(env.MAX_CONCURRENT, 4, 1, 100),
    requestTimeoutMs: int(env.REQUEST_TIMEOUT_MS, 40000, 5000, 120000),
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
