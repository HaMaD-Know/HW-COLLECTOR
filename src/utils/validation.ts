import { CONDITIONS, PACKAGING_STATUSES, type CarInput, type WishlistInput } from '../types/models';

export const LIMITS = {
  name: 120,
  shortText: 80,
  notes: 2000,
  minYear: 1968, // first Hot Wheels year
  maxPriceCents: 100_000_000,
} as const;

export type FieldErrors = Partial<Record<string, string>>;

export interface ValidationResult<T> {
  ok: boolean;
  value: T;
  errors: FieldErrors;
}

export function maxReleaseYear(now = new Date()): number {
  return now.getFullYear() + 1; // next-year models ship early
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  return trimmed === '' ? null : trimmed.slice(0, max);
}

function checkYear(value: unknown, field: string, errors: FieldErrors, now: Date): number | null {
  if (value == null || value === '') return null;
  const year = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(year) || year < LIMITS.minYear || year > maxReleaseYear(now)) {
    errors[field] = `Enter a year between ${LIMITS.minYear} and ${maxReleaseYear(now)}.`;
    return null;
  }
  return year;
}

function checkCents(value: unknown, field: string, errors: FieldErrors): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > LIMITS.maxPriceCents) {
    errors[field] = 'Enter a valid non-negative amount.';
    return null;
  }
  return value;
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : null;
}

/** Normalises and validates car input. Unknown optional values become null, never guesses. */
export function validateCarInput(input: Partial<CarInput>, now = new Date()): ValidationResult<CarInput> {
  const errors: FieldErrors = {};
  const name = cleanText(input.name, LIMITS.name);
  if (!name) errors.name = 'Car name is required.';

  const imagePath = input.imagePath == null ? null : isSafeImagePath(input.imagePath) ? input.imagePath : null;
  if (input.imagePath != null && imagePath == null) errors.imagePath = 'Invalid image reference.';

  const value: CarInput = {
    name: name ?? '',
    imagePath,
    manufacturer: cleanText(input.manufacturer, LIMITS.shortText),
    model: cleanText(input.model, LIMITS.shortText),
    series: cleanText(input.series, LIMITS.shortText),
    color: cleanText(input.color, 40),
    releaseYear: checkYear(input.releaseYear, 'releaseYear', errors, now),
    purchaseYear: checkYear(input.purchaseYear, 'purchaseYear', errors, now),
    condition: oneOf(CONDITIONS, input.condition),
    packaging: oneOf(PACKAGING_STATUSES, input.packaging),
    purchasePriceCents: checkCents(input.purchasePriceCents, 'purchasePriceCents', errors),
    estimatedValueCents: checkCents(input.estimatedValueCents, 'estimatedValueCents', errors),
    purchaseLocation: cleanText(input.purchaseLocation, LIMITS.shortText),
    notes: cleanMultiline(input.notes, LIMITS.notes),
    isWishlisted: input.isWishlisted === true,
    isSample: input.isSample === true,
  };

  if (value.purchaseYear != null && value.purchaseYear > now.getFullYear()) {
    errors.purchaseYear = 'Purchase year cannot be in the future.';
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}

export function validateWishlistInput(input: Partial<WishlistInput>): ValidationResult<WishlistInput> {
  const errors: FieldErrors = {};
  const name = cleanText(input.name, LIMITS.name);
  if (!name) errors.name = 'Name is required.';
  const imagePath = input.imagePath == null ? null : isSafeImagePath(input.imagePath) ? input.imagePath : null;
  if (input.imagePath != null && imagePath == null) errors.imagePath = 'Invalid image reference.';
  return {
    ok: Object.keys(errors).length === 0,
    value: {
      name: name ?? '',
      imagePath,
      notes: cleanMultiline(input.notes, LIMITS.notes),
      series: cleanText(input.series, LIMITS.shortText),
    },
    errors,
  };
}

/** Image paths must stay inside the app's images/ folder: no traversal, no absolute paths, no schemes. */
export function isSafeImagePath(path: unknown): path is string {
  return typeof path === 'string' && /^images\/[A-Za-z0-9_-]{1,64}\.(jpe?g|png|webp|svg)$/.test(path);
}
