# HW Collector

A local-first app for cataloguing a Hot Wheels / 1:64 die-cast collection on Android and iOS.
Take or pick a photo, type the name and details, then browse, search, filter and analyse your
collection. Everything is stored on the device and the app works fully offline: no account, no online
services and no API keys.

> **Independent project.** HW Collector is not affiliated with, sponsored or endorsed by Mattel, Inc.
> "Hot Wheels" is a trademark of Mattel, Inc. The app uses its own logo and artwork.

## Features

| Area | What works |
| --- | --- |
| Add a car | Camera or gallery photo, preview, name, series, colour, year, notes and more details, duplicate-name warning, Save |
| Collection | Photo grid, total count, search, filter by series / colour / year, sort (A–Z, Z–A, newest, oldest, year), per-card menu, empty states |
| Car details | Large photo, all known fields (unknown ones are hidden, not invented), edit, wishlist flag, delete with confirmation, recent additions |
| Wishlist | Add by name, optional reference photo, notes, edit/remove, mark acquired, convert to a collection car exactly once |
| Statistics | Totals, unique models, series, colour and packaging distribution, cars added per month, purchase cost vs. your own estimates |
| Storage | SQLite with migrations, app-owned photo copies, reference-safe photo deletion, missing-photo placeholders, orphan clean-up, duplicate-save protection |
| Backup | Export to a single JSON file (records + photos) via the share sheet, validated import that never overwrites |
| Settings | Theme, currency, export/import, unused-photo clean-up, demo data, clear collection, privacy, version |

## Tech stack

TypeScript · Vite 8 · Capacitor 8 (Android + iOS) · `@capacitor-community/sqlite` · Capacitor Camera,
Filesystem, Preferences, Share, Status Bar, Splash Screen · Lucide icons · Vitest · ESLint.
No UI framework and no server: small typed components and a hash router.

## Project layout

```
src/
  app/                 app context, event bus
  components/          DOM helper, buttons/fields/states, dialogs/toasts, car card, nav
  screens/             collection, car detail, add/edit car, wishlist, stats, settings
  navigation/          hash router
  database/            driver interface, Capacitor SQLite driver, migrations
  repositories/        cars, wishlist, statistics (all SQL lives here)
  services/
    image-storage/     ImageStore + Capacitor Filesystem adapter
    export-import/     backup build/validate/import, share/download
  types/ theme/ utils/
tests/                 Vitest suites (sql.js in-memory SQLite)
android/ ios/          Capacitor native projects (generated, committed)
assets/                icon/splash sources (scripts/make-icon.mjs)
docs/                  setup, platform, privacy and backup guides
.github/workflows/     CI, Android release, iOS
```

## Quick start (Windows)

Prerequisites: Node.js 22+ (24 recommended), Git. For Android: Android Studio + JDK 21. Full details in
[docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md).

```powershell
npm.cmd install
npm.cmd run dev          # http://localhost:5173 — browser preview with real SQLite (IndexedDB-backed)
npm.cmd run check        # typecheck + lint + tests + production build
```

Use `npm.cmd` / `npx.cmd` if PowerShell blocks `npm` with an execution-policy error.

### Android

```powershell
npm.cmd run build
npx.cmd cap sync android
npx.cmd cap open android        # then Run ▶ in Android Studio
# or a debug APK from the command line:
cd android; .\gradlew.bat assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Device install, release APK/AAB and signing:
[docs/ANDROID.md](docs/ANDROID.md).

### iOS (no Mac needed)

Push to GitHub. The **iOS** workflow compiles the app on a macOS runner for the simulator on every push.
Signed `.ipa` files and TestFlight uploads need an Apple Developer account and signing secrets — see
[docs/IOS.md](docs/IOS.md), which explains exactly what each build type can and cannot be installed on.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` / `lint` / `test` | Individual checks |
| `npm run check` | All of the above |
| `npm run cap:sync` | Build and copy web assets into both native projects |
| `npm run assets:generate` | Regenerate app icons and splash screens from `scripts/make-icon.mjs` |

## Documentation

- [Windows setup](docs/WINDOWS_SETUP.md)
- [Android build, device testing and release](docs/ANDROID.md)
- [iOS cloud builds, signing, TestFlight and App Store](docs/IOS.md)
- [Privacy](docs/PRIVACY.md)
- [Data storage and backups](docs/DATA_AND_BACKUP.md)

## Security notes

- The app has no API keys or server credentials of any kind.
- Signing keystores, certificates and provisioning profiles are git-ignored. Keep them out of commits; CI reads
  them from GitHub Secrets.
- CI secrets are read only inside the steps that need them and signing files are deleted after use.
- No workflow publishes to Google Play or submits to App Store review. TestFlight upload only happens when you
  start the iOS workflow manually with `upload_to_testflight` checked.
