import { Preferences } from '@capacitor/preferences';
import { CURRENCIES, type Currency } from '../utils/format';

export type ThemePreference = 'dark' | 'light' | 'system';

export interface AppSettings {
  currency: Currency;
  theme: ThemePreference;
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'USD',
  theme: 'dark',
};

const KEY = 'settings.v1';

/** Small preferences live in Capacitor Preferences (SharedPreferences / UserDefaults), not SQLite. */
export class SettingsService {
  private current: AppSettings = { ...DEFAULT_SETTINGS };
  private readonly listeners = new Set<(s: AppSettings) => void>();

  async load(): Promise<AppSettings> {
    try {
      const { value } = await Preferences.get({ key: KEY });
      this.current = sanitize(value ? JSON.parse(value) : {});
    } catch {
      this.current = { ...DEFAULT_SETTINGS };
    }
    return this.current;
  }

  get(): AppSettings {
    return this.current;
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.current = sanitize({ ...this.current, ...patch });
    await Preferences.set({ key: KEY, value: JSON.stringify(this.current) });
    for (const listener of this.listeners) listener(this.current);
    return this.current;
  }

  subscribe(listener: (s: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function sanitize(raw: Partial<Record<keyof AppSettings, unknown>>): AppSettings {
  return {
    currency: CURRENCIES.includes(raw.currency as Currency) ? (raw.currency as Currency) : DEFAULT_SETTINGS.currency,
    theme: raw.theme === 'light' || raw.theme === 'system' ? raw.theme : 'dark',
  };
}
