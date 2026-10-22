# Privacy

HW Collector is a local-first app. This page describes what the app as shipped in this repository does.
If you publish it, adapt this text into your store privacy policy and keep it accurate for your deployment.

## Data stored on the device

| Data | Where | Leaves the device? |
| --- | --- | --- |
| Car and wishlist records | SQLite database in app-private storage | Only in backup files you export |
| Photos you add | App-private storage (`images/` in the app's data directory) | Only when you tap **Identify** (that one photo) or export a backup |
| Settings (currency, theme, AI URL, consent) | Capacitor Preferences (Android SharedPreferences / iOS UserDefaults) | No |

There is no account, no analytics, no advertising SDK, no crash reporting and no cloud sync.

## AI identification

Only when you tap **Identify** (and after you agree to the one-time consent prompt):

1. The selected photo, resized to at most 1600 px and re-encoded as JPEG (which drops most EXIF metadata such
   as GPS location), is sent over HTTPS to the identification service configured in the app.
2. That service forwards the photo to Anthropic's API and returns a text suggestion.
3. The service in `backend/` does not store photos and logs only timing and status (no image data, no keys).
   Anthropic processes API requests under its commercial terms and data-retention policy.

Revoke consent in **Settings → AI identification**; you will be asked again before any further upload.
You can always skip identification and type the name.

## Permissions

- **Camera** (iOS prompt; Android uses the system camera app): only when you tap *Take photo*.
- **Photos** (iOS prompt; Android uses the system Photo Picker, no permission): only when you choose a photo.
- **Internet**: only for the optional identification service.

## Deleting data

- Delete a car: removes its record and its photo (unless another record uses the same photo).
- **Settings → Clear collection**: deletes all records and photos.
- Uninstalling the app deletes all app data on the device. Platform device backups (Android Auto Backup,
  iCloud device backup) may contain a copy depending on your device settings.

## App Store / Play Store declarations (for publishers)

- Data collected by the developer: **none**, if you operate the proxy without logging.
- Data shared with a third party: **photos**, only on user action, for app functionality (identification),
  not linked to identity, not used for tracking.
