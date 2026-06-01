# The Postbox — CLAUDE.md

Claude Code context file. Keep this up to date after every session.

---

## What This App Is

**The Postbox** is an iOS-first newsletter reader app. It connects to a user's Gmail account via OAuth2, identifies newsletter emails from approved senders, and presents them in a clean reading experience — separate from the chaos of a regular inbox.

**Core value prop:** A dedicated, distraction-free inbox for newsletters only, with push notifications when new issues arrive.

---

## Architecture

Monorepo with two independently deployable pieces:

```
Newsletter Reader/
├── backend/           # Node.js/Express server — handles Gmail API, auth, DB
├── mobile/            # React Native (Expo bare workflow) — iOS app
├── db/init.sql        # PostgreSQL schema (run once on a fresh DB)
└── docker-compose.yml # Spins up local PostgreSQL for development
```

### How the pieces connect

```
Mobile App (React Native)
  │── Google OAuth2 (PKCE) ──▶ Google
  │── POST /login (idToken + authCode) ──▶ Backend
  │                                          │── verifies token with Google
  │                                          │── stores refresh token in DB
  │                                          └── returns app JWT
  │
  │── All subsequent API calls use JWT ──▶ Backend ──▶ PostgreSQL
  │
  └── Push notifications ◀── Firebase/APNs ◀── Backend (on new email)
                                                   ▲
                                            Gmail Pub/Sub (real-time ping)
```

### Real-time email flow

1. User connects Gmail → backend calls Gmail Watch API
2. New email arrives → Gmail pings backend via Google Cloud Pub/Sub
3. Backend fetches only the sender metadata
4. If sender is in user's subscription list → fetch full email, save to DB, push notification
5. Otherwise → ignore (privacy-first)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native 0.79.5 + Expo SDK 53 |
| Mobile language | TypeScript |
| Mobile state | React Context API (AuthContext, MessagesContext, SubscriptionContext) |
| Mobile navigation | React Navigation v7 |
| Mobile storage | expo-secure-store (JWT), expo-file-system (HTML cache) |
| Mobile build | EAS Build (cloud iOS builds — works from Windows) |
| Backend runtime | Node.js ≥18 |
| Backend framework | Express 5 |
| Database | PostgreSQL 15 |
| Email integration | Gmail API via `googleapis` + Google Cloud Pub/Sub |
| Push notifications | Firebase Admin SDK → APNs/FCM |
| Auth | Google OAuth2 + PKCE → custom JWT |
| Backend hosting | Fly.io (migrating from Railway — see checklist) |
| Testing (backend) | Jest + Supertest |
| Testing (mobile) | Jest + React Native Testing Library |

---

## Database Schema (key tables)

| Table | Purpose |
|---|---|
| `users` | Google profile, stored refresh token, scan status |
| `senders` | Newsletter publishers identified by `List-Unsubscribe` header |
| `messages` | Individual newsletter emails (body_html stored here) |
| `subscriptions` | User↔sender M2M, `is_active` flag |
| `devices` | FCM/Expo push tokens per user |

---

## Key Files

| File | Purpose |
|---|---|
| `backend/index-postgres.js` | Entire backend in one file (~99KB). All routes, auth middleware, Pub/Sub listener, push logic. |
| `mobile/src/screens/` | 9 screens: Login, Inbox, Detail, Saved, SenderManagement, Settings, Explore, ConnectedMailboxes, Home |
| `mobile/src/context/` | AuthContext, MessagesContext, SubscriptionContext |
| `mobile/src/api/client.ts` | Axios instance with JWT interceptors and auto-refresh on 401 |
| `mobile/src/services/cacheManager.ts` | Gzip-compressed HTML caching with 30-day auto-purge |
| `mobile/src/services/notifications.ts` | Expo push token registration and notification handlers |
| `mobile/src/theme.ts` | Centralized color palette (light/dark/sepia) |
| `db/init.sql` | Full PostgreSQL schema with triggers |
| `mobile/eas.json` | EAS build profiles (development, preview, production) — root eas.json deleted, this is the only one |

---

## Development Setup

### Prerequisites
- Node.js ≥ 18
- Docker Desktop (for local PostgreSQL)
- Expo account (for EAS builds)
- Apple Developer Program membership (for device installs)

### Local dev

```bash
# 1. Start PostgreSQL — use the existing named container, NOT docker-compose up
#    (docker-compose up creates a new container; the data lives in newsletter-reader-postgres)
docker start newsletter-reader-postgres

# 2. Start backend (in one terminal)
cd backend && npm start

# 3. Start mobile dev server (in another terminal)
#    Metro reads mobile/.env for EXPO_PUBLIC_API_URL (local IP, never commit this file)
cd mobile && npx expo start --lan

# 4. Connect dev client on iPhone
#    Open The Postbox (Dev) → enter http://<your-laptop-LAN-IP>:8081
#    Find your LAN IP with: ipconfig | findstr "192.168"
#    NOTE: laptop IP changes — update mobile/.env if connection fails

# 5. Run tests
cd backend && npm test
cd mobile && npm test
```

### Docker containers — what exists

| Container | Use | Status |
|---|---|---|
| `newsletter-reader-postgres` | **The Postbox** — has full schema + data | ✅ Keep, use this one |
| `newsletter-postgres` | Old duplicate — no user data | 🗑 Delete |
| `postgres-dev` | Old duplicate — empty DB | 🗑 Delete |
| `languagelearning-*` | Dutch vocab app (different project) | Leave as-is |

### Build for iOS device (dev build — installs directly, no TestFlight needed)

```bash
cd mobile
npx eas build --profile development --platform ios
```

### Deploy backend to Fly.io (see Phase 3 in checklist)

```bash
fly deploy
```

---

## Environment Variables

Backend `.env` keys (see `.env` file in root):
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — App JWT signing key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth2 credentials
- `GOOGLE_CLOUD_PROJECT` — GCP project for Pub/Sub
- `FIREBASE_PROJECT_ID` + `serviceAccountKey.json` — Push notifications

Mobile API URL is controlled via `EXPO_PUBLIC_API_URL` in `mobile/eas.json` per build profile.
- development / preview / production → `https://the-postbox-backend.fly.dev`
- Local Metro dev server → reads from `mobile/.env` (gitignored, set to your LAN IP)

`mobile/.env` (gitignored, machine-specific):
```
EXPO_PUBLIC_API_URL=http://192.168.18.x:3000
```

---

## Bundle Identifier & App Identity

- **App name:** The Postbox
- **iOS bundle ID:** `io.thepostbox.app` (registered in Apple Developer portal)
- **iOS OAuth Client ID:** iOS-specific client (NOT the web app client — caused `400 invalid_request` bug)

---

## Testing Conventions

- All new features need tests before committing
- Backend: `jest + supertest` against real endpoint logic
- Mobile: `jest + react-native-testing-library`, mocked `apiClient`
- `testID` props on key UI elements for stable test selectors
- Mobile has a known peer dep conflict with `react-test-renderer` — fixed by pinning to `18.2.0`

---

## Current Status (as of 2026-05-29)

### What's done

| Area | Status |
|---|---|
| Google Sign-In (OAuth2 + PKCE) | ✅ |
| JWT auth + auto-refresh | ✅ |
| Gmail Pub/Sub real-time pipeline | ✅ |
| Inbox screen (SectionList, pull-to-refresh) | ✅ |
| Detail screen (WebView, HTML rendering) | ✅ |
| Dark/light/sepia themes with CSS injection | ✅ |
| Offline caching (gzip-compressed HTML) | ✅ |
| Push notifications (Firebase + APNs) | ✅ |
| Sender subscription management | ✅ |
| Settings screen | ✅ |
| Login screen with animations + haptics | ✅ |
| Bottom nav consistency | ✅ |
| EAS build configuration | ✅ |
| Project cleanup (removed Railway files, duplicate eas.json, old scripts) | ✅ |
| API URL refactored to env var (`EXPO_PUBLIC_API_URL`) | ✅ |
| Dev build (development profile) installed on device | ✅ |
| Dev build running with local Metro + local backend | ✅ |
| Security incident resolved (credentials rotated, history cleaned) | ✅ |

### Active work (next up)

| Area | Status | Notes |
|---|---|---|
| Backend migration: Railway → Fly.io | ✅ | Live at https://the-postbox-backend.fly.dev |
| Preview build (standalone, no Metro needed) | ✅ | **FIXED (Build 12 `8b16df25`, 2026-05-30). App renders on device — black screen gone.** Root cause was bare-but-managed mismatch (prebuild skipped → plugins never ran since Build 5); fixed by migrating to CNG/prebuild + UNTRACKING `ios/` + Sentry version downgrade. See root cause analysis below. Branch `fix/eas-preview-bare-ios` — ready to merge. |
| iOS design audit & polish | ☐ | **NEXT.** App now launches on device but has functional/UI issues to triage (post-black-screen). |
| TestFlight beta distribution | ☐ | After design polish |
| CI/CD pipeline | ☐ | EAS + GitHub Actions (copy pattern from SafariTTS) |

### Preview build — failure root cause & fix (2026-05-29)

The first preview build (`21d54126-e172-45b9-ad0c-cce8a5b2f8ed`) failed after ~11s at the Pre-install phase. Investigation in the next session found **two real root causes**, both exposed by the submodule→directory conversion (commit `fa4482a`):

1. **The native `ios/` directory was untracked AND gitignored.** This is a BARE workflow project (`mobile/ios/mobile/Info.plist` is authoritative), so EAS needs the native `ios/` dir. But `mobile/.gitignore` ignores `ios/` and `android/` (lines 82-83), and `git ls-files mobile/ios` returned 0 files. When mobile was a submodule, `ios/` was presumably committed in the submodule; after the conversion it became untracked. EAS got NO native project → pre-install failed. **This was the primary cause.**

2. **Root `package.json` declared npm `workspaces` (`backend`, `mobile`).** Since the git root is the monorepo root, EAS detected the workspace root and uploaded the whole monorepo, running `npm install` at the root (where `backend`'s server deps live and the `mobile` `eas-build-pre-install` hook doesn't apply).

**The fix (applied 2026-05-29):**

- **Added `mobile/.easignore`.** When present, EAS uses it INSTEAD of `.gitignore` and copies the **working tree** (not the git archive), so the gitignored-but-on-disk `ios/` dir DOES get uploaded. The `.easignore` deliberately does NOT list `ios/`, but re-lists the usual excludes (`node_modules/`, `.env`, `ios/build/`, `ios/Pods/`, `android/`, etc.) since it replaces `.gitignore`. Verified: upload was 1.2 MB (ios source in, Pods/node_modules out).
- **Removed `workspaces` from root `package.json`** so EAS treats `mobile/` as a standalone project root (backend + mobile each have their own `package-lock.json`, so both still install independently). Also changed the root `test` script from `npm run test --workspaces` to `npm run test --prefix backend && npm run test --prefix mobile`.
- **Updated EAS CLI** `16.18.1` → `20.0.0`.

**`ios/` is now COMMITTED to git** (branch `fix/eas-preview-bare-ios`, removed from `.gitignore`). This is what makes EAS resolve a bare build and skip prebuild. Verified no secrets in `ios/` (the Google OAuth client ID in `Info.plist` is a public iOS client ID, not a secret). Do NOT re-add `ios/` to `.gitignore`.

**Build progressed one phase per fix (each failure was a different, later phase):**
- Build 1 `21d54126` → failed PRE-INSTALL (~11s) — old monorepo/workspaces config.
- Build 2 `53ceee55` → failed PREBUILD — `ios/` gitignored ⇒ EAS ran managed prebuild, which crashed on missing `Supporting/Expo.plist` and would have clobbered the custom `Info.plist`.
- Build 3 `0fde6073` → PREBUILD SKIPPED (bare worked!), failed INSTALL_PODS — Podfile `use_native_modules!` needs `@react-native-community/cli`, which was missing (it had been hoisted under npm workspaces; dropping workspaces exposed it was never a direct dep). Fixed by adding `@react-native-community/cli` + `cli-platform-ios` + `cli-platform-android` @ `18.0.1` to mobile devDeps. Verified locally: `node -e "process.argv=['','','config'];require('@react-native-community/cli').run()"` emits valid autolinking JSON.
- Build 4 `10a5f982` → COMPILE + ARCHIVE + CODESIGN succeeded, failed at fastlane EXPORT: `exportArchive requires a provisioning profile / No provisioning profile provided`. Cause: `Info.plist` hardcoded `CFBundleIdentifier = io.thepostbox.dev` while the Xcode project, EAS credentials, and the AdHoc provisioning profile all use `io.thepostbox.app`; the export options only had a profile for `io.thepostbox.app`, so the app's real bundle ID didn't match. Fixed by setting `CFBundleIdentifier` to `$(PRODUCT_BUNDLE_IDENTIFIER)` (RN-standard) so it resolves to `io.thepostbox.app`.
- Build 5 `ee3d5d3f` → ✅ FINISHED. But app showed as "mobile" on home screen and was blank on launch.
- Build 6 `bb57df86` → CANCELLED (intentional — spotted another bug before compile).
- Build 7 `b17f7ccf` → ✅ IPA builds and installs, named "The Postbox" — but blank/black screen on launch.
- Build 8 `38737d54` → Added ErrorBoundary + Sentry. Still black screen. Sentry.wrap() identified as cause (see below).
- Build 9 `3896dc07` → Fixed Sentry.init() always called. Still black screen — Sentry.wrap() still present.
- Build 10 `9046e569` → ✅ FINISHED but **STILL BLACK**. Removed Sentry.wrap() — this DISPROVED the Sentry-wrap theory.
- Build 11 `430d1994` → ✅ FINISHED but prebuild was **SKIPPED** ("the ios directory already exists"). `.easignore` excludes `ios/` from the upload but EAS resolves managed-vs-bare by whether `ios/` is **git-TRACKED**. So CNG didn't take effect.
- Build 12 `8b16df25` → ✅ FINISHED, **prebuild RAN** (`✔ Finished prebuild`, codegen + autolinking for all native modules, Google OAuth scheme present in the generated app). First standalone build ever produced from a real prebuild. **← install this one.**

⚠️ **KEY LESSON:** to switch a project from bare → CNG for EAS, adding `ios/` to `.easignore` is NOT enough. EAS decides the workflow by checking if `ios/` is git-tracked. You must **untrack it** (`git rm -r --cached mobile/ios`) and gitignore it (mirroring how `android/` was already handled). Done in commit `6c3498e`; `mobile/ios` removed from disk + git, `ios/` added to `mobile/.gitignore`.

**Black screen root cause — CORRECTED (2026-05-30, session 3):**

⚠️ The earlier "`Sentry.wrap()` is the root cause" conclusion was WRONG. Proof: **Build 5 and Build 7 were already blank, and both predate Sentry** (Sentry was first added in Build 8). Build 10 removed `wrap()` and was still blank. The standalone build has been blank since the first IPA that compiled (Build 5) — it has **never once rendered**.

**Actual root cause: the project was in a broken "bare-but-authored-as-managed" state.** Evidence from Build 10's EAS log (`expo-doctor`):
> "This project contains native project folders but also has native configuration in app.config.js… EAS Build will **not sync**: `scheme`, `ios`, `plugins`."

Because a committed `ios/` folder was uploaded, EAS **skipped prebuild**, so every config plugin in `app.config.js` (expo-notifications, expo-font, expo-secure-store, expo-build-properties) plus the `ios`/`scheme` config **never ran**. Pods autolinked (so the JS modules existed), but the native configuration those plugins inject was absent, and `newArchEnabled`/`deploymentTarget` were no-ops. The JS bundle was fine — Build 10's log shows `main.jsbundle` built, Hermes-compiled and embedded correctly, so packaging was never the problem. Also surfaced by `expo-doctor`: **`@sentry/react-native@8.13.0` is incompatible with Expo SDK 53** (expects `~6.14.0`) — a second, independent failure on Builds 8–10.

**The fix (session 3, 2026-05-30):**
1. **Converted to CNG / managed prebuild.** `mobile/.easignore` now EXCLUDES `ios/` and `android/` → EAS runs `expo prebuild` on the server and generates the native projects from `app.config.js`. No Mac needed. (This reverses the Build-1 era decision to upload `ios/`.)
2. **Ported all hand-edited native config into `app.config.js`**: Google OAuth reversed-client-ID URL scheme, App Transport Security (HTTPS-only + local networking), bundle ID `io.thepostbox.app` (unchanged, to reuse existing credentials + Google OAuth client), deployment target 15.6, `newArchEnabled: false` (matches the old architecture the app has always run on — avoid changing arch in the same fix).
3. **Downgraded `@sentry/react-native` 8.13.0 → ~6.14.0** and wrapped `initSentry()` in try/catch (it runs at module-load, OUTSIDE the ErrorBoundary, so an uncaught throw there blanks the app).
4. Gave the loading `View` a theme background color (was transparent → transient black).

**Bundle ID:** `app.config.js` sets `io.thepostbox.app` for ALL variants (dev/preview/prod share it for now) so EAS credentials + the Google iOS OAuth client are reused unchanged. Splitting dev/prod IDs later needs new credentials + a matching Google OAuth client (tech debt).

**The committed `ios/` folder is now UNUSED** (excluded from upload via `.easignore`; prebuild regenerates it fresh). It can be `git rm -r`'d later for cleanliness — left in place for now as a reference/rollback point. Do not hand-edit it expecting changes to ship.

`ios/Podfile.lock` is still not committed (can't run `pod install` on Windows). EAS generates it on the server; not a blocker.

**Reading EAS build logs without a Mac / from the CLI:** there is no `eas build:logs` command. Fetch logs via the GraphQL API at `https://api.expo.dev/graphql` using the session secret from `~/.expo/state.json` (`auth.sessionSecret`, sent as the `expo-session` header). Query `builds{byId(buildId:$id){status error{message} logFiles}}` — `logFiles[0]` is a signed GCS URL (expires ~15 min) to the newline-delimited JSON build log. A poller script lives at `~/eas-poll.js`.

### Backlog

| Area | Notes |
|---|---|
| App Store submission | Needs icons, screenshots, App Store Connect setup |
| Inbox UI polish (filters, unread badge) | Step 5.4 in roadmap |
| Branding & App Store assets | Step 5.6 |
| E2E smoke tests | Step 7.1 |
| Analytics & monitoring | Firebase Analytics + crash reporting |
| Search within newsletters | Nice-to-have |
| Sender-based grouping view | Nice-to-have |
| Discover/explore feed | Nice-to-have |

---

## Post-MVP Auth Enhancements (backlog)

- Device management / remote logout
- Multi-provider OAuth (Outlook, Apple Sign-In)
- Rate limiting on auth endpoints
- Audit logging / suspicious activity detection

---

## Important Gotchas

### iOS / EAS Build
1. **iOS build from Windows:** Must use EAS Build (cloud). Cannot run `pod install` locally. Any native config changes (Info.plist, entitlements, etc.) require a new EAS build.
2. **OAuth Client ID must be iOS type:** Using a web-type client ID causes `400 invalid_request` during sign-in. The iOS client ID is in `mobile/src/config/app.config.ts`.
3. **Bundle ID lives in `app.config.js` (CNG):** since session 3 the native `ios/` is regenerated by prebuild, so `app.config.js` is authoritative. All variants currently build `io.thepostbox.app` (shared, to reuse EAS credentials + Google OAuth client). The Google iOS OAuth reversed-client-ID URL scheme is set in `ios.infoPlist.CFBundleURLTypes` — do not drop it or OAuth login breaks.
4. **Dev build ≠ standalone app:** The `development` EAS profile requires Metro bundler running on your laptop. Use `preview` profile for a standalone build.
5. **EAS `eas.json` lives in `mobile/`:** The root `eas.json` was deleted (it was a duplicate). Only `mobile/eas.json` is used.
6. **CNG / managed prebuild (since session 3) — native `ios/`/`android/` are GENERATED, not stored.** EAS runs `expo prebuild` and creates them from `app.config.js` on the build server. ⚠️ A hand-edited `ios/` folder is IGNORED — **all native config (Info.plist keys, URL schemes, entitlements, architecture) MUST live in `app.config.js`.** Do not commit or hand-edit `ios/`.
7. **🔑 To make EAS run prebuild, `ios/` must be UNTRACKED in git — `.easignore` is NOT enough.** EAS resolves managed-vs-bare by whether `ios/` is git-tracked; if tracked, it logs "Skipped running expo prebuild because the ios directory already exists" and you get a bare build with NONE of your plugins applied (this was the black-screen root cause for Builds 5–11). `mobile/.gitignore` now ignores `ios/` and `android/`, and `.easignore` also excludes them from upload. Never `git add` `mobile/ios`. Verify a real prebuild ran by grepping the build log for `✔ Finished prebuild` (good) vs `Skipped running .expo prebuild.` (bad).
8. **Verify standalone behavior on a real prebuild, not the bare cache.** The bare build (Builds 5–11) NEVER rendered, so anything "tested" on those was meaningless. The first build that actually exercised the app standalone was Build 12 (CNG). Don't trust a green IPA = working app; install and launch it.
9. **Root `package.json` no longer uses npm `workspaces`:** Removed so EAS treats `mobile/` as a standalone project root. Backend + mobile each manage their own `node_modules`/`package-lock.json`. Run tests per-package or via the root `test` script (`--prefix backend` / `--prefix mobile`).

### Local Development
6. **Local IP changes between sessions:** Metro and the backend use your LAN IP. Run `ipconfig | findstr "192.168"` to get current IP and update `mobile/.env` before starting Metro.
7. **Docker: don't use `docker-compose up` for day-to-day dev:** It creates new containers. Instead use `docker start newsletter-reader-postgres` to resume the existing container that has your data.
8. **Port 8081 may be held by a previous Metro process:** If Metro hangs on "Starting Metro Bundler", check with `netstat -ano | findstr :8081` and kill the process with PowerShell: `Stop-Process -Id <PID> -Force`.
9. **Metro tunnel requires `@expo/ngrok`:** `npx expo start --tunnel` prompts to install it in non-interactive mode. Use `--lan` instead (works fine on same WiFi).

### Backend / Fly.io
10. **Fly.io secrets with credentials are blocked by Claude's classifier:** Commands like `flyctl secrets set JWT_SECRET=...` containing real credentials must be run manually in your own terminal, not through Claude.
11. **Backend Dockerfile uses `npm install` not `npm ci`:** The backend has its own `package-lock.json` that gets out of sync with the root workspace installs. `npm ci` fails in Docker; `npm install` is the safe choice.
12. **Backend loads `.env` from parent directory:** `require('dotenv').config({ path: '../.env' })`. On Fly.io the file doesn't exist — that's fine, it silently falls back to process.env (the Fly secrets). No code change needed.
13. **Firebase falls back to file if env var missing:** If `FIREBASE_SERVICE_ACCOUNT_KEY` is not set, the backend tries to load `./serviceAccountKey.json`. On Fly.io the secret must be set as a compact JSON string.

### Database
14. **Legacy `received_at` format:** Old DB rows stored epoch milliseconds; new rows store ISO strings. The `parseDate` utility in `InboxScreen.tsx` handles both.
15. **Three PostgreSQL containers exist locally** — only `newsletter-reader-postgres` is correct (has full schema + data). `newsletter-postgres` and `postgres-dev` are empty duplicates from earlier sessions.

### Security — Credentials
16. **Never commit credential files to git:** `serviceAccountKey.json` was accidentally committed and found by Google/GitHub scanners (2026-05-29 incident). Required full history rewrite + credential rotation. The `.gitignore` already covers `serviceAccountKey.json` and `.env` — never `git add -f` these.
17. **Firebase service account changed (2026-05-29):** Old `newsletter-backend-service` SA was deleted. New SA is `firebase-adminsdk-fbsvc@newsletter-reader-app.iam.gserviceaccount.com`. Key is stored as `FIREBASE_SERVICE_ACCOUNT_KEY` Fly.io secret (compact JSON string).
18. **`backend/index.js` exists in old git history with hardcoded OAuth credentials:** This is the pre-PostgreSQL backend, replaced by `index-postgres.js`. It's not in the working tree. The OAuth secret it contained has been rotated (2026-05-29). History can be cleaned with `git filter-repo --path backend/index.js --invert-paths --force` + force push if desired.

### Debugging "works in dev, broken only in the standalone/release build"
27. **Diagnostic playbook for standalone-only failures (black screen, crash on launch):** lessons from the Build 5–12 saga —
    - **Bisect by git history first.** The black screen was blamed on Sentry for 3 builds; one look at the history showed Builds 5 & 7 were already broken *before* Sentry existed. Find the FIRST broken build and see what was/wasn't present then — it instantly exonerates later additions.
    - **Confirm the JS bundle is even loaded before theorizing about JS.** Grep the EAS log for `Writing bundle output` + `hermesc … main.jsbundle`. In our case the bundle was always built and embedded fine, which ruled out an entire class of causes (and meant it was a runtime/native/config issue, not packaging).
    - **Read `expo-doctor` output in the build log.** It literally printed the root cause ("EAS Build will not sync: scheme, ios, plugins") and the Sentry version incompatibility. It's a non-fatal phase, so the build still "succeeds" — but its warnings are gold.
    - **The React `ErrorBoundary` canNOT catch module-load-time errors or native crashes** — only render/lifecycle errors of its descendants. A blank screen with no error UI means the failure is *outside* React (module eval, native init, or no JS running at all). Anything run at module top-level (e.g. `initSentry()`) is outside the boundary — wrap it defensively.
    - **Get EAS logs without a Mac** via the GraphQL API (see below); a real-prebuild check is `✔ Finished prebuild` vs `Skipped running .expo prebuild.`.

### Crash Reporting (Sentry)
22. **Sentry auth token is in `mobile/.env` as `SENTRY_AUTH_TOKEN`.** Use it to query events directly without needing the browser. Node snippet (works in any session):
    ```js
    // node --input-type=module
    const TOKEN = process.env.SENTRY_AUTH_TOKEN; // or paste from mobile/.env
    const get = async path => (await fetch(`https://sentry.io/api/0${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
    // List issues:  get("/projects/sid-design/react-native/issues/?limit=10&query=is:unresolved")
    // Event detail: get(`/organizations/sid-design/issues/${id}/events/?limit=1&full=true`)
    ```
    Org: `sid-design` | Projects: `react-native` (mobile), `the-postbox-backend` (backend) | Dashboard: https://sid-design.sentry.io

23. **Sentry version MUST match Expo SDK (`~6.14.0` for SDK 53).** `@sentry/react-native@8.x` is incompatible with Expo 53 and was a red herring in the black-screen saga (session 3 downgraded 8.13.0 → 6.14.0). Run `npx expo install --check` after any Sentry bump. `Sentry.init()` only (NOT `Sentry.wrap()`); `initSentry()` runs at module-load (outside the ErrorBoundary) so it is wrapped in try/catch — keep it that way. See `mobile/src/services/sentry.ts`.
23. **Sentry DSN is in `mobile/eas.json`** (preview + production profiles). If you rotate the DSN, update both profiles. The dev profile intentionally has no DSN (uses Metro error overlay instead).
24. **Backend Sentry DSN must be a Fly.io secret:** `flyctl secrets set SENTRY_DSN="<dsn>" --app the-postbox-backend`. The DSN itself (`https://ddd761b473877c4f840cb143a3be1719@o4511480100880384.ingest.de.sentry.io/4511480141185104`) is safe to store in docs — it's a public client identifier, not a secret.
25. **Sentry dashboard:** `sid-design.sentry.io` — two projects: `react-native` (mobile) and `the-postbox-backend` (Node.js/Express).
26. **Backend structured logging uses Pino.** JSON output — readable in `flyctl logs`. Pipe through `npx pino-pretty` locally for human-readable output: `node index-postgres.js | npx pino-pretty`. Existing logging function signatures (logAuth, logError, etc.) are unchanged — only their implementations now use pino.

### Git / Repository
19. **`mobile/` was a submodule with no remote:** Converted to a regular directory in the root repo. All mobile code now lives in one repo, one push covers everything.
20. **Backend is one file:** `backend/index-postgres.js` is intentionally monolithic (~99KB). All routes, auth, Pub/Sub, push logic lives there.
21. **Pub/Sub ping privacy:** The Gmail Pub/Sub notification contains no email content — only a ping. The backend fetches sender metadata separately via Gmail API.
