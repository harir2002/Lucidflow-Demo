# Saved Report Feature - Implementation Summary

## Overview
Implemented URL-to-saved-report mapping with PDF extraction and caching for the IRDAI Dark Pattern Scanner. The feature allows users to quickly retrieve previously generated PDF reports without re-scanning.

## Implementation Details

### 1. Backend Service (`backend/src/services/savedReports.js`)
- **URL Normalization**: Strips trailing slashes, query params, paths; lowercases domain
- **URL Matching**: Two Option B mappings:
  - `https://allianceinsurance.in` → `LF-AIBPL-2026-001` (Lucidflow_Dark Pattern_Alliance Insurance.pdf)
  - `https://insurance-deception-explorer.lovable.app` → `LF-AIBL-2026-001` (Lucidflow_Dark Pattern Report_ABC Insurance.pdf)
- **PDF Extraction**: Uses `pdf-parse` to extract text and metadata from PDFs
- **Caching**: Caches extracted content to `backend/data/saved-reports.json` for fast retrieval
- **Fields Extracted**: organisation, reportId, version, issueDate, findings, CAP, appendix, sourceHash, pageCount

### 2. Backend Routes (`backend/src/routes/saved-reports.js`)
- **GET /api/saved-reports/check?url=** - Check if saved report exists for URL
- **GET /api/saved-reports/:reportId** - Get report metadata and extracted content
- **GET /api/saved-reports/:reportId/download** - Download original PDF with security validation
  - Allowlist protection: Only serves from designated `reports/` directory
  - Path traversal rejection: Validates normalized paths

### 3. Backend Integration
- Mounted saved-reports router in `backend/src/server.js`
- Initialized cache on server startup via `initializeCache()`
- Added `pdf-parse` dependency to `backend/package.json`

### 4. Frontend Components

#### SavedReportBanner (`frontend/src/components/SavedReportBanner.jsx`)
- Shows green/amber/red indicator based on risk level
- Displays organisation name, report ID, issue date
- Two buttons: [View Report] and [Download PDF]
- 500ms debounce on URL check to avoid excessive API calls
- Fades in/out when reports found/not found

#### ReportViewer (`frontend/src/components/ReportViewer.jsx`)
- Modal overlay showing saved report details
- Displays: metadata (reportId, issueDate, version, pageCount)
- Sections: findings (with severity), CAP, appendix
- Download button and close button
- Clean design matching existing application style

### 5. Frontend Integration
- Extended API client (`frontend/src/api/client.js`) with:
  - `checkSavedReport(url)` - Check for saved reports
  - `getSavedReport(reportId)` - Get report details
  - `downloadSavedReportUrl(reportId)` - Get download link
- Updated `NewScan.jsx` to include SavedReportBanner
- Added ReportViewer modal to NewScan page

### 6. URL Matching Rules
- Scheme + domain only (no paths, query strings, fragments)
- Normalized: remove trailing slash, lowercase, no port variants
- Exact match required (no substring or partial domain matching)
- Two explicit mappings only (no wildcards or patterns)

## Testing

### Backend Tests (`backend/src/services/savedReports.test.js`)
✅ 14 test cases covering:
- URL normalization (trailing slashes, case-insensitivity, path/query removal)
- URL matching (both mappings, unrelated URLs, invalid URLs)
- Cache operations (load, save, roundtrip)

### Build Verification
✅ Backend: All 56 tests pass (14 new + 42 existing)
✅ Frontend: Builds successfully with Vite (220.43 KB JS)

### Functionality Verification
✅ PDF extraction works (5 pages extracted from each report)
✅ Cache initialization succeeds on startup
✅ checkUrl returns correct structure for all cases
✅ URL matching works for both Option B mappings

## Files Created

1. `backend/src/services/savedReports.js` (390 lines)
   - Service layer for URL matching, PDF extraction, caching

2. `backend/src/routes/saved-reports.js` (100 lines)
   - API endpoints with security validation

3. `backend/src/services/savedReports.test.js` (85 lines)
   - Unit tests for all service functions

4. `frontend/src/components/SavedReportBanner.jsx` (100 lines)
   - Banner component showing saved report availability

5. `frontend/src/components/ReportViewer.jsx` (220 lines)
   - Modal for viewing saved report details

## Files Modified

1. `backend/package.json`
   - Added `pdf-parse@^1.1.1` dependency

2. `backend/src/server.js`
   - Imported `initializeCache` from savedReports service
   - Mounted saved-reports router at `/api/saved-reports`
   - Initialized cache on server startup

3. `frontend/src/api/client.js`
   - Added three new API methods for saved reports

4. `frontend/src/pages/NewScan.jsx`
   - Added state for SavedReportBanner and ReportViewer
   - Integrated SavedReportBanner component
   - Integrated ReportViewer modal

## Security Features

✅ Path traversal protection: Validates normalized paths against allowlist
✅ Directory allowlist: Only serves PDFs from `backend/reports/`
✅ URL validation: Rejects invalid URLs before processing
✅ Input sanitization: Query parameters validated

## Behavior

### User Flow
1. User enters URL in NewScan page
2. SavedReportBanner checks if saved report exists (500ms debounce)
3. If found:
   - Banner displays with organisation name, report ID, issue date
   - User can click [View Report] to see details in modal
   - User can click [Download PDF] to download original file
4. If not found:
   - Banner hidden, normal scan form shown

### URL Matching Examples
- ✅ `https://allianceinsurance.in` → Found (Alliance Insurance)
- ✅ `https://allianceinsurance.in/` → Found (trailing slash stripped)
- ✅ `https://ALLIANCEINSURANCE.IN` → Found (case-insensitive)
- ✅ `https://allianceinsurance.in/page` → Found (path ignored for matching)
- ❌ `https://sub.allianceinsurance.in` → Not found (subdomain requires exact mapping)
- ❌ `https://example.com` → Not found (not in mappings)

## Verification Results

```
Backend Tests:   56 passed (14 new tests for SavedReports)
Frontend Build:  ✓ No errors
Cache Init:      ✓ Successfully initializes on startup
PDF Extraction:  ✓ 5 pages extracted from each report
URL Matching:    ✓ Both Option B mappings work
API Endpoints:   ✓ All routes implemented
Security:        ✓ Path traversal and directory validation
```

## Next Steps (Not Implemented)
- Automatic scan report saving (separate feature)
- Advanced searching within extracted text
- Report expiration/TTL cleanup
- Database persistence (currently JSON cache)
- Multi-language support for report fields
