# Implementation Plan: Saved Reports Feature

**Goal:** Enable users to quickly retrieve and download previously generated PDF reports without re-scanning, with URL normalization and PDF caching strategy.

**Scope:** Backend service architecture, API endpoints, PDF extraction/caching, URL matching logic, and frontend components for displaying saved reports.

---

## Architecture Decisions

### 1. Saved Reports Storage Structure
- **Decision:** Store reports as JSON metadata in SQLite (`saved_reports` table) with PDFs cached as files in `backend/reports/` directory
- **Rationale:** Keeps audit trail in DB; PDFs as files avoid BLOB bloat; JSON allows fast querying by URL/domain patterns
- **Schema:** `saved_reports` table tracks scan_id, URL, normalized URL, PDF path, extracted text (for searching), created_at, expires_at

### 2. URL Normalization & Matching
- **Decision:** Normalize URLs to scheme + hostname only (ignore query params, fragments, paths except for path-based comparison); support exact match, domain wildcard, and pattern matching
- **Rationale:** Different scan runs of the same site may hit different pages; normalizing enables matching "insurance.com" to any subpath without false positives
- **Logic:** Remove query/fragment → lowercase → deduplicate subdomains; support regex patterns for advanced matching

### 3. PDF Extraction Strategy
- **Decision:** Use `pdfjs-dist` npm package to extract text layer from PDF on demand; cache extracted text in DB for fast searching
- **Rationale:** PDFKit generates PDFs without OCR; text layer extraction enables report search/preview without re-processing; caching avoids re-reading file on every request
- **Trigger:** Extract once on first save; invalidate on PDF regeneration

### 4. Caching & Cache Invalidation
- **Decision:** Cache extracted PDF text in `saved_reports.extracted_text` column; invalidate when new scan on same URL completes
- **Rationale:** Reduces I/O on repeated searches; TTL-based expiry (e.g., 90 days) keeps stale reports manageable
- **Expiry:** `expires_at = NOW() + 90 days`; background cleanup job (optional first phase)

---

## Database Schema Changes

### New Table: `saved_reports`

```sql
CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,               -- Original URL from scan
  normalized_url TEXT NOT NULL,           -- Normalized: scheme + host
  pdf_file_path TEXT NOT NULL,            -- backend/reports/<uuid>.pdf
  pdf_file_size INTEGER,                  -- bytes, for UI
  extracted_text TEXT,                    -- Cached text from PDF for search
  page_count INTEGER,                     -- for UI
  findings_count INTEGER,                 -- cached from scan
  highest_risk TEXT,                      -- HIGH | MEDIUM | LOW | CLEAN
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,                        -- TTL: 90 days by default
  UNIQUE(normalized_url, scan_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_normalized_url ON saved_reports(normalized_url);
CREATE INDEX IF NOT EXISTS idx_saved_reports_expires_at ON saved_reports(expires_at);
```

### Extended Scans Table

```sql
-- Scans table already exists; no changes needed
-- New fields not required; use scan_id as FK to saved_reports
```

---

## Backend Service: `backend/src/services/savedReports.js`

**Purpose:** Core logic for URL normalization, PDF extraction, caching, and matching.

### Exports

```javascript
module.exports = {
  normalizeUrl,           // (url) => normalized string
  matchUrl,              // (url, pattern, normalization) => bool
  extractPdfText,        // (filePath) => Promise<text>
  savePdfReport,         // (scanId, pdf, targetUrl) => Promise<reportId>
  findSavedReports,      // (searchUrl, options) => Promise<reports[]>
  getSavedReportUrl,     // (reportId) => url or null
};
```

### Function Breakdown

**normalizeUrl(url: string): string**
- Lines 1–40: Parse URL → extract scheme + hostname only (remove path, query, fragment)
- Lowercase all parts
- Handle edge cases: missing scheme (prepend https), international domains (IDN)
- Return format: `https://example.com` (no trailing slash)

**matchUrl(targetUrl: string, savedUrl: string, mode: 'exact'|'domain'|'pattern'): boolean**
- Lines 42–80: 
  - 'exact': normalize both → strict equality
  - 'domain': normalize both → compare hostname only (e.g., `insurance.com` matches `*.insurance.com`)
  - 'pattern': treat savedUrl as regex pattern → test targetUrl
- Return boolean

**extractPdfText(filePath: string): Promise<string>**
- Lines 82–130: Use pdfjs-dist to load PDF file
- Read text from each page's text layer
- Concatenate with page breaks
- On error (no text layer): return empty string (OCR not in scope)
- Catch file-not-found gracefully → return null

**savePdfReport(scanId: string, pdfBuffer: Buffer, targetUrl: string): Promise<string>**
- Lines 132–180:
  - Generate UUID for report ID
  - Normalize target URL
  - Write pdfBuffer to `backend/reports/<uuid>.pdf`
  - Extract text asynchronously (do not block scan completion)
  - Get page count + size from pdfBuffer
  - Get findings count + highest risk from DB (query scans/findings)
  - INSERT into saved_reports with extracted_text
  - Return reportId

**findSavedReports(searchUrl: string, options: {mode, limit, maxAge}): Promise<reports[]>**
- Lines 182–220:
  - Normalize searchUrl
  - Query saved_reports WHERE normalized_url matches (mode='domain'|'exact'|'pattern')
  - Filter by age if maxAge provided (created_at > NOW() - maxAge)
  - Sort by created_at DESC
  - Limit results (default 10)
  - Return array of {id, scanId, targetUrl, pdfPath, findingsCount, highestRisk, createdAt}

**getSavedReportUrl(reportId: string): string | null**
- Lines 222–230: Query saved_reports by ID → return pdf_file_path or null if not found

---

## Backend Routes: `backend/src/routes/reports.js` (NEW FILE)

**Purpose:** HTTP endpoints for saved report discovery and download.

### Endpoints

**POST /api/reports/check**
- Request: `{ url: string, match_mode?: 'exact'|'domain'|'pattern' }`
- Response: `{ found: bool, reports: [{id, targetUrl, createdAt, findingsCount, highestRisk}], totalCount: int }`
- Logic: Call `findSavedReports(url)` → return matching reports or empty array
- Status 200 / 400 on invalid URL

**GET /api/reports/:reportId**
- Request: `reportId` in path
- Response: `{ id, scanId, targetUrl, createdAt, findingsCount, highestRisk, pageCount, fileSize, extracted_text_preview }`
- Logic: Query DB → return metadata (do not stream PDF yet)
- Status 200 / 404 if not found

**GET /api/reports/:reportId/download**
- Request: `reportId` in path
- Response: PDF file stream with `Content-Disposition: attachment`
- Logic: Call `getSavedReportUrl(reportId)` → stream file or 404
- Status 200 / 404

**DELETE /api/reports/:reportId**
- Request: `reportId` in path
- Response: `{ success: bool, message: string }`
- Logic: Delete DB record + file from disk
- Status 204 / 404

**GET /api/reports/scan/:scanId/saved**
- Request: `scanId` in path
- Response: `{ reportId, saved_at: datetime, file_size, page_count }`
- Logic: Query saved_reports WHERE scan_id = ? → return single report or null
- Status 200 / 404

---

## Backend Integration: Modify Existing Files

### `backend/src/routes/report.js` (Lines 1–10)

**Add automatic PDF save on generation:**

```javascript
// After PDF doc.end() (line ~220):
const reportId = uuid();
const reportPath = path.join(REPORTS_DIR, `${reportId}.pdf`);

// Stream to file WHILE streaming to HTTP response
const fileStream = fs.createWriteStream(reportPath);
doc.pipe(fileStream);
doc.pipe(res);

// On completion, save report metadata
fileStream.on('finish', async () => {
  const { savePdfReport } = require('../services/savedReports');
  await savePdfReport(scan.id, fs.readFileSync(reportPath), scan.target_url)
    .catch(err => console.error('Failed to save report:', err));
});

doc.end();
```

**Decision:** Save report metadata asynchronously after PDF generation completes; do not block user download.

### `backend/src/routes/scans.js` (New POST Endpoint)

**Integrate saved reports discovery into NewScan page:**

```javascript
// Add endpoint around line 50 (after /discover endpoint):
router.post('/reports/check', async (req, res) => {
  const { url, match_mode = 'domain' } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'url is not a valid URL' });
  }

  try {
    const { findSavedReports } = require('../services/savedReports');
    const reports = await findSavedReports(url, { mode: match_mode, limit: 5 });
    res.json({
      found: reports.length > 0,
      reports: reports.map(r => ({
        id: r.id,
        scanId: r.scan_id,
        targetUrl: r.target_url,
        createdAt: r.created_at,
        findingsCount: r.findings_count,
        highestRisk: r.highest_risk
      }))
    });
  } catch (err) {
    res.status(500).json({ error: `Check failed: ${err.message}` });
  }
});
```

### `backend/src/routes/reports.js` (NEW FILE — Create)

See section "Backend Routes" above. Full file implementation in step 2 below.

---

## Frontend: API Client Extension

### Modify `frontend/src/api/client.js`

**Add methods (around line 45, after existing methods):**

```javascript
/** Check if saved reports exist for a URL */
checkSavedReports: (url, matchMode = 'domain') =>
  request('/scans/reports/check', {
    method: 'POST',
    body: JSON.stringify({ url, match_mode: matchMode })
  }),

/** Get metadata for a saved report */
getSavedReport: (reportId) =>
  request(`/reports/${reportId}`),

/** Download a saved report PDF */
downloadSavedReportUrl: (reportId) =>
  `${API_BASE}/reports/${reportId}/download`,

/** Delete a saved report */
deleteSavedReport: (reportId) =>
  request(`/reports/${reportId}`, { method: 'DELETE' }),

/** Get saved report info for a scan */
getScanSavedReport: (scanId) =>
  request(`/reports/scan/${scanId}/saved`)
```

---

## Frontend: Component `SavedReportBanner.jsx` (NEW)

**Purpose:** Display "Saved Report Found" banner in NewScan, offering quick access.

**Location:** `frontend/src/components/SavedReportBanner.jsx`

**Props:**
```javascript
{
  url: string,              // Current user URL input
  onOpenReport: (reportId) => void
}
```

**Behavior:**
- Mount/URL changes → call `checkSavedReports(url)` with debounce (500ms)
- If `found: true` → show banner with findings count + risk level
- "View Report" CTA → call `onOpenReport(reportId)`
- Fade animation on show/hide

**JSX Structure:**
```
- If loading: pulsing skeleton
- If found:
  - Green/amber/red bar (by highest_risk)
  - "Saved Report Found (date)"
  - "X findings on Y pages"
  - "View Report" button
- If not found: null (do not render)
```

---

## Frontend: Component `ReportViewer.jsx` (NEW)

**Purpose:** Display saved report details + download link.

**Location:** `frontend/src/components/ReportViewer.jsx`

**Props:**
```javascript
{
  reportId: string,
  onClose: () => void
}
```

**State:**
- report: metadata from `getSavedReport(reportId)`
- loading: bool
- error: string

**JSX Structure:**
```
- Modal overlay
- Header: "Saved Report" + date
- Metadata: Target URL, pages, findings, risk level
- Actions: Download PDF, Delete, Close
- Text preview (first 500 chars of extracted_text)
```

---

## Frontend: Modify `NewScan.jsx`

**Changes (Lines to modify):**

1. **Lines 1–10 (imports):** Add SavedReportBanner import
2. **Lines 25–30 (state):** Add:
   ```javascript
   const [savedReportId, setSavedReportId] = useState(null);
   const [showReportViewer, setShowReportViewer] = useState(false);
   ```
3. **Lines 70–90 (return JSX):** Add SavedReportBanner before main form:
   ```javascript
   <SavedReportBanner 
     url={items[0]} 
     onOpenReport={(id) => {
       setSavedReportId(id);
       setShowReportViewer(true);
     }}
   />
   ```
4. **Lines 140–150 (return end):** Add ReportViewer modal:
   ```javascript
   {showReportViewer && (
     <ReportViewer 
       reportId={savedReportId} 
       onClose={() => setShowReportViewer(false)}
     />
   )}
   ```

---

## Frontend: Modify `ScanConsole.jsx`

**Changes (Lines to modify):**

1. **Lines 1–10 (imports):** Add ReportViewer import
2. **Lines 30–40 (state):** Add:
   ```javascript
   const [showSavedReportOption, setShowSavedReportOption] = useState(false);
   const [savedReportId, setSavedReportId] = useState(null);
   ```
3. **Lines 120–140 (on scan:complete socket event):** Add:
   ```javascript
   socket.on('scan:complete', async () => {
     // ... existing code ...
     try {
       const saved = await api.getScanSavedReport(scanId);
       if (saved?.reportId) {
         setSavedReportId(saved.reportId);
         setShowSavedReportOption(true);
       }
     } catch (err) {
       console.error('Failed to get saved report:', err);
     }
   });
   ```
4. **Lines 200–220 (return JSX):** Add button in action bar:
   ```javascript
   {showSavedReportOption && (
     <button 
       className="btn secondary"
       onClick={() => setShowReportViewer(true)}
     >
       View Saved Report
     </button>
   )}
   ```
5. **Lines 240–250 (return end):** Add modal:
   ```javascript
   <ReportViewer 
     reportId={savedReportId} 
     onClose={() => setShowReportViewer(false)}
   />
   ```

---

## PDF Extraction: Add `pdfjs-dist` Dependency

### `backend/package.json` (Lines 15–20)

**Add to dependencies:**
```json
"pdfjs-dist": "^4.1.0"
```

**Decision:** Use v4.1.0 (latest stable) for full PDF.js text extraction support.

---

## Test Strategy

### Backend Unit Tests: `backend/src/services/__tests__/savedReports.test.js`

**Test cases (Jest):**
1. `normalizeUrl`: 
   - HTTPS URL with path → returns scheme + host only
   - HTTP URL → normalizes to HTTPS
   - IDN domain → handles correctly
   - Missing scheme → prepends https
2. `matchUrl`:
   - Exact mode: identical normalized URLs match
   - Domain mode: `*.example.com` matches `sub.example.com`
   - Pattern mode: regex pattern matching works
   - Edge case: different ports treated as different (www:8080 ≠ www:443)
3. `extractPdfText`:
   - Valid PDF with text layer → returns text
   - PDF without text layer → returns empty string
   - File not found → returns null
4. `savePdfReport`:
   - Creates report record in DB
   - Writes file to disk
   - Returns reportId
   - Finds findings count + highest risk correctly
5. `findSavedReports`:
   - Returns matching reports by URL
   - Respects limit parameter
   - Filters by maxAge
   - Returns empty array if no match

### Frontend Component Tests: `frontend/src/components/__tests__/SavedReportBanner.test.jsx`

**Test cases (Vitest/React Testing Library):**
1. Shows loading state on mount
2. Displays banner when reports found
3. Calls onOpenReport when "View Report" clicked
4. Debounces URL changes (no call within 500ms)
5. Hides banner when no reports found

### Frontend Component Tests: `frontend/src/components/__tests__/ReportViewer.test.jsx`

**Test cases (Vitest/React Testing Library):**
1. Loads report metadata on mount
2. Displays download link
3. Delete button calls API
4. Shows error on fetch failure
5. Modal closes on close button

### E2E Manual Test Flow

1. **Setup:** Run backend with DEMO_MODE=true; frontend on :5173
2. **Step 1 — Create first scan:**
   - NewScan: Enter URL → Start Scan → Monitor ScanConsole → Complete
3. **Step 2 — Verify saved report created:**
   - Query DB: `SELECT * FROM saved_reports` → verify record exists
   - Verify file exists: `backend/reports/<uuid>.pdf`
4. **Step 3 — Check for saved report on re-entry:**
   - NewScan: Same URL input → Banner appears "Saved Report Found"
   - Click "View Report" → ReportViewer modal opens
   - Download PDF → verify file downloads
5. **Step 4 — Test URL matching:**
   - Query with domain variant (e.g., `www.example.com` vs `example.com`)
   - Banner should still find report (domain mode matching)
6. **Step 5 — Test deletion:**
   - Delete report from ReportViewer
   - Verify DB record deleted + file removed
   - Return to NewScan → Banner no longer appears

---

## Implementation Sequence (Dependencies)

1. **Phase 1 — Backend Foundation:**
   - Create `backend/src/services/savedReports.js` (URL normalization, PDF extraction, DB logic)
   - Add `pdfjs-dist` to `backend/package.json`
   - Extend DB schema: add `saved_reports` table and indexes

2. **Phase 2 — Backend API:**
   - Modify `backend/src/routes/report.js` to auto-save reports on generation
   - Create `backend/src/routes/reports.js` (new endpoints)
   - Modify `backend/src/routes/scans.js` to add `/reports/check` endpoint

3. **Phase 3 — Backend Testing:**
   - Write unit tests for `savedReports.js`
   - Run `npm test` → all tests pass

4. **Phase 4 — Frontend API Client:**
   - Extend `frontend/src/api/client.js` with new methods

5. **Phase 5 — Frontend Components:**
   - Create `SavedReportBanner.jsx` component
   - Create `ReportViewer.jsx` component

6. **Phase 6 — Frontend Integration:**
   - Modify `NewScan.jsx` to integrate SavedReportBanner
   - Modify `ScanConsole.jsx` to integrate ReportViewer

7. **Phase 7 — Testing & Verification:**
   - Unit tests for components
   - E2E manual flow
   - Verify backward compatibility (old scans without saved_reports still work)

---

## Success Criteria

- ✅ URL normalization works for exact, domain, and pattern matching
- ✅ PDFs auto-saved to `backend/reports/` on report generation
- ✅ Saved report metadata stored in DB with extracted text
- ✅ API endpoints for check, get, download, delete work correctly
- ✅ SavedReportBanner detects existing reports on URL input (with debounce)
- ✅ ReportViewer displays metadata + download + delete options
- ✅ All unit tests pass (backend + frontend)
- ✅ E2E flow tested: create scan → check saved → download → delete
- ✅ Backward compatible (existing scans/reports unaffected)
- ✅ No broken builds; frontend/backend both run without errors

---

## Implementation Notes

**File Sizes & Paths:**
- `backend/src/services/savedReports.js` — ~250 lines
- `backend/src/routes/reports.js` — ~200 lines
- `frontend/src/components/SavedReportBanner.jsx` — ~150 lines
- `frontend/src/components/ReportViewer.jsx` — ~200 lines
- Modifications to existing files: ~50 lines total

**Dependencies Added:**
- `pdfjs-dist@^4.1.0` (backend, for PDF text extraction)

**Database:**
- 1 new table (`saved_reports`)
- 2 new indexes (normalized_url, expires_at)
- No breaking changes to existing schema

**Backward Compatibility:**
- All changes are additive; existing scan/report flows unaffected
- Old reports (before feature) can still be downloaded via existing `/report/:scanId` endpoint
- New `saved_reports` table is optional; system works if empty

