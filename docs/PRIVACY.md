# Privacy

HW Collector is an offline, local-first app. This page describes what the app as shipped in this repository
does. If you publish it, adapt this text into your store privacy policy and keep it accurate.

## Summary

- No account, no sign-in, no API keys.
- No analytics, advertising, crash reporting or tracking SDKs.
- No online services: the app makes no network requests. Everything works in airplane mode.
- Your data leaves the device only in backup files that you export and share yourself.

## Data stored on the device

| Data | Where | Leaves the device? |
| --- | --- | --- |
| Car and wishlist records | SQLite database in app-private storage | Only in backup files you export |
| Photos you add | App-private storage (`images/` in the app's data directory) | Only in backup files you export |
| Settings (currency, theme) | Capacitor Preferences (Android SharedPreferences / iOS UserDefaults) | No |

Photos are resized to at most 1600 px and re-encoded as JPEG when saved, which drops most EXIF metadata such
as GPS location.

## Permissions

- **Camera** (iOS prompt; Android uses the system camera app): only when you tap *Take photo*.
- **Photos** (iOS prompt; Android uses the system Photo Picker, no permission): only when you choose a photo.
- **Internet** (Android manifest only): kept from the Capacitor template for development live-reload. The app
  itself never connects to the internet.

## Deleting data

- Delete a car: removes its record and its photo (unless another record uses the same photo).
- **Settings → Clear collection**: deletes all records and photos.
- Uninstalling the app deletes all app data on the device. Platform device backups (Android Auto Backup,
  iCloud device backup) may contain a copy depending on your device settings.

## App Store / Play Store declarations (for publishers)

- Data collected: **none**.
- Data shared with third parties: **none**.
- Tracking: **no**.
