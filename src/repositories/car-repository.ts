import type { Row, SqlDriver, SqlValue } from '../database/driver';
import type { CarInput, CarQuery, CarRecord, SortOrder } from '../types/models';
import { createId } from '../utils/id';
import { validateCarInput } from '../utils/validation';

export class ValidationError extends Error {
  constructor(public readonly fieldErrors: Partial<Record<string, string>>) {
    super(Object.values(fieldErrors)[0] ?? 'Invalid input');
    this.name = 'ValidationError';
  }
}

const COLUMNS: Array<[keyof CarRecord, string]> = [
  ['id', 'id'],
  ['name', 'name'],
  ['imagePath', 'image_path'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
  ['manufacturer', 'manufacturer'],
  ['model', 'model'],
  ['series', 'series'],
  ['color', 'color'],
  ['releaseYear', 'release_year'],
  ['purchaseYear', 'purchase_year'],
  ['condition', 'condition'],
  ['packaging', 'packaging'],
  ['purchasePriceCents', 'purchase_price_cents'],
  ['estimatedValueCents', 'estimated_value_cents'],
  ['purchaseLocation', 'purchase_location'],
  ['notes', 'notes'],
  ['isWishlisted', 'is_wishlisted'],
  ['isSample', 'is_sample'],
];

const SORT_SQL: Record<SortOrder, string> = {
  'name-asc': 'name COLLATE NOCASE ASC, created_at DESC',
  'name-desc': 'name COLLATE NOCASE DESC, created_at DESC',
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  // Records without a release year always go last.
  'year-desc': 'release_year IS NULL, release_year DESC, name COLLATE NOCASE ASC',
  'year-asc': 'release_year IS NULL, release_year ASC, name COLLATE NOCASE ASC',
};

function num(value: SqlValue | undefined): number | null {
  return value == null ? null : Number(value);
}

function str(value: SqlValue | undefined): string | null {
  return value == null ? null : String(value);
}

export function rowToCar(row: Row): CarRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    imagePath: str(row.image_path),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    manufacturer: str(row.manufacturer),
    model: str(row.model),
    series: str(row.series),
    color: str(row.color),
    releaseYear: num(row.release_year),
    purchaseYear: num(row.purchase_year),
    condition: str(row.condition) as CarRecord['condition'],
    packaging: str(row.packaging) as CarRecord['packaging'],
    purchasePriceCents: num(row.purchase_price_cents),
    estimatedValueCents: num(row.estimated_value_cents),
    purchaseLocation: str(row.purchase_location),
    notes: str(row.notes),
    isWishlisted: Number(row.is_wishlisted) === 1,
    isSample: Number(row.is_sample) === 1,
  };
}

function carToParams(car: CarRecord): SqlValue[] {
  return COLUMNS.map(([key]) => {
    const value = car[key];
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value as SqlValue;
  });
}

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class CarRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Creates a car. Passing a stable `id` makes the call idempotent: a repeated
   * save (double tap, retry after a timeout) returns the existing record instead
   * of creating a duplicate.
   */
  async create(input: Partial<CarInput>, id: string = createId()): Promise<CarRecord> {
    const existing = await this.get(id);
    if (existing) return existing;
    const { ok, value, errors } = validateCarInput(input, new Date(this.now()));
    if (!ok) throw new ValidationError(errors);
    const timestamp = this.now();
    const car: CarRecord = { ...value, isSample: value.isSample ?? false, id, createdAt: timestamp, updatedAt: timestamp };
    await this.insertRecord(car);
    return car;
  }

  /** Inserts a fully-formed record (used by import, which preserves timestamps). */
  async insertRecord(car: CarRecord): Promise<void> {
    const placeholders = COLUMNS.map(() => '?').join(', ');
    const columns = COLUMNS.map(([, column]) => column).join(', ');
    await this.db.run(`INSERT INTO cars (${columns}) VALUES (${placeholders})`, carToParams(car));
  }

  async update(id: string, input: Partial<CarInput>): Promise<CarRecord> {
    const current = await this.get(id);
    if (!current) throw new Error('This car no longer exists.');
    const merged = { ...current, ...input };
    const { ok, value, errors } = validateCarInput(merged, new Date(this.now()));
    if (!ok) throw new ValidationError(errors);
    const next: CarRecord = {
      ...value,
      id,
      isSample: current.isSample,
      createdAt: current.createdAt,
      updatedAt: Math.max(this.now(), current.updatedAt),
    };
    const assignments = COLUMNS.filter(([key]) => key !== 'id')
      .map(([, column]) => `${column} = ?`)
      .join(', ');
    const params = carToParams(next).slice(1);
    await this.db.run(`UPDATE cars SET ${assignments} WHERE id = ?`, [...params, id]);
    return next;
  }

  async setWishlisted(id: string, wishlisted: boolean): Promise<void> {
    await this.db.run('UPDATE cars SET is_wishlisted = ?, updated_at = ? WHERE id = ?', [
      wishlisted ? 1 : 0,
      this.now(),
      id,
    ]);
  }

  /** Deletes the row and returns it so the caller can release its image. */
  async delete(id: string): Promise<CarRecord | null> {
    const car = await this.get(id);
    if (!car) return null;
    await this.db.run('DELETE FROM cars WHERE id = ?', [id]);
    return car;
  }

  async get(id: string): Promise<CarRecord | null> {
    const rows = await this.db.query('SELECT * FROM cars WHERE id = ?', [id]);
    return rows[0] ? rowToCar(rows[0]) : null;
  }

  async list(query: CarQuery = {}): Promise<CarRecord[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    const search = query.search?.trim();
    if (search) {
      where.push("(name LIKE ? ESCAPE '\\' OR series LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\')");
      const pattern = likePattern(search);
      params.push(pattern, pattern, pattern);
    }
    if (query.series) {
      where.push('series = ? COLLATE NOCASE');
      params.push(query.series);
    }
    if (query.color) {
      where.push('color = ? COLLATE NOCASE');
      params.push(query.color);
    }
    if (query.year != null) {
      where.push('release_year = ?');
      params.push(query.year);
    }
    if (query.wishlistedOnly) where.push('is_wishlisted = 1');
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = SORT_SQL[query.sort ?? 'newest'];
    const rows = await this.db.query(`SELECT * FROM cars ${clause} ORDER BY ${order}`, params);
    return rows.map(rowToCar);
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM cars');
    return Number(rows[0]?.n ?? 0);
  }

  async recent(limit = 6): Promise<CarRecord[]> {
    const rows = await this.db.query('SELECT * FROM cars ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map(rowToCar);
  }

  /** Cars whose name matches exactly (case-insensitive) — used to warn before saving a likely duplicate. */
  async findByName(name: string, excludeId?: string): Promise<CarRecord[]> {
    const rows = await this.db.query(
      'SELECT * FROM cars WHERE name = ? COLLATE NOCASE AND id != ? ORDER BY created_at DESC',
      [name.trim(), excludeId ?? ''],
    );
    return rows.map(rowToCar);
  }

  async filterOptions(): Promise<{ series: string[]; colors: string[]; years: number[] }> {
    const [series, colors, years] = await Promise.all([
      this.db.query<{ v: string }>(
        'SELECT DISTINCT series AS v FROM cars WHERE series IS NOT NULL ORDER BY series COLLATE NOCASE',
      ),
      this.db.query<{ v: string }>(
        'SELECT DISTINCT color AS v FROM cars WHERE color IS NOT NULL ORDER BY color COLLATE NOCASE',
      ),
      this.db.query<{ v: number }>(
        'SELECT DISTINCT release_year AS v FROM cars WHERE release_year IS NOT NULL ORDER BY release_year DESC',
      ),
    ]);
    return {
      series: series.map((r) => String(r.v)),
      colors: colors.map((r) => String(r.v)),
      years: years.map((r) => Number(r.v)),
    };
  }

  async countImageReferences(imagePath: string): Promise<number> {
    const rows = await this.db.query<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM cars WHERE image_path = ?) +
              (SELECT COUNT(*) FROM wishlist WHERE image_path = ?) AS n`,
      [imagePath, imagePath],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async allImagePaths(): Promise<string[]> {
    const rows = await this.db.query<{ p: string }>(
      `SELECT image_path AS p FROM cars WHERE image_path IS NOT NULL
       UNION SELECT image_path AS p FROM wishlist WHERE image_path IS NOT NULL`,
    );
    return rows.map((r) => String(r.p));
  }

  async deleteSamples(): Promise<CarRecord[]> {
    const rows = await this.db.query('SELECT * FROM cars WHERE is_sample = 1');
    await this.db.run('DELETE FROM cars WHERE is_sample = 1');
    return rows.map(rowToCar);
  }

  async deleteAll(): Promise<void> {
    await this.db.run('DELETE FROM cars');
  }
}
