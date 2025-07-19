# 📬 Newsletter Reader — Implementation Roadmap

This roadmap outlines **the exact sequence of steps** we will follow to turn incoming newsletter e-mails into a polished mobile reading experience with real-time notifications.

Use the check-boxes to track progress (`☐` = not started, `⧗` = in progress, `✅` = done). Each step lists its purpose, key tasks, and expected deliverables.

---

## 0️⃣  Project Foundations

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 0.1 | Repository & Tooling | • Initialize Git repo<br>• Add `.gitignore`, `prettier`, `eslint` (or flake8 if Python)<br>• Configure CI (GitHub Actions) to run lint/tests | Clean repo with CI badge | ☐ |
| 0.2 | Documentation Starter | • Add this roadmap file<br>• Create `/docs` folder for future ADRs | Docs scaffolding | ☐ |

---

## 1️⃣  Backend ‑ Phase 1 (MVP Data Pipeline)

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 1.1 | Select Tech Stack | • Choose language (Node, Python, Go)<br>• Pick framework (Express / FastAPI / Flask / Fiber) | Decision noted in `docs/ADR-001-stack.md` | ☐ |
| 1.2 | Database Schema | • Design tables: `messages`, `senders`, `devices`<br>• Generate migration | `db/schema.sql` | ☐ |
| 1.3 | Mail Integration (Gmail) | • OAuth 2.0 flow (offline access)<br>• Implement Gmail **watch** + Pub/Sub receiver | Service that logs new message IDs | ☐ |
| 1.4 | Mail Integration (IMAP fallback) | • IMAP IDLE listener with reconnect logic | IMAP poller service | ☐ |
| 1.5 | Message Fetch & Parse | • Fetch RFC822 using message ID<br>• Extract `senderName`, `subject`, `bodyHtml`<br>• Save to DB | Parsed record in DB | ☐ |

---

## 2️⃣  Backend ‑ Phase 2 (External Interface)

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 2.1 | REST API | • GET `/messages` (paged)<br>• GET `/messages/{id}`<br>• PATCH `/messages/{id}/read` | API spec in OpenAPI (Swagger) | ☐ |
| 2.2 | Auth & Security | • Issue JWT per device/user<br>• Middleware to protect endpoints | Secure endpoints | ☐ |
| 2.3 | Push Notification Endpoint | • Store device tokens<br>• POST `/push` to send FCM/APNs | Working push sender | ☐ |

---

## 3️⃣  Push Notification Pipeline

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 3.1 | Firebase/APNs Setup | • Create Firebase project & iOS APNs key<br>• Configure server credentials | Credentials in secrets store | ☐ |
| 3.2 | Trigger Logic | • On message save → queue push job<br>• Batch multiple pushes if same sender | Worker sending push | ☐ |
| 3.3 | Reliability & Retries | • Exponential retry on 5xx/Network<br>• Dead-letter log | Robust push pipeline | ☐ |

---

## 4️⃣  Mobile App ‑ Phase 1 (Scaffold & Core UI)

_Flutter_ is assumed. Replace with React Native/Kotlin as needed.

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 4.1 | Project Scaffold | • `flutter create`<br>• Add `riverpod`, `flutter_html`, `firebase_messaging` | Running blank app | ☐ |
| 4.2 | State Management | • Define `Message` model<br>• Provider to fetch list from API | Data layer wired | ☐ |
| 4.3 | Inbox List Screen | • Rectangular card (sender + subject)<br>• Pull-to-refresh<br>• Unread badge | Functional list UI | ☐ |
| 4.4 | Detail Reader Screen | • Fetch `/messages/{id}`<br>• Render HTML<br>• Mark read on open | Reader view | ☐ |

---

## 5️⃣  Mobile App ‑ Phase 2 (Push & Polishing)

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 5.1 | Push Registration | • Request permission<br>• Send FCM token to backend | Device token stored | ☐ |
| 5.2 | Foreground & Background Handling | • Show local notification in foreground<br>• Deep-link to reader on tap | Seamless notification UX | ☐ |
| 5.3 | Dark Mode & Themes | • Implement `ThemeMode.system`<br>• Verify HTML rendering in dark | Themed UI | ☐ |
| 5.4 | App Store Assets | • Icons, splash, screenshots | Ready for TestFlight/Play | ☐ |

---

## 6️⃣  End-to-End Integration & QA

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 6.1 | E2E Smoke Tests | • Send test email → verify push → open app → view content | Recorded test pass | ☐ |
| 6.2 | Load & Latency Tests | • Simulate 100 newsletters/min<br>• Measure DB + push latency | Performance report | ☐ |
| 6.3 | Security Review | • Pen-test API (OWASP top-10)<br>• Verify token scopes | Security checklist | ☐ |

---

## 7️⃣  Deployment

| Step | Description | Tasks | Deliverable | Status |
|------|-------------|-------|-------------|--------|
| 7.1 | Infrastructure as Code | • Terraform (or CloudFormation) for DB, Pub/Sub, Cloud Run | IaC scripts | ☐ |
| 7.2 | CI/CD Pipeline | • Automated build, test, deploy for backend<br>• App build artifacts | Green pipeline | ☐ |
| 7.3 | Monitoring & Alerts | • Metrics: message/sec, push failures<br>• Alerts via PagerDuty | Observability dashboards | ☐ |

---

## 8️⃣  Nice-to-Have Enhancements

| Idea | Notes |
|------|-------|
| Search within newsletters | Full-text search on `subject` / `body` |
| Sender-based grouping | Show list of senders with unread counts |
| Offline caching | Store recent messages in device SQLite |
| Analytics dashboard | Engagement (opens, clicks) |

---

### How to Update This Roadmap

1. **Work in sequence** as much as possible; later steps assume earlier ones are complete.
2. Move the Status icon as you progress: `☐` → `⧗` → `✅`.
3. If scope changes, append new steps rather than rewriting history for traceability.
4. Keep each deliverable small and demonstrable.

Happy building! 🎉 