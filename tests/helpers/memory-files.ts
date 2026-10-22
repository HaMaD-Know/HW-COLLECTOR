import type { FileAdapter } from '../../src/services/image-storage/image-store';

/** In-memory FileAdapter for tests. */
export class MemoryFiles implements FileAdapter {
  readonly files = new Map<string, string>();

  async write(path: string, base64: string): Promise<void> {
    this.files.set(path, base64);
  }
  async read(path: string): Promise<string> {
    const data = this.files.get(path);
    if (data == null) throw new Error('File does not exist');
    return data;
  }
  async delete(path: string): Promise<void> {
    if (!this.files.delete(path)) throw new Error('File does not exist');
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
  async list(dir: string): Promise<string[]> {
    return [...this.files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1));
  }
  async displayUrl(): Promise<string | null> {
    return null;
  }
}

/** 1x1 transparent PNG. */
export const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
