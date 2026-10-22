import { beforeEach, describe, expect, it } from 'vitest';
import { CarRepository } from '../src/repositories/car-repository';
import { StatsRepository, bucketByMonth } from '../src/repositories/stats-repository';
import { WishlistRepository } from '../src/repositories/wishlist-repository';
import { createTestDb, type SqlJsDriver } from './helpers/sqljs-driver';

let db: SqlJsDriver;
let repo: CarRepository;
const base = new Date(2026, 9, 15).getTime();

beforeEach(async () => {
  db = await createTestDb();
  let tick = 0;
  repo = new CarRepository(db, () => base + tick++ * 1000);
  await repo.create({ name: 'Ford GT-40', color: 'Red', series: 'HW Exotics', releaseYear: 2024, packaging: 'carded', purchasePriceCents: 125 });
  await repo.create({ name: 'Nissan Skyline GT-R', color: 'Blue', series: 'HW J-Imports', releaseYear: 2023, packaging: 'loose' });
  await repo.create({ name: 'Porsche 911', color: 'Yellow', series: 'HW Exotics', releaseYear: 2022, purchasePriceCents: 300, estimatedValueCents: 1000 });
  await repo.create({ name: 'Dodge Charger', color: 'Black', series: 'HW Muscle Mania' });
  await repo.create({ name: '100% Real Car', color: 'red' });
});

describe('search', () => {
  it('matches name case-insensitively and partially', async () => {
    expect((await repo.list({ search: 'gt' })).map((c) => c.name).sort()).toEqual(['Ford GT-40', 'Nissan Skyline GT-R']);
  });
  it('treats LIKE wildcards literally', async () => {
    expect((await repo.list({ search: '100%' })).map((c) => c.name)).toEqual(['100% Real Car']);
    expect(await repo.list({ search: '_' })).toHaveLength(0);
  });
  it('also searches series', async () => {
    expect(await repo.list({ search: 'muscle' })).toHaveLength(1);
  });
});

describe('filters', () => {
  it('filters by series, color (case-insensitive) and year', async () => {
    expect(await repo.list({ series: 'HW Exotics' })).toHaveLength(2);
    expect(await repo.list({ color: 'RED' })).toHaveLength(2);
    expect((await repo.list({ year: 2023 }))[0].name).toBe('Nissan Skyline GT-R');
    expect(await repo.list({ series: 'HW Exotics', color: 'Yellow' })).toHaveLength(1);
  });
  it('lists only values that exist in the collection', async () => {
    const options = await repo.filterOptions();
    expect(options.series).toEqual(['HW Exotics', 'HW J-Imports', 'HW Muscle Mania']);
    expect(options.years).toEqual([2024, 2023, 2022]);
  });
});

describe('sorting', () => {
  it('sorts by name', async () => {
    const names = (await repo.list({ sort: 'name-asc' })).map((c) => c.name);
    expect(names).toEqual(['100% Real Car', 'Dodge Charger', 'Ford GT-40', 'Nissan Skyline GT-R', 'Porsche 911']);
  });
  it('sorts newest and oldest first', async () => {
    expect((await repo.list({ sort: 'newest' }))[0].name).toBe('100% Real Car');
    expect((await repo.list({ sort: 'oldest' }))[0].name).toBe('Ford GT-40');
  });
  it('sorts by year with unknown years last', async () => {
    const desc = (await repo.list({ sort: 'year-desc' })).map((c) => c.releaseYear);
    expect(desc).toEqual([2024, 2023, 2022, null, null]);
    const asc = (await repo.list({ sort: 'year-asc' })).map((c) => c.releaseYear);
    expect(asc).toEqual([2022, 2023, 2024, null, null]);
  });
});

describe('statistics', () => {
  it('computes figures from real records only', async () => {
    await new WishlistRepository(db).create({ name: 'Bone Shaker' });
    const stats = await new StatsRepository(db, () => base).compute();
    expect(stats.totalCars).toBe(5);
    expect(stats.uniqueModels).toBe(5);
    expect(stats.seriesCount).toBe(3);
    expect(stats.wishlistTotal).toBe(1);
    expect(stats.totalPurchaseCents).toBe(425);
    expect(stats.pricedCount).toBe(2);
    expect(stats.totalEstimateCents).toBe(1000);
    expect(stats.estimatedCount).toBe(1);
    expect(stats.colorDistribution[0]).toEqual({ label: expect.stringMatching(/red/i), count: 2 });
    expect(stats.packagingDistribution.find((p) => p.label === 'Not set')?.count).toBe(3);
    expect(stats.addedOverTime.at(-1)).toEqual({ month: '2026-10', count: 5 });
  });

  it('returns zeros for an empty collection', async () => {
    const empty = await createTestDb();
    const stats = await new StatsRepository(empty).compute();
    expect(stats.totalCars).toBe(0);
    expect(stats.totalPurchaseCents).toBe(0);
    expect(stats.colorDistribution).toEqual([]);
  });

  it('buckets by month including empty months', () => {
    const now = new Date(2026, 2, 10).getTime();
    const buckets = bucketByMonth([new Date(2026, 0, 5).getTime(), new Date(2025, 5, 1).getTime()], now, 3);
    expect(buckets).toEqual([
      { month: '2026-01', count: 1 },
      { month: '2026-02', count: 0 },
      { month: '2026-03', count: 0 },
    ]);
  });
});

describe('router parent paths', async () => {
  const { parentPath } = await import('../src/navigation/router');
  it('falls back to the logical parent screen', () => {
    expect(parentPath('/car/abc/edit', '/collection')).toBe('/car/abc');
    expect(parentPath('/car/abc', '/collection')).toBe('/collection');
    expect(parentPath('/wishlist/new', '/collection')).toBe('/wishlist');
    expect(parentPath('/wishlist/x/edit', '/collection')).toBe('/wishlist');
    expect(parentPath('/stats', '/collection')).toBe('/collection');
  });
});
