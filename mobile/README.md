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

## What's built so far

**M1 — foundation**
- Expo (SDK 57) + TypeScript project.
- Supabase client with session persisted in `AsyncStorage` (stays logged in).
- **Login** (name or email + password — a bare name resolves to
  `@cbdcollege.edu.au`, same as the web app).
- **Today** screen: your profile, today's class numbers (AM/PM), who's rostered
  today, and recent notifications (trainers see all; assistants see their own).
- Self-update banner that reads the published `version.json`.

**M2 — roster calendar + availability editing**
- Bottom tabs: **Today** and **Calendar**.
- **Calendar**: month grid with per-day AM/PM student numbers and coloured dots
  for rostered staff; tap a day for its detail.
- **Day detail** sheet: the day's classes and full roster.
- **Assistant self-availability**: assistants set Available / Not available (with
  an optional note) per day, which writes `cbd_assistant_availability` and
  notifies the trainers — exactly like the web app, including the 14-day lock on
  marking yourself unavailable. Their own availability is marked on the calendar.

**M3 — auto-roster, classes/students, trainer editing**
- The calendar, Today screen and day detail now show the **fully computed** roster,
  not just saved rows: the web app's resolution logic (weekend head-trainer
  rotation, head-trainers-are-full-time, assistant scaling by student numbers,
  public holidays, per-DOW priorities/exclusions/rotation) is ported to
  `src/lib/rosterCompute.ts` and drives every screen.
- Class numbers (AM/PM + capped) are computed with the same 0/0 and per-DOW
  default rules as the web app.
- **Trainers** can, from a day's detail sheet: edit that day's class numbers, and
  pin the day's roster by toggling staff on/off. Both notify the affected staff.
- The port is verified against the real web app: `scripts/xcheck/run.sh` diffs the
  TS engine's output against `index.html`'s own functions across a battery of
  dates/scenarios (currently 132 checks, 0 mismatches).

Later milestones add native push notifications, a richer notification detail view,
and admin/exports.

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
