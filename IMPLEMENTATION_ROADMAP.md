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
| 1.3 | First Development Build | • Trigger first iOS build on EAS<br>• Install custom development client on device<br>• **Blocked:** Pending Apple Developer Program approval | Working dev client | 🚫 |

---

## 2️⃣  Backend ‑ Phase 1 (MVP Data Pipeline)

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 2.1 | Select Tech Stack | • Choose language (Node, Python, Go)<br>• Pick framework (Express / FastAPI / Flask / Fiber) | Decision noted in `docs/ADR-001-stack.md` | ✅ |
| 2.2 | Database Schema | • Design tables: `messages`, `senders`, `devices`<br>• Add `users` and `subscriptions` tables | `db/schema.sql` | ✅ |
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
| 5.5 | Branding & Asset Review | • Finalize logo design<br>• Review iconography and app store assets<br>• Polish UI text based on brand voice | Final visual identity | ☐ |

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

## 8️⃣  Deployment

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 8.1 | Infrastructure as Code | • Terraform (or CloudFormation) for DB, Pub/Sub, Cloud Run | IaC scripts | ☐ |
| 8.2 | CI/CD Pipeline | • Automated build, test, deploy for backend<br>• App build artifacts | Green pipeline | ☐ |
| 8.3 | Monitoring & Alerts | • Metrics: message/sec, push failures<br>• Alerts via PagerDuty | Observability dashboards | ☐ |

---

## 9️⃣  Nice-to-Have Enhancements

| Idea | Notes |
|------|-------|
| Search within newsletters | Full-text search on `subject` / `body` |
| Sender-based grouping | Show list of senders with unread counts |
| Offline caching | Store recent messages in device SQLite |
| Analytics dashboard | Engagement (opens, clicks) |
| Discover Feed | A curated/categorized list of popular newsletters users can subscribe to.<br>• Add `category` to `senders` table. |
| **Advanced Analytics** | **The current schema is designed to support future analytics (e.g., sender popularity, user engagement trends). This capability should be enhanced as new features are added.** |

---

### How to Update This Roadmap

1. **Work in sequence** as much as possible; later steps assume earlier ones are complete.
2. Move the Status icon as you progress: `☐` → `