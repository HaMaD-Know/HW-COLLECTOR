# Windows setup

## 1. Install tools

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22+ (24 LTS recommended) | <https://nodejs.org> |
| Git | any recent | <https://git-scm.com> |
| Android Studio | current stable | Includes the Android SDK. Install SDK Platform 36 and Build-Tools from *SDK Manager*. |
| JDK | 21 | Capacitor 8 builds need Java 21. Android Studio's bundled JBR 21 works; or install Temurin 21. |

Check:

```powershell
node -v
npm.cmd -v
java -version
```

### PowerShell execution policy

If `npm` fails with *"running scripts is disabled on this system"*, use `npm.cmd` and `npx.cmd`
(every command in these docs does), or allow scripts for your user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Android SDK location

Gradle needs to find the SDK. Either set `ANDROID_HOME`:

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
```

or create `android/local.properties` (git-ignored):

```
sdk.dir=C\:/Users/<you>/AppData/Local/Android/Sdk
```

Opening the `android` folder in Android Studio creates this file automatically.

## 2. Install dependencies

```powershell
cd "HOT WHEELS COLLECTOR"
npm.cmd install
```

`postinstall` copies `sql-wasm.wasm` into `public/assets` for the browser preview.

`@capacitor/assets` (icon generator) depends on `sharp`, whose install script is allow-listed in
`package.json` (`allowScripts`). If npm warns about it, run `npm.cmd rebuild sharp`.

## 3. Run in the browser

```powershell
npm.cmd run dev
```

Open <http://localhost:5173>. The browser preview uses the same SQLite code through sql.js/IndexedDB and a
file picker instead of the camera. Use it for UI work; test camera, storage and back-button behaviour on a device.

## 4. Run all checks

```powershell
npm.cmd run check
```

Runs TypeScript, ESLint, Vitest and the production build.

## 5. Android

See [ANDROID.md](ANDROID.md).

## 6. iOS from Windows

You cannot build iOS apps on Windows. The `ios/` project is committed and the GitHub **iOS** workflow builds it on
macOS. See [IOS.md](IOS.md).

## Dependency notes

- **`sql.js` is pinned to 1.11.0** on purpose. `jeep-sqlite` 2.8.0 (the browser backend of
  `@capacitor-community/sqlite`) bundles the sql.js 1.11 JavaScript glue, and the `sql-wasm.wasm` copied to
  `public/assets` must come from the same version. A newer sql.js makes the browser preview fail with
  `WebAssembly.instantiate(): Import #34 … function import requires a callable`. Native Android/iOS builds do not
  use sql.js at all.
- If PowerShell's `Set-Content` is used to edit `package.json`, it may add a UTF-8 BOM that breaks Vite
  ("Unexpected token"). Save JSON files as UTF-8 without BOM.
