# Android

App id: `com.hwcollector.app` (change it in `capacitor.config.ts` **and** `android/app/build.gradle`
before your first store upload; it cannot change afterwards).

## Debug build

```powershell
npm.cmd run build
npx.cmd cap sync android
cd android
.\gradlew.bat assembleDebug
```

Output: `android\app\build\outputs\apk\debug\app-debug.apk`

Or open the project in Android Studio and press **Run ▶**:

```powershell
npx.cmd cap open android
```

`npm.cmd run android:debug` does build + sync + assemble in one step.

## Install on a physical phone

1. On the phone: **Settings → About phone →** tap **Build number** 7 times to enable Developer options.
2. **Settings → System → Developer options →** enable **USB debugging**.
3. Connect by USB and accept the "Allow USB debugging" prompt.
4. Check the phone is visible:
   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
   ```
5. Install:
   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
   ```
   or run `npx.cmd cap run android` and pick the device.

Without a cable: copy `app-debug.apk` to the phone (or download it from the GitHub Actions run) and open it;
allow "Install unknown apps" for your file manager when asked.

### What to test on the device

- Take photo and Choose from gallery (first use shows the system camera / photo picker).
- Save a car, force-close the app, reopen: the car and photo are still there.
- Edit, delete (photo removed), search, filters, sort.
- Hardware back button: closes dialogs first, then goes back, then exits from the collection.
- Airplane mode: everything works (the app never uses the network).
- Export a backup to Drive/Files, Clear collection, Import the backup.

## Permissions

The app requests no runtime permissions. Photos are captured through the system camera app and picked through
the Android Photo Picker, so no camera or storage permission is needed. The app makes no network requests;
`INTERNET` remains in the manifest only because Capacitor's development live-reload needs it (you may remove it
for release after testing). `android.hardware.camera` is declared optional so tablets without a camera can
install the app.

## Release signing

Create a keystore once and **back it up** — losing it means you can never update the app on Google Play
(unless you use Play App Signing with an upload key, which is recommended).

```powershell
keytool -genkeypair -v -keystore hw-collector-release.jks -alias hwcollector -keyalg RSA -keysize 2048 -validity 10000
```

Keep the `.jks` outside the repository.

### Local signed build

Copy `android/keystore.properties.example` to `android/keystore.properties` (git-ignored) and fill it in, then:

```powershell
npm.cmd run build
npx.cmd cap sync android
cd android
.\gradlew.bat assembleRelease   # APK: app\build\outputs\apk\release\app-release.apk
.\gradlew.bat bundleRelease     # AAB for Google Play: app\build\outputs\bundle\release\app-release.aab
```

Without a keystore, `assembleRelease` produces an unsigned APK that Android refuses to install.

Before each store release bump `versionCode` (integer, must increase) and `versionName` in
`android/app/build.gradle`.

### Signed build on GitHub

Add repository secrets (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `[Convert]::ToBase64String([IO.File]::ReadAllBytes("hw-collector-release.jks"))` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | e.g. `hwcollector` |
| `ANDROID_KEY_PASSWORD` | key password |

To copy the base64 to the clipboard in PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\hw-collector-release.jks")) | Set-Clipboard
```

Then **Actions → Android release → Run workflow**. Download `hw-collector-android-release` from the run page
(APK for direct install, AAB for the Play Console). The workflow never uploads to Google Play.

## Debug APK from CI

Every push runs **CI**, which uploads `hw-collector-debug-apk`. Open the run in the **Actions** tab, scroll to
**Artifacts**, download, unzip and install the APK as above. Debug builds are signed with a throwaway debug key,
so you cannot update a debug install with a release build (uninstall first — this deletes local data, export a
backup first).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `SDK location not found` | Set `ANDROID_HOME` or create `android/local.properties` |
| `Unsupported class file major version` / needs Java 21 | Point `JAVA_HOME` at JDK 21, or in Android Studio set Gradle JDK to 21 |
| Changes in `src/` not visible on the device | Run `npm.cmd run build` and `npx.cmd cap sync android` again |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | App installed with a different signing key; uninstall it first |
