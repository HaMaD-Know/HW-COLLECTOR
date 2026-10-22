export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'PKR', 'AED', 'SAR', 'CAD', 'AUD', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Currencies whose minor unit is not 1/100. */
const ZERO_DECIMAL = new Set<string>(['JPY']);

export function minorUnitFactor(currency: string): number {
  return ZERO_DECIMAL.has(currency) ? 1 : 100;
}

export function formatMoney(cents: number | null, currency: string): string {
  if (cents == null) return '—';
  const value = cents / minorUnitFactor(currency);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Parses user text such as "4.99" or "1,250" into minor units. Returns null for blank, NaN for invalid. */
export function parseMoney(text: string, currency: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '').replace(/^[^\d.-]+/, '');
  if (cleaned === '') return null;
  const factor = minorUnitFactor(currency);
  const pattern = factor === 1 ? /^\d+$/ : /^\d+(\.\d{0,2})?$/;
  if (!pattern.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * factor);
}

export function moneyToInput(cents: number | null, currency: string): string {
  if (cents == null) return '';
  const factor = minorUnitFactor(currency);
  return factor === 1 ? String(cents) : (cents / factor).toFixed(2);
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
