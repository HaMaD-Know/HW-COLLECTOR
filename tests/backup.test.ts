import { describe, expect, it } from 'vitest';
import { CarRepository } from '../src/repositories/car-repository';
import { WishlistRepository } from '../src/repositories/wishlist-repository';
import {
  BACKUP_FORMAT,
  BackupValidationError,
  buildBackup,
  importBackup,
  validateBackup,
} from '../src/services/export-import/backup';
import { ImageStore } from '../src/services/image-storage/image-store';
import { MemoryFiles, TINY_PNG } from './helpers/memory-files';
import { createTestDb } from './helpers/sqljs-driver';

async function setup() {
  const db = await createTestDb();
  const files = new MemoryFiles();
  const cars = new CarRepository(db);
  const store = new ImageStore(files, (p) => cars.countImageReferences(p));
  return { db, files, cars, wishlist: new WishlistRepository(db), store };
}

describe('export', () => {
  it('includes cars, wishlist and image data', async () => {
    const src = await setup();
    const path = await src.store.save(TINY_PNG, 'image/png');
    await src.cars.create({ name: 'Ford GT-40', imagePath: path, purchasePriceCents: 199 });
    await src.wishlist.create({ name: 'Twin Mill' });
    const { backup, missingImages } = await buildBackup(src.db, src.store, '1.0.0', new Date('2026-10-22T00:00:00Z'));
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.cars).toHaveLength(1);
    expect(backup.wishlist).toHaveLength(1);
    expect(backup.images[path]).toEqual({ mimeType: 'image/png', data: TINY_PNG });
    expect(missingImages).toBe(0);
  });

  it('counts missing image files instead of failing', async () => {
    const src = await setup();
    await src.cars.create({ name: 'Ghost', imagePath: 'images/missing.jpg' });
    const { backup, missingImages } = await buildBackup(src.db, src.store, '1.0.0');
    expect(missingImages).toBe(1);
    expect(backup.images).toEqual({});
  });
});

describe('round trip', () => {
  it('restores records and images into an empty install and is safe to repeat', async () => {
    const src = await setup();
    const path = await src.store.save(TINY_PNG, 'image/png');
    const car = await src.cars.create({ name: 'Skyline', imagePath: path, releaseYear: 2023 });
    const item = await src.wishlist.create({ name: 'Deora' });
    await src.wishlist.convertToCar(item.id);
    const { backup } = await buildBackup(src.db, src.store, '1.0.0');
    const json = JSON.parse(JSON.stringify(backup));

    const dest = await setup();
    const { backup: validated, warnings } = validateBackup(json);
    expect(warnings).toEqual([]);
    const report = await importBackup(dest.db, dest.store, validated);
    expect(report.carsAdded).toBe(2);
    expect(report.wishlistAdded).toBe(1);
    expect(report.imagesRestored).toBe(1);

    const restored = await dest.cars.get(car.id);
    expect(restored?.name).toBe('Skyline');
    expect(restored?.createdAt).toBe(car.createdAt);
    expect(restored?.imagePath).toMatch(/^images\//);
    expect(await dest.store.read(restored!.imagePath!)).toBe(TINY_PNG);

    const again = await importBackup(dest.db, dest.store, validated);
    expect(again.carsAdded).toBe(0);
    expect(again.carsSkipped).toBe(2);
    expect(await dest.cars.count()).toBe(2);
  });
});

describe('validateBackup', () => {
  const valid = () => ({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: '2026-10-22T00:00:00Z',
    appVersion: '1.0.0',
    cars: [{ id: 'aaaaaaaa-1111', name: 'Car', createdAt: 1, updatedAt: 1, imagePath: 'images/a.png' }],
    wishlist: [],
    images: { 'images/a.png': { mimeType: 'image/png', data: TINY_PNG } },
  });

  it('rejects files that are not backups', () => {
    expect(() => validateBackup(null)).toThrow(BackupValidationError);
    expect(() => validateBackup({ hello: 'world' })).toThrow(/not a HW Collector backup/);
    expect(() => validateBackup({ ...valid(), version: 99 })).toThrow(/newer version/);
    expect(() => validateBackup({ ...valid(), cars: 'nope' })).toThrow(/missing/);
  });

  it('drops invalid records and unsafe image paths with warnings', () => {
    const raw = valid();
    raw.cars.push(
      { id: 'bad', name: 'Short id', createdAt: 1, updatedAt: 1, imagePath: 'images/a.png' },
      { id: 'cccccccc-3333', name: '', createdAt: 1, updatedAt: 1, imagePath: 'images/a.png' },
      { id: 'dddddddd-4444', name: 'Traversal', createdAt: 1, updatedAt: 1, imagePath: '../../../data.db' },
      { id: 'aaaaaaaa-1111', name: 'Duplicate id', createdAt: 1, updatedAt: 1, imagePath: 'images/a.png' },
    );
    (raw.images as Record<string, unknown>)['../escape.png'] = { mimeType: 'image/png', data: TINY_PNG };
    (raw.images as Record<string, unknown>)['images/b.png'] = { mimeType: 'text/html', data: TINY_PNG };
    const { backup, warnings } = validateBackup(raw);
    expect(backup.cars.map((c) => c.name)).toEqual(['Car', 'Traversal']);
    expect(backup.cars[1].imagePath).toBeNull();
    expect(Object.keys(backup.images)).toEqual(['images/a.png']);
    expect(warnings.length).toBeGreaterThanOrEqual(5);
  });

  it('records a missing image without failing the import', async () => {
    const raw = valid();
    raw.images = {} as typeof raw.images;
    const dest = await setup();
    const report = await importBackup(dest.db, dest.store, validateBackup(raw).backup);
    expect(report.carsAdded).toBe(1);
    expect(report.imagesMissing).toBe(1);
    expect((await dest.cars.get('aaaaaaaa-1111'))?.imagePath).toBeNull();
  });
});
