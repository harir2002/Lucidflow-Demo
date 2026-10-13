# IRDAI Local Suite — Architecture & Code Walkthrough

This document explains the **outsourced codebase** so you can own and maintain it.

It is organized **file by file**. For each file you get:

- What the file is for
- What it imports / exports
- A **line-range walkthrough** of every major block (equivalent to reading the file top-to-bottom)

> **Note on “line by line”:** Dumping every individual line of JSX/PDF drawing code here would be unreadable. Instead, every significant block is mapped to exact line ranges so you can open the file and follow along. Setup/run steps remain in [`SETUP.md`](./SETUP.md).

---

## 1. What this product does

A **fully local** insurance dark-pattern scanner:

1. User enters a target website URL
2. Backend discovers pages (sitemap → fallback crawl)
3. Playwright opens each page, saves a **full-quality screenshot**, extracts **DOM signals**
4. Local Ollama (`gemma3:4b`) runs **vision analysis**: screenshot (base64) **+** DOM/text are sent to the model
5. Findings + recommendations are stored in SQLite
6. Live progress streams over Socket.IO
7. UI + PDF report show the **same** screenshots (also kept on disk)

**No cloud LLM API.** After one-time installs, only the *target insurance sites* need network access.

---

## 2. Repository layout

```
IRDAI Local Suite Dark Pattern Finder/
├── SETUP.md                 # How to install & run
├── ARCHITECTURE.md          # This file
├── backend/
│   ├── package.json
│   ├── data/                # irdai.db, license.key (runtime)
│   ├── screenshots/         # PNG evidence (served + PDF)
│   ├── reports/             # placeholder only
│   └── src/
│       ├── server.js        # Entry: Express + Socket.IO
│       ├── db/database.js   # SQLite schema + connection
│       ├── routes/          # HTTP API
│       └── services/        # Crawl, AI, license, orchestration
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx          # Shell + view switching
        ├── api/client.js    # REST + URLs
        ├── components/
        └── pages/
```

| Process | Port | Role |
|---------|------|------|
| Backend (`npm start` in `backend/`) | **4500** | API, sockets, screenshots, PDF |
| Frontend (`npm run dev` in `frontend/`) | **5173** | React UI |
| Ollama (often on another LAN PC) | **11434** | Local model (`gemma3:4b`) |

Default Ollama host in code: `http://192.168.1.177:11434` (override with `OLLAMA_HOST`).

---

## 3. System architecture (big picture)

```
┌──────────────────────────────┐         ┌──────────────────────────────────────────┐
│  Browser (Vite :5173)        │         │  Backend (Express :4500)                  │
│                              │  REST   │                                          │
│  App → NewScan / Console /   │◄───────►│  routes/scans, report, system, license   │
│        ReportDashboard       │         │           │                              │
│                              │ Socket  │           ▼                              │
│  socket.io-client            │◄───────►│  scanOrchestrator                        │
│                              │         │      ├─ sitemap (discover URLs)          │
└──────────────────────────────┘         │      ├─ crawler (Playwright + PNG)       │
                                         │      ├─ vision → Ollama /api/generate    │
                                         │      ├─ severity / manualReview          │
                                         │      └─ license (page caps)              │
                                         │           │                              │
                                         │           ▼                              │
                                         │  SQLite: backend/data/irdai.db           │
                                         │  PNGs:  backend/screenshots/             │
                                         └──────────────────┬───────────────────────┘
                                                            │ HTTP
                                                            ▼
                                         ┌──────────────────────────────────────────┐
                                         │  Ollama (:11434) — gemma3:4b (multimodal)│
                                         │  GET /api/tags   (health, every ~10s UI) │
                                         │  POST /api/generate (vision: image+DOM)  │
                                         └──────────────────────────────────────────┘
```

### End-to-end scan flow

```
POST /api/scans { target_url }
  → INSERT scans (status=discovering)
  → startScan() [async]
       → checkOllamaAvailable()
       → discoverAllUrls() OR Crawler.discoverOnly()
       → filter url_pattern, sort by scoreUrl()
       → license cap (trial = 3 pages)
       → INSERT pages PENDING
       → for each PENDING page:
            visitPage() → screenshot + domSignals
            analyzePage() → Ollama JSON
            needsManualReview()
            UPDATE page + INSERT findings/recommendations
            emit scan:page-done
       → emit scan:complete
GET /api/report/:scanId → PDF with screenshots from disk
```

---

## 4. Data model (SQLite)

**File:** `backend/src/db/database.js` → disk: `backend/data/irdai.db`

| Table | Purpose |
|-------|---------|
| `scans` | One row per scan job (`discovering` / `scanning` / `paused` / `complete` / `error`) |
| `pages` | One row per URL (`PENDING` → risk or `ERROR`); stores screenshot path + DOM JSON |
| `findings` | Dark-pattern hits (`source`: `ai` or `manual`) |
| `recommendations` | Fix text per page |
| `manual_findings_queue` | Pages flagged for human walkthrough |

Relationships: `scans` 1→N `pages` → N `findings` / `recommendations`.

---

## 5. Backend — file by file

### 5.1 `backend/package.json`

Declares the Node package `irdai-local-backend`.

| Script | Command |
|--------|---------|
| `start` | `node src/server.js` |
| `dev` | `node --watch src/server.js` |

**Dependencies used in `src`:** `express`, `cors`, `socket.io`, `better-sqlite3`, `uuid`, `playwright`, `pdfkit`  
**Declared but unused in current `src`:** `sharp`

---

### 5.2 `backend/src/server.js` (~47 lines)

**Role:** Process entry. Creates HTTP server, Socket.IO, mounts routes, serves screenshots.

| Lines | What it does |
|-------|----------------|
| 1–6 | Import Express, HTTP, CORS, Socket.IO, path, fs |
| 8–10 | Create `app`, wrap in `http.Server`, attach Socket.IO with `cors.origin: '*'` |
| 12–13 | Enable CORS + JSON body parsing |
| 15–18 | Ensure `backend/screenshots/` exists; serve at `/screenshots` |
| 20–24 | On socket connect: `subscribe(scanId)` joins room; `unsubscribe` leaves |
| 26–29 | Mount routers: `/api/scans`, `/api/report`, `/api/system`, `/api/license` |
| 31 | Health: `GET /api/health` → `{ status: 'ok', mode: 'fully-local' }` |
| 33–36 | Global error middleware → JSON `{ error }` |
| 38–47 | Listen on `PORT` (default **4500**); print startup banner |

**Key idea:** Scans get a Socket.IO **room named after `scanId`**. The orchestrator emits into that room; the frontend joins it.

---

### 5.3 `backend/src/db/database.js` (~83 lines)

**Role:** Open SQLite and create tables if missing. Exports the live `db` handle.

| Lines | What it does |
|-------|----------------|
| 1–7 | Comment + imports (`better-sqlite3`, path, fs) |
| 9–13 | Create `backend/data/`, open `irdai.db` |
| 15–16 | WAL mode + foreign keys ON |
| 18–28 | Table `scans` |
| 30–44 | Table `pages` (risk, screenshot path, DOM JSON, manual flags) |
| 46–58 | Table `findings` |
| 61–66 | Table `recommendations` |
| 68–76 | Table `manual_findings_queue` |
| 78–80 | Indexes on scan/page FKs |
| 83 | `module.exports = db` |

**There are no migration files** — schema lives only here.

---

### 5.4 `backend/src/routes/scans.js` (~147 lines)

**Role:** REST API for scan lifecycle. Factory: `(io) => Router` so create/restart can start the orchestrator with sockets.

| Lines | Route | Behavior |
|-------|-------|----------|
| 1–7 | setup | Import db + orchestrator; export factory |
| 10–25 | `POST /` | Validate URL → insert scan → **fire-and-forget** `startScan` → `201` |
| 28–31 | `GET /` | List scans + `is_active` |
| 34–62 | `GET /:id` | Scan + risk counts, findings count, top patterns, manual count |
| 65–85 | `GET /:id/pages` | Pages + parsed JSON + findings + recommendations; optional `?severity=` |
| 88–91 | `GET /:id/manual-review` | Manual queue |
| 94–128 | `POST /:id/manual-findings` | Insert manual finding; bump page risk; mark queue reviewed |
| 131–133 | `POST /:id/pause\|resume\|cancel` | In-memory flags on `activeScans` |
| 136–144 | `POST /:id/restart` | Re-run `startScan` if not already active (continues PENDING pages) |

---

### 5.5 `backend/src/routes/system.js` (~18 lines)

**Role:** Backend + Ollama readiness for the UI header.

| Lines | What it does |
|-------|----------------|
| 1–2 | Import Express + `checkOllamaAvailable`, `MODEL_NAME`, `OLLAMA_HOST` |
| 6–15 | `GET /status` → `{ backend, ollama_host, model, ollama_available, ollama_message }` |
| 17 | Export router |

Mounted at `/api/system` → full path **`GET /api/system/status`**.

> Frontend also defines `POST /system/ollama/test` in the client, but **this route is not implemented** in current `system.js`.

---

### 5.6 `backend/src/routes/license.js` (~21 lines)

**Role:** Thin HTTP wrapper around `services/license.js`.

| Lines | Route |
|-------|-------|
| ~8 | `GET /` → license state |
| ~12 | `POST /` body `{ key }` → install |
| ~16 | `DELETE /` → remove key (back to trial) |

---

### 5.7 `backend/src/routes/report.js` (~198–223 lines)

**Role:** Build an **A4 PDF** for a scan with PDFKit and stream it to the browser.

| Section (conceptually) | Behavior |
|------------------------|----------|
| Top | Load scan/pages/findings/recs from DB; color constants; page geometry |
| Helpers | Text helpers, horizontal rules, headers, `embedShot` (reads PNG from `screenshot_path`) |
| Cover | Title, target URL, stats, pattern frequency bars |
| Per-page | Screenshot + findings (skips `ERROR` / `PENDING`) |
| Appendix | High-severity summary + corrective-action template table |
| End | Page numbers via `bufferPages`; `Content-Disposition: attachment` |

**Important:** PDF is generated **on the fly** into the HTTP response. `backend/reports/` is unused for storage.

---

### 5.8 `backend/src/services/scanOrchestrator.js` (~183 lines)

**Role:** The **brain** of a scan. Coordinates discovery → crawl → AI → DB → sockets.

| Lines | What it does |
|-------|----------------|
| 1–8 | Imports crawler, sitemap, vision, manualReview, license, db |
| 10 | Screenshots directory path |
| 12–13 | `activeScans` Map: `{ paused, cancelled }` |
| 15–17 | `emit(io, scanId, event, payload)` → room broadcast |
| 19–26 | `startScan`: register active; helper `updateScan` |
| 29–35 | Gate: Ollama must be available or status=`error` |
| 37–46 | Discover: sitemap first; else Playwright BFS (`discoverOnly`, max 300) |
| 48–52 | Optional `url_pattern` wildcard filter; sort by insurance relevance |
| 54–69 | License page cap (trial **3**; licensed `max_pages`; `-1` = unlimited) |
| 71–77 | Set `scanning`; insert PENDING page rows |
| 79–86 | Open one Chromium browser/context for the whole loop |
| 88–102 | Pause/cancel loop; crawl page; mark ERROR if load fails |
| 105–145 | `analyzePage` → `needsManualReview` → UPDATE page + findings + recs + queue; emit `scan:page-done` |
| 148–157 | Close browser; `complete` or `paused` if cancelled |
| 158–164 | Catch → `error`; **finally** delete from `activeScans` |
| 167–181 | `pauseScan` / `resumeScan` / `cancelScan` / `isScanActive` |

**Known quirks (read before editing):**

- Lines 106–110 pass `onProgress` into `analyzePage`, but **current `vision.analyzePage` ignores a second argument**.
- Lines 108–109 and 160 call `log(...)` which is **not defined** — if the catch path runs, it can throw a secondary `ReferenceError`. Prefer `console.error` / `emit(scan:log)`.

---

### 5.9 `backend/src/services/crawler.js` (~166 lines)

**Role:** Playwright Chromium: visit pages, screenshot, extract DOM signals, discover links.

| Lines | What it does |
|-------|----------------|
| 1–9 | Playwright + skip regexes (assets, logout, api, utm, …) |
| 11–23 | `Crawler` constructor: delay, viewport 1280×900, domain, screens dir |
| 25 | `skip(url)` |
| 27–40 | `screenshot`: full page if height ≤ 7800px; else clipped viewport shot |
| 42–~95 | `visitPage`: goto → wait → evaluate DOM signals → screenshot → collect links → return `{ url, title, screenshotPath, domSignals, links }` or `null` |
| ~96+ | `_browser`, `_context` (headless; abort media/fonts) |
| | `crawlUrls` sequential with delay |
| | `discoverOnly` BFS same-domain discovery (no analysis) |

**DOM signals collected (fed to Ollama later):**

- `preChecked` checkboxes, `timers`, `popups`, `forms`
- `badges`, `priceEls`, `buttons`, `bodyText`
- Flags: multi-step / login-gated, `pageHeightPx`

---

### 5.10 `backend/src/services/sitemap.js` (~83 lines)

**Role:** Discover URLs without loading every page in a browser first.

| Function | Role |
|----------|------|
| `fetchUrl` | HTTP(S) GET with redirects, 15s timeout, UA `IRDAI-Local-Scanner/1.0` |
| `extractLocs` / `parseSitemap` | Recursive sitemap XML `<loc>` (depth ≤ 5) |
| `discoverAllUrls` | robots.txt `Sitemap:` + `/sitemap.xml` + `/sitemap_index.xml` |
| `scoreUrl` | Prefer quote/checkout (100) → product (85) → renew (75) → … → default (40) |

---

### 5.11 `backend/src/services/vision.js` (~270 lines)

**Role:** Talk to Ollama for **multimodal vision analysis**. Reads the page screenshot as base64, sends it with the DOM prompt to `/api/generate` (`images: [...]`). The same PNG remains on disk for UI/PDF.

| Lines | What it does |
|-------|----------------|
| 1–22 | Docs + env: `OLLAMA_HOST`, `OLLAMA_MODEL`, generate/tags timeouts |
| 24–36 | `formatFetchError` — richer network error strings |
| 38–59 | `buildAnalysisPrompt` — vision mode prompt + DOM signals + 13 patterns → JSON-only instruction |
| 61–186 | `postGenerate` — raw `http`/`https` POST `/api/generate` with `images: [base64]`, `format: json`, temp 0.1, `num_predict` 1024, `num_ctx` 4096, `keep_alive` 30m; socket timeouts disabled (vision prefill can be silent for minutes) |
| 188–190 | `callOllama(prompt, base64Image)` → `postGenerate` |
| 192–204 | `checkOllamaAvailable` — `GET /api/tags` (default **5s** timeout only here); status text says vision analysis |
| 207–220 | `parseModelJson` |
| 223–243 | `finalizeAnalysis` — re-apply `resolveSeverity`; roll up overall risk |
| 246–270 | `analyzePage` — load screenshot base64 (required); call model; return ERROR if image missing or model fails |

**Env vars:**

| Variable | Default | Applies to |
|----------|---------|------------|
| `OLLAMA_HOST` | `http://192.168.1.177:11434` | All Ollama calls |
| `OLLAMA_MODEL` | `gemma3:4b` | Model name (multimodal) |
| `OLLAMA_TAGS_TIMEOUT_MS` | `5000` | Health only |
| `OLLAMA_GENERATE_TIMEOUT_MS` | `0` (wait forever) | Optional hard abort |

---

### 5.12 `backend/src/services/severity.js` (~147 lines)

**Role:** Canonical list of **13 dark patterns** + evidence-keyword severity overrides.

| Export | Purpose |
|--------|---------|
| `SEVERITY_RULES` | Per-pattern HIGH/MEDIUM/LOW signal phrases |
| `PATTERNS` | `{ id, name }` list used in the Ollama prompt |
| `resolveSeverity(patternId, evidence, modelSeverity)` | Prefer rule match on evidence text; else model severity |
| `buildSeverityPrompt()` | Long severity text (exported; currently unused by other modules) |

Pattern IDs 1–13 include: False Urgency, Basket Sneaking, Confirm Shaming, Forced Action, Subscription Trap, Bait & Switch, Drip Pricing, Disguised Ads, Trick Questions, SaaS Billing, Rogue Malwares, Nagging, Interface Interference.

---

### 5.13 `backend/src/services/manualReview.js` (~21 lines)

**Role:** Heuristic “this page needs a human.”

Returns `{ required, reasons:[{ code, detail }] }` when any of:

| Code | Trigger |
|------|---------|
| `MULTI_STEP_FLOW` | Multi-step UI detected |
| `LOGIN_GATED` | Login wall suspected |
| `PAGE_TOO_TALL` | Height > 7800px |
| `TRANSACTION_FLOW_URL` | URL looks like quote/checkout/payment |

---

### 5.14 `backend/src/services/license.js` (~89 lines)

**Role:** Offline Ed25519 license keys; trial mode without a key.

| Piece | Detail |
|-------|--------|
| `TRIAL_PAGE_LIMIT` | **3** pages per scan |
| Key format | `IRDAI1.<payload_b64url>.<sig_b64url>` |
| File | `backend/data/license.key` |
| `getLicenseState()` | `{ licensed, trial, max_pages, … }` — `max_pages: -1` = unlimited |
| `installKey` / `removeKey` / `validateKey` | Activate / wipe / verify |

---

## 6. Frontend — file by file

### 6.1 `frontend/package.json`

React 18 SPA: `react`, `react-dom`, `socket.io-client`, `lucide-react`; Vite + `@vitejs/plugin-react`.

Scripts: `dev`, `build`, `preview`.

---

### 6.2 `frontend/vite.config.js` (~6–8 lines)

- React plugin
- Dev server port **5173**, `host: true` (reachable on LAN)
- **No proxy** — browser calls `http://localhost:4500` directly (backend CORS allows it)

---

### 6.3 `frontend/index.html` (~12 lines)

SPA shell: `#root` + module script `/src/main.jsx`. Title: “IRDAI Dark Pattern Scanner — Local”.

---

### 6.4 `frontend/src/main.jsx` (~8–10 lines)

```text
createRoot(#root).render(<StrictMode><App /></StrictMode>)
```

---

### 6.5 `frontend/src/App.jsx` (~107 lines)

**Role:** App shell. **No React Router** — a `view` string switches pages.

| Lines | What it does |
|-------|----------------|
| 1–7 | Imports pages + SystemStatus + api/socket |
| 9–13 | State: `view`, `activeScanId`, `socket`, `systemStatus` |
| 15–19 | Connect Socket.IO once; close on unmount |
| 21–28 | Poll `GET /api/system/status` on mount + every **10 seconds** |
| 29–32 | `handleScanCreated` → set id, switch to `console` |
| 35–43 | Cream background + Google Fonts global `<style>` |
| 45–64 | Navy header (“IS” mark) + `SystemStatus` |
| 66–98 | Tab bar when not on new-scan: Console / Report / + New Scan |
| 100–104 | Render `NewScan` \| `ScanConsole` \| `ReportDashboard` |

**Views:** `'new-scan'` → `'console'` → `'report'`.

**Design tokens (inline):** cream `#F5F1E8`, navy `#0B1929`, gold `#C9A961`, terracotta `#B8442E`; fonts Source Serif 4 / IBM Plex Sans / IBM Plex Mono.

---

### 6.6 `frontend/src/api/client.js` (~43 lines)

**Role:** Single REST client + URL helpers.

| Lines | What it does |
|-------|----------------|
| 1 | `API_BASE = 'http://localhost:4500/api'` |
| 3–13 | `request()` — fetch JSON; throw on `body.error` |
| 15–41 | `api.*` methods (table below) |
| 43 | `SOCKET_URL = 'http://localhost:4500'` |

| Method | Backend |
|--------|---------|
| `getSystemStatus` | `GET /system/status` |
| `testOllamaConnection` | `POST /system/ollama/test` (**client-only; route missing**) |
| `createScan` | `POST /scans` |
| `listScans` | `GET /scans` (unused in UI) |
| `getScan` / `getPages` / `getManualReview` | scan detail |
| `addManualFinding` | manual finding (**API exists; no UI form**) |
| `pauseScan` / `resumeScan` / `cancelScan` / `restartScan` | controls |
| `getLicense` / `activateLicense` / `removeLicense` | license |
| `reportUrl(id)` | PDF download URL (not JSON) |
| `screenshotUrl(path)` | basename under `/screenshots/` |

---

### 6.7 `frontend/src/components/SystemStatus.jsx` (~20 lines)

Display-only pill in the header.

- Green: backend OK + Ollama available  
- Red: backend unreachable  
- Amber: backend OK but model not ready  
- Shows model name / `ollama_message`

---

### 6.8 `frontend/src/components/LicensePanel.jsx` (~103 lines)

| Block | Behavior |
|-------|----------|
| Mount | `getLicense()` |
| Banner | Licensed vs trial (3-page cap messaging) |
| Actions | Enter key → `activateLicense`; Remove → `removeLicense` |
| Callback | `onLicenseChange` so NewScan can relabel the Start button |

---

### 6.9 `frontend/src/pages/NewScan.jsx` (~103 lines)

| Block | Behavior |
|-------|----------|
| Form | Target URL (default example insurer) + optional URL pattern |
| Warning | If systemStatus says AI/backend not ready |
| Embed | `LicensePanel` |
| Submit | `api.createScan` → `onScanCreated(scan.id)` |
| Footer | Explains local Playwright + Gemma/Ollama |

---

### 6.10 `frontend/src/pages/ScanConsole.jsx` (~192 lines)

**Role:** Live scan monitor.

| Concern | Detail |
|---------|--------|
| REST | `getScan`, `getManualReview`, `pauseScan`, `restartScan`, PDF link |
| Socket emit | `subscribe` / `unsubscribe` with `scanId` |
| Socket listen | `scan:log`, `scan:discovered`, `scan:page-done`, `scan:complete`, `scan:paused`, `scan:error`, `scan:license-limited` |
| UI | Stats, progress, terminal log (last 60 lines), recent findings, pause/resume, Download PDF, View Dashboard |

**Naming quirk:** UI “RESUME” calls **`restartScan`**, not `resumeScan` (restart re-invokes orchestrator for remaining PENDING pages).

---

### 6.11 `frontend/src/pages/ReportDashboard.jsx` (~179 lines)

**Role:** Post-scan analysis UI.

| Block | Behavior |
|-------|----------|
| Load | `getScan` + `getPages` (optional severity filter) |
| Header | Target URL, counts, Export PDF |
| Overview tab | Most frequent patterns (bar list) |
| Pages tab | Expandable rows: screenshot via `screenshotUrl`, findings (AI/MANUAL badge), recommendations |

No sockets — refresh is on mount / filter change.

---

## 7. API & Socket contracts (cheat sheet)

### REST (prefix `/api`)

| Method | Path | Used by |
|--------|------|---------|
| GET | `/health` | ops |
| GET | `/system/status` | App poll every 10s |
| GET/POST/DELETE | `/license` | LicensePanel |
| POST | `/scans` | NewScan |
| GET | `/scans`, `/scans/:id`, `/scans/:id/pages` | Console / Report |
| GET | `/scans/:id/manual-review` | Console count |
| POST | `/scans/:id/pause\|resume\|cancel\|restart` | Console |
| POST | `/scans/:id/manual-findings` | API only (no UI yet) |
| GET | `/report/:scanId` | PDF download |
| GET | `/screenshots/:file` | static PNGs |

### Socket.IO

| Direction | Event | Meaning |
|-----------|-------|---------|
| Client → | `subscribe` / `unsubscribe` | Join/leave room `scanId` |
| Server → | `scan:log` | Log line |
| | `scan:discovered` | Total pages set |
| | `scan:license-limited` | Cap applied |
| | `scan:page-done` | One page finished |
| | `scan:complete` / `scan:paused` / `scan:error` | Terminal states |

---

## 8. Runtime directories & artifacts

| Path | Created by | Used for |
|------|------------|----------|
| `backend/data/irdai.db` | `database.js` | All scan state |
| `backend/data/license.key` | `license.js` | Activated license |
| `backend/screenshots/*.png` | `crawler.js` | Sent to Ollama as base64 **and** used in UI/PDF |
| `backend/reports/` | — | Placeholder only |

---

## 9. How frontend and backend map (ownership map)

| User action | Frontend file | Backend file(s) |
|-------------|---------------|-----------------|
| Open app / see AI ready | `App.jsx` + `SystemStatus.jsx` | `routes/system.js` → `vision.checkOllamaAvailable` |
| Enter license | `LicensePanel.jsx` | `routes/license.js` → `license.js` |
| Start scan | `NewScan.jsx` | `routes/scans.js` → `scanOrchestrator.js` |
| Watch live progress | `ScanConsole.jsx` | Socket emits from orchestrator |
| Crawl page | — | `crawler.js` |
| AI analyze | — | `vision.js` + Ollama |
| Severity | — | `severity.js` |
| View report UI | `ReportDashboard.jsx` | `routes/scans.js` pages API |
| Download PDF | link `api.reportUrl` | `routes/report.js` |

---

## 10. Things to know before changing code

1. **Architecture is intentional:** crawl → screenshot + DOM → multimodal LLM → store → report. Prefer not to redesign detection categories/severity without a product decision.
2. **Screenshots go to the AI:** PNGs are base64-encoded into `POST /api/generate` (`images` array) **and** kept for UI/PDF. Full-page images make vision slow (often minutes per page on CPU).
3. **`/api/tags` spam in Ollama logs** is the UI health poll every 10s — not the scan itself. Generate is `POST /api/generate` and can stay silent during vision prefill.
4. **Hardcoded frontend API host** (`localhost:4500`) — change `client.js` if backend host/port changes.
5. **Unused / incomplete hooks:** `testOllamaConnection`, `addManualFinding` UI, `sharp` dependency, `SEVERITY_RULES` import in report, undefined `log` in orchestrator catch path.
6. **Trial = 3 pages** unless a valid `license.key` is installed.

---

## 11. Changelog — first (outsourced) → current

| Topic | First / outsourced | Current |
|-------|--------------------|---------|
| AI input | Screenshot + DOM (vision) | **Same — vision restored** (screenshot base64 + DOM) |
| Ollama host default | `http://localhost:11434` | `http://192.168.1.177:11434` (`OLLAMA_HOST`) |
| Generate transport | Typical fetch-style client | Node `http`/`https`, socket timeout disabled |
| Product shell | Express + React + Playwright + SQLite + PDF | Unchanged |

Briefly: a text-only (no-image) experiment was tried for speed/reliability, then **reverted**. Lasting ops change vs first delivery is mainly the **LAN Ollama URL** (+ generate timeout hardening).

---

## 12. Suggested reading order (to learn the code)

1. `frontend/src/App.jsx` — how the UI is structured  
2. `frontend/src/api/client.js` — every HTTP call  
3. `backend/src/server.js` — how the API is wired  
4. `backend/src/db/database.js` — data shapes  
5. `backend/src/routes/scans.js` — scan API  
6. `backend/src/services/scanOrchestrator.js` — full pipeline  
7. `crawler.js` → `vision.js` → `severity.js` — detection path  
8. `frontend/src/pages/ScanConsole.jsx` + `ReportDashboard.jsx` — results UX  
9. `routes/report.js` — PDF  

---

*Generated for local ownership of the outsourced IRDAI Dark Pattern Finder codebase. Keep this file updated when you add/remove modules.*
