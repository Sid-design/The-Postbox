# The Postbox — Design System

Single source of truth for the app's visual design. Tokens here are extracted
from the real code (`mobile/src/theme.ts`, `navigationTheme.ts`, and the screen
StyleSheets) and rationalized into scales. **Apply these in both the HTML design
mockup (`design/`) and the React Native code so the two never drift.**

> Status: v1 (Session 11). Reflects current app + proposes a tightened scale.
> Where current code diverges from the proposed scale, it's flagged ⚠️.

---

## 1. Brand

- **Name:** The Postbox — "your newsletter companion"
- **Voice:** clear, calm, respectful (a relief from a chaotic inbox)
- **Primary color:** Royal Blue `#4A90E2`
- **Feel:** clean, light, generous whitespace, rounded, friendly-but-premium

---

## 2. Color tokens

### Core palette (from `theme.ts`) — three themes: light / dark / sepia
| Token | Light | Dark | Sepia | Use |
|---|---|---|---|---|
| `primary` | `#4A90E2` | `#4A90E2` | `#4A90E2` | brand accent (constant across all themes) |
| `background` | `#F4F6F8` | `#1A202C` | `#F1E7CF` | screen background |
| `surface` | `#FFFFFF` | `#2D3748` | `#FAF3E0` | cards, list rows, headers, modals |
| `textPrimary` | `#1A202C` | `#E2E8F0` | `#5B4636` | titles, body |
| `textSecondary` | `#718096` | `#A0AEC0` | `#8A7866` | subtitles, captions, metadata |

> **Sepia** is a warm "paper" reading theme — now a real app theme alongside
> light/dark (not just the Detail WebView mode). Selected by the user; resolved
> via the theme context. The date-chip pill goes warm in sepia (`#E8DCC0`).

### Supporting tokens (currently hardcoded across screens — centralize these)
| Token | Light | Dark (proposed) | Use |
|---|---|---|---|
| `border` | `#E2E8F0` | `#3A4658` | dividers, card/input borders |
| `borderStrong` | `#A0AEC0` | `#4A5568` | checkbox/control outlines |
| `fill` | `#F7FAFC` | `#252D3B` | subtle inset fills (modal options, chips) |
| `danger` | `#DC2626` | `#F87171` | errors, destructive |
| `onPrimary` | `#FFFFFF` | `#FFFFFF` | text/icon on primary |
| `google` | `#4285F4` | `#4285F4` | Google sign-in accent (fixed brand) |

> ⚠️ **Known issue:** `navigationTheme` sets `border` = `background`, so nav-level
> borders are invisible. And several screens hardcode `colors.light.*` (e.g.
> `SenderManagementScreen`), breaking dark mode. Fix = consume these tokens
> theme-aware, never `colors.light.*` directly.

### Detail reading modes (WebView, via CSS injection — not app theme)
`list` / `summary` reading modes and a **sepia** reading theme apply only inside
the article WebView in `DetailScreen`. Keep separate from the app color tokens.

---

## 3. Typography

System font (`-apple-system` / Roboto). Scale (sizes already in use):

| Token | Size | Weight | Use |
|---|---|---|---|
| `display` | 24 | 700 | screen titles / empty-state headlines |
| `h2` | 18 | 600–700 | section headers, modal titles |
| `body` | 16 | 400–500 | primary text, list titles, settings rows |
| `bodySm` | 14 | 400–600 | subtitles, secondary actions |
| `caption` | 12 | 400–600 | metadata, timestamps, badges |
| `tab` | 11 | 500 | tab bar labels |

> Keep to these 6 steps. Avoid introducing new sizes.

---

## 4. Spacing scale

4-pt base. Use these steps only:

`xs 4` · `sm 8` · `md 12` · `lg 16` · `xl 20` · `2xl 24` · `3xl 32`

- Screen padding: `xl (20)`
- List row vertical: `lg (16)`, horizontal: `xl (20)`
- Gaps between controls: `sm (8)` / `xs (4)`

---

## 5. Corner radius

> ⚠️ The code currently uses **10 different radii** (4,5,6,8,10,12,16,20,24,40).
> Rationalize to this scale:

| Token | Value | Use |
|---|---|---|
| `xs` | 4 | checkboxes, tiny chips |
| `sm` | 8 | buttons, action tiles, small cards |
| `md` | 12 | cards, modal option rows |
| `lg` | 16 | modals, large cards |
| `pill` | 999 | pills / fully-rounded chips & FABs |
| `avatar` | circle | sender avatars (use 50% of size) |

---

## 6. Elevation / shadow

- **Cards/rows:** flat — separated by `surface` over `background` + a 1px `border` divider, not shadow.
- **Modals / FAB:** soft shadow — `shadowColor #000`, opacity `0.25`, radius `8`, offset `(0,4)` (≈ `elevation: 8` on Android).

---

## 7. Component specs

### Tab bar
Height `60`, absolute bottom, `surface` bg, 1px top `border`. Active icon+label `primary`; inactive `textSecondary`. Icons ≈ 95% default size. Labels `tab (11)`.

### List row (message / sender)
Row, `py lg / px xl`, `surface` bg, 1px bottom `border`. Title `body`, meta `caption textSecondary`. Right-side control (checkbox / chevron / unread dot).

### Checkbox
`24×24`, radius `xs`, 2px `borderStrong`. Checked = `primary` fill + `onPrimary` check.

### Action tile (Search/Filter/Groups/Select-all)
Flex column, `py md`, radius `sm`, 1px `border`, `surface` bg. Active = `primary` bg + `onPrimary` icon/label. Label `11`.

### Button
- **Primary:** `primary` bg, `onPrimary` text, radius `sm`, `py md`.
- **Text/tertiary:** `primary` text, no fill (e.g. "Refresh Sender List").
- **Google sign-in:** white bg, `#DADCE0` border, Google-blue mark, radius `sm`.

### Card / section (Settings)
`surface` bg, radius `md`, grouped rows with 1px `border` dividers; section header `h2`.

### Modal
Centered, `surface` bg, radius `lg`, soft shadow; option rows radius `md` on `fill`, active = `primary`. Dim overlay `rgba(0,0,0,0.5)`.

### Empty state
Centered icon (in a `primary`-tinted circle), `display` headline, `body textSecondary` subtext, optional primary CTA.

---

## 8. Light / Dark rules

- Every surface/text/border value must come from the **theme-aware** token, never `colors.light.*`.
- `primary` is identical in both modes (brand constant).
- Dark dividers/fills use the proposed dark supporting tokens (§2), not light hexes.

---

## 9. App icon (separate asset)

1024×1024, full-bleed, system applies the rounded mask. Currently being
re-explored via an external icon generator — once a square design is chosen,
export 1024 PNG → wired into `app.config.js` (icon/splash/notification/adaptive
regenerated from it). Brand color `#4A90E2`.

---

## 10. How to use this doc

1. Design changes are proposed/iterated in the HTML mockup (`design/`) using these tokens.
2. Agreed changes update **this file first**, then the RN `theme.ts` + screens.
3. The mockup approximates RN (not pixel-identical) — do one on-device check per batch.

---

## 11. Mockup & per-screen decisions (Session 11)

**Mockup:** `design/index.html` — self-contained HTML, iPhone frames, all main
screens, with a **Light / Dark / Sepia** cycle button. Open the file directly,
or run the preview server (`.claude/launch.json` → `design-mockup`, serves
`design/` on :5599). It approximates RN for fast design iteration without builds.

**Agreed redesigns — in the mockup, NOT yet ported to RN code:**
- **Mailbox:** header = title left / search right, **no "•••" dots**. Frozen filter
  strip (All / Unread / +) with **background = header surface** (themed; the
  on-device white band is a bug). Rounded **message cards** (sender 18/bold,
  subject, light **date-chip**, **bookmark** bottom-right, **unread dot** top-right).
  Swipe right → More + Mark-read; swipe left → Delete; long-press → multi-select.
- **Sender (revamped):** header = **Groups · Refresh · Search** (Ionicons).
  **Inline filter chips** (All / Active / Inactive) replace the action-tile row +
  filter modal. **No big search bar** (search via header icon). Rows =
  **avatar initial + name/email + toggle switch** (gray when unsubscribed).
  **Pull-to-refresh**. **Alphabetical sort** by name.
- **Saved:** Mailbox-style cards. **Sort icon next to search** in header → toggles
  newest ⇄ oldest (by `received_at`). **"+"** = create **groups** of saved newsletters.
- **Settings:** grouped cards (kept).
- **Icons:** real Ionicons glyphs (`search`, `refresh`, `people`, `swap-vertical`),
  header icons text-colored — replaced the emoji placeholders.

**Done in real code this session:** sepia palette in `theme.ts` (+ `ThemeName` type)
and `navigationTheme.ts`. Everything else above is **mockup-only**, pending the port.

---

## 12. Pending / next session

**Continue the design (next session):**
- Polish **Settings**; mock the **Detail (newsletter reader)** screen.
- Finalize the **app icon** — user is choosing from an external generator; drop a
  1024 PNG into the Drive folder → wire into `app.config.js` (regenerate
  splash/notification/adaptive from it via `.branding-tools`).

**Code port — one implementation pass + a single build, after design is final:**
1. **3-mode theme system:** build a `ThemeContext` (preference `system/light/dark/sepia`,
   persisted to AsyncStorage; resolves the active theme), wire `App.tsx`'s
   `NavigationContainer`, and connect the Settings "Default Theme" picker (currently
   saves a value but drives nothing).
2. **Theme-aware screen cleanup:** remove hardcoded `colors.light.*`
   (SenderManagement et al.) so **dark AND sepia** render correctly everywhere.
3. **Port the screen redesigns** above (Mailbox frozen strip/header, Sender revamp +
   alphabetical sort + pull-to-refresh, Saved sort toggle + Groups "+").
4. One **build** to verify on device.

**Other backlog:** stale non-ScreenQA Jest suites (pre-existing failures); restore
`npm ci` (lockfile regen); Maestro "Mailbox not visible" selector nit (non-blocking,
informational job); optional E2E mock-data layer for populated screenshots.
