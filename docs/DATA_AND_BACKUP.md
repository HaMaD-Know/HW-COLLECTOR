# Data storage and backups

## Where things live

| | Android | iOS | Browser preview |
| --- | --- | --- | --- |
| Database (`hw_collectorSQLite.db`) | `/data/data/com.hwcollector.app/databases/` | `Library/CapacitorDatabase/` | IndexedDB (via jeep-sqlite) |
| Photos (`images/<uuid>.jpg`) | `/data/data/com.hwcollector.app/files/` (`Directory.Data`) | `Documents/` (`Directory.Data`) | IndexedDB (Capacitor Filesystem web) |
| Settings | SharedPreferences | UserDefaults | localStorage |

Everything is app-private. Other apps cannot read it, and it is **deleted when the app is uninstalled**.

Platform backups:

- **Android**: `android:allowBackup="true"` lets Android Auto Backup include app data in the user's Google
  backup if they have it enabled. Restore after reinstall is possible but not guaranteed (size limits, device
  settings, different signing keys).
- **iOS**: `Documents/` and `Library/` are included in iCloud / computer device backups and restored with a
  full device restore.

Do not rely on either. The supported backup is the export file below.

## Database

- Schema is defined in `src/database/migrations.ts` as an append-only list. On every start the app applies
  any migrations newer than the version stored in `schema_version`, each inside a transaction.
- Money is stored as integer minor units (cents). Release year and purchase year are separate columns.
- To change the schema, **add** a migration with the next version number; never edit a shipped one.

## Photos

- Every photo is re-encoded (≤ 1600 px JPEG) and **copied** into app storage on save; records store only the
  relative path (`images/<uuid>.jpg`). Temporary camera/picker files are never referenced.
- Deleting or replacing a photo checks that no other car or wishlist entry references it first.
- If a file goes missing, the UI shows "Photo missing" instead of a broken image; the record is kept.
- A few seconds after start-up, and on demand in Settings, files no record references (e.g. from a crash
  between writing a photo and saving the record) are removed.

## Duplicate protection

- Each Add screen generates its record id once; repeated taps or retries of Save return the existing record.
- Converting a wishlist entry stores the new car id on the entry in the same transaction, so it converts once.
- Saving a name that already exists asks "Save anyway?" (collectors often own duplicates on purpose).

## Export

**Settings → Backup & restore → Export** writes `hw-collector-backup-YYYY-MM-DD.json`:

```json
{
  "format": "hw-collector-backup",
  "version": 1,
  "exportedAt": "2026-10-22T10:00:00.000Z",
  "appVersion": "1.0.0",
  "cars": [ { "id": "…", "name": "Ford GT-40", "imagePath": "images/….jpg", "…": "…" } ],
  "wishlist": [ … ],
  "images": { "images/….jpg": { "mimeType": "image/jpeg", "data": "<base64>" } }
}
```

On a phone the system share sheet opens: save to Files / Google Drive / iCloud Drive, or send it to your
computer. In the browser preview the file downloads. Photos are embedded, so expect roughly 150–400 KB per car.

## Import

**Settings → Backup & restore → Import** accepts a backup file and:

- rejects files that are not HW Collector backups, are from a newer app version, are larger than 200 MB, or
  contain more than 20,000 records;
- validates every record with the same rules as the editor and skips invalid ones (reported in the summary);
- accepts image entries only for safe `images/<name>.<jpg|png|webp|svg>` keys with a supported MIME type and
  valid base64; anything else is ignored, and records pointing at unsafe paths are imported without a photo;
- **merges**: records whose id already exists on the device are skipped, nothing is overwritten, so importing the
  same file twice is harmless;
- writes photos as new app-owned files.

## Recommended backup routine

1. Export after adding a batch of cars.
2. Keep the file in at least one place that is not the phone (cloud drive or computer).
3. Before uninstalling, switching phones, or using **Clear collection**, export first.
4. On the new device: install the app → Settings → Import.
