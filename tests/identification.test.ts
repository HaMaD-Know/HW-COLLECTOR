import { describe, expect, it, vi } from 'vitest';
import { parseIdentificationResponse } from '../src/services/identification/parse';
import {
  NotConfiguredProvider,
  ProxyIdentificationProvider,
  normalizeProxyUrl,
} from '../src/services/identification/proxy-provider';
import { IdentificationError } from '../src/services/identification/types';
import { CarRepository } from '../src/repositories/car-repository';
import { createTestDb } from './helpers/sqljs-driver';

const IMAGE = { base64: 'AAAA', mimeType: 'image/jpeg' as const };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('parseIdentificationResponse', () => {
  const now = new Date('2026-10-22');

  it('parses a complete response', () => {
    const result = parseIdentificationResponse(
      {
        suggestedName: 'Ford GT-40',
        manufacturer: 'Ford',
        series: 'HW Exotics',
        releaseYear: 2024,
        color: 'Red',
        alternatives: ['Ford GT', 'Ford GT-40', '  ', 'Shelby Daytona'],
        reasoningSummary: 'Low mid-engine profile with twin stripes.',
        needsManualReview: false,
        isDiecastCar: true,
        provider: 'anthropic',
      },
      now,
    );
    expect(result.suggestedName).toBe('Ford GT-40');
    expect(result.alternatives).toEqual(['Ford GT', 'Shelby Daytona']); // de-duplicated, blank and self removed
    expect(result.needsManualReview).toBe(false);
  });

  it('drops implausible years and treats a missing review flag as uncertain', () => {
    const result = parseIdentificationResponse({ suggestedName: 'Camaro', releaseYear: 1890, color: 7 }, now);
    expect(result.releaseYear).toBeNull();
    expect(result.color).toBeNull();
    expect(result.series).toBeNull();
    expect(result.needsManualReview).toBe(true);
  });

  it('accepts a not-a-car answer with no name and flags review', () => {
    const result = parseIdentificationResponse({ isDiecastCar: false, needsManualReview: false }, now);
    expect(result.isDiecastCar).toBe(false);
    expect(result.needsManualReview).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(() => parseIdentificationResponse('oops', now)).toThrow(IdentificationError);
    expect(() => parseIdentificationResponse({ alternatives: [] }, now)).toThrow(/unexpected/);
  });
});

describe('ProxyIdentificationProvider', () => {
  it('normalises proxy URLs', () => {
    expect(normalizeProxyUrl(' https://api.example.com/ ')).toBe('https://api.example.com');
    expect(normalizeProxyUrl('ftp://x')).toBeNull();
    expect(normalizeProxyUrl('not a url')).toBeNull();
    expect(normalizeProxyUrl('')).toBeNull();
  });

  it('reports not-configured without a URL, so the UI falls back to manual entry', async () => {
    const provider = new ProxyIdentificationProvider({ baseUrl: '' });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.identify(IMAGE)).rejects.toMatchObject({ code: 'not-configured' });
    await expect(new NotConfiguredProvider().identify()).rejects.toMatchObject({ code: 'not-configured' });
  });

  it('posts the image and parses the result', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { suggestedName: 'Porsche 911', needsManualReview: false }));
    const provider = new ProxyIdentificationProvider({ baseUrl: 'https://p.example', clientToken: 't', fetchImpl });
    const result = await provider.identify(IMAGE);
    expect(result.suggestedName).toBe('Porsche 911');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.example/v1/identify');
    expect((init.headers as Record<string, string>)['X-Client-Token']).toBe('t');
    expect(JSON.parse(String(init.body))).toEqual({ image: 'AAAA', mimeType: 'image/jpeg' });
  });

  it.each([
    [429, 'rate-limited'],
    [413, 'too-large'],
    [415, 'unsupported-type'],
    [401, 'unauthorized'],
    [422, 'refused'],
    [502, 'unavailable'],
    [500, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const provider = new ProxyIdentificationProvider({
      baseUrl: 'https://p.example',
      fetchImpl: async () => jsonResponse(status, { error: 'nope' }),
    });
    await expect(provider.identify(IMAGE)).rejects.toMatchObject({ code });
  });

  it('maps a 503 "not configured" to not-configured', async () => {
    const provider = new ProxyIdentificationProvider({
      baseUrl: 'https://p.example',
      fetchImpl: async () => jsonResponse(503, { error: 'AI provider is not configured on the server.' }),
    });
    await expect(provider.identify(IMAGE)).rejects.toMatchObject({ code: 'not-configured' });
  });

  it('rejects a malformed success body', async () => {
    const provider = new ProxyIdentificationProvider({
      baseUrl: 'https://p.example',
      fetchImpl: async () => new Response('<html>gateway</html>', { status: 200 }),
    });
    await expect(provider.identify(IMAGE)).rejects.toMatchObject({ code: 'bad-response' });
  });

  it('times out slow requests', async () => {
    const provider = new ProxyIdentificationProvider({
      baseUrl: 'https://p.example',
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    await expect(provider.identify(IMAGE)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reports offline before sending', async () => {
    const fetchImpl = vi.fn();
    const provider = new ProxyIdentificationProvider({ baseUrl: 'https://p.example', fetchImpl, isOnline: () => false });
    await expect(provider.identify(IMAGE)).rejects.toMatchObject({ code: 'offline' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized and unsupported images before upload', async () => {
    const fetchImpl = vi.fn();
    const provider = new ProxyIdentificationProvider({ baseUrl: 'https://p.example', fetchImpl });
    await expect(provider.identify({ base64: 'A'.repeat(6_000_000), mimeType: 'image/jpeg' })).rejects.toMatchObject({
      code: 'too-large',
    });
    await expect(provider.identify({ base64: 'AAAA', mimeType: 'image/gif' as never })).rejects.toMatchObject({
      code: 'unsupported-type',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports health status', async () => {
    const ok = new ProxyIdentificationProvider({
      baseUrl: 'https://p.example',
      fetchImpl: async () => jsonResponse(200, { ok: true, configured: true, provider: 'anthropic' }),
    });
    expect(await ok.status()).toEqual({ configured: true, description: 'Connected (anthropic).' });
    const noKey = new ProxyIdentificationProvider({
      baseUrl: 'https://p.example',
      fetchImpl: async () => jsonResponse(200, { ok: true, configured: false }),
    });
    expect((await noKey.status()).configured).toBe(false);
  });
});

describe('manual fallback', () => {
  it('saves a car without any AI involvement after identification fails', async () => {
    const provider = new ProxyIdentificationProvider({
      baseUrl: 'https://p.example',
      fetchImpl: async () => jsonResponse(503, { error: 'down' }),
    });
    let suggestion: string | null = null;
    try {
      suggestion = (await provider.identify(IMAGE)).suggestedName;
    } catch (error) {
      expect(error).toBeInstanceOf(IdentificationError);
    }
    const repo = new CarRepository(await createTestDb());
    const car = await repo.create({ name: 'Typed by hand', aiSuggestedName: suggestion, nameSource: 'manual' });
    expect(car.nameSource).toBe('manual');
    expect(car.aiSuggestedName).toBeNull();
  });
});
