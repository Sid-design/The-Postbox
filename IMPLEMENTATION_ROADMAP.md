# 📬 Newsletter Reader — Implementation Roadmap

This roadmap outlines **the exact sequence of steps** we will follow to turn incoming newsletter e-mails into a polished mobile reading experience with real-time notifications.

Use the check-boxes to track progress (`☐` = not started, `⧗` = in progress, `✅` = done). Each step lists its purpose, key tasks, and expected deliverables.

---

## 0️⃣  Project Foundations

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 0.1 | Repository & Tooling | • Initialize Git repo<br>• Add `.gitignore`, `prettier`, `eslint` (or flake8 if Python)<br>• Configure CI (GitHub Actions) to run lint/tests | Clean repo with CI badge | ✅ |
| 0.2 | Documentation Starter | • Add this roadmap file<br>• Create `/docs` folder for future ADRs | Docs scaffolding | ✅ |

---

## 1️⃣  Build & Deployment Setup

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 1.1 | Cloud Build Strategy | • Decide on iOS build strategy (EAS Build)<br>• Document prerequisites (Apple Developer Program)<br>• **NOTE:** Detailed workflow for device testing added to main `README.md`. | Decision in `README.md` | ✅ |
| 1.2 | EAS Integration | • Integrate Expo package into project<br>• Configure `eas.json` and `app.json`<br>• Install `expo-dev-client` | Project configured for EAS | ✅ |
- | 1.3 | First Development Build | • Trigger first iOS build on EAS<br>• Install custom development client on device<br>• **Completed:** After extensive troubleshooting. | Working dev client | ✅ |
- | 1.4 | User Authentication | • Implement Google Sign-In<br>• Backend token exchange<br>• Secure JWT storage | User can log in | ✅ |

---

## 2️⃣  Backend ‑ Phase 1 (MVP Data Pipeline)

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 2.1 | Select Tech Stack | • Choose language (Node, Python, Go)<br>• Pick framework (Express / FastAPI / Flask / Fiber) | Decision noted in `docs/ADR-001-stack.md` | ✅ |
| 2.2 | Database Schema | • Design tables: `messages`, `senders`, `devices`<br>• Add `users` and `subscriptions` tables | PostgreSQL schema in `backend/index-postgres.js` | ✅ |
| 2.3 | Mail Integration (Gmail) | • ~~GCP Config (APIs, OAuth, Pub/Sub)~~<br>• ~~Implement backend OAuth flow~~<br>• ~~Code Pub/Sub listener~~ | Service that logs new message IDs | ✅ |
| 2.4 | Mail Integration (IMAP fallback) | • IMAP IDLE listener with reconnect logic | IMAP poller service | ☐ |
| 2.5 | Message Fetch & Parse | • Fetch RFC822 using message ID<br>• Extract `senderName`, `subject`, `bodyHtml`<br>• Save to DB based on subscription | Parsed record in DB | ✅ |
| 2.6 | Sender Identification | • Scan for `List-Unsubscribe` header<br>• Store unique senders for user review<br>• **Refactored from old label logic** | List of potential senders | ✅ |

---

## 3️⃣  Mobile App ‑ Phase 1 (Scaffold & Core UI)

_React Native_ is assumed.

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 3.1 | Project Scaffold | • `npx react-native init`<br>• Configure dependencies | Runnable blank app | ✅ |
| 3.2 | App Structure & Navigation | • Define `Message` model<br>• Set up `react-navigation`<br>• Create `screens` directory | Base navigation wired | ✅ |
| 3.3 | Inbox List Screen | • `FlatList` with custom component<br>• Pull-to-refresh<br>• Unread badge | Functional list UI | ✅ |
| 3.4 | Detail Reader Screen | • Fetch `/messages/{id}`<br>• Render HTML<br>• Mark read on open | Reader view | ✅ |
| 3.5 | Unit Test Foundation | • Set up Jest & Testing Library<br>• Write initial tests for Inbox screen | Passing test suite | ✅ |
| 3.6 | Sender Management Screen | • Initial onboarding checklist<br>• Settings screen to manage senders | UI for subscription control | ✅ |
| 3.7 | Mobile Integration Tests | • Test navigation flows (Login → Inbox → Detail)<br>• Test state changes across components (e.g., pull-to-refresh) | Confident component interaction | ✅ |

---

## 4️⃣  Backend ‑ Phase 2 (External Interface)

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 4.1 | REST API | • GET `/messages` (paged)<br>• GET `/messages/{id}`<br>• PATCH `/messages/{id}/read`<br>• GET `/senders`, POST `/subscriptions` | API spec in OpenAPI (Swagger) | ✅ |
| 4.2 | Auth & Security | • Issue JWT per device/user<br>• Middleware to protect endpoints | Secure endpoints | ✅ |
| 4.3 | API Endpoint Tests | • Test all public and protected endpoints<br>• Verify correct error handling (401, 403, 404)<br>• Test data validation and edge cases | Robust & reliable API | ✅ |

---

## 5️⃣  Mobile App ‑ Phase 2 (Connecting & Polishing)

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 5.1 | Connect to API | • Fetch and display messages<br>• Implement "mark read"<br>• Connect Sender Management UI | Data-driven UI | ✅ |
| 5.2 | Dark Mode & Themes | • Implement `ThemeMode.system`<br>• Verify HTML rendering in dark | Themed UI | ✅ |
| 5.3 | App Store Assets | • Icons, splash, screenshots | Ready for TestFlight/Play | ☐ |
| 5.4 | Inbox UI Polish | • Add "Last Refreshed" header<br>• Add "Unread" filter<br>• Use timestamp on cards<br>• Support for images/emojis | Polished inbox UI | ☐ |
| 5.4.1 | Bottom Navigation Consistency | • Standardize icon sizes (20px)<br>• Consistent label font size (10px)<br>• Remove Subscriptions tab font size override<br>• Add proper theme colors and borders<br>• Fix white box background around icons<br>• Ensure consistent icon container heights<br>• Apply Mailbox screen styling to all tabs with explicit transparent backgrounds | Consistent navigation across all tabs | ✅ |
| 5.5 | Login Screen Design Enhancement | • Add modern branded interface with logo/icon<br>• Implement loading states and error handling UI<br>• Add smooth animations and transitions<br>• Support dark mode and responsive design<br>• Include privacy/security messaging<br>• Add haptic feedback and accessibility improvements | Professional login experience | ✅ |
| 5.6 | Branding & Asset Review | • Finalize logo design<br>• Review iconography and app store assets<br>• Polish UI text based on brand voice | Final visual identity | ☐ |

---

## 6️⃣  Push Notification Pipeline

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 6.1 | Firebase/APNs Setup | • Create Firebase project & iOS APNs key<br>• Configure server credentials | Credentials in secrets store | ✅ |
| 6.2 | Backend Endpoint | • Store device tokens<br>• POST `/devices` to send FCM/APNs | Working push sender | ✅ |
| 6.3 | Trigger Logic | • On message save → queue push job<br>• Batch multiple pushes if same sender | Worker sending push | ✅ |
| 6.4 | Mobile Integration | • Request permission & send token<br>• Handle foreground/background notifications | Seamless notification UX | ✅ |

---

## 7️⃣  End-to-End Integration & QA

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 7.1 | E2E Smoke Tests | • Send test email → verify push → open app → view content | Recorded test pass | ☐ |
| 7.2 | Load & Latency Tests | • Simulate 100 newsletters/min<br>• Measure DB + push latency | Performance report | ☐ |
| 7.3 | Security Review | • Pen-test API (OWASP top-10)<br>• Verify token scopes | Security checklist | ☐ |

---

## 8️⃣  Production Deployment & Testing

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| **8.0 Preview Build** | Standalone internal build for device testing | • EAS preview profile build<br>• Bakes in Fly.io backend URL<br>• No Metro server needed<br>• Install directly via URL | App running standalone on device | ⧗ |
| **8.1 TestFlight Setup** | Beta testing distribution via Apple TestFlight | • Apple Developer Program ($99/year)<br>• App Store Connect setup<br>• Build signing & upload<br>• Tester management | TestFlight app ready for beta users | ☐ |
| **8.2 CI/CD Pipeline** | Automated build, test, & deployment pipeline | • EAS Build configuration<br>• Environment setup (Dev/Staging/Prod)<br>• Automated testing<br>• Release management | Full CI/CD pipeline | ☐ |
| **8.3 Backend Hosting** | Production server & database hosting | • ~~Railway (lapsed)~~ → **Fly.io** ✅<br>• Fly Postgres attached (`the-postbox-db`)<br>• All secrets configured<br>• Live at `https://the-postbox-backend.fly.dev` | Scalable backend infrastructure | ✅ |
| **8.4 UAT Environment** | User Acceptance Testing environment | • Separate staging environment<br>• Beta user onboarding<br>• Feedback collection system<br>• Bug tracking integration | UAT-ready environment | ☐ |
| **8.5 Analytics & Monitoring** | Comprehensive app & backend monitoring | • Firebase Analytics setup<br>• Crash reporting<br>• Performance monitoring<br>• User behavior tracking | Analytics dashboard | ☐ |
| **8.6 Production Launch** | App Store submission & launch | • App Store optimization<br>• Final testing & QA<br>• Launch strategy<br>• Post-launch monitoring | Live app in App Store | ☐ |

---

## 9️⃣  Nice-to-Have Enhancements

| Idea | Notes |
|------|-------|
| Search within newsletters | Full-text search on `subject` / `body` |
| Sender-based grouping | Show list of senders with unread counts |
| Offline caching | Store recent messages in device storage |
| Analytics dashboard | Engagement (opens, clicks) |
| Discover Feed | A curated/categorized list of popular newsletters users can subscribe to.<br>• Add `category` to `senders` table. |
| **Advanced Analytics** | **The current schema is designed to support future analytics (e.g., sender popularity, user engagement trends). This capability should be enhanced as new features are added.** |

---

## 🔧 Technical Debt - RESOLVED

| Issue | Status | Resolution |
|-------|--------|------------|
| **OAuth Refresh Token Flow** | ✅ **COMPLETED** | Implemented proper refresh token exchange and automatic renewal. Backend now uses `users.google_refresh_token` for long-term Gmail API access. Enhanced error handling for existing users and added re-authentication endpoint. |

---

## 🔐 Post-MVP Authentication Enhancements

| Feature | Description | Business Value | Status |
|---------|-------------|---------------|--------|
| **Device Management & Session Tracking** | Track user devices, enable remote logout, monitor login activity | Security & compliance, better user control | ☐ |
| **OAuth2 Provider Abstraction** | Modular architecture to easily add Microsoft Outlook, Apple Sign-In, or other OAuth providers | Scalability, multi-provider support | ☐ |
| **Enhanced Security Monitoring** | Comprehensive audit logging, failed login tracking, suspicious activity detection | Security monitoring, compliance | ☐ |
| **Rate Limiting** | Prevent authentication abuse and brute force attacks | Security hardening | ☐ |
| **Multi-Device Logout** | Allow users to logout from all devices simultaneously | Security & convenience | ☐ |
| **Session Analytics** | Track authentication patterns, login frequency, device usage | User insights, security monitoring | ☐ |

---

### How to Update This Roadmap

1. **Work in sequence** as much as possible; later steps assume earlier ones are complete.
2. Move the Status icon as you progress: `☐` → `