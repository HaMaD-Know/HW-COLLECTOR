import type { Row, SqlDriver } from '../database/driver';
import type { CarInput, CarRecord, WishlistInput, WishlistItem } from '../types/models';
import { createId } from '../utils/id';
import { validateWishlistInput } from '../utils/validation';
import { CarRepository, ValidationError } from './car-repository';

export function rowToWishlist(row: Row): WishlistItem {
  return {
    id: String(row.id),
    name: String(row.name),
    imagePath: row.image_path == null ? null : String(row.image_path),
    notes: row.notes == null ? null : String(row.notes),
    series: row.series == null ? null : String(row.series),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    acquiredAt: row.acquired_at == null ? null : Number(row.acquired_at),
    acquiredCarId: row.acquired_car_id == null ? null : String(row.acquired_car_id),
  };
}

export interface ConversionResult {
  car: CarRecord;
  /** false when the entry had already been converted and the existing car was returned. */
  created: boolean;
}

export class WishlistRepository {
  private readonly cars: CarRepository;

  constructor(
    private readonly db: SqlDriver,
    private readonly now: () => number = Date.now,
  ) {
    this.cars = new CarRepository(db, now);
  }

  async create(input: Partial<WishlistInput>, id: string = createId()): Promise<WishlistItem> {
    const existing = await this.get(id);
    if (existing) return existing;
    const { ok, value, errors } = validateWishlistInput(input);
    if (!ok) throw new ValidationError(errors);
    const timestamp = this.now();
    const item: WishlistItem = {
      ...value,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      acquiredAt: null,
      acquiredCarId: null,
    };
    await this.insertRecord(item);
    return item;
  }

  async insertRecord(item: WishlistItem): Promise<void> {
    await this.db.run(
      `INSERT INTO wishlist (id, name, image_path, notes, series, created_at, updated_at, acquired_at, acquired_car_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.imagePath,
        item.notes,
        item.series,
        item.createdAt,
        item.updatedAt,
        item.acquiredAt,
        item.acquiredCarId,
      ],
    );
  }

  async update(id: string, input: Partial<WishlistInput>): Promise<WishlistItem> {
    const current = await this.get(id);
    if (!current) throw new Error('This wishlist entry no longer exists.');
    const { ok, value, errors } = validateWishlistInput({ ...current, ...input });
    if (!ok) throw new ValidationError(errors);
    const updatedAt = Math.max(this.now(), current.updatedAt);
    await this.db.run('UPDATE wishlist SET name = ?, image_path = ?, notes = ?, series = ?, updated_at = ? WHERE id = ?', [
      value.name,
      value.imagePath,
      value.notes,
      value.series,
      updatedAt,
      id,
    ]);
    return { ...current, ...value, updatedAt };
  }

  async get(id: string): Promise<WishlistItem | null> {
    const rows = await this.db.query('SELECT * FROM wishlist WHERE id = ?', [id]);
    return rows[0] ? rowToWishlist(rows[0]) : null;
  }

  /** Open entries first (newest first), then acquired ones. */
  async list(): Promise<WishlistItem[]> {
    const rows = await this.db.query(
      'SELECT * FROM wishlist ORDER BY acquired_at IS NOT NULL, COALESCE(acquired_at, created_at) DESC',
    );
    return rows.map(rowToWishlist);
  }

  async delete(id: string): Promise<WishlistItem | null> {
    const item = await this.get(id);
    if (!item) return null;
    await this.db.run('DELETE FROM wishlist WHERE id = ?', [id]);
    return item;
  }

  async setAcquired(id: string, acquired: boolean): Promise<WishlistItem> {
    const item = await this.get(id);
    if (!item) throw new Error('This wishlist entry no longer exists.');
    if (!acquired && item.acquiredCarId) {
      throw new Error('This entry is already in your collection. Delete that car first to undo.');
    }
    const acquiredAt = acquired ? (item.acquiredAt ?? this.now()) : null;
    await this.db.run('UPDATE wishlist SET acquired_at = ?, updated_at = ? WHERE id = ?', [acquiredAt, this.now(), id]);
    return { ...item, acquiredAt };
  }

  /**
   * Turns a wishlist entry into a collection record exactly once. The car id is
   * stored on the entry inside the same transaction, so repeating the call
   * (double tap, retry) returns the existing car instead of a duplicate.
   */
  async convertToCar(id: string, extra: Partial<CarInput> = {}): Promise<ConversionResult> {
    return this.db.transaction(async () => {
      const item = await this.get(id);
      if (!item) throw new Error('This wishlist entry no longer exists.');
      if (item.acquiredCarId) {
        const existing = await this.cars.get(item.acquiredCarId);
        if (existing) return { car: existing, created: false };
      }
      const car = await this.cars.create({
        name: item.name,
        series: item.series,
        notes: item.notes,
        imagePath: item.imagePath,
        nameSource: 'manual',
        ...extra,
      });
      const timestamp = this.now();
      await this.db.run('UPDATE wishlist SET acquired_at = ?, acquired_car_id = ?, updated_at = ? WHERE id = ?', [
        item.acquiredAt ?? timestamp,
        car.id,
        timestamp,
        id,
      ]);
      return { car, created: true };
    });
  }

  async count(): Promise<{ total: number; open: number }> {
    const rows = await this.db.query<{ total: number; open: number }>(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN acquired_at IS NULL THEN 1 ELSE 0 END) AS open FROM wishlist',
    );
    return { total: Number(rows[0]?.total ?? 0), open: Number(rows[0]?.open ?? 0) };
  }

  async deleteAll(): Promise<void> {
    await this.db.run('DELETE FROM wishlist');
  }
}
