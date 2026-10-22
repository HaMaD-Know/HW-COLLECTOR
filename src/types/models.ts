export const CONDITIONS = ['mint', 'near-mint', 'good', 'fair', 'played-with', 'damaged'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const PACKAGING_STATUSES = ['carded', 'loose', 'boxed', 'damaged-card', 'opened'] as const;
export type PackagingStatus = (typeof PACKAGING_STATUSES)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  mint: 'Mint',
  'near-mint': 'Near mint',
  good: 'Good',
  fair: 'Fair',
  'played-with': 'Played with',
  damaged: 'Damaged',
};

export const PACKAGING_LABELS: Record<PackagingStatus, string> = {
  carded: 'Carded (sealed)',
  loose: 'Loose',
  boxed: 'Boxed',
  'damaged-card': 'Damaged card',
  opened: 'Opened',
};

export interface CarRecord {
  id: string;
  name: string;
  /** Relative path inside app storage, e.g. "images/abc.jpg". null = no photo. */
  imagePath: string | null;
  createdAt: number;
  updatedAt: number;
  manufacturer: string | null;
  model: string | null;
  series: string | null;
  color: string | null;
  releaseYear: number | null;
  purchaseYear: number | null;
  condition: Condition | null;
  packaging: PackagingStatus | null;
  /** Price paid, in minor units (cents) of the preferred currency. */
  purchasePriceCents: number | null;
  /** User-entered estimate in minor units. The app never predicts value. */
  estimatedValueCents: number | null;
  purchaseLocation: string | null;
  notes: string | null;
  isWishlisted: boolean;
  /** True only for clearly-labelled demo records that can be removed in Settings. */
  isSample: boolean;
}

/** Fields the user can provide when creating or editing a car. */
export type CarInput = Omit<CarRecord, 'id' | 'createdAt' | 'updatedAt' | 'isSample'> & {
  isSample?: boolean;
};

export interface WishlistItem {
  id: string;
  name: string;
  imagePath: string | null;
  notes: string | null;
  series: string | null;
  createdAt: number;
  updatedAt: number;
  acquiredAt: number | null;
  /** Car created from this entry. Set once, which is what prevents duplicate conversions. */
  acquiredCarId: string | null;
}

export type WishlistInput = Pick<WishlistItem, 'name' | 'imagePath' | 'notes' | 'series'>;

export type SortOrder = 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'year-desc' | 'year-asc';

export const SORT_LABELS: Record<SortOrder, string> = {
  'name-asc': 'Name (A–Z)',
  'name-desc': 'Name (Z–A)',
  newest: 'Newest first',
  oldest: 'Oldest first',
  'year-desc': 'Release year (newest)',
  'year-asc': 'Release year (oldest)',
};

export interface CarQuery {
  search?: string;
  series?: string | null;
  color?: string | null;
  year?: number | null;
  wishlistedOnly?: boolean;
  sort?: SortOrder;
}

export interface CollectionStats {
  totalCars: number;
  uniqueModels: number;
  seriesCount: number;
  wishlistTotal: number;
  colorDistribution: Array<{ label: string; count: number }>;
  packagingDistribution: Array<{ label: string; count: number }>;
  addedOverTime: Array<{ month: string; count: number }>;
  /** Sum of purchase prices for records that have one. */
  totalPurchaseCents: number;
  pricedCount: number;
  /** Sum of user-entered estimates for records that have one. */
  totalEstimateCents: number;
  estimatedCount: number;
}

export const CAR_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Red', hex: '#e5322d' },
  { name: 'Blue', hex: '#2f6bff' },
  { name: 'Yellow', hex: '#ffcc1f' },
  { name: 'Orange', hex: '#ff7a1a' },
  { name: 'Green', hex: '#22b55a' },
  { name: 'Purple', hex: '#8a4dff' },
  { name: 'Pink', hex: '#ff5fa8' },
  { name: 'Black', hex: '#15161a' },
  { name: 'White', hex: '#f4f5f7' },
  { name: 'Silver', hex: '#b9c0ca' },
  { name: 'Gray', hex: '#6c7480' },
  { name: 'Gold', hex: '#d4a72c' },
  { name: 'Brown', hex: '#7a4b2a' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Multi', hex: 'conic-gradient(#e5322d, #ffcc1f, #22b55a, #2f6bff, #8a4dff, #e5322d)' },
];

export function colorSwatch(name: string | null): string | null {
  if (!name) return null;
  const match = CAR_COLORS.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  return match ? match.hex : null;
}

/** Common mainline series names offered as suggestions; users may type anything. */
export const SERIES_SUGGESTIONS = [
  'HW Exotics',
  'HW Dream Garage',
  'HW Race Day',
  'HW Muscle Mania',
  'HW Hot Trucks',
  'HW J-Imports',
  'HW Turbo',
  'HW Speed Graphics',
  'HW Art Cars',
  'HW Screen Time',
  'HW Green Speed',
  'HW Rescue',
  'HW Metro',
  'HW Roadsters',
  'HW Drift',
  'HW Modified',
  'Car Culture',
  'Premium',
  'Treasure Hunt',
  'Super Treasure Hunt',
  'Mainline',
];
