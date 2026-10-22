import { createId } from '../../utils/id';
import { isSafeImagePath } from '../../utils/validation';

/** File operations relative to the app's private data directory. */
export interface FileAdapter {
  write(path: string, base64: string): Promise<void>;
  read(path: string): Promise<string>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  /** A URL the WebView can render directly, or null if the adapter can't provide one. */
  displayUrl(path: string): Promise<string | null>;
}

export const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export const MAX_STORED_IMAGE_BYTES = 12 * 1024 * 1024;

export class ImageStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageStoreError';
  }
}

export function base64ByteLength(base64: string): number {
  const clean = base64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
}

/**
 * Stores photos as app-owned copies under images/. Records keep only the
 * relative path, so temporary camera/picker URIs are never relied upon.
 */
export class ImageStore {
  private readonly urlCache = new Map<string, string>();

  constructor(
    private readonly files: FileAdapter,
    private readonly countReferences: (path: string) => Promise<number>,
  ) {}

  async save(base64: string, mimeType: string): Promise<string> {
    const ext = SUPPORTED_IMAGE_TYPES[mimeType];
    if (!ext) throw new ImageStoreError('Unsupported image type. Use JPEG, PNG or WebP.');
    const data = base64.replace(/^data:[^;]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(data) || data.length === 0) throw new ImageStoreError('Image data is corrupt.');
    if (base64ByteLength(data) > MAX_STORED_IMAGE_BYTES) throw new ImageStoreError('Image is too large to store.');
    const path = `images/${createId()}.${ext}`;
    await this.files.write(path, data);
    return path;
  }

  async read(path: string): Promise<string | null> {
    if (!isSafeImagePath(path)) return null;
    try {
      return await this.files.read(path);
    } catch {
      return null;
    }
  }

  async exists(path: string): Promise<boolean> {
    return isSafeImagePath(path) && (await this.files.exists(path));
  }

  /** Returns a renderable URL, or null when the file is missing so the UI can show a placeholder. */
  async displayUrl(path: string | null): Promise<string | null> {
    if (!path || !isSafeImagePath(path)) return null;
    const cached = this.urlCache.get(path);
    if (cached) return cached;
    try {
      if (!(await this.files.exists(path))) return null;
      let url = await this.files.displayUrl(path);
      if (!url) {
        const data = await this.files.read(path);
        url = `data:${mimeForPath(path)};base64,${data}`;
      }
      this.urlCache.set(path, url);
      return url;
    } catch {
      return null;
    }
  }

  /**
   * Deletes the file only if no car or wishlist entry still references it.
   * Call after the owning row has been removed or repointed.
   */
  async releaseIfUnreferenced(path: string | null): Promise<boolean> {
    if (!path || !isSafeImagePath(path)) return false;
    if ((await this.countReferences(path)) > 0) return false;
    this.urlCache.delete(path);
    try {
      await this.files.delete(path);
      return true;
    } catch {
      return false; // already gone
    }
  }

  /** Removes files under images/ that no record references (e.g. left by a crash mid-save). */
  async removeOrphans(referenced: string[]): Promise<number> {
    const keep = new Set(referenced);
    let removed = 0;
    let names: string[];
    try {
      names = await this.files.list('images');
    } catch {
      return 0;
    }
    for (const name of names) {
      const path = `images/${name}`;
      if (!keep.has(path) && isSafeImagePath(path)) {
        await this.files.delete(path).catch(() => undefined);
        this.urlCache.delete(path);
        removed++;
      }
    }
    return removed;
  }
}
