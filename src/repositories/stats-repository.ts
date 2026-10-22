import type { SqlDriver } from '../database/driver';
import { PACKAGING_LABELS, type CollectionStats, type PackagingStatus } from '../types/models';
import { monthKey } from '../utils/format';

/** All figures are computed from saved records only; nothing is estimated or inferred. */
export class StatsRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly now: () => number = Date.now,
  ) {}

  async compute(monthsBack = 6): Promise<CollectionStats> {
    const [totals, colors, packaging, created, wishlist] = await Promise.all([
      this.db.query<Record<string, number>>(
        `SELECT COUNT(*) AS total,
                COUNT(DISTINCT LOWER(TRIM(name))) AS unique_models,
                COUNT(DISTINCT LOWER(TRIM(series))) AS series_count,
                COALESCE(SUM(purchase_price_cents), 0) AS purchase_total,
                COUNT(purchase_price_cents) AS priced,
                COALESCE(SUM(estimated_value_cents), 0) AS estimate_total,
                COUNT(estimated_value_cents) AS estimated
         FROM cars`,
      ),
      this.db.query<{ label: string | null; n: number }>(
        `SELECT color AS label, COUNT(*) AS n FROM cars GROUP BY LOWER(color) ORDER BY label IS NULL, n DESC, label`,
      ),
      this.db.query<{ label: string | null; n: number }>(
        `SELECT packaging AS label, COUNT(*) AS n FROM cars GROUP BY packaging ORDER BY label IS NULL, n DESC, label`,
      ),
      this.db.query<{ created_at: number }>('SELECT created_at FROM cars'),
      this.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM wishlist WHERE acquired_at IS NULL'),
    ]);

    const t = totals[0] ?? {};
    return {
      totalCars: Number(t.total ?? 0),
      uniqueModels: Number(t.unique_models ?? 0),
      seriesCount: Number(t.series_count ?? 0),
      wishlistTotal: Number(wishlist[0]?.n ?? 0),
      colorDistribution: colors.map((r) => ({ label: r.label ?? 'Not set', count: Number(r.n) })),
      packagingDistribution: packaging.map((r) => ({
        label: r.label ? (PACKAGING_LABELS[r.label as PackagingStatus] ?? r.label) : 'Not set',
        count: Number(r.n),
      })),
      addedOverTime: bucketByMonth(
        created.map((r) => Number(r.created_at)),
        this.now(),
        monthsBack,
      ),
      totalPurchaseCents: Number(t.purchase_total ?? 0),
      pricedCount: Number(t.priced ?? 0),
      totalEstimateCents: Number(t.estimate_total ?? 0),
      estimatedCount: Number(t.estimated ?? 0),
    };
  }
}

/** Counts per calendar month for the last `months` months (oldest first), including empty months. */
export function bucketByMonth(timestamps: number[], now: number, months: number): Array<{ month: string; count: number }> {
  const end = new Date(now);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(end.getFullYear(), end.getMonth() - i, 1).getTime()));
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const ts of timestamps) {
    const key = monthKey(ts);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((month) => ({ month, count: counts.get(month) ?? 0 }));
}
