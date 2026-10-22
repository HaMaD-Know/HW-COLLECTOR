import { describe, expect, it } from 'vitest';
import { CarRepository } from '../src/repositories/car-repository';
import { ImageStore, ImageStoreError, base64ByteLength } from '../src/services/image-storage/image-store';
import { MemoryFiles, TINY_PNG } from './helpers/memory-files';
import { createTestDb } from './helpers/sqljs-driver';

async function setup() {
  const db = await createTestDb();
  const files = new MemoryFiles();
  const cars = new CarRepository(db);
  const store = new ImageStore(files, (p) => cars.countImageReferences(p));
  return { db, files, cars, store };
}

describe('ImageStore', () => {
  it('saves an app-owned copy under images/', async () => {
    const { store, files } = await setup();
    const path = await store.save(`data:image/png;base64,${TINY_PNG}`, 'image/png');
    expect(path).toMatch(/^images\/[a-f0-9-]+\.png$/);
    expect(files.files.get(path)).toBe(TINY_PNG);
    expect(await store.read(path)).toBe(TINY_PNG);
  });

  it('rejects unsupported types and corrupt data', async () => {
    const { store } = await setup();
    await expect(store.save(TINY_PNG, 'image/gif')).rejects.toBeInstanceOf(ImageStoreError);
    await expect(store.save('not base64!!', 'image/png')).rejects.toThrow(/corrupt/);
  });

  it('returns a data URL for display and null when the file is missing', async () => {
    const { store, files } = await setup();
    const path = await store.save(TINY_PNG, 'image/png');
    expect(await store.displayUrl(path)).toBe(`data:image/png;base64,${TINY_PNG}`);
    files.files.clear();
    const fresh = new ImageStore(files, async () => 0);
    expect(await fresh.displayUrl(path)).toBeNull();
    expect(await fresh.read(path)).toBeNull();
    expect(await fresh.displayUrl('images/../secret.jpg')).toBeNull();
  });

  it('does not delete an image another record still references', async () => {
    const { store, cars, files } = await setup();
    const path = await store.save(TINY_PNG, 'image/png');
    const a = await cars.create({ name: 'A', imagePath: path });
    await cars.create({ name: 'B', imagePath: path });

    await cars.delete(a.id);
    expect(await store.releaseIfUnreferenced(path)).toBe(false);
    expect(files.files.has(path)).toBe(true);
  });

  it('deletes an image once it is unreferenced', async () => {
    const { store, cars, files } = await setup();
    const path = await store.save(TINY_PNG, 'image/png');
    const car = await cars.create({ name: 'A', imagePath: path });
    await cars.delete(car.id);
    expect(await store.releaseIfUnreferenced(path)).toBe(true);
    expect(files.files.has(path)).toBe(false);
    // Releasing again is harmless
    expect(await store.releaseIfUnreferenced(path)).toBe(false);
  });

  it('removes orphaned files but keeps referenced ones', async () => {
    const { store, cars, files } = await setup();
    const kept = await store.save(TINY_PNG, 'image/png');
    const orphan = await store.save(TINY_PNG, 'image/png');
    await cars.create({ name: 'Keep', imagePath: kept });
    expect(await store.removeOrphans(await cars.allImagePaths())).toBe(1);
    expect(files.files.has(kept)).toBe(true);
    expect(files.files.has(orphan)).toBe(false);
  });

  it('computes decoded byte length', () => {
    expect(base64ByteLength('AAAA')).toBe(3);
    expect(base64ByteLength('AAA=')).toBe(2);
    expect(base64ByteLength('AA==')).toBe(1);
  });
});
