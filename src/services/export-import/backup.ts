import type { SqlDriver } from '../../database/driver';
import { CarRepository } from '../../repositories/car-repository';
import { WishlistRepository } from '../../repositories/wishlist-repository';
import type { CarRecord, WishlistItem } from '../../types/models';
import { isSafeImagePath, validateCarInput, validateWishlistInput } from '../../utils/validation';
import { type ImageStore, mimeForPath, SUPPORTED_IMAGE_TYPES } from '../image-storage/image-store';

export const BACKUP_FORMAT = 'hw-collector-backup';
export const BACKUP_VERSION = 1;
export const MAX_IMPORT_RECORDS = 20_000;

export interface BackupImage {
  mimeType: string;
  data: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appVersion: string;
  cars: CarRecord[];
  wishlist: WishlistItem[];
  /** Keyed by the record's imagePath. */
  images: Record<string, BackupImage>;
}

export interface ImportReport {
  carsAdded: number;
  carsSkipped: number;
  wishlistAdded: number;
  wishlistSkipped: number;
  imagesRestored: number;
  imagesMissing: number;
  warnings: string[];
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export async function buildBackup(
  db: SqlDriver,
  images: ImageStore,
  appVersion: string,
  now = new Date(),
): Promise<{ backup: BackupFile; missingImages: number }> {
  const cars = await new CarRepository(db).list({ sort: 'oldest' });
  const wishlist = await new WishlistRepository(db).list();
  const files: Record<string, BackupImage> = {};
  let missingImages = 0;
  const paths = new Set([...cars, ...wishlist].map((r) => r.imagePath).filter((p): p is string => !!p));
  for (const path of paths) {
    const data = await images.read(path);
    if (data) files[path] = { mimeType: mimeForPath(path), data };
    else missingImages++;
  }
  return {
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      appVersion,
      cars,
      wishlist,
      images: files,
    },
    missingImages,
  };
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 32503680000000;
}

/**
 * Structural and field-level validation of an untrusted backup file. Returns
 * clean records; invalid records are dropped with a warning rather than
 * aborting the whole import, but a file that is not a backup is rejected.
 */
export function validateBackup(raw: unknown): { backup: BackupFile; warnings: string[] } {
  if (!raw || typeof raw !== 'object') throw new BackupValidationError('This file is not a backup.');
  const b = raw as Record<string, unknown>;
  if (b.format !== BACKUP_FORMAT) throw new BackupValidationError('This file is not a HW Collector backup.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new BackupValidationError('This backup was made by a newer version of the app. Update the app first.');
  }
  if (!Array.isArray(b.cars) || !Array.isArray(b.wishlist)) {
    throw new BackupValidationError('Backup is missing its car or wishlist list.');
  }
  if (b.cars.length + b.wishlist.length > MAX_IMPORT_RECORDS) {
    throw new BackupValidationError('Backup contains too many records.');
  }
  const warnings: string[] = [];
  const rawImages = b.images && typeof b.images === 'object' ? (b.images as Record<string, unknown>) : {};
  const images: Record<string, BackupImage> = {};
  for (const [path, value] of Object.entries(rawImages)) {
    const img = value as Partial<BackupImage> | null;
    if (
      !isSafeImagePath(path) ||
      !img ||
      typeof img.data !== 'string' ||
      typeof img.mimeType !== 'string' ||
      !SUPPORTED_IMAGE_TYPES[img.mimeType] ||
      !/^[A-Za-z0-9+/=]+$/.test(img.data)
    ) {
      warnings.push(`Ignored an invalid image entry (${path.slice(0, 40)}).`);
      continue;
    }
    images[path] = { mimeType: img.mimeType, data: img.data };
  }

  const seen = new Set<string>();
  const cars: CarRecord[] = [];
  for (const entry of b.cars as Array<Record<string, unknown>>) {
    const id = entry?.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || seen.has(id)) {
      warnings.push('Skipped a car with a missing or duplicate id.');
      continue;
    }
    const imagePath = isSafeImagePath(entry.imagePath) ? entry.imagePath : null;
    if (entry.imagePath != null && imagePath == null) warnings.push('Ignored an unsafe image path.');
    const { ok, value } = validateCarInput({ ...(entry as Partial<CarRecord>), imagePath });
    if (!ok) {
      warnings.push(`Skipped car "${String(entry.name ?? id).slice(0, 40)}": invalid data.`);
      continue;
    }
    const createdAt = isTimestamp(entry.createdAt) ? entry.createdAt : Date.now();
    const updatedAt = isTimestamp(entry.updatedAt) ? Math.max(entry.updatedAt, createdAt) : createdAt;
    seen.add(id);
    cars.push({ ...value, isSample: value.isSample ?? false, id, createdAt, updatedAt });
  }

  const wishlist: WishlistItem[] = [];
  for (const entry of b.wishlist as Array<Record<string, unknown>>) {
    const id = entry?.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || seen.has(id)) {
      warnings.push('Skipped a wishlist entry with a missing or duplicate id.');
      continue;
    }
    const imagePath = isSafeImagePath(entry.imagePath) ? entry.imagePath : null;
    if (entry.imagePath != null && imagePath == null) warnings.push('Ignored an unsafe image path.');
    const { ok, value } = validateWishlistInput({ ...(entry as Partial<WishlistItem>), imagePath });
    if (!ok) {
      warnings.push(`Skipped wishlist entry "${String(entry.name ?? id).slice(0, 40)}": invalid data.`);
      continue;
    }
    seen.add(id);
    const createdAt = isTimestamp(entry.createdAt) ? entry.createdAt : Date.now();
    const acquiredCarId =
      typeof entry.acquiredCarId === 'string' && ID_PATTERN.test(entry.acquiredCarId) ? entry.acquiredCarId : null;
    wishlist.push({
      ...value,
      id,
      createdAt,
      updatedAt: isTimestamp(entry.updatedAt) ? Math.max(entry.updatedAt, createdAt) : createdAt,
      acquiredAt: isTimestamp(entry.acquiredAt) ? entry.acquiredAt : null,
      acquiredCarId,
    });
  }

  return {
    backup: {
      format: BACKUP_FORMAT,
      version: b.version,
      exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
      appVersion: typeof b.appVersion === 'string' ? b.appVersion : 'unknown',
      cars,
      wishlist,
      images,
    },
    warnings,
  };
}

/**
 * Merges a validated backup into the local collection. Records whose id
 * already exists are skipped, so importing the same file twice is harmless.
 * Images are written as new app-owned files and records are repointed to them.
 */
export async function importBackup(db: SqlDriver, imageStore: ImageStore, backup: BackupFile): Promise<ImportReport> {
  const carsRepo = new CarRepository(db);
  const wishlistRepo = new WishlistRepository(db);
  const report: ImportReport = {
    carsAdded: 0,
    carsSkipped: 0,
    wishlistAdded: 0,
    wishlistSkipped: 0,
    imagesRestored: 0,
    imagesMissing: 0,
    warnings: [],
  };
  const restored = new Map<string, string | null>();
  const restoreImage = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    if (restored.has(path)) return restored.get(path) ?? null;
    const image = backup.images[path];
    let next: string | null = null;
    if (image) {
      try {
        next = await imageStore.save(image.data, image.mimeType);
        report.imagesRestored++;
      } catch {
        report.warnings.push('One image could not be restored.');
      }
    } else {
      report.imagesMissing++;
    }
    restored.set(path, next);
    return next;
  };

  for (const car of backup.cars) {
    if (await carsRepo.get(car.id)) {
      report.carsSkipped++;
      continue;
    }
    await carsRepo.insertRecord({ ...car, imagePath: await restoreImage(car.imagePath) });
    report.carsAdded++;
  }
  for (const item of backup.wishlist) {
    if (await wishlistRepo.get(item.id)) {
      report.wishlistSkipped++;
      continue;
    }
    await wishlistRepo.insertRecord({ ...item, imagePath: await restoreImage(item.imagePath) });
    report.wishlistAdded++;
  }
  await db.persist();
  return report;
}
