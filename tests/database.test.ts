import { describe, expect, it } from 'vitest';
import { getSchemaVersion, LATEST_SCHEMA_VERSION, runMigrations, type Migration } from '../src/database/migrations';
import { CarRepository, ValidationError } from '../src/repositories/car-repository';
import { createTestDb } from './helpers/sqljs-driver';

describe('migrations', () => {
  it('creates the schema and records the version', async () => {
    const db = await createTestDb();
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(['cars', 'wishlist', 'schema_version']));
  });

  it('is idempotent and applies only new migrations', async () => {
    const db = await createTestDb();
    await runMigrations(db);
    const extra: Migration = { version: 99, description: 'test', sql: 'ALTER TABLE cars ADD COLUMN extra TEXT;' };
    await runMigrations(db, [extra]);
    await runMigrations(db, [extra]); // would throw "duplicate column" if re-applied
    expect(await getSchemaVersion(db)).toBe(99);
  });

  it('rolls back a failing migration', async () => {
    const db = await createTestDb();
    const bad: Migration = { version: 50, description: 'bad', sql: 'CREATE TABLE t1 (a); NOT VALID SQL;' };
    await expect(runMigrations(db, [bad])).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const t1 = await db.query("SELECT name FROM sqlite_master WHERE name='t1'");
    expect(t1).toHaveLength(0);
  });
});

describe('CarRepository CRUD', () => {
  it('adds, reads, edits and deletes a car', async () => {
    const db = await createTestDb();
    let clock = 1_700_000_000_000;
    const repo = new CarRepository(db, () => clock);

    const car = await repo.create({
      name: '  Ford   GT-40 ',
      color: 'Red',
      series: 'HW Exotics',
      releaseYear: 2024,
      purchasePriceCents: 125,
    });
    expect(car.name).toBe('Ford GT-40');
    expect(car.createdAt).toBe(clock);
    expect(await repo.get(car.id)).toEqual(car);

    clock += 5000;
    const edited = await repo.update(car.id, { name: 'Ford GT40 MkII', notes: 'Le Mans' });
    expect(edited.name).toBe('Ford GT40 MkII');
    expect(edited.createdAt).toBe(car.createdAt);
    expect(edited.updatedAt).toBe(clock);
    expect((await repo.get(car.id))?.notes).toBe('Le Mans');

    const removed = await repo.delete(car.id);
    expect(removed?.id).toBe(car.id);
    expect(await repo.get(car.id)).toBeNull();
    expect(await repo.count()).toBe(0);
  });

  it('keeps release year and purchase year separate', async () => {
    const repo = new CarRepository(await createTestDb());
    const car = await repo.create({ name: 'Camaro', releaseYear: 2020, purchaseYear: 2023 });
    const stored = await repo.get(car.id);
    expect(stored?.releaseYear).toBe(2020);
    expect(stored?.purchaseYear).toBe(2023);
  });

  it('rejects invalid input with field errors', async () => {
    const repo = new CarRepository(await createTestDb());
    await expect(repo.create({ name: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.create({ name: 'X', releaseYear: 1800 })).rejects.toThrow(/year/);
    await expect(repo.create({ name: 'X', purchasePriceCents: -5 })).rejects.toThrow(/amount/);
    await expect(repo.create({ name: 'X', imagePath: '../../etc/passwd' })).rejects.toThrow(/image/);
  });

  it('prevents duplicate saves when the same id is submitted twice', async () => {
    const repo = new CarRepository(await createTestDb());
    const first = await repo.create({ name: 'Skyline' }, 'fixed-id-123');
    const second = await repo.create({ name: 'Skyline' }, 'fixed-id-123');
    expect(second).toEqual(first);
    expect(await repo.count()).toBe(1);
  });

  it('finds same-name cars for duplicate warnings', async () => {
    const repo = new CarRepository(await createTestDb());
    const a = await repo.create({ name: 'Porsche 911' });
    await repo.create({ name: 'porsche 911' });
    expect(await repo.findByName('PORSCHE 911')).toHaveLength(2);
    expect(await repo.findByName('Porsche 911', a.id)).toHaveLength(1);
  });

  it('counts image references across cars and wishlist', async () => {
    const db = await createTestDb();
    const repo = new CarRepository(db);
    await repo.create({ name: 'A', imagePath: 'images/shared.jpg' });
    await repo.create({ name: 'B', imagePath: 'images/shared.jpg' });
    await db.run(
      "INSERT INTO wishlist (id, name, image_path, created_at, updated_at) VALUES ('w1', 'W', 'images/shared.jpg', 1, 1)",
    );
    expect(await repo.countImageReferences('images/shared.jpg')).toBe(3);
  });
});

describe('persistence', () => {
  it('keeps records after the database is closed and reopened', async () => {
    const db = await createTestDb();
    const repo = new CarRepository(db);
    const car = await repo.create({ name: 'McLaren 720S', color: 'Orange', releaseYear: 2022 });
    const reopened = await db.reopen();
    await runMigrations(reopened); // startup path runs migrations again
    const again = await new CarRepository(reopened).get(car.id);
    expect(again).toEqual(car);
  });
});

describe('older installs', () => {
  it('keeps working on a database created with the earlier AI columns', async () => {
    const initSqlJs = (await import('sql.js')).default;
    const { SqlJsDriver } = await import('./helpers/sqljs-driver');
    const SQL = await initSqlJs();
    const db = new SqlJsDriver(new SQL.Database());
    // Schema shipped in the first debug build (before AI identification was removed).
    await db.exec(`
      CREATE TABLE cars (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, image_path TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, manufacturer TEXT, model TEXT,
        series TEXT, color TEXT, release_year INTEGER, purchase_year INTEGER, condition TEXT,
        packaging TEXT, purchase_price_cents INTEGER, estimated_value_cents INTEGER,
        purchase_location TEXT, notes TEXT, ai_suggested_name TEXT,
        name_source TEXT NOT NULL DEFAULT 'manual',
        is_wishlisted INTEGER NOT NULL DEFAULT 0, is_sample INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
      INSERT INTO cars (id, name, created_at, updated_at, name_source, ai_suggested_name)
        VALUES ('old-car-0001', 'Old Car', 1, 1, 'ai-confirmed', 'Old Car');
    `);
    await runMigrations(db);
    const repo = new CarRepository(db);
    expect((await repo.get('old-car-0001'))?.name).toBe('Old Car');
    const added = await repo.create({ name: 'New Car' });
    expect((await repo.update(added.id, { notes: 'edited' })).notes).toBe('edited');
    expect(await repo.count()).toBe(2);
  });
});
