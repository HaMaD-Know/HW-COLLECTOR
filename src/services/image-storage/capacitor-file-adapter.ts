import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FileAdapter } from './image-store';

/**
 * Directory.Data is app-private storage:
 * - Android: /data/data/<appId>/files (removed on uninstall, included in Android Auto Backup unless disabled)
 * - iOS: <App>/Documents (removed on uninstall, included in iCloud/iTunes device backups)
 * - Web: IndexedDB of the origin (development only)
 */
export class CapacitorFileAdapter implements FileAdapter {
  private readonly directory = Directory.Data;

  async write(path: string, base64: string): Promise<void> {
    await Filesystem.writeFile({ path, data: base64, directory: this.directory, recursive: true });
  }

  async read(path: string): Promise<string> {
    const result = await Filesystem.readFile({ path, directory: this.directory });
    if (typeof result.data === 'string') return result.data;
    return blobToBase64(result.data);
  }

  async delete(path: string): Promise<void> {
    await Filesystem.deleteFile({ path, directory: this.directory });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path, directory: this.directory });
      return true;
    } catch {
      return false;
    }
  }

  async list(dir: string): Promise<string[]> {
    const result = await Filesystem.readdir({ path: dir, directory: this.directory });
    return result.files.filter((f) => f.type === 'file').map((f) => f.name);
  }

  async displayUrl(path: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return null; // web store has no URL; caller falls back to a data URL
    const { uri } = await Filesystem.getUri({ path, directory: this.directory });
    return Capacitor.convertFileSrc(uri);
  }

  /** Writes a UTF-8 text file to the cache directory and returns its native URI (used for exports). */
  static async writeCacheText(path: string, text: string): Promise<string> {
    const result = await Filesystem.writeFile({
      path,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return result.uri;
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}
