import { describe, expect, it } from 'vitest';
import { loadConfig } from '../backend/src/config.ts';
import { RateLimiter } from '../backend/src/rate-limit.ts';
import { MAX_IMAGE_BYTES, RequestValidationError, validateIdentifyRequest } from '../backend/src/validation.ts';

function fakeImage(header: number[], size = 200): string {
  const bytes = new Uint8Array(size);
  bytes.set(header);
  return Buffer.from(bytes).toString('base64');
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)));

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof RequestValidationError ? error.status : -1;
  }
  return undefined;
}

describe('proxy request validation', () => {
  it('accepts real JPEG, PNG and WebP data', () => {
    expect(validateIdentifyRequest({ image: fakeImage(JPEG), mimeType: 'image/jpeg' }).mimeType).toBe('image/jpeg');
    expect(validateIdentifyRequest({ image: fakeImage(PNG), mimeType: 'image/png' }).mimeType).toBe('image/png');
    expect(validateIdentifyRequest({ image: fakeImage(WEBP), mimeType: 'image/webp' }).mimeType).toBe('image/webp');
  });

  it('strips a data URL prefix', () => {
    const result = validateIdentifyRequest({ image: `data:image/jpeg;base64,${fakeImage(JPEG)}`, mimeType: 'image/jpeg' });
    expect(result.image.startsWith('data:')).toBe(false);
  });

  it('enforces MIME type, content sniffing, base64 and size limits', () => {
    expect(statusOf(() => validateIdentifyRequest(null))).toBe(400);
    expect(statusOf(() => validateIdentifyRequest({ image: fakeImage(JPEG), mimeType: 'image/gif' }))).toBe(415);
    expect(statusOf(() => validateIdentifyRequest({ image: fakeImage(PNG), mimeType: 'image/jpeg' }))).toBe(415);
    expect(statusOf(() => validateIdentifyRequest({ image: '<script>', mimeType: 'image/jpeg' }))).toBe(400);
    expect(statusOf(() => validateIdentifyRequest({ image: fakeImage(JPEG, 10), mimeType: 'image/jpeg' }))).toBe(400);
    expect(
      statusOf(() => validateIdentifyRequest({ image: fakeImage(JPEG, MAX_IMAGE_BYTES + 3), mimeType: 'image/jpeg' })),
    ).toBe(413);
  });
});

describe('rate limiter', () => {
  it('limits per minute and per day per client', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 3, () => now);
    expect(limiter.check('a')).toBe(0);
    expect(limiter.check('a')).toBe(0);
    expect(limiter.check('a')).toBeGreaterThan(0);
    expect(limiter.check('b')).toBe(0); // separate client
    now += 61_000;
    expect(limiter.check('a')).toBe(0); // third of the day
    expect(limiter.check('a')).toBeGreaterThan(3600); // daily cap reached
  });
});

describe('server config', () => {
  it('reads secrets only from the environment and applies safe defaults', () => {
    const config = loadConfig({});
    expect(config.anthropicApiKey).toBeNull();
    expect(config.model).toBe('claude-opus-5-5');
    expect(config.allowedOrigins).toContain('capacitor://localhost');
    expect(config.trustProxy).toBe(false);
    const custom = loadConfig({ ANTHROPIC_API_KEY: ' k ', RATE_LIMIT_PER_MINUTE: 'abc', ALLOWED_ORIGINS: 'a, b' });
    expect(custom.anthropicApiKey).toBe('k');
    expect(custom.rateLimitPerMinute).toBe(6);
    expect(custom.allowedOrigins).toEqual(['a', 'b']);
  });
});
