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
| Preview build (standalone, no Metro needed) | ☐ | **ATTEMPTED — failed. See investigation notes below before retrying.** |
| iOS design audit & polish | ☐ | After preview build — need to see it on device to judge |
| TestFlight beta distribution | ☐ | After design polish |
| CI/CD pipeline | ☐ | EAS + GitHub Actions (copy pattern from SafariTTS) |

### Preview build — failure investigation notes

A preview build was attempted on 2026-05-29 (build ID `21d54126-e172-45b9-ad0c-cce8a5b2f8ed`) and failed after only ~11 seconds with: `Unknown error. See logs of the Pre-install hook build phase for more information.`

**Before starting the next preview build attempt, investigate these root causes in order:**

1. **EAS CLI is significantly outdated:** Local version is `16.18.1`, latest is `20.x`. Run `npm install -g eas-cli@latest` first. This version gap is the most likely cause of the failure.

2. **Mobile was recently converted from git submodule to regular directory (commit `fa4482a`):** Previously, running `eas build` from `mobile/` uploaded only the `mobile/` submodule's git context. Now it uploads the entire root monorepo (including `backend/`, `db/`, etc.) as the git context. EAS may be confused about the project root. Consider adding a `mobile/.easignore` file to exclude non-mobile files from the upload.

3. **`ios/Podfile.lock` is not committed:** For bare workflow, `Podfile.lock` is normally committed so EAS uses pinned pod versions. It's missing because it was never generated after the submodule conversion. This won't cause a pre-install failure but will cause slower/less predictable pod installs. Cannot be fixed on Windows (needs `pod install` on a Mac) — EAS will generate it on the server.

4. **Check the full build logs** at https://expo.dev/accounts/sid-design/projects/newsletter-reader — look at the failed build's detailed log output to see the exact error in the pre-install phase.

5. **The `eas-build-pre-install` script** in `mobile/package.json` is `npm config set legacy-peer-deps true`. This should not fail, but verify it's running in the correct directory context after the monorepo restructure.

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
3. **Bundle ID hardcoded in `Info.plist`:** EAS ignores `app.json` when a native `ios/` directory exists. `mobile/ios/mobile/Info.plist` is the authoritative source. Dev/preview builds use `io.thepostbox.dev`; production uses `io.thepostbox.app`.
4. **Dev build ≠ standalone app:** The `development` EAS profile requires Metro bundler running on your laptop. Use `preview` profile for a standalone build.
5. **EAS `eas.json` lives in `mobile/`:** The root `eas.json` was deleted (it was a duplicate). Only `mobile/eas.json` is used.

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

### Git / Repository
19. **`mobile/` was a submodule with no remote:** Converted to a regular directory in the root repo. All mobile code now lives in one repo, one push covers everything.
20. **Backend is one file:** `backend/index-postgres.js` is intentionally monolithic (~99KB). All routes, auth, Pub/Sub, push logic lives there.
21. **Pub/Sub ping privacy:** The Gmail Pub/Sub notification contains no email content — only a ping. The backend fetches sender metadata separately via Gmail API.
