# CBD College Scheduler — Android app

A native Android app (React Native + Expo) for the CBD College Scheduler. It
talks to the same Supabase backend as the web app (`../index.html`), so trainers
and assistants sign in with the same account and see the same data.

Distribution follows the same model as the `kerblock` project: a **self-hosted
APK** with a small download page and a `version.json` manifest. No Play Store —
users sideload the APK, and the app checks `version.json` on launch and offers an
update when a newer build is published.

> **iOS comes later.** The code is cross-platform (the `ios` config in
> `app.json` is already filled in), but the current focus is getting Android
> working and shipped.

## What's in this milestone (M1)

- Expo (SDK 57) + TypeScript project.
- Supabase client with session persisted in `AsyncStorage` (stays logged in).
- **Login** screen (email/password, same credentials as the web app).
- **Home** screen: your profile, today's class numbers (AM/PM), who's rostered
  today, and recent notifications (trainers see all; assistants see their own).
- Self-update banner that reads the published `version.json`.

Later milestones add the full roster calendar, availability editing, the
classes/students screens with the weekend rotation + auto-roster rules, and
native push notifications.

## Project layout

```
mobile/
  App.tsx                 auth gate: Login vs Home
  app.json                Expo config (name, package, version, icons)
  eas.json                EAS build profiles (APK output)
  src/
    lib/
      config.ts           Supabase keys, app version, release URL
      supabase.ts         Supabase client (AsyncStorage session)
      types.ts            DB row types
      format.ts           date/time helpers (formatDate matches the web app)
    theme.ts              colours mirrored from the web app
    screens/
      LoginScreen.tsx
      HomeScreen.tsx
    components/
      UpdateBanner.tsx    self-update check
  site/                   the download/update host (deploy this folder)
    index.html            download page
    version.json          release manifest (versionCode drives updates)
    _headers              cache + APK content-type headers
```

## Develop

```bash
cd mobile
npm install            # already done in this repo checkout
npx expo start         # then press 'a' for an Android emulator, or scan the QR
npx tsc --noEmit       # typecheck
```

Expo Go can run the JS, but this app is meant to ship as a standalone APK — build
one with EAS (below). After adding any library with native code you'll need a new
dev/APK build, not Expo Go.

## Build the APK (EAS cloud — no Android Studio needed)

You need a free [Expo account](https://expo.dev). Builds run in Expo's cloud.

```bash
cd mobile
npm install -g eas-cli          # or: npx eas-cli@latest <cmd>
eas login
eas build:configure            # first time only; keeps the eas.json here
eas build -p android --profile preview
```

When the build finishes, EAS gives you a URL to download the `.apk`.

- **Signing:** let EAS manage the Android keystore (it offers on first build).
  It stays in your Expo account — you never handle the keystore file. Keep the
  same keystore for every release so updates install over the top.
- `preview` and `production` profiles both output an **APK** (not an `.aab`),
  because we self-host rather than upload to Play.

## Publish a release (self-hosted, kerblock-style)

1. **Bump the version** in three places so they agree:
   - `app.json` → `expo.version` and `expo.android.versionCode`
   - `src/lib/config.ts` → `APP_VERSION` and `APP_VERSION_CODE`
   - (the APK you build will carry these)
   `versionCode` must increase every release — it's what the update check and
   Android both compare.
2. **Build** the APK (above) and download it.
3. **Assemble `site/`:**
   - Copy the APK into `site/` as `cbd-college-scheduler.apk`.
   - Update `site/version.json`:
     - `versionCode` / `versionName` → match this build
     - `size` → the APK's byte size
     - `sha256` → `sha256sum cbd-college-scheduler.apk` (lower-case hex)
     - `notes` → short "what's new"
     - `published` → an ISO timestamp
4. **Deploy `site/`** to your host (e.g. Cloudflare Pages, Netlify). Point
   `RELEASE_BASE_URL` in `src/lib/config.ts` at that URL before building, so the
   in-app update check and the download button target the right place. The
   `_headers` file makes `version.json` uncacheable and serves the APK with the
   right content-type (works on Cloudflare Pages / Netlify).

Installed apps check `version.json` on launch; when its `versionCode` is higher
than the running build, the update banner links users to the download page.

## Configuration notes

- **Supabase keys** in `config.ts` are the URL + *publishable (anon)* key — the
  same ones the web app ships. They're safe in a client; Row Level Security
  protects the data.
- Keep `APP_VERSION_CODE` (config.ts) equal to `android.versionCode` (app.json)
  or the update check will misfire.
