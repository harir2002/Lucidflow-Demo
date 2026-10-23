# Tata AIG Demo: Two-Mode Scan UI Implementation Requirements

## Summary

Implement a complete demo-mode frontend and backend API support for two mutually exclusive scan modes: **One Page** (scan a single target URL directly) and **Main Domain** (discover URLs from a domain, select a subset, then scan the selection). Add a discovery preview component, mode selector UI, enforce selection limits reused from the license service, and display demo labels to make fixture data visible. All changes must be verified via tests, avoid hardcoding limits, and preserve backward compatibility.

---

## Functional Requirements

### 1. Scan Mode Selector (Frontend)
1.1. Display two mutually exclusive mode selection controls in the NewScan page.  
1.2. Labels: "One Page" (default) and "Main Domain."  
1.3. Selecting one mode hides the UI of the other.  
1.4. Persist the mode selection during the current form interaction (not required to persist across page reload).

### 2. One Page Mode (Frontend)
2.1. Show a single "Target URL" input field with placeholder text (e.g., `https://www.example.com`).  
2.2. Show the optional "URL Pattern" input below it.  
2.3. Display a "Start Scan" button that is disabled if the target URL is empty.  
2.4. Clicking "Start Scan" invokes `api.createScan(targetUrl, urlPattern, 'one-page', [])` and proceeds to console.  
2.5. One Page scans must submit exactly one URL to the backend, regardless of the license limit or discovered page count.  
2.6. Show the current page limit (e.g., "Trial: 3 pages") based on the license state, but do not impose selection constraints in One Page mode.

### 3. Main Domain Mode (Frontend & Backend)
3.1. Show a "Domain" input field (same position as One Page's target URL) with placeholder text.  
3.2. Display a "Discover Pages" button below the domain input.  
3.3. Clicking "Discover Pages" invokes `api.discoverUrls(baseUrl)` and shows a loading indicator.  
3.4. After discovery completes, render the `DiscoveryPreview` component with the list of discovered URLs.  
3.5. Display a "Scan Selected Pages" button (disabled if no URLs are selected).  
3.6. Clicking "Scan Selected Pages" invokes `api.createScan(domainUrl, urlPattern, 'main-domain', selectedUrls[])` and proceeds to console.  
3.7. The backend `POST /api/scans/discover` endpoint accepts `base_url` and returns `{ urls, sitemapFound, demoLabel }`.

### 4. Discovery Preview Component (Frontend)
4.1. Accept props: `urls` (string array), `maxSelectable` (number), `demoLabel` (string or null), `onSelectionChange` (callback).  
4.2. Render a list of checkboxes, one per discovered URL.  
4.3. Display "Select All" and "Clear All" buttons above the list.  
4.4. Show a live counter: "Selected: X / Y (limit: Z)" where X = selected count, Y = total discovered, Z = maxSelectable.  
4.5. Disable remaining unchecked checkboxes when the count reaches `maxSelectable` (but allow unchecking to re-enable others).  
4.6. If `demoLabel` is provided and non-empty, display it prominently (e.g., highlighted background, distinct styling) above the URL list.  
4.7. Pass the array of selected URLs to `onSelectionChange` whenever selection changes.  
4.8. Show discovery limitation statement alongside demo label if present (to clarify fixture vs. live data).

### 5. License Limit Enforcement (Frontend & Backend)
5.1. Frontend must fetch `/api/license` on NewScan mount to determine `maxSelectable`.  
5.2. Extract `max_pages` from the license response; if no license, use `TRIAL_PAGE_LIMIT` (3) as the limit.  
5.3. Display the effective limit to the user (e.g., "Trial mode: 3 pages" or "Licensed: 50 pages").  
5.4. Pass `maxSelectable` to the `DiscoveryPreview` component.  
5.5. Backend must enforce the limit when inserting page rows: if `allUrls.length > license.max_pages`, truncate the array and emit `scan:license-limited` event.  
5.6. Do not hardcode the value `3` or any other limit in frontend components; always reference it via the license API or backend configuration.

### 6. Demo Mode & Labels (Frontend & Backend)
6.1. Backend must check `process.env.DEMO_MODE` (explicitly for the string `'true'`, not just truthiness).  
6.2. When `DEMO_MODE==='true'`, the `discoverAllUrls` function in sitemap.js must return the fixture data from `backend/data/demo-fixtures.json` for the domain `demo.tata-aig.local`.  
6.3. Fixture data includes a `demoLabel` field: "Demo data — live domain discovery is not active in this demo."  
6.4. The `POST /api/scans/discover` endpoint must return the `demoLabel` in the response if demo mode is active and the domain matches a fixture.  
6.5. Frontend must display the demo label above the URL list in `DiscoveryPreview` with distinct visual styling (background color or border).  
6.6. Backend must not silently fall back to fixture data if live discovery fails; failure is a failure.  
6.7. Do not show the demo fixture as discovery results for an unrelated domain entered by the user.

### 7. API Extensions (Backend)
7.1. Extend `POST /api/scans` to accept optional `scan_mode` (default: `'one-page'`) and `selected_urls` (default: `[]`) fields in the request body.  
7.2. Store `scan_mode` in the scans table for audit/reporting purposes.  
7.3. Add a new `POST /api/scans/discover` endpoint that accepts `base_url` in the request body and returns discovered URLs with optional `demoLabel`.  
7.4. Update the scans table schema to include a `scan_mode` column (type: TEXT, default: `'one-page'`).

### 8. Orchestrator Mode Branching (Backend)
8.1. Extend `startScan(scanId, targetUrl, urlPattern, io, options = {})` to accept an options object with `scanMode` and `selectedUrls`.  
8.2. When `scanMode === 'one-page'`, scan only the `targetUrl` (no discovery, no URL pattern filtering).  
8.3. When `scanMode === 'main-domain'` and `selectedUrls` is non-empty, scan only the URLs in `selectedUrls` (apply URL pattern filter if provided).  
8.4. For backward compatibility, if `scanMode` is not provided or is unrecognized, fall back to the existing discovery behavior.  
8.5. Log a message indicating which mode was used (e.g., "One Page mode: scanning 1 URL" or "Main Domain mode: scanning 3 selected page(s)").  
8.6. Apply license enforcement after URL selection (existing logic unchanged).

### 9. Selection Safety Boundaries (Backend)
9.1. Fixture URLs (from demo-fixtures.json) must never be submitted to the live Playwright crawler or Ollama analysis when demo mode is off.  
9.2. If a user enters a URL that matches a fixture domain (e.g., `demo.tata-aig.local`) outside of demo mode, reject the discovery request with a clear error or return an empty list.  
9.3. The orchestrator must not allow a fixture URL to proceed to the live scan engine if demo mode is disabled.

### 10. Backward Compatibility
10.1. Existing single-mode scans (no `scan_mode` in the database) must continue to work via the old discovery → crawl flow.  
10.2. The `createScan` API client method must remain callable with the old signature `(targetUrl, urlPattern)` and default to `'one-page'` mode with empty selected URLs.  
10.3. Frontend components not involved in the mode selector must not break or require changes.  
10.4. Do not rename or remove existing columns or functions; only add new ones.

---

## Non-Functional Requirements

### 1. Code Quality & Reuse
1.1. Do not duplicate the `TRIAL_PAGE_LIMIT` constant; import and reuse it from `backend/src/services/license.js`.  
1.2. Do not hardcode limits (`3`, `50`, etc.) in frontend or backend components; always read from license state or configuration.  
1.3. All discovery and orchestration logic must be centralized in `sitemap.js`, `crawler.js`, and `scanOrchestrator.js`; do not replicate in route handlers.  
1.4. The API client (`frontend/src/api/client.js`) must remain a thin HTTP wrapper; business logic stays in components.

### 2. Testability
2.1. Backend must support unit testing of `startScan` with mock `io`, `db`, and options parameters.  
2.2. Frontend components must accept all dynamic values as props (no global state reading in NewScan, DiscoveryPreview).  
2.3. The discovery preview component must be testable independently with mock props.  
2.4. All mode-branching logic must be testable without invoking live Playwright or Ollama.

### 3. Error Handling
3.1. If discovery fails (network error, invalid domain, etc.), display a user-facing error message and do not proceed.  
3.2. If the orchestrator receives invalid `selectedUrls` (e.g., URLs not from the discovery response), reject the scan request.  
3.3. If `DEMO_MODE` is set to a value other than the exact string `'true'`, it must be treated as `false` (demo mode off).  
3.4. Log all mode decisions and fixture matching at the backend for audit purposes.

### 4. User Experience
4.1. The mode selector must be visually prominent and easy to toggle.  
4.2. The "Discover Pages" button must show a loading state and disable further clicks until discovery completes or fails.  
4.3. Demo labels must be visually distinct (e.g., colored background, icon) so users understand they are viewing fixture data.  
4.4. All CTAs (buttons) must reflect the mode and current state (e.g., "Scan Selected Pages (3)" when 3 are selected).  
4.5. The selection counter and demo label must remain visible as users scroll through the URL list (if applicable).

---

## Acceptance Criteria

1. **Two modes visible and selectable**: User can switch between "One Page" and "Main Domain" modes; only one mode's UI is displayed at a time.

2. **One Page mode scans single URL**: Entering `https://insurance-deception-explorer.lovable.app` and clicking "Start Scan" creates a scan with exactly 1 URL, regardless of license limit.

3. **Main Domain mode discovers and filters**: Entering `https://demo.tata-aig.local` (with `DEMO_MODE=true`) and clicking "Discover Pages" returns 7 fixture URLs from `demo-fixtures.json` with demo label displayed.

4. **Discovery preview component renders**: After discovery, checkboxes appear for each URL, "Select All" / "Clear All" buttons are clickable, and the selection counter updates live.

5. **Selection limit enforced**: With trial mode active (3-page limit), selecting 3 URLs in the preview disables unchecked checkboxes; the counter displays "Selected: 3 / 7 (limit: 3)"; clicking "Scan Selected Pages" creates a scan with exactly 3 URLs.

6. **License limit displayed**: NewScan shows "Trial: 3 pages" (trial) or "Licensed: N pages" (licensed) based on `/api/license` response.

7. **Demo label visible and styled**: When demo mode is active and fixture data is returned, the discovery preview displays "Demo data — live domain discovery is not active in this demo" above the URL list with distinct background or border styling.

8. **API accepts scan_mode and selected_urls**: `POST /api/scans` with body `{ target_url, url_pattern, scan_mode: 'main-domain', selected_urls: [...] }` succeeds and creates a scan with the correct mode stored.

9. **POST /api/scans/discover endpoint works**: `POST /api/scans/discover` with `base_url: "https://demo.tata-aig.local"` (DEMO_MODE=true) returns `{ urls: [...], sitemapFound: true, demoLabel: "Demo data..." }`.

10. **Orchestrator branches correctly**: Running a One Page scan processes 1 URL; running a Main Domain scan with 3 selected URLs processes exactly 3 URLs; both emit correct socket messages.

11. **No hardcoding or duplication**: Limit `3` does not appear in any frontend component file; all imports of `TRIAL_PAGE_LIMIT` are from `license.js`; URL pattern filtering and license logic are not duplicated.

12. **Backward compatibility maintained**: Creating a scan without `scan_mode` defaults to one-page and works as before; old scan records without `scan_mode` in the database do not break queries.

13. **Demo fixture URLs never reach live scan engine**: A scan with fixture URLs (when demo mode is off) does not attempt to load pages in Playwright or send to Ollama; any such attempt is blocked or returns a clear error.

14. **Error cases handled**: Invalid domain, network failure, and malformed requests return appropriate HTTP status and user-facing error messages; no silent fallback to fixtures.

15. **All tests pass**: Backend Jest tests for discovery, orchestrator, and mode branching pass; frontend component tests for mode selector, discovery preview, and selection limits pass.

---

## Out of Scope

- Modifying the crawl or vision analysis logic (remain unchanged).
- Changing the PDF report generation or existing dashboard views.
- Implementing a browser-based test suite (if one does not already exist, defer setup; manual E2E testing suffices for this phase).
- Persisting mode selection or discovered URLs across browser sessions.
- Adding new dark-pattern detection rules or severity levels.
- Refactoring `scanOrchestrator.js` or `sitemap.js` beyond the required mode-branching additions; no unnecessary cleanup or restructuring.
- Adding UI features beyond the mode selector, discovery preview, and selection counter (e.g., no pagination, sorting, or filtering in the discovery list).
- Deploying or configuring the DEMO_MODE environment variable in production; implementation only; documentation of how to enable it suffices.

---

## Assumptions

**Explicit assumptions (to be validated in design review or implementation):**

1. **One Page mode does not re-discover URLs**: Even if the user enters a domain that normally has multiple pages, One Page mode scans only that single URL without invoking discovery.

2. **Main Domain always discovers first**: The user must click "Discover Pages" before clicking "Scan Selected Pages"; discovery results are cached in component state for the duration of the form interaction.

3. **URL matching for demo fixtures is exact on domain**: Only the exact domain `demo.tata-aig.local` matches the fixture; similar domains (e.g., `demo.tata-aig.local.evil.com`) do not.

4. **License limit from API is definitive**: Frontend reads `max_pages` from `/api/license` and uses it as the selection limit; no client-side fallback to hardcoded values.

5. **Demo label is provided by the backend**: The `/api/scans/discover` response includes `demoLabel`; if not present or null, frontend does not display a label.

6. **Existing scan/page schema is extended, not replaced**: New `scan_mode` column added to scans table; existing `target_url`, `url_pattern`, `status`, etc. columns remain unchanged.

7. **URL pattern filtering applies after mode-specific URL selection**: One Page ignores URL pattern; Main Domain applies it to selected URLs.

8. **No transaction rollback on partial failure**: If a scan is created but orchestrator fails to start, the scan row exists in the database (status: error); this is acceptable per existing behavior.

---

## Definition of Done

- ✅ Requirements document completed and reviewed.
- ✅ All acceptance criteria are testable and aligned with the original user request.
- ✅ Assumptions are documented and ready for design phase.
- ✅ No implementation or design details in this document (design phase follows).
