export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Claude accepts images up to 5 MB; stay under that after decoding. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** JSON body limit: base64 is ~4/3 the image size, plus a little envelope. */
export const MAX_BODY_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4096;

export class RequestValidationError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RequestValidationError';
    this.status = status;
  }
}

export interface IdentifyRequest {
  image: string;
  mimeType: AllowedMimeType;
}

function sniffMime(bytes: Uint8Array): AllowedMimeType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Validates the JSON body of POST /v1/identify. Checks the declared type, the
 * size, base64 well-formedness, and that the bytes really are that image type.
 */
export function validateIdentifyRequest(body: unknown): IdentifyRequest {
  if (!body || typeof body !== 'object') throw new RequestValidationError(400, 'Body must be a JSON object.');
  const { image, mimeType } = body as Record<string, unknown>;
  if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
    throw new RequestValidationError(415, 'Only JPEG, PNG and WebP images are supported.');
  }
  if (typeof image !== 'string' || image.length === 0) {
    throw new RequestValidationError(400, 'Missing image data.');
  }
  const data = image.replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new RequestValidationError(400, 'Image must be base64 encoded.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new RequestValidationError(413, 'Image is larger than 4 MB.');
  if (bytes.length < 64) throw new RequestValidationError(400, 'Image is too small to analyse.');
  const actual = sniffMime(bytes);
  if (actual !== mimeType) throw new RequestValidationError(415, 'Image content does not match its declared type.');
  return { image: data, mimeType: actual };
}
