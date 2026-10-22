import type { SqlDriver } from '../database/driver';
import type { CarRepository } from '../repositories/car-repository';
import type { StatsRepository } from '../repositories/stats-repository';
import type { WishlistRepository } from '../repositories/wishlist-repository';
import type { ImageStore } from '../services/image-storage/image-store';
import type { SettingsService } from '../services/settings';

export const APP_VERSION = __APP_VERSION__;

export type AppEvent = 'cars-changed' | 'wishlist-changed' | 'settings-changed';

/** Minimal pub/sub so screens refresh immediately after any modification. */
export class EventBus {
  private readonly listeners = new Map<AppEvent, Set<() => void>>();

  on(event: AppEvent, fn: () => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(event: AppEvent): void {
    this.listeners.get(event)?.forEach((fn) => fn());
  }
}

export interface AppContext {
  db: SqlDriver;
  cars: CarRepository;
  wishlist: WishlistRepository;
  stats: StatsRepository;
  images: ImageStore;
  settings: SettingsService;
  events: EventBus;
  navigate(path: string, options?: { replace?: boolean }): void;
  back(): void;
}
