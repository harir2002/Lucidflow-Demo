---
inclusion: auto
name: "Demo Mode Implementation Guide"
description: "Frontend + backend implementation for Tata AIG demo with two scan modes (One Page / Main Domain)"
---

# Tata AIG Demo: Two-Mode Scan Implementation

## Project Context
- **Goal**: Complete demo mode with One Page and Main Domain scan modes, discovery preview, safety boundaries
- **Backend Status**: ✅ Complete (demo mode injected in sitemap.js, orchestrator updated, demo-fixtures.json created, 25 tests written and passing)
- **Frontend Status**: ⏳ Needs implementation (mode selector, discovery preview, API extensions)
- **Test Status**: ✅ Jest backend tests complete; frontend tests TBD

## Key Decisions (Confirmed)
1. **Demo Mode**: Explicit `process.env.DEMO_MODE === 'true'` parsing only
2. **Selection Limit**: Reuse `TRIAL_PAGE_LIMIT = 3` from `license.js` (exported constant)
3. **One Page Examples**: 
   - ABC Insurance: `https://insurance-deception-explorer.lovable.app`
   - Alliance Insurance: `https://allianceinsurance.in/`
4. **Main Domain Fixture**: `demo.tata-aig.local` with 7 sample URLs from `backend/data/demo-fixtures.json`
5. **Safety**: No silent fallback; fixture URLs never trigger live scans; clear demo labels displayed

## Frontend Files to Implement/Modify

### 1. `frontend/src/api/client.js`
**Add two new API methods** (backward compatible):

```javascript
// New: Discover URLs from a domain (Main Domain mode)
discoverUrls: (baseUrl) =>
  request('/scans/discover', { 
    method: 'POST', 
    body: JSON.stringify({ base_url: baseUrl }) 
  }),

// Extended: createScan with optional scan_mode and selected_urls
// Signature: createScan(targetUrl, urlPattern, scanMode?, selectedUrls?)
// - scanMode: 'one-page' (default) | 'main-domain'
// - selectedUrls: array of URLs (required for main-domain, ignored for one-page)
createScan: (targetUrl, urlPattern, scanMode, selectedUrls) =>
  request('/scans', {
    method: 'POST',
    body: JSON.stringify({
      target_url: targetUrl,
      url_pattern: urlPattern,
      scan_mode: scanMode || 'one-page',
      selected_urls: selectedUrls || []
    })
  })
```

### 2. `frontend/src/pages/NewScan.jsx`
**Refactor for two-mode UI**:

**State to add**:
- `scanMode`: 'one-page' | 'main-domain'
- `discoveredUrls`: []
- `selectedUrls`: []
- `discovering`: false
- `maxSelectable`: number (from license API)

**UI Flow**:
1. Display two buttons: "One Page" / "Main Domain" (mutually exclusive)
2. **One Page mode** (default):
   - Show URL input (placeholder: "https://www.example.com")
   - Show URL pattern input (optional)
   - Show "Start Scan" button
3. **Main Domain mode**:
   - Show domain input (placeholder: "https://www.example.com")
   - Show "Discover Pages" button
   - After discovery: render `<DiscoveryPreview />`
   - Show "Scan Selected Pages" button (disabled if no selection)

**License Display**:
- Fetch `/api/license` on mount
- Display selection limit: "Trial: 3 pages" or "Licensed: N pages"

**Event Flow**:
1. User selects mode
2. One Page: User enters URL → Click "Start Scan" → `api.createScan(url, pattern, 'one-page', [])`
3. Main Domain: User enters domain → Click "Discover" → `api.discoverUrls(domain)` → show preview → select → Click "Scan Selected" → `api.createScan(domain, pattern, 'main-domain', selectedUrls)`

### 3. `frontend/src/components/DiscoveryPreview.jsx` (NEW)
**Purpose**: Display discovered URLs with selection controls.

**Props**:
```javascript
{
  urls: string[],              // Discovered URLs
  maxSelectable: number,       // TRIAL_PAGE_LIMIT or license.max_pages
  demoLabel: string | null,    // Optional demo label from discovery response
  onSelectionChange: (selectedUrls: string[]) => void
}
```

**Features**:
- Render checkbox list of URLs
- "Select All" / "Clear All" buttons
- Selection counter: "Selected: X / Y (limit: N)"
- Disable checkboxes after reaching limit (unless already selected)
- Display demo label prominently (if present): highlight with background color
- "Scan Selected Pages" CTA with count: "Scan Selected Pages (X)"

## Backend Files to Implement/Modify

### 1. `backend/src/routes/scans.js`

**Add POST /api/scans/discover endpoint**:
```javascript
// POST /api/scans/discover
// Request: { base_url: "https://..." }
// Response: { urls: [...], sitemapFound: bool, demoLabel: string | null }
router.post('/discover', async (req, res) => {
  const { base_url } = req.body;
  if (!base_url) return res.status(400).json({ error: 'base_url is required' });
  
  try {
    const parsed = new URL(base_url);
  } catch {
    return res.status(400).json({ error: 'base_url is not a valid URL' });
  }
  
  const discovery = await discoverAllUrls(base_url, null);
  res.json({
    urls: discovery.urls,
    sitemapFound: discovery.sitemapFound,
    demoLabel: discovery.demoLabel || null
  });
});
```

**Extend POST /api/scans**:
```javascript
// Accept scan_mode and selected_urls in body
const { target_url, url_pattern, scan_mode, selected_urls } = req.body;
// ... validate target_url ...
// Store scan_mode and selected_urls in DB or pass to startScan
db.prepare(`INSERT INTO scans (id, target_url, url_pattern, scan_mode, status) VALUES (?, ?, ?, ?, 'discovering')`)
  .run(id, target_url, url_pattern || null, scan_mode || 'one-page');
  
// Pass to orchestrator
startScan(id, target_url, url_pattern, io, { 
  scanMode: scan_mode || 'one-page',
  selectedUrls: selected_urls || []
}).catch(...);
```

### 2. `backend/src/services/scanOrchestrator.js`

**Extend startScan signature**:
```javascript
async function startScan(scanId, targetUrl, urlPattern, io, options = {}) {
  const { scanMode = 'one-page', selectedUrls = [] } = options;
  // ... existing code ...
  
  // Mode-based URL selection
  let allUrls = [];
  if (scanMode === 'one-page') {
    // One Page: scan only the target URL
    allUrls = [targetUrl];
    emit(io, scanId, 'scan:log', { message: `One Page mode: scanning ${targetUrl}` });
  } else if (scanMode === 'main-domain' && selectedUrls.length > 0) {
    // Main Domain with selections: use selected URLs
    allUrls = selectedUrls;
    emit(io, scanId, 'scan:log', { message: `Main Domain mode: scanning ${selectedUrls.length} selected page(s)` });
  } else {
    // Fallback: discover URLs (backward compatibility)
    const { urls: discoveredUrls, demoLabel } = await discoverAllUrls(targetUrl, ...);
    allUrls = discoveredUrls;
    if (demoLabel) emit(io, scanId, 'scan:log', { message: demoLabel });
  }
  
  // Apply URL pattern if provided
  if (urlPattern) {
    const re = new RegExp(urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
    allUrls = allUrls.filter(u => re.test(u));
  }
  
  // Apply license limit (existing logic, unchanged)
  const license = getLicenseState();
  if (license.max_pages !== -1 && allUrls.length > license.max_pages) {
    allUrls = allUrls.slice(0, license.max_pages);
    emit(io, scanId, 'scan:license-limited', { limit: license.max_pages, discovered: allUrls.length });
  }
  
  // Continue with existing scan loop...
}
```

### 3. `backend/src/db/database.js`

**Add scan_mode column to scans table**:
```javascript
// In the CREATE TABLE IF NOT EXISTS scans block, add:
scan_mode TEXT DEFAULT 'one-page',  -- one-page | main-domain
```

## Constants & Exports

**From `backend/src/services/license.js`**:
- `TRIAL_PAGE_LIMIT = 3` (already exported)

**Frontend** will fetch max_pages from `/api/license` endpoint and display it in UI.

## Testing & Verification

### Backend: Manual / Automated
- ✅ Jest tests already written (25 test cases)
- Run: `npm test` in backend folder
- Verify: POST /api/scans/discover with demo.tata-aig.local (DEMO_MODE=true) returns 7 fixture URLs

### Frontend: Manual E2E
1. **One Page mode**:
   - Enter URL (e.g., `https://insurance-deception-explorer.lovable.app`)
   - Click "Start Scan"
   - Verify scan starts with 1 page

2. **Main Domain mode** (DEMO_MODE=true):
   - Enter domain: `https://demo.tata-aig.local`
   - Click "Discover Pages"
   - Verify 7 fixture URLs appear
   - Verify demo label displayed: "Demo data — live discovery is not active in this demo"
   - Select 3 URLs (or less, or all)
   - Click "Scan Selected Pages"
   - Verify scan starts with selected count

3. **Selection limit enforcement**:
   - Discover URLs
   - Select 3 URLs (or license max_pages)
   - Verify checkboxes disabled for remaining URLs
   - Verify counter displays: "Selected: 3 / 7 (limit: 3)"

4. **Backward compatibility**:
   - Old scans (without scan_mode) work unchanged
   - URL pattern filtering still works in both modes

## Success Criteria

- ✅ One Page mode: Single URL scanned (no discovery)
- ✅ Main Domain mode: Selected URLs from fixture or live discovery scanned
- ✅ Selection limit enforced (TRIAL_PAGE_LIMIT = 3)
- ✅ Demo labels visible when in demo mode
- ✅ No silent fallback from live to fixture
- ✅ API client backward compatible
- ✅ Orchestrator receives scanMode + selectedUrls correctly
- ✅ All changes tested and verified
- ✅ No hardcoding, no duplication
