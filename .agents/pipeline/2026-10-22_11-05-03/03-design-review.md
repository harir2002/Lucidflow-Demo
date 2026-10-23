# Design Review: Two-Mode Scan UI Implementation

**Date:** 2026-10-22  
**Reviewer:** Design Review Agent  
**Status:** CHANGES_REQUESTED (3 HIGH findings)

---

## Verified Assumptions

1. ✅ **Demo mode implementation already in place**: `sitemap.js` correctly implements `isDemoMode()` with explicit string comparison (`'true'`), `loadDemoFixtures()`, and returns fixture data with `demoLabel` field for matching domains.

2. ✅ **Demo fixtures file exists and is well-formed**: `backend/data/demo-fixtures.json` contains the expected structure with `demo.tata-aig.local` domain, 7 URLs, `sitemapFound: true`, and the demo label "Demo data — live domain discovery is not active in this demo".

3. ✅ **License service exports TRIAL_PAGE_LIMIT and getLicenseState()**: `license.js` exports both `TRIAL_PAGE_LIMIT = 3` and `getLicenseState()` function that returns `{ licensed, trial, max_pages, licensee, expires }`. Default trial mode returns `max_pages: 3`.

4. ✅ **Existing API client is thin wrapper**: `frontend/src/api/client.js` contains only HTTP request methods; no business logic embedded.

5. ✅ **scanOrchestrator.js follows the intended discovery → crawl → analyze flow**: Current code discovers URLs via `discoverAllUrls()`, applies license cap, and processes pages one at a time.

6. ✅ **Database schema is extensible**: scans table exists with `target_url`, `url_pattern`, `status`, `total_pages`, `scanned_pages` columns but no `scan_mode` column yet.

7. ✅ **Sitemap.js discoverAllUrls already returns `demoLabel` in responses**: Fixture responses include the `demoLabel` field as designed.

8. ✅ **NewScan.jsx exists and contains a single URL input**: Current form has `targetUrl` input with default value `https://www.royalsundaram.in` and `urlPattern` input.

---

## Unverified/Wrong Assumptions

1. ❌ **Demo fixtures will never reach the live scan engine when demo mode is OFF** — The design claims safety guardrails are in place, but `scanOrchestrator.js` does NOT contain any checks to block demo URLs when demo mode is disabled. The design specifies:

   > "Implementation safeguard in scanOrchestrator.js: if any URL contains demo fixture domain and demo mode is OFF, skip it or mark as ERROR"

   **Reality:** This code does not exist. Current `startScan()` does not inspect URLs for demo domains. If a user somehow selects demo URLs in non-demo mode, they will be sent to Playwright as normal URLs.

2. ❌ **The API client's createScan method already accepts scan_mode and selected_urls** — The design states it "extends" the method with new parameters and defaults. **Reality:** Current `api.createScan(targetUrl, urlPattern)` has only 2 parameters and no support for `scan_mode` or `selected_urls`. The design assumes this is an extension, but the signature must change.

3. ❌ **The backend POST /api/scans route accepts scan_mode and selected_urls** — The design claims the route "extends" the existing route. **Reality:** Current `routes/scans.js` only destructures `target_url` and `url_pattern` from the request body. No `scan_mode` or `selected_urls` fields are handled.

4. ❌ **scanOrchestrator.startScan already accepts an options parameter** — The design proposes `startScan(scanId, targetUrl, urlPattern, io, options = {})`. **Reality:** Current signature is `startScan(scanId, targetUrl, urlPattern, io)` with no options parameter. The design assumes this is an optional extension, but the function must be modified to accept it.

5. ❌ **The scans table schema includes scan_mode column** — The design specifies a new column. **Reality:** Verified via database.js — no `scan_mode` column exists. The ALTER TABLE migration is not written.

---

## Findings

### HIGH

**1. Missing demo URL safety guard in orchestrator — fixture URLs not blocked when demo mode is OFF**

**Location:** Design section "API Contracts" and "Safety boundary — fixture URLs never reach the live scan engine" / Implementation specification in scanOrchestrator.js

**Problem:** The design claims a safety check prevents demo URLs from reaching the live Playwright engine when demo mode is disabled:

> "Implementation safeguard in scanOrchestrator.js: ... if any URL contains demo.tata-aig.local and demo mode is OFF, skip it or mark as ERROR"

However, this code does not exist in `scanOrchestrator.js`. The current `startScan()` function has no logic to inspect discovered/selected URLs for demo domains. If a user enters `demo.tata-aig.local` when `DEMO_MODE` is not `'true'`, the URL will be treated as a normal live domain and Playwright will attempt to fetch it, potentially causing network errors or unintended behavior. This violates requirement 9.1: "Fixture URLs must never be submitted to the live Playwright crawler when demo mode is off."

**Impact:** HIGH — This is a security/safety boundary violation. Users could accidentally or maliciously submit demo fixture URLs to the live scan engine, causing errors or confusion.

**Concrete Fix:** Add the following check at the start of the URL scanning loop in `scanOrchestrator.js` (after license enforcement, before inserting pages):

```javascript
// Safety check: reject demo URLs when demo mode is OFF
const isDemoModeActive = process.env.DEMO_MODE === 'true';
if (!isDemoModeActive) {
  const demoUrls = allUrls.filter(u => u.includes('demo.tata-aig.local'));
  if (demoUrls.length > 0) {
    updateScan({ status: 'error' });
    emit(io, scanId, 'scan:error', {
      message: 'Fixture URLs detected outside demo mode — scan blocked for safety. Enable DEMO_MODE=true to scan demo domains.',
    });
    return;
  }
}
```

This must be placed in `startScan()` after the license cap is applied but before pages are inserted into the database.

---

**2. API client createScan method signature is incomplete — missing scan_mode and selected_urls parameters**

**Location:** Design section "Frontend API Client Changes" / Actual file: `frontend/src/api/client.js` line 17

**Problem:** The design specifies:

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

However, the actual implementation in `client.js` is:

```javascript
createScan: (targetUrl, urlPattern) =>
  request('/scans', { method: 'POST', body: JSON.stringify({ target_url: targetUrl, url_pattern: urlPattern }) }),
```

The new parameters are not present. This prevents the frontend from sending scan mode and selected URLs to the backend. Requirement 2.4 and 3.6 will fail because the API client cannot construct the correct request bodies for One Page and Main Domain modes.

**Impact:** HIGH — The entire mode-branching feature cannot work. Frontend components will not be able to pass mode and selected URLs to the backend.

**Concrete Fix:** Replace the `createScan` method in `frontend/src/api/client.js` with:

```javascript
createScan: (targetUrl, urlPattern, scanMode = 'one-page', selectedUrls = []) =>
  request('/scans', {
    method: 'POST',
    body: JSON.stringify({
      target_url: targetUrl,
      url_pattern: urlPattern,
      scan_mode: scanMode,
      selected_urls: selectedUrls,
    }),
  }),
```

Also add the new `discoverUrls` method to the `api` object:

```javascript
discoverUrls: (baseUrl) =>
  request('/scans/discover', {
    method: 'POST',
    body: JSON.stringify({ base_url: baseUrl }),
  }),
```

---

**3. Backend POST /api/scans route does not accept or store scan_mode and selected_urls**

**Location:** Design section "Backend Routes" / Actual file: `backend/src/routes/scans.js` lines 10–23

**Problem:** The design specifies the route should accept and store `scan_mode` and `selected_urls`:

> "scan_mode defaults to 'one-page' if omitted (backward compatible)"  
> "selected_urls defaults to [] if omitted"  
> "Store scan_mode in the scans table for audit/reporting"

However, the actual route destructures only `target_url` and `url_pattern`:

```javascript
const { target_url, url_pattern } = req.body;
```

And the INSERT query does not reference `scan_mode`:

```javascript
db.prepare(`INSERT INTO scans (id, target_url, url_pattern, status) VALUES (?, ?, ?, 'discovering')`)
  .run(id, target_url, url_pattern || null);
```

This means:
- `scan_mode` will be silently ignored if sent by the frontend
- `selected_urls` will be silently ignored
- The mode information is not stored in the database for audit purposes
- The backend has no way to know which mode was requested when restarting a scan

Requirements 7.1, 7.2, and 8.1 cannot be met without this change.

**Impact:** HIGH — The backend cannot receive or store mode information. Mode branching logic in the orchestrator will have no input.

**Concrete Fix:** Modify `backend/src/routes/scans.js` POST / route:

```javascript
router.post('/', (req, res) => {
  const { target_url, url_pattern, scan_mode = 'one-page', selected_urls = [] } = req.body;
  if (!target_url) return res.status(400).json({ error: 'target_url is required' });

  // Validate scan_mode
  if (!['one-page', 'main-domain'].includes(scan_mode)) {
    return res.status(400).json({ error: 'scan_mode must be "one-page" or "main-domain"' });
  }

  // Validate selected_urls is an array
  if (!Array.isArray(selected_urls)) {
    return res.status(400).json({ error: 'selected_urls must be an array' });
  }

  let parsed;
  try { parsed = new URL(target_url); } catch { return res.status(400).json({ error: 'target_url is not a valid URL' }); }

  const id = uuid();
  db.prepare(`INSERT INTO scans (id, target_url, url_pattern, scan_mode, status) VALUES (?, ?, ?, ?, 'discovering')`)
    .run(id, target_url, url_pattern || null, scan_mode);

  // Pass selectedUrls to startScan via options
  startScan(id, target_url, url_pattern, io, { scanMode: scan_mode, selectedUrls: selected_urls })
    .catch(err => console.error('Scan crashed:', err));

  res.status(201).json({ id, target_url, scan_mode, status: 'discovering' });
});
```

---

### MEDIUM

**4. Database schema is missing scan_mode column — existing query patterns will fail**

**Location:** Design section "Database Schema Extension" / Actual file: `backend/src/db/database.js` (lines 11–29 CREATE TABLE)

**Problem:** The design specifies:

> "Add one column: ALTER TABLE scans ADD COLUMN scan_mode TEXT DEFAULT 'one-page';"

However, this migration has not been applied. The scans table definition in `database.js` does not include the `scan_mode` column. New queries that reference `scan_mode` (e.g., in the POST / route and in the restart endpoint) will fail with a "no such column" error.

The design assumes the column exists in the response at requirement 8 (Acceptance Criteria):

> "API accepts scan_mode and selected_urls: POST /api/scans with body { target_url, url_pattern, scan_mode: 'main-domain', selected_urls: [...] } succeeds..."

Without the column, the INSERT will fail.

**Impact:** MEDIUM — Database operations will error until the schema is updated. No scans can be created once the new route code is deployed without this schema change.

**Concrete Fix:** Add the `scan_mode` column to the `db.exec()` call in `backend/src/db/database.js` after the `url_pattern` line:

```javascript
db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id            TEXT PRIMARY KEY,
    target_url    TEXT NOT NULL,
    url_pattern   TEXT,
    scan_mode     TEXT DEFAULT 'one-page',  -- <-- ADD THIS LINE
    status        TEXT DEFAULT 'discovering',
    total_pages   INTEGER DEFAULT 0,
    scanned_pages INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  ...
```

For existing databases, add a migration or manually run:

```sql
ALTER TABLE scans ADD COLUMN scan_mode TEXT DEFAULT 'one-page';
```

---

**5. scanOrchestrator.startScan signature does not accept options parameter — mode branching cannot happen**

**Location:** Design section "Backend Orchestrator Branching" / Actual file: `backend/src/services/scanOrchestrator.js` line 18

**Problem:** The design specifies:

> "In scanOrchestrator.js — modify startScan signature: async function startScan(scanId, targetUrl, urlPattern, io, options = {})"

However, the current signature is:

```javascript
async function startScan(scanId, targetUrl, urlPattern, io) {
```

There is no `options` parameter. Mode branching logic cannot be implemented without this parameter to receive `scanMode` and `selectedUrls`. Requirements 8.1 through 8.6 (Orchestrator Mode Branching) cannot be met.

**Impact:** MEDIUM — The core mode-branching orchestration logic cannot be written. One Page and Main Domain scans will behave identically (always discover → crawl all).

**Concrete Fix:** Update the `startScan` function signature and extract options:

```javascript
async function startScan(scanId, targetUrl, urlPattern, io, options = {}) {
  const { scanMode = 'one-page', selectedUrls = [] } = options;
  activeScans.set(scanId, { paused: false, cancelled: false });

  // ... rest of function

  // After license enforcement, replace the discovery block with mode branching:
  let allUrls;
  
  if (scanMode === 'one-page') {
    // One Page mode: scan only the targetUrl
    allUrls = [targetUrl];
    emit(io, scanId, 'scan:log', { message: 'One Page mode: scanning 1 URL' });
  } else if (scanMode === 'main-domain' && selectedUrls.length > 0) {
    // Main Domain mode: use selectedUrls directly (already discovered by frontend)
    allUrls = selectedUrls;
    emit(io, scanId, 'scan:log', { message: `Main Domain mode: scanning ${selectedUrls.length} selected page(s)` });
  } else {
    // Backward compatibility or unrecognized mode: proceed with discovery
    emit(io, scanId, 'scan:log', { message: 'Discovering pages from sitemap...' });
    const { urls: sitemapUrls, sitemapFound, demoLabel } = await discoverAllUrls(targetUrl, (msg) => emit(io, scanId, 'scan:log', { message: msg }));
    if (demoLabel) {
      emit(io, scanId, 'scan:log', { message: demoLabel });
    }
    allUrls = sitemapUrls;
    if (!sitemapFound || allUrls.length === 0) {
      emit(io, scanId, 'scan:log', { message: 'No sitemap found — crawling to discover pages...' });
      const crawler = new Crawler({ targetUrl, crawlDelayMs: 600, screenshotsDir: SCREENSHOTS_DIR });
      allUrls = await crawler.discoverOnly((msg) => emit(io, scanId, 'scan:log', { message: msg }), 300);
    }
  }

  // Apply URL pattern filter (except for One Page mode which ignores it)
  if (urlPattern && scanMode !== 'one-page') {
    const re = new RegExp(urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
    allUrls = allUrls.filter(u => re.test(u));
  }
  allUrls.sort((a, b) => scoreUrl(b) - scoreUrl(a));

  // ... rest continues as before (license enforcement, page insertion, scan loop)
```

---

**6. POST /api/scans/discover endpoint does not exist**

**Location:** Design section "Backend Routes" / Actual file: `backend/src/routes/scans.js` (no discover endpoint)

**Problem:** The design specifies:

> "Add a new POST /api/scans/discover endpoint that accepts base_url in the request body and returns discovered URLs with optional demoLabel."

However, this endpoint is not implemented. The route handler file only contains the /scans endpoints (POST /, GET /, GET /:id, etc.). Requirement 3.3, 3.4, and 9 of the Acceptance Criteria cannot be met without this endpoint.

**Impact:** MEDIUM — Frontend cannot call `api.discoverUrls()` because the backend endpoint does not exist. Main Domain mode's discovery step will fail.

**Concrete Fix:** Add a new POST /api/scans/discover route in `backend/src/routes/scans.js` (or create a new file `backend/src/routes/discover.js` and mount it):

```javascript
router.post('/discover', async (req, res) => {
  const { base_url } = req.body;
  if (!base_url) return res.status(400).json({ error: 'base_url is required' });

  let parsed;
  try { parsed = new URL(base_url); } catch { return res.status(400).json({ error: 'base_url is not a valid URL' }); }

  try {
    const result = await discoverAllUrls(base_url);
    res.json({
      urls: result.urls || [],
      sitemapFound: result.sitemapFound || false,
      demoLabel: result.demoLabel || null,
    });
  } catch (err) {
    console.error('Discovery error:', err);
    res.status(500).json({ error: 'Discovery failed: ' + err.message });
  }
});
```

Also ensure `discoverAllUrls` is exported from `sitemap.js` (it already is) and imported into the routes module.

---

**7. startScan callers do not pass options parameter — backward compat will work but mode feature is inactive**

**Location:** Design section "Backward Compatibility" / Actual file: `backend/src/routes/scans.js` lines 20 and line 101 (restart endpoint)

**Problem:** Even after the `startScan` signature is updated to accept options, the existing call sites must be updated to pass options. Currently:

- Line 20 in POST /: `startScan(id, target_url, url_pattern, io).catch(...)`
- Line 101 in restart endpoint: `startScan(req.params.id, scan.target_url, scan.url_pattern, io).catch(...)`

These calls do not pass the options parameter, so even if the function is updated to accept it, backward compatibility will only work by accident (the defaults apply). The mode feature will be inactive.

**Impact:** MEDIUM — Mode information needs to be passed from the database to the orchestrator. The POST /scans route must extract `scanMode` from the request and pass it; the restart endpoint must read it from the database and pass it.

**Concrete Fix:** Update both call sites:

In POST / route (after storing the scan):

```javascript
startScan(id, target_url, url_pattern, io, { scanMode: scan_mode, selectedUrls: selected_urls })
  .catch(err => console.error('Scan crashed:', err));
```

In the restart endpoint:

```javascript
const scan = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(req.params.id);
if (!scan) return res.status(404).json({ error: 'Scan not found' });
if (isScanActive(req.params.id)) return res.status(409).json({ error: 'Scan already running' });

db.prepare(`UPDATE scans SET status = 'scanning' WHERE id = ?`).run(req.params.id);
startScan(
  req.params.id,
  scan.target_url,
  scan.url_pattern,
  io,
  { scanMode: scan.scan_mode || 'one-page', selectedUrls: [] }  // <-- pass options
).catch(err => console.error('Scan crashed:', err));
```

---

### NIT

**8. Demo fixture file path is not configurable in a clean way — DEMO_FIXTURE_PATH env var works but default path is hardcoded relative path**

**Location:** Design section "Demo Mode & Fixtures" / Actual file: `backend/src/services/sitemap.js` line 48

**Problem:** The code uses a relative path with `path.join(__dirname, '..', '..', 'data', 'demo-fixtures.json')`, which works but is fragile. The env var fallback exists, but relying on relative paths from `__dirname` can break if the module structure changes. This is a minor clarity issue, not a blocker.

**Impact:** NIT — The code works as intended, but the approach is slightly less robust than using an absolute path or a clearer configuration pattern.

**Suggestion:** Use a more explicit path construction:

```javascript
function loadDemoFixtures() {
  const fixturePath = process.env.DEMO_FIXTURE_PATH || 
    path.resolve(__dirname, '../../data/demo-fixtures.json');
  if (!fs.existsSync(fixturePath)) {
    return null;
  }
  // ... rest continues
}
```

Or alternatively, compute the data directory once:

```javascript
const DATA_DIR = path.resolve(__dirname, '../../data');
function loadDemoFixtures() {
  const fixturePath = process.env.DEMO_FIXTURE_PATH || 
    path.join(DATA_DIR, 'demo-fixtures.json');
  // ...
}
```

---

**9. Design does not specify what constitutes a "valid" URL for the frontend DiscoveryPreview selection — edge cases are possible**

**Location:** Design section "Component Specifications" → DiscoveryPreview.jsx

**Problem:** The design specifies that `urls` is a `string[]` but does not clarify whether:
- Empty strings are allowed
- Relative URLs are allowed (or if all URLs must be absolute)
- URLs with fragments (#) are allowed
- How malformed URLs in the array are handled

**Impact:** NIT — Implementation detail. The component tests should clarify these constraints, but the design is incomplete in this regard.

**Suggestion:** Add to the DiscoveryPreview specification:

> "All URLs in the `urls` prop must be valid absolute HTTP(S) URLs. URLs with fragments or query parameters are allowed but treated as distinct URLs. The component does not validate URLs; it assumes the backend has already done so."

---

**10. Error message in demo mode safety guard is specific to demo but could be improved for general UX**

**Location:** Finding #1 (HIGH finding, demo URL safety guard)

**Problem:** The proposed error message is specific to demo mode:

> "Fixture URLs detected outside demo mode — scan blocked for safety. Enable DEMO_MODE=true to scan demo domains."

This message assumes users are trying to enable demo mode intentionally. In reality, a user might have simply entered a URL that happens to match the demo domain (e.g., typing "demo.tata-aig.local" thinking it's a real website). The message could be clearer about what happened.

**Impact:** NIT — UX/messaging clarity only.

**Suggestion:** Improve the error message:

```javascript
emit(io, scanId, 'scan:error', {
  message: 'The domain demo.tata-aig.local is reserved for demo purposes and cannot be scanned in production mode. ' +
    'To run a demo, set environment variable DEMO_MODE=true on the backend and refresh the page.',
});
```

---

## Summary

**Total findings:** 10 (3 HIGH, 4 MEDIUM, 3 NIT)

**Verdict:** CHANGES_REQUESTED

### Must Fix (HIGH):
1. Add demo URL safety guard in scanOrchestrator.startScan() to block fixture URLs when demo mode is OFF
2. Update api.createScan() signature to accept scanMode and selectedUrls parameters + add api.discoverUrls() method
3. Update POST /api/scans route to accept, validate, and store scan_mode and selected_urls

### Must Fix (MEDIUM):
4. Add scan_mode column to scans table schema in database.js
5. Update scanOrchestrator.startScan signature to accept options parameter and implement mode branching logic
6. Implement POST /api/scans/discover endpoint that calls discoverAllUrls() and returns URLs + demoLabel
7. Update scanOrchestrator.startScan() call sites in routes to pass options with scan_mode and selectedUrls

### Nice to Have (NIT):
8. Use absolute paths for fixture file loading
9. Clarify URL validation rules in DiscoveryPreview design
10. Improve error messaging for demo domain safety guard

---

## Conclusion

The design is well-structured and clearly articulates the intent of the two-mode feature. However, it is based on several assumptions about the existing codebase that are incorrect. The core issue is that the design document does not acknowledge that **none of the backend changes have been implemented yet**. The three HIGH findings represent missing implementations that are prerequisites for the entire feature to function:

1. **Demo URL safety guard** ensures fixtures never leak to live scanning
2. **API client and route extensions** enable the frontend and backend to communicate mode information
3. **Orchestrator options parameter** enables the branching logic to receive and act on the mode

Once these are fixed, the MEDIUM findings (database schema, endpoint implementation, option passing) are straightforward. The design can then proceed to implementation.

**No MEDIUM or HIGH findings represent conflicting information within the design itself** — the design is internally consistent and well-specified. All findings are about misalignments between the design's assumptions and the current source code.
