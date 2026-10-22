# iOS builds without a Mac

The `ios/` folder is a complete Capacitor 8 Xcode project generated on Windows. It uses **Swift Package
Manager** (no CocoaPods), so a macOS GitHub Actions runner can build it directly after `npm ci`.

`ios/App/App/public` (the built web app) is git-ignored; every workflow run builds the web app and runs
`npx cap sync ios` before calling Xcode.

## What you can get, and what each one needs

| Build | Apple account | Secrets | Installable on | Workflow |
| --- | --- | --- | --- | --- |
| **Simulator build** (unsigned) | none | none | iOS Simulator on a Mac only. **Not** on an iPhone. | runs on every push / PR |
| **Unsigned IPA** | none to build; a free Apple ID to sideload | none | your own iPhone, after a sideloading tool signs it (free Apple ID: expires after 7 days) | runs on every push to `main` |
| **Signed IPA – development** (`debugging`) | Apple Developer Program | certificate + development profile | the iPhones whose UDIDs are in the profile | manual run |
| **Signed IPA – ad hoc** (`release-testing`) | Apple Developer Program | distribution certificate + ad hoc profile | up to 100 registered devices per device type per year | manual run |
| **TestFlight** (`app-store-connect`) | Apple Developer Program + App Store Connect app record | distribution certificate + App Store profile + API key | testers you invite in TestFlight | manual run with `upload_to_testflight` |
| **App Store release** | as TestFlight + review | — | everyone | done by you in App Store Connect after TestFlight; no workflow submits for review |

A public GitHub repository on its own **cannot** produce an app that installs on an iPhone. iOS only runs
code signed with a certificate and a provisioning profile from an Apple Developer account
(the paid Apple Developer Program, currently US$99/year, for anything distributed through CI).

The free "Personal Team" in Xcode can only sign on a Mac with Xcode, for 7 days, for your own device; it
cannot be used from CI.

## 1. Simulator build (no account)

Push to `main` or open a PR. **Actions → iOS → Simulator build (unsigned)** compiles the app for the
simulator. This proves the iOS project builds with the current code. The artifact
`hw-collector-ios-simulator` contains `App.app`, which can be dragged onto a running Simulator on any Mac.

## 1b. Unsigned IPA + sideloading (no paid account)

Every push to `main` also runs **Unsigned IPA (for sideloading)**, which uploads `hw-collector-ios-unsigned-ipa`
containing `HWCollector-unsigned.ipa`. iOS refuses to install an unsigned app directly, but a sideloading tool
can sign it with your own Apple ID and install it from Windows:

1. Install **iTunes** (or Apple Devices) from Microsoft Store/Apple so Windows can talk to the iPhone, and
   **Sideloadly** (<https://sideloadly.io>).
2. Download the artifact from the GitHub run page (**Actions → iOS → latest run → Artifacts**) and unzip it.
3. Connect the iPhone by USB, open Sideloadly, drop in `HWCollector-unsigned.ipa`, enter your Apple ID, Start.
4. On the iPhone: **Settings → General → VPN & Device Management →** trust your Apple ID; on iOS 16+ also turn
   on **Settings → Privacy & Security → Developer Mode** and restart.

Limits with a free Apple ID (Apple's rules, not the app's): the app stops opening after **7 days** and must be
re-sideloaded (your data stays as long as you re-install over it, not after deleting it); at most 3 sideloaded
apps per device. A paid developer account extends this to one year — or use the signed-IPA route below.

## 2. One-time Apple setup

All of this is done in a browser at <https://developer.apple.com/account> — no Mac needed.

1. **Enrol** in the Apple Developer Program.
2. **Team ID**: Membership details → Team ID (10 characters).
3. **App ID**: Certificates, IDs & Profiles → Identifiers → **+** → App IDs → App →
   Bundle ID `com.hwcollector.app` (explicit). No extra capabilities are needed.
4. **Certificate** (creating it on Windows with OpenSSL):
   ```bash
   # Git Bash on Windows (OpenSSL ships with Git)
   openssl genrsa -out ios_dist.key 2048
   openssl req -new -key ios_dist.key -out ios_dist.csr -subj "/emailAddress=you@example.com/CN=Your Name/C=US"
   ```
   Certificates → **+** → *Apple Distribution* (or *Apple Development* for development builds) → upload
   `ios_dist.csr` → download `distribution.cer`, then:
   ```bash
   openssl x509 -inform DER -in distribution.cer -out ios_dist.pem
   openssl pkcs12 -export -legacy -inkey ios_dist.key -in ios_dist.pem -out ios_dist.p12 -name "Apple Distribution"
   ```
   Choose a strong export password. (`-legacy` keeps the .p12 readable by macOS `security`; drop it if your
   OpenSSL is older than 3.0.) Store the `.key`, `.p12` and password somewhere safe and **outside** the repo.
5. **Devices** (development / ad hoc only): Devices → **+** → enter each iPhone's UDID
   (shown when the phone is connected to iTunes / Apple Devices on Windows, or via sites that read it from a profile).
6. **Provisioning profile**: Profiles → **+** →
   - *iOS App Development* → `debugging`
   - *Ad Hoc* → `release-testing`
   - *App Store Connect* → `app-store-connect` (TestFlight)

   Select the App ID, the certificate and (for development/ad hoc) the devices. Download the `.mobileprovision`.

## 3. Signing secrets

GitHub → repository → **Settings → Secrets and variables → Actions**:

| Secret | How to get it |
| --- | --- |
| `IOS_CERTIFICATE_P12_BASE64` | `[Convert]::ToBase64String([IO.File]::ReadAllBytes("ios_dist.p12")) \| Set-Clipboard` |
| `IOS_CERTIFICATE_PASSWORD` | the .p12 export password |
| `IOS_PROVISIONING_PROFILE_BASE64` | `[Convert]::ToBase64String([IO.File]::ReadAllBytes("HW_Collector.mobileprovision")) \| Set-Clipboard` |
| `IOS_TEAM_ID` | your Team ID |

For TestFlight also:

| Secret | How to get it |
| --- | --- |
| `APPSTORE_API_KEY_ID` | App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key (role *App Manager*). This is Apple's upload credential for CI, used only by the workflow — the app itself has no keys. |
| `APPSTORE_API_ISSUER_ID` | shown above the key list |
| `APPSTORE_API_PRIVATE_KEY` | full contents of the downloaded `AuthKey_XXXX.p8` (it can be downloaded only once) |

Secrets are only exposed to the steps that use them, are masked in logs, the temporary keychain uses a
random password, and the certificate, profile and API key files are deleted at the end of the job. Secrets are
not available to workflows triggered from forks.

## 4. Build a signed IPA

**Actions → iOS → Run workflow**:

- `build_signed_ipa`: ✔
- `export_method`: must match your profile (`debugging`, `release-testing`, `app-store-connect`, `enterprise`)

Download `hw-collector-ios-ipa-<method>` from the run's **Artifacts**.

Installing a development/ad hoc IPA from Windows: use Apple Configurator on a Mac, or an over-the-air
distribution service (for example Diawi, Firebase App Distribution) that accepts an IPA. The iPhone's UDID must
be in the profile.

## 5. TestFlight

1. App Store Connect → **Apps → + → New App**, platform iOS, bundle ID `com.hwcollector.app`.
2. Run the workflow with `export_method = app-store-connect` and `upload_to_testflight` ✔.
3. After processing (typically 10–30 minutes) the build appears under **TestFlight**. Add internal testers
   (immediate) or external testers (needs a short Beta App Review).

The build number is the GitHub run number, so each upload is unique. Bump the marketing version
(`MARKETING_VERSION` in Xcode build settings, currently 1.0) for new App Store versions.

## 6. App Store release

Done manually in App Store Connect: screenshots, description, privacy "nutrition label" (see
[PRIVACY.md](PRIVACY.md) — the app collects no data), age rating,
select the TestFlight build, **Submit for Review**. Nothing in this repository submits automatically.

Keep the trademark disclaimer: the app must not look like an official Mattel product.

## Other CI services

The same steps work on Codemagic, Bitrise or Ionic Appflow: `npm ci` → `npm run build` → `npx cap sync ios` →
`xcodebuild` with the project at `ios/App/App.xcodeproj`, scheme `App`.

## Troubleshooting

| Error | Cause |
| --- | --- |
| `No profiles for 'com.hwcollector.app' were found` | Profile secret is for a different bundle ID or was not decoded correctly |
| `No signing certificate "Apple Distribution" found` | `.p12` is a development certificate, or the password is wrong; use `export_method=debugging` for development certificates |
| `requires a provisioning profile with the … feature` | Capability mismatch; regenerate the profile after changing the App ID |
| Simulator job fails to resolve packages | Run `npm ci` before Xcode — the Swift packages live in `node_modules` |
