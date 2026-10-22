import { IdentificationError, type IdentificationResult } from './types';

const MAX_TEXT = 120;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function year(value: unknown, now: Date): number | null {
  const n = typeof value === 'string' && /^\d{4}$/.test(value.trim()) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  return n >= 1968 && n <= now.getFullYear() + 1 ? n : null;
}

/**
 * Validates an identification payload from the proxy. Anything malformed is
 * rejected rather than guessed; implausible optional values are dropped.
 */
export function parseIdentificationResponse(payload: unknown, now = new Date()): IdentificationResult {
  if (!payload || typeof payload !== 'object') throw new IdentificationError('bad-response');
  const p = payload as Record<string, unknown>;
  const isDiecastCar = p.isDiecastCar !== false;
  const suggestedName = text(p.suggestedName);
  if (!suggestedName && isDiecastCar) throw new IdentificationError('bad-response');

  const alternatives = Array.isArray(p.alternatives)
    ? [...new Set(p.alternatives.map((a) => text(a)).filter((a): a is string => !!a))]
        .filter((a) => a.toLowerCase() !== suggestedName?.toLowerCase())
        .slice(0, 4)
    : [];

  return {
    suggestedName: suggestedName ?? '',
    manufacturer: text(p.manufacturer),
    series: text(p.series),
    releaseYear: year(p.releaseYear, now),
    color: text(p.color, 40),
    alternatives,
    reasoningSummary: text(p.reasoningSummary, 400) ?? '',
    // Missing flag = treat as uncertain. Not-a-car always needs review.
    needsManualReview: p.needsManualReview !== false || !isDiecastCar,
    isDiecastCar,
    provider: text(p.provider, 60) ?? 'unknown',
  };
}
