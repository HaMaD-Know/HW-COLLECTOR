import { parseIdentificationResponse } from './parse';
import {
  IdentificationError,
  type CarIdentificationProvider,
  type IdentificationImage,
  type IdentificationResult,
  type ProviderStatus,
} from './types';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 45_000;

export interface ProxyProviderOptions {
  baseUrl: string;
  clientToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
}

/** Normalises a user-entered proxy URL; returns null when it is not an http(s) URL. */
export function normalizeProxyUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Sends photos to the project's own identification proxy (backend/), which
 * holds the provider API key server-side. The app never sees a provider key.
 */
export class ProxyIdentificationProvider implements CarIdentificationProvider {
  readonly id = 'proxy';
  private readonly baseUrl: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ProxyProviderOptions) {
    this.baseUrl = normalizeProxyUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  async identify(image: IdentificationImage, signal?: AbortSignal): Promise<IdentificationResult> {
    if (!this.baseUrl) throw new IdentificationError('not-configured');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType)) {
      throw new IdentificationError('unsupported-type');
    }
    if ((image.base64.length * 3) / 4 > MAX_UPLOAD_BYTES) throw new IdentificationError('too-large');
    if (this.options.isOnline && !this.options.isOnline()) throw new IdentificationError('offline');

    const response = await this.request(
      '/v1/identify',
      {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ image: image.base64, mimeType: image.mimeType }),
      },
      signal,
    );

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new IdentificationError('bad-response');
    }
    if (!response.ok) throw errorFromStatus(response.status, payload);
    return parseIdentificationResponse(payload);
  }

  async status(signal?: AbortSignal): Promise<ProviderStatus> {
    if (!this.baseUrl) return { configured: false, description: 'No identification service configured.' };
    try {
      const response = await this.request('/health', { method: 'GET', headers: this.headers({}) }, signal, 8000);
      const body = (await response.json().catch(() => ({}))) as { provider?: string; configured?: boolean };
      if (!response.ok) return { configured: false, description: `Service responded with HTTP ${response.status}.` };
      if (body.configured === false) {
        return { configured: false, description: 'Service is reachable but has no provider key configured.' };
      }
      return { configured: true, description: `Connected (${body.provider ?? 'AI provider'}).` };
    } catch (error) {
      const message = error instanceof IdentificationError ? error.message : 'Service unreachable.';
      return { configured: false, description: message };
    }
  }

  private headers(extra: Record<string, string>): Record<string, string> {
    return this.options.clientToken ? { ...extra, 'X-Client-Token': this.options.clientToken } : extra;
  }

  private async request(
    path: string,
    init: RequestInit,
    outerSignal?: AbortSignal,
    timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    outerSignal?.addEventListener('abort', onAbort);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new IdentificationError('timeout');
      if (outerSignal?.aborted) throw error; // user cancelled: let the caller ignore it
      throw new IdentificationError(this.options.isOnline?.() === false ? 'offline' : 'unavailable');
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onAbort);
    }
  }
}

export function errorFromStatus(status: number, payload: unknown): IdentificationError {
  const serverMessage =
    payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? ((payload as { error: string }).error as string)
      : undefined;
  switch (status) {
    case 401:
    case 403:
      return new IdentificationError('unauthorized');
    case 413:
      return new IdentificationError('too-large');
    case 415:
      return new IdentificationError('unsupported-type');
    case 422:
      return new IdentificationError('refused', serverMessage);
    case 429:
      return new IdentificationError('rate-limited');
    case 503:
      return new IdentificationError(
        serverMessage?.includes('not configured') ? 'not-configured' : 'unavailable',
        serverMessage,
      );
    case 502:
    case 504:
      return new IdentificationError('unavailable');
    default:
      return new IdentificationError(status >= 500 ? 'unavailable' : 'unknown', serverMessage);
  }
}

/** Used when no proxy URL is set: always reports the manual-entry path. */
export class NotConfiguredProvider implements CarIdentificationProvider {
  readonly id = 'none';
  isConfigured(): boolean {
    return false;
  }
  async identify(): Promise<IdentificationResult> {
    throw new IdentificationError('not-configured');
  }
  async status(): Promise<ProviderStatus> {
    return { configured: false, description: 'No identification service configured.' };
  }
}
