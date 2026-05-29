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

### Active work (next up)

| Area | Status | Notes |
|---|---|---|
| Backend migration: Railway → Fly.io | ✅ | Live at https://the-postbox-backend.fly.dev |
| Preview build (standalone, no Metro needed) | ☐ | After Fly.io migration; update URL in eas.json first |
| iOS design audit & polish | ☐ | After preview build — need to see it on device to judge |
| TestFlight beta distribution | ☐ | After design polish |
| CI/CD pipeline | ☐ | EAS + GitHub Actions (copy pattern from SafariTTS) |

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

1. **iOS build from Windows:** Must use EAS Build (cloud). Cannot run `pod install` locally. Any native config changes require a new EAS build.
2. **OAuth Client ID must be iOS type:** Using a web-type client ID causes `400 invalid_request` during sign-in.
3. **Bundle ID hardcoded in `Info.plist`:** EAS was ignoring `app.json` because a native `ios/` directory exists. The value in `ios/mobile/Info.plist` is authoritative.
4. **Legacy `received_at` format:** Old DB rows stored epoch milliseconds; new rows store ISO strings. The `parseDate` utility in `InboxScreen.tsx` handles both.
5. **Backend is one file:** `backend/index-postgres.js` is intentionally monolithic (~99KB). All logic lives there for now.
6. **Pub/Sub ping privacy:** The Gmail Pub/Sub notification contains no email content — only a notification that mail arrived. The backend fetches sender metadata separately.
