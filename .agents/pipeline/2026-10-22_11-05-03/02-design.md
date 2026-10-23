# Tata AIG Demo: Two-Mode Scan UI — Technical Design

## Overview

This design adds a two-mode scan interface to the existing dark-pattern scanner, enabling users to choose between **One Page** (direct single-URL scan) and **Main Domain** (discover multiple URLs, select a subset, then scan the selection). The implementation reuses existing patterns in the codebase: the API client layer (`client.js`), socket-based progress streaming, the license service, and backend orchestrator branching. Frontend will gain two new components (mode selector and discovery preview), backend routes will extend to accept scan mode and selected URLs, and the orchestrator will branch on mode at execution time. All URL limits are read dynamically from the license service, not hardcoded, and demo fixtures are exposed only when `DEMO_MODE === 'true'`. The fixture URLs never reach the live scan engine when demo mode is disabled.

---

## Architecture & Integration Points

### 1. Frontend Structure (React, Vite)

**New components:**
- **ModeSelector.jsx**: Radio-style buttons for "One Page" / "Main Domain"; maintains local state for current mode.
- **DiscoveryPreview.jsx**: Renders discovered URL list with checkboxes, selection counter, "Select All"/"Clear All", and demo label if present.
- **Updated NewScan.jsx**: Integrates ModeSelector and DiscoveryPreview; routes form submission to the correct API endpoint based on mode.

**Component hierarchy in NewScan:**
```
NewScan
├── ModeSelector
│   └── Display "One Page" (default) | "Main Domain"
│       Callback: onModeChange(mode)
├── [One Page mode → shown when mode === 'one-page']
│   ├── Single "Target URL" input
│   ├── "URL Pattern" input (optional)
│   └── "Start Scan" button (disabled if target URL empty)
├── [Main Domain mode → shown when mode === 'main-domain']
│   ├── "Domain" input
│   ├── "Discover Pages" button
│   │   └── Calls api.discoverUrls(baseUrl)
│   │       Shows loading indicator while fetch is in progress
│   ├── DiscoveryPreview (rendered after discovery succeeds)
│   │   ├── Display demo label if present (styled distinct)
│   │   ├── URL list with checkboxes
│   │   ├── "Select All" / "Clear All" buttons
│   │   ├── Counter: "Selected: X / Y (limit: Z)"
│   │   └── Callback: onSelectionChange(selectedUrls)
│   └── "Scan Selected Pages" button (disabled if no URLs selected)
└── LicensePanel
    └── Displays trial/licensed limit
```

### 2. Backend Routes

**Existing route modified:**
- **POST /api/scans**
  - **Old signature:** `{ target_url, url_pattern }`
  - **New signature:** `{ target_url, url_pattern, scan_mode?, selected_urls? }`
  - `scan_mode` defaults to `'one-page'` if omitted (backward compatible)
  - `selected_urls` defaults to `[]` if omitted
  - Store `scan_mode` in the scans table for audit/reporting
  - Route continues to fire-and-forget `startScan(...)` with orchestrator options

**New route:**
- **POST /api/scans/discover**
  - **Request:** `{ base_url }`
  - **Response:** `{ urls: string[], sitemapFound: boolean, demoLabel?: string }`
  - Calls `discoverAllUrls(baseUrl)` (from sitemap.js)
  - Returns demo label if demo mode is active and the domain matches a fixture
  - Does **not** return fixture data for a domain unless the domain exactly matches a fixture entry (e.g., `demo.tata-aig.local`)

### 3. Database Schema Extension

**scans table — add one column:**
```sql
ALTER TABLE scans ADD COLUMN scan_mode TEXT DEFAULT 'one-page';
```

- **scan_mode:** `'one-page'` | `'main-domain'` | `NULL` (legacy rows without the column)
- Default to `'one-page'` if NULL or missing (backward compatible)
- Stored for audit: reports and console logs can indicate which mode was used

### 4. Backend Orchestrator Branching

**In scanOrchestrator.js — modify `startScan` signature:**
```javascript
async function startScan(scanId, targetUrl, urlPattern, io, options = {})
```

- **options.scanMode:** `'one-page'` | `'main-domain'` (default: inherit from scans table or `'one-page'`)
- **options.selectedUrls:** `string[]` (default: `[]`)

**Mode branching logic:**

1. **One Page mode** (`scanMode === 'one-page'`):
   - Scan only the single `targetUrl`
   - Ignore `urlPattern` (no filtering applied)
   - Log: "One Page mode: scanning 1 URL"
   - Continue with license cap → Playwright crawl → AI analysis → findings

2. **Main Domain mode** (`scanMode === 'main-domain'`):
   - Use `selectedUrls` array (already discovered + selected by user)
   - Apply `urlPattern` filter to selected URLs if provided
   - Sort by `scoreUrl()`
   - Log: "Main Domain mode: scanning N selected page(s)"
   - Continue with license cap → Playwright crawl → AI analysis → findings

3. **Unrecognized or omitted mode:**
   - Fall back to existing discovery → crawl flow (backward compatible)
   - Load from scans table; if NULL, use `'one-page'`

**No unnecessary refactoring:** The orchestrator continues to handle discovery, license enforcement, and analysis. Only the URL source changes.

---

## Frontend API Client Changes

**In client.js, add new method:**
```javascript
discoverUrls: (baseUrl) =>
  request('/scans/discover', { method: 'POST', body: JSON.stringify({ base_url: baseUrl }) })
```

**Extend existing method:**
```javascript
createScan: (targetUrl, urlPattern, scanMode = 'one-page', selectedUrls = []) =>
  request('/scans', {
    method: 'POST',
    body: JSON.stringify({
      target_url: targetUrl,
      url_pattern: urlPattern,
      scan_mode: scanMode,
      selected_urls: selectedUrls
    })
  })
```

- **Backward compatibility:** Old calls like `createScan(url, pattern)` work because `scanMode` and `selectedUrls` have defaults
- The client remains a thin HTTP wrapper; mode logic lives in components and routes

---

## License Limit Exposure & Reuse

**Frontend flow:**

1. **NewScan component mounts:**
   - Call `api.getLicense()` once
   - Extract `max_pages` from response
   - Compute effective limit: `max_pages === -1 ? "Unlimited" : max_pages`
   - Display: "Trial: 3 pages" or "Licensed: N pages"

2. **Pass limit to DiscoveryPreview:**
   ```javascript
   <DiscoveryPreview
     urls={discovered}
     maxSelectable={licenseState.max_pages === -1 ? discovered.length : licenseState.max_pages}
     demoLabel={demoLabel}
     onSelectionChange={setSelectedUrls}
   />
   ```

3. **DiscoveryPreview enforces limit:**
   - Disable unchecked boxes when selected count reaches `maxSelectable`
   - Allow unchecking to re-enable boxes
   - Display counter: "Selected: X / Y (limit: Z)"

**Backend:**

- Continue to read `license.js` exports: `getLicenseState()` and `TRIAL_PAGE_LIMIT` (imported, not hardcoded)
- Orchestrator applies cap *after* URL selection in Main Domain mode
- Emit `scan:license-limited` event if cap is applied
- All enforcement references `license.max_pages` from `getLicenseState()`, never hardcoded `3`

**No duplication:** Limit value flows from `license.js` → orchestrator → backend cap enforcement, and separately via `/api/license` → frontend UI. No hardcoding in components.

---

## Demo Mode & Fixtures

**Backend behavior (sitemap.js already implements this):**

1. **Check DEMO_MODE:**
   ```javascript
   function isDemoMode() {
     return process.env.DEMO_MODE === 'true'; // Explicit string comparison
   }
   ```

2. **Load fixtures (on first discovery call or on demand):**
   ```javascript
   function loadDemoFixtures() {
     const fixturePath = process.env.DEMO_FIXTURE_PATH || 
       path.join(__dirname, '..', '..', 'data', 'demo-fixtures.json');
     try {
       return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
     } catch (e) {
       console.error('[demo] Failed to load demo fixtures:', e.message);
       return null;
     }
   }
   ```

3. **In discoverAllUrls:**
   - If `DEMO_MODE === 'true'` and domain matches a fixture key (exact match on hostname):
     - Return fixture URLs + `demoLabel: fixtures[domain].label`
     - Log the demo indicator message
   - If demo mode is ON but no fixture for the domain:
     - Return `{ urls: [], sitemapFound: false, demoMode: true }` (fail gracefully)
   - If demo mode is OFF (normal):
     - Proceed with live discovery (robots.txt → sitemap → crawl)

**Demo fixture format (backend/data/demo-fixtures.json):**
```json
{
  "demo.tata-aig.local": {
    "urls": [
      "https://demo.tata-aig.local/",
      "https://demo.tata-aig.local/car-insurance",
      ...
    ],
    "sitemapFound": true,
    "label": "Demo data — live domain discovery is not active in this demo"
  }
}
```

**Frontend display:**
- If `demoLabel` is present in the discovery response:
  - Show in DiscoveryPreview with distinct styling (background color, border, icon)
  - Display discovery limitation statement alongside (e.g., "Fixture data — live domain discovery is not active")
  - Users understand results are demo data, not live verification

**Safety boundary — fixture URLs never reach the live scan engine:**

1. If user enters a demo domain (e.g., `demo.tata-aig.local`) **when demo mode is OFF**:
   - Backend discovery proceeds to live fetch, fails or returns empty (domain not reachable)
   - No fixture is returned
   - No scan is created with demo URLs

2. If user somehow selects URLs and invokes a scan with demo fixture URLs (when demo mode is OFF):
   - Backend must reject or bypass the scan (add check in orchestrator)
   - Log a warning if demo URLs are detected in a non-demo scan
   - Orchestrator sanitizes: if a URL contains `demo.tata-aig.local` and demo mode is OFF, skip it or mark as ERROR

**Implementation safeguard in scanOrchestrator.js:**
```javascript
// Before scanning, if any URL contains demo fixture domain and demo mode is OFF:
if (!isDemoMode()) {
  const demoUrls = allUrls.filter(u => u.includes('demo.tata-aig.local'));
  if (demoUrls.length > 0) {
    emit(io, scanId, 'scan:error', {
      message: 'Fixture URLs detected outside demo mode — scan blocked for safety.'
    });
    return;
  }
}
```

---

## API Contracts

### POST /api/scans (Modified)

**Request:**
```json
{
  "target_url": "https://example.com",
  "url_pattern": "*/quote*",
  "scan_mode": "one-page",
  "selected_urls": []
}
```

**Response (201):**
```json
{
  "id": "scan-uuid",
  "target_url": "https://example.com",
  "scan_mode": "one-page",
  "status": "discovering"
}
```

**Error (400):**
```json
{
  "error": "target_url is required" | "target_url is not a valid URL" | "selected_urls is not a valid array"
}
```

---

### POST /api/scans/discover (New)

**Request:**
```json
{
  "base_url": "https://demo.tata-aig.local"
}
```

**Response (200):**
```json
{
  "urls": [
    "https://demo.tata-aig.local/",
    "https://demo.tata-aig.local/car-insurance",
    ...
  ],
  "sitemapFound": true,
  "demoLabel": "Demo data — live domain discovery is not active in this demo"
}
```

**Response if no sitemap + crawl fails (200):**
```json
{
  "urls": [],
  "sitemapFound": false
}
```

**Error (400):**
```json
{
  "error": "base_url is required" | "base_url is not a valid URL"
}
```

---

## Component Specifications

### ModeSelector.jsx

**Props:**
- `mode` (string): `'one-page'` | `'main-domain'`
- `onModeChange` (function): Callback when user selects a mode

**Behavior:**
- Display two radio buttons or toggle: "One Page" (default) and "Main Domain"
- Only one can be selected at a time
- Call `onModeChange(newMode)` on selection
- Style: Use existing design tokens (navy, gold, fonts from App.jsx)

**Example:**
```jsx
<ModeSelector mode={mode} onModeChange={setMode} />
```

---

### DiscoveryPreview.jsx

**Props:**
- `urls` (string[]): List of discovered URLs
- `maxSelectable` (number): Maximum number of URLs the user can select (from license limit)
- `demoLabel` (string | null): Demo label text if present
- `onSelectionChange` (function): Callback called with array of currently selected URLs

**State:**
- `selected` (Set<string>): URLs currently checked

**Behavior:**

1. **Demo label (if `demoLabel` is non-empty):**
   - Display above the URL list with distinct styling (background: light gold or light red, border, icon)
   - Font: Bold, slightly larger
   - Include discovery limitation statement (e.g., "Fixture data — live domain discovery is not active")

2. **Buttons:**
   - "Select All": Check all checkboxes (respecting `maxSelectable` limit)
   - "Clear All": Uncheck all checkboxes

3. **Checkboxes:**
   - One per discovered URL
   - Disabled if `selected.size === maxSelectable` (except for already-checked ones, which can be unchecked)

4. **Counter:**
   - Display: "Selected: X / Y (limit: Z)"
   - X = current selection count, Y = total URLs, Z = maxSelectable
   - Update live as user checks/unchecks

5. **Callback:**
   - Call `onSelectionChange(Array.from(selected))` whenever selection changes

**Example:**
```jsx
<DiscoveryPreview
  urls={discoveredUrls}
  maxSelectable={licenseLimit}
  demoLabel={demoLabel}
  onSelectionChange={setSelectedUrls}
/>
```

---

## Error Handling & Validation

### Frontend

1. **Missing or invalid base URL in Main Domain mode:**
   - Disable "Discover Pages" button if input is empty or invalid URL
   - Show inline error: "Enter a valid domain URL"
   - Do not call API

2. **Discovery API fails:**
   - Catch in NewScan: `api.discoverUrls(...).catch(err => { setError(err.message); })`
   - Display error banner: "Discovery failed: {error message}"
   - Clear loading state; allow user to retry

3. **No URLs discovered:**
   - After successful discovery with empty array:
     - Show message: "No pages found for this domain"
     - Disable "Scan Selected Pages" button
     - Offer to try a different domain or mode

4. **Invalid scan request (missing target_url in One Page mode):**
   - Disable "Start Scan" button until input is non-empty
   - Show validation message on blur or focus

### Backend

1. **POST /api/scans/discover — missing or invalid base_url:**
   - Return 400: `{ error: "base_url is required" }` or `{ error: "base_url is not a valid URL" }`

2. **Discovery network failure:**
   - Catch in `discoverAllUrls(...)`, return `{ urls: [], sitemapFound: false }`
   - **Do not** silently return fixture data if live discovery fails

3. **POST /api/scans — invalid selected_urls:**
   - Validate that `selected_urls` is an array of strings (URLs)
   - If not, return 400: `{ error: "selected_urls must be an array of URL strings" }`

4. **Orchestrator receives invalid selectedUrls (URLs not from discovery):**
   - Log warning: "Selected URL not from discovery response — may be user tampering"
   - Proceed with URL as-is; let Playwright handle the result
   - If page load fails, mark as ERROR (existing behavior)

5. **Demo mode OFF but fixture URLs detected:**
   - Log warning: "[SAFETY] Fixture URLs detected outside demo mode — skipping"
   - Skip the URL or mark it as ERROR

---

## Testing Strategy

**Unit tests (backend Jest):**

1. **License limit exposure:**
   - Mock `getLicenseState()` with trial (3) and licensed (50) states
   - Verify orchestrator applies correct cap
   - Verify no hardcoded `3` in components

2. **Mode branching in orchestrator:**
   - `one-page` mode: scans exactly 1 URL (targetUrl), ignores urlPattern
   - `main-domain` mode: scans selectedUrls, applies urlPattern filter
   - Backward compatibility: no scanMode or NULL defaults to `one-page`

3. **Demo fixtures:**
   - When `DEMO_MODE === 'true'` and domain is `demo.tata-aig.local`: returns fixture data with demoLabel
   - When `DEMO_MODE === 'true'` and domain is not in fixtures: returns empty array
   - When `DEMO_MODE !== 'true'`: proceeds with live discovery

4. **API /scans/discover:**
   - Valid base_url returns discovered URLs
   - Invalid base_url returns 400 error
   - Demo domain in demo mode returns fixture with demoLabel

5. **POST /api/scans with scan_mode and selected_urls:**
   - Stores `scan_mode` in scans table
   - Backward compatible: old requests without fields work

6. **Fixture URL safety:**
   - Demo URLs never submitted to Playwright when demo mode is OFF
   - Warning logged if fixture URL detected outside demo mode

**Component tests (frontend Jest + React Testing Library):**

1. **ModeSelector:**
   - Default mode is `one-page`
   - Clicking "Main Domain" calls `onModeChange('main-domain')`
   - Only one mode is selected at a time

2. **DiscoveryPreview:**
   - Renders checkbox per URL
   - "Select All" checks all (up to maxSelectable)
   - "Clear All" unchecks all
   - Counter updates correctly
   - Disabled checkboxes when limit reached
   - Demo label displayed with distinct styling if provided

3. **NewScan integration:**
   - Mode selector visible and toggles UI
   - One Page mode: shows target URL + URL pattern + "Start Scan" button
   - Main Domain mode: shows domain + "Discover Pages" + DiscoveryPreview (after discovery)
   - License panel displays limit correctly
   - Buttons disabled/enabled based on state

4. **API calls:**
   - One Page: calls `createScan(targetUrl, urlPattern, 'one-page', [])`
   - Main Domain: calls `discoverUrls(domain)` then `createScan(domain, urlPattern, 'main-domain', selectedUrls)`

**Integration tests (socket + orchestrator):**

1. **One Page scan:**
   - Create scan with `scan_mode: 'one-page'`
   - Verify only 1 page is inserted + scanned
   - Verify socket emits correct count

2. **Main Domain scan:**
   - Create scan with `scan_mode: 'main-domain'`, `selected_urls: [3 URLs]`
   - Verify 3 pages are inserted + scanned
   - Verify license cap is applied if needed
   - Verify socket emits correct counts

3. **Demo fixture scan:**
   - Set `DEMO_MODE=true`
   - Discover `demo.tata-aig.local` → returns 7 fixture URLs with demoLabel
   - Create Main Domain scan with 3 selected fixture URLs
   - Verify scan starts (demo mode allows fixture URLs)
   - Verify demo label is returned + displayed

**Manual/browser tests (if test runner exists):**

1. Switch between modes, verify UI changes
2. Discover pages, verify list renders
3. Select pages, verify counter and button state
4. Start a One Page scan, verify 1 page processed
5. Start a Main Domain scan with selection, verify N pages processed
6. Verify demo label is visible in discovery results (if demo mode enabled)
7. Verify license limit is displayed correctly (trial vs. licensed)

---

## Files to Create/Modify

### Frontend (New)

- **frontend/src/components/ModeSelector.jsx** (new)
- **frontend/src/components/DiscoveryPreview.jsx** (new)

### Frontend (Modified)

- **frontend/src/api/client.js**
  - Add `discoverUrls(baseUrl)` method
  - Extend `createScan(targetUrl, urlPattern, scanMode, selectedUrls)` signature
  
- **frontend/src/pages/NewScan.jsx**
  - Integrate ModeSelector
  - Conditionally render One Page or Main Domain UI
  - Fetch license on mount; pass limit to DiscoveryPreview
  - Call correct API method based on mode

### Backend (New)

- **backend/src/routes/discover.js** (new, or inline in scans.js)
  - POST /api/scans/discover endpoint
  - Calls discoverAllUrls and returns URLs + demoLabel

### Backend (Modified)

- **backend/src/db/database.js**
  - Add `scan_mode` column to scans table (TEXT, DEFAULT 'one-page')

- **backend/src/routes/scans.js**
  - Extend POST / route to accept `scan_mode` and `selected_urls`
  - Pass options to startScan

- **backend/src/services/scanOrchestrator.js**
  - Modify `startScan(scanId, targetUrl, urlPattern, io, options = {})` signature
  - Add mode branching logic
  - Log which mode is used
  - In Main Domain mode, skip discovery; use selectedUrls directly
  - Add safety check: skip/error on fixture URLs when demo mode is OFF

- **backend/src/services/sitemap.js**
  - Already implements `isDemoMode()` and fixture loading (no changes needed if not present; add if missing)
  - Ensure `discoverAllUrls` returns `demoLabel` in response

### Backend (Existing — No Changes)

- **backend/src/services/license.js**
  - Already exports `TRIAL_PAGE_LIMIT` and `getLicenseState()` — import in orchestrator, no changes
  
- **backend/src/services/crawler.js**
  - No changes

- **backend/src/services/vision.js**
  - No changes

---

## Backward Compatibility

1. **Old API calls:**
   - `createScan(url, pattern)` works; defaults to `scan_mode: 'one-page'`, `selected_urls: []`

2. **Old scan records:**
   - scans table rows without `scan_mode` column are treated as `'one-page'`
   - Queries must handle NULL: `COALESCE(scan_mode, 'one-page')`

3. **Old orchestrator calls:**
   - `startScan(scanId, targetUrl, urlPattern, io)` works; defaults to discovery → crawl flow
   - `startScan(scanId, targetUrl, urlPattern, io, { scanMode: 'one-page' })` same behavior

4. **Socket events:**
   - All existing `scan:*` events remain unchanged
   - `scan:discovered` emitted with `totalPages` count (same as before)
   - `scan:license-limited` emitted if cap applied (same as before)

5. **Frontend components not involved:**
   - LicensePanel, ScanConsole, ReportDashboard, SystemStatus — no changes required
   - NewScan embeds new components; backward compatible

---

## Technology Stack (Locked)

**Frontend:**
- React 18 (Vite, no breaking changes)
- React component state for mode and selected URLs (no new libraries)
- Existing CSS-in-JS inline styles (no additional UI libraries)
- Lucide icons (already imported for buttons)

**Backend:**
- Node.js + Express (existing)
- SQLite + better-sqlite3 (existing)
- Socket.IO (existing)
- Playwright (existing, no changes to crawl logic)
- Ollama (existing, no changes to vision)

**No new dependencies introduced.**

---

## Implementation Constraints & Safeguards

1. **No hardcoded limits:**
   - All `3`-page trial limits and page caps are read from `license.js` exports or `/api/license` response
   - Enforcement happens in orchestrator using `getLicenseState().max_pages`
   - Frontend displays limit from license response

2. **No duplication of discovery/orchestration logic:**
   - All discovery stays in `sitemap.js` and `crawler.js`
   - No replication in route handlers
   - Orchestrator branches on mode after receiving discovered/selected URLs

3. **Demo fixtures confined to demo mode:**
   - Fixtures returned only if `DEMO_MODE === 'true'` (exact string comparison)
   - Fixture URLs never reach live Playwright if demo mode is OFF
   - Safety check in orchestrator catches and errors on demo URLs outside demo mode

4. **All mode decisions logged:**
   - Orchestrator logs which mode was used: "One Page mode: scanning 1 URL" or "Main Domain mode: scanning N selected page(s)"
   - Useful for debugging and audit trails

5. **Database schema preserved:**
   - New `scan_mode` column added; existing columns unchanged
   - Default value ensures backward compatibility
   - No renaming or removal of existing columns

---

## Known Limitations & Deferred Work

1. **Fixture URL examples:**
   - ABC Insurance: https://insurance-deception-explorer.lovable.app (from user request)
   - Alliance Insurance: https://allianceinsurance.in/ (from user request)
   - These URLs are confirmed as approved examples; they will be used in test/demo data if deployment requires live-example testing
   - For this phase, the fixture domain `demo.tata-aig.local` is used for demo mode; real URLs remain optional

2. **Pagination in discovery list:**
   - Out of scope; full list of discovered URLs is rendered
   - If performance is a concern in later phases, virtualization (e.g., react-window) can be added

3. **Demo mode persistence across reloads:**
   - Out of scope; demo mode is a backend environment variable
   - Frontend mode selection (One Page / Main Domain) is not persisted across page reload

4. **Browser test stack:**
   - If no browser test runner exists, manual smoke testing suffices for this phase
   - Jest unit + integration tests cover the main flows

---

## Deployment & Documentation

**Environment variables (backend):**
- `DEMO_MODE` (string, default `'false'`):
  - Set to `'true'` (exact string) to enable demo mode fixture returns
  - Any other value (including `"false"`, `"0"`, `"no"`) disables demo mode
  - When disabled, live discovery is attempted

- `DEMO_FIXTURE_PATH` (string, optional):
  - Path to demo-fixtures.json (default: `backend/data/demo-fixtures.json`)
  - Allows custom fixture files for testing

**Documentation:**
- Add to SETUP.md or a new DEMO_MODE.md:
  - How to enable demo mode: `DEMO_MODE=true npm start` (in backend/)
  - What demo fixtures are available: `demo.tata-aig.local` (7 pages)
  - Example workflow: Start New Scan → Select "Main Domain" → Enter "https://demo.tata-aig.local" → Click "Discover Pages" → See fixture list with demo label → Select 3 URLs → Click "Scan Selected Pages" → Watch One Page progress (1 URL) in console

---

## Responses to Design Review Findings (if applicable)

*No prior design review exists; this is the first full design.*

---

