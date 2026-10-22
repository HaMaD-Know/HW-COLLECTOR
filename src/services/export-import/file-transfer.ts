import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { CapacitorFileAdapter } from '../image-storage/capacitor-file-adapter';

export const MAX_IMPORT_FILE_BYTES = 200 * 1024 * 1024;

export function backupFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `hw-collector-backup-${stamp}.json`;
}

/**
 * Hands the backup to the user. On a phone this opens the system share sheet
 * (save to Files/Drive, email, etc.); in a browser it downloads the file.
 */
export async function deliverBackup(json: string, fileName: string): Promise<'shared' | 'downloaded'> {
  if (Capacitor.isNativePlatform()) {
    const uri = await CapacitorFileAdapter.writeCacheText(`exports/${fileName}`, json);
    await Share.share({ title: 'HW Collector backup', text: 'HW Collector backup file', files: [uri], dialogTitle: 'Save your backup' });
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Opens the system file picker for a JSON backup and returns its text, or null if cancelled. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.className = 'visually-hidden-input';
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn();
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return done(() => resolve(null));
      if (file.size > MAX_IMPORT_FILE_BYTES) return done(() => reject(new Error('That file is too large to be a backup.')));
      file
        .text()
        .then((text) => done(() => resolve(text)))
        .catch(() => done(() => reject(new Error('The file could not be read.'))));
    });
    input.addEventListener('cancel', () => done(() => resolve(null)));
    document.body.appendChild(input);
    input.click();
  });
}
