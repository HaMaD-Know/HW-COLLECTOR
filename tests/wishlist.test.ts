import { describe, expect, it } from 'vitest';
import { CarRepository } from '../src/repositories/car-repository';
import { WishlistRepository } from '../src/repositories/wishlist-repository';
import { createTestDb } from './helpers/sqljs-driver';

describe('WishlistRepository', () => {
  it('adds, edits and removes entries', async () => {
    const repo = new WishlistRepository(await createTestDb());
    const item = await repo.create({ name: 'Twin Mill', notes: 'Any colour' });
    const edited = await repo.update(item.id, { name: 'Twin Mill III', series: 'HW Legends' });
    expect(edited.name).toBe('Twin Mill III');
    expect((await repo.get(item.id))?.series).toBe('HW Legends');
    await repo.delete(item.id);
    expect(await repo.list()).toHaveLength(0);
  });

  it('marks entries acquired and lists open ones first', async () => {
    let clock = 1000;
    const repo = new WishlistRepository(await createTestDb(), () => clock++);
    const a = await repo.create({ name: 'A' });
    await repo.create({ name: 'B' });
    await repo.setAcquired(a.id, true);
    const list = await repo.list();
    expect(list.map((i) => i.name)).toEqual(['B', 'A']);
    expect(list[1].acquiredAt).not.toBeNull();
    expect((await repo.count()).open).toBe(1);
  });

  it('converts an entry into a collection car exactly once', async () => {
    const db = await createTestDb();
    const wishlist = new WishlistRepository(db);
    const cars = new CarRepository(db);
    const item = await wishlist.create({ name: 'Bone Shaker', series: 'HW Dream Garage', notes: 'Found at Target' });

    const first = await wishlist.convertToCar(item.id, { color: 'Black' });
    expect(first.created).toBe(true);
    expect(first.car.name).toBe('Bone Shaker');
    expect(first.car.series).toBe('HW Dream Garage');
    expect(first.car.color).toBe('Black');

    const second = await wishlist.convertToCar(item.id);
    expect(second.created).toBe(false);
    expect(second.car.id).toBe(first.car.id);
    expect(await cars.count()).toBe(1);

    const stored = await wishlist.get(item.id);
    expect(stored?.acquiredCarId).toBe(first.car.id);
    expect(stored?.acquiredAt).not.toBeNull();
  });

  it('re-converts if the created car was later deleted', async () => {
    const db = await createTestDb();
    const wishlist = new WishlistRepository(db);
    const cars = new CarRepository(db);
    const item = await wishlist.create({ name: 'Deora II' });
    const { car } = await wishlist.convertToCar(item.id);
    await cars.delete(car.id);
    const again = await wishlist.convertToCar(item.id);
    expect(again.created).toBe(true);
    expect(await cars.count()).toBe(1);
  });

  it('rolls back the conversion if the car cannot be created', async () => {
    const db = await createTestDb();
    const wishlist = new WishlistRepository(db);
    const item = await wishlist.create({ name: 'Rodger Dodger' });
    await expect(wishlist.convertToCar(item.id, { releaseYear: 1500 })).rejects.toThrow();
    expect((await wishlist.get(item.id))?.acquiredCarId).toBeNull();
    expect(await new CarRepository(db).count()).toBe(0);
  });

  it('refuses to un-acquire an entry that is already in the collection', async () => {
    const db = await createTestDb();
    const wishlist = new WishlistRepository(db);
    const item = await wishlist.create({ name: 'Sharkruiser' });
    await wishlist.convertToCar(item.id);
    await expect(wishlist.setAcquired(item.id, false)).rejects.toThrow(/already in your collection/);
  });
});
