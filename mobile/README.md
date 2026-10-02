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

## Features (matches the web app)

The app mirrors the web scheduler's look and functions, with the same top tabs.

**Trainers:** Schedule (today hero + team roster calendar + Team overview + Sync
students + Auto-roster), Classes (Vasto sync + per-weekday default class times +
public holidays), Staff (add/edit/remove staff, link accounts, auto-roster rules,
assistant slot times; weekly availability patterns + one-off overrides), send
Notifications, Admin (create users, passwords, emails, roles, delete), App Guides.

**Assistants:** My Roster (today/next-shift + calendar), My Availability (weekly
pattern + one-off overrides with the 14-day lock), App Guides.

**Everywhere:** the notification bell (list + rich detail with the day snapshot),
light/dark theme toggle, Export PDF, and self-update banner.

The roster shown is **fully computed** by a faithful port of the web app's
resolution logic (`src/lib/rosterCompute.ts`): weekend head-trainer rotation,
head-trainers-are-full-time, assistant scaling, public holidays, per-DOW
priorities/exclusions/rotation. It's verified against the real web app —
`scripts/xcheck/run.sh` diffs it against `index.html`'s own functions (132 checks,
0 mismatches).

**Native push** uses `expo-notifications` (real OS notifications). See setup below.

### Verifying the roster engine

```bash
cd scripts/xcheck && ./run.sh   # expects "132 checks, 0 mismatches"
```

Re-run after changing `src/lib/rosterCompute.ts` or the web app's roster logic.

### Native push setup (one-time)

1. Run `../supabase-native-push.sql` in Supabase (creates `cbd_expo_push_tokens`).
2. Deploy the sender: `supabase functions deploy send-native-push --project-ref nqbonrcmbhjutlrpjfpk`
3. Give EAS your Android push credentials so the build can receive FCM messages:
   `eas credentials` → Android → Push Notifications (FCM V1) → upload the service
   account key from your Firebase project (Firebase console → Project settings →
   Service accounts → Generate new private key). This is a one-time step like the
   keystore.

The app registers a device token on launch and saves it; both the mobile and web
apps call `send-native-push` on every notification, so native devices get an OS
notification wherever the change was made.

### Verifying the roster engine

```bash
cd scripts/xcheck && ./run.sh   # expects "132 checks, 0 mismatches"
```

Re-run after changing `src/lib/rosterCompute.ts` or the web app's roster logic.

## Project layout

```
mobile/
  App.tsx                 auth gate: Login vs Main
  app.json                Expo config (name, package, version, icons)
  eas.json                EAS build profiles (APK output)
  src/
    Main.tsx              loads profile once; bottom tabs (Today/Calendar)
    lib/
      config.ts           Supabase keys, app version, release URL
      supabase.ts         Supabase client (AsyncStorage session)
      types.ts            DB row + settings types
      format.ts           date/time helpers (formatDate matches the web app)
      rosterCompute.ts    the roster engine, ported from index.html (pure)
      data.ts             loads a month into a RosterContext for the engine
      roster.ts           small display helper (role label)
      notify.ts           emit notifications (mirrors the web app)
    theme.ts              colours mirrored from the web app
    screens/
      LoginScreen.tsx
      HomeScreen.tsx      the Today tab
      CalendarScreen.tsx  the Calendar tab (month grid)
    components/
      UpdateBanner.tsx    self-update check
      DayDetailSheet.tsx  per-day roster + class/roster editors
  scripts/
    xcheck/               cross-checks rosterCompute.ts against the web app
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

1. **Set the version name** in `app.json` → `expo.version`, using semver: patch
   (`1.3.0`→`1.3.1`) for small fixes, minor (`→1.4.0`) for features, major
   (`→2.0.0`) for big/breaking changes. The app reads this at runtime (see
   `src/lib/version.ts`), so there's nothing to keep in sync by hand.
   The Android `versionCode` is auto-incremented by EAS on every build
   (`appVersionSource: remote` + `autoIncrement` in `eas.json`) — don't hand-edit it.
2. **Build** the APK (above) and download it.
3. **Assemble `site/`:**
   - Copy the APK into `site/` as `cbd-college-scheduler.apk`.
   - Update `site/version.json`:
     - `versionName` → this build's version (the update check compares this, as semver)
     - `size` → the APK's byte size
     - `sha256` → `sha256sum cbd-college-scheduler.apk` (lower-case hex)
     - `notes` → short "what's new"
     - `published` → an ISO timestamp
4. **Deploy `site/`** to your host (e.g. Cloudflare Pages, Netlify). Point
   `RELEASE_BASE_URL` in `src/lib/config.ts` at that URL before building, so the
   in-app update check and the download button target the right place. The
   `_headers` file makes `version.json` uncacheable and serves the APK with the
   right content-type (works on Cloudflare Pages / Netlify).

Installed apps check `version.json` on launch; when its `versionName` is a newer
semver than the running build, the update banner links users to the download page.

## Configuration notes

- **Supabase keys** in `config.ts` are the URL + *publishable (anon)* key — the
  same ones the web app ships. They're safe in a client; Row Level Security
  protects the data.
- The app version is read at runtime (`src/lib/version.ts` → `APP_VERSION`, from
  the build's `expo.version`), so there's nothing to keep in sync in `config.ts`.
