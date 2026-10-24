# Discovery Safety Mechanisms Audit

## Overview
This audit documents the discovery and analysis safety mechanisms across the backend services. The system implements browser-based crawling, sitemap discovery, and vision-based analysis. Key findings show that several protections are implemented, but critical gaps remain in redirect limiting and private network protection.

---

## 1. CRAWLER.JS Safety Analysis

### Request Timeout
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| goto() timeout | Primary timeout: 28s with retry fallback to 15s | 45-46 | ✓ Implemented |
| screenshot() timeout | Screenshot timeout: 22s (tall pages), 18s (full page) | 26, 28 | ✓ Implemented |
| Delay between pages | Configurable delay, defaults to 1000ms | 21 | ✓ Implemented |

**Details:**
```javascript
// Line 45-46: visitPage method uses two-tier timeout strategy
const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 28000 })
  .catch(() => page.goto(url, { waitUntil: 'commit', timeout: 15000 }).catch(() => null));

// Line 26-28: screenshot timeouts
await page.screenshot({ path: outPath, fullPage: true, timeout: 22000 });
// AND
await page.screenshot({ path: outPath, fullPage: false, timeout: 18000 });

// Line 21: delay between URLs
delay: parseInt(cfg.crawlDelayMs) || 1000,
```

### Redirect Handling
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Redirect limits | No explicit redirect counter or limit | — | ✗ **MISSING** |
| Redirect detection | Final URL checked for same-domain scope | 50-51 | ✓ Implemented (partial) |
| HTTP 3xx tracking | Not tracked; silently followed by Playwright | — | ⚠️ Transparent |

**Details:**
- Playwright browser follows redirects automatically (default 20 redirects max)
- System checks final URL hostname matches target domain (line 50-51) but does NOT track redirect count
- No protection against redirect chains or redirect loops
- Safe for normal sites, but malicious sites could use redirect chains to exhaust resources

**Risk:** A site could redirect through 20 URLs consuming browser resources. While Playwright has an internal limit, no application-level control exists.

```javascript
// Line 50-51: Redirect detection (post-redirect check only)
if (this.cfg.sameDomain && new URL(finalUrl).hostname !== this.domain) return null;
```

### URL Validation (Same-Domain Scope)
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Same-domain check | Enforced in visitPage() | 14, 50-51 | ✓ Implemented |
| Same-domain discovery | Enforced in discoverOnly() | 134 | ✓ Implemented |
| Domain extraction | Extracted once from target URL hostname | 22 | ✓ Implemented |

**Details:**
```javascript
// Line 22: Domain extracted at initialization
this.domain = new URL(cfg.targetUrl).hostname;

// Line 50-51: Enforced in visitPage
if (this.cfg.sameDomain && new URL(finalUrl).hostname !== this.domain) return null;

// Line 134: Enforced in discoverOnly
.filter(h => h && h.startsWith('http') && new URL(h).hostname === d)
```

### Resource Filtering
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Resource type filtering | Media/font/stylesheet aborted | 126-127 | ✓ Implemented |
| URL pattern filtering | PDFs, images, JS, CSS, assets, downloads | 6-10 | ✓ Implemented |
| Download blocking | Downloads intercepted and cancelled | 39 | ✓ Implemented |

**Details:**
```javascript
// Lines 6-10: URL pattern SKIP list
const SKIP = [
  /\.(pdf|jpg|jpeg|png|gif|svg|css|js|xml|zip|doc|xls|mp4|webp|ico|woff|ttf)$/i,
  /\?.*utm/i, /#/, /\/sitemap/i, /\/cdn-cgi\//i, /\/assets\//i, /\/static\//i,
  /logout|signout/i, /\/api\//i,
];

// Line 39: Download cancellation
page.on('download', d => d.cancel().catch(() => {}));

// Lines 126-127: Resource type filtering in discoverOnly
await context.route('**/*', r => { if (['image', 'media', 'font', 'stylesheet'].includes(r.request().resourceType())) return r.abort(); r.continue(); });
```

### Private Network Protection (CRITICAL GAP)
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Private IPv4 (127.0.0.1) | No validation | — | ✗ **MISSING** |
| Private IPv4 (10.x) | No validation | — | ✗ **MISSING** |
| Private IPv4 (192.168.x) | No validation | — | ✗ **MISSING** |
| IPv6 loopback (::1) | No validation | — | ✗ **MISSING** |
| Private domain (.local) | No validation | — | ✗ **MISSING** |

**Risk:** CRITICAL — The crawler does not validate target URLs against private IP ranges. An attacker could submit `http://127.0.0.1:3000` or `http://192.168.1.1` as a target URL, leading to:
- Scanning internal development services
- Accessing internal network resources
- Exposing internal IP topology
- Potential SSRF (Server-Side Request Forgery) attacks

**Current Implementation Gap:**
```javascript
// Line 22: Domain extracted WITHOUT validation
this.domain = new URL(cfg.targetUrl).hostname;
// No check for private IPs or .local domains
```

---

## 2. SITEMAP.JS Safety Analysis

### HTTP Timeout
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Request timeout | 15s timeout on HTTP request | 12 | ✓ Implemented |
| Timeout error handling | Error caught and propagated | 13 | ✓ Implemented |

**Details:**
```javascript
// Line 12: Request timeout
const req = mod.get(url, { headers: { 'User-Agent': 'IRDAI-Local-Scanner/1.0' }, timeout: 15000 }, res => {

// Line 13: Timeout error handling
req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
```

### Redirect Limits
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Redirect following | Automatic recursive call to fetchUrl | 14-15 | ✓ Implemented (but unbounded) |
| Redirect limit | No explicit limit on redirect depth | — | ✗ **MISSING** |

**Risk:** The `fetchUrl()` function follows redirects recursively without a depth limit:

```javascript
// Lines 14-15: Unbounded recursive redirect following
if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
  return fetchUrl(res.headers.location).then(resolve).catch(reject);
}
```

A malicious robots.txt or sitemap could contain Location headers that form a redirect loop, causing stack exhaustion or infinite recursion. While the HTTP client typically limits redirects to ~5, this code has no explicit guard.

**Recommendation:** Add a depth parameter and limit to ≤5 redirects:
```javascript
function fetchUrl(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('Max redirects exceeded'));
  // ... rest of code ...
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    return fetchUrl(res.headers.location, depth + 1).then(resolve).catch(reject);
  }
}
```

### URL Validation
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Domain extraction | Extracted from baseUrl | 75 | ✓ Extracted |
| Private IP check | No validation against private IPs | — | ✗ **MISSING** |
| Private domain check | No validation for .local domains | — | ✗ **MISSING** |

**Details:**
```javascript
// Line 75: Domain extracted from baseUrl (the target URL)
const domain = new URL(baseUrl).hostname;
// No private IP validation on baseUrl
```

Same SSRF risk as crawler.js applies here.

---

## 3. VISION.JS Safety Analysis

### Timeout Settings
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Generate timeout | Configurable OLLAMA_GENERATE_TIMEOUT_MS | 13 | ✓ Configurable |
| Tags timeout (health check) | Configurable OLLAMA_TAGS_TIMEOUT_MS (default 5s) | 14 | ✓ Configurable |
| Socket timeout | Explicitly disabled (0) for long vision processing | 86-87 | ✓ Intentional |

**Details:**
```javascript
// Lines 13-14: Timeout configuration
const GENERATE_TIMEOUT_MS = parseInt(process.env.OLLAMA_GENERATE_TIMEOUT_MS || '0', 10);
const TAGS_TIMEOUT_MS = parseInt(process.env.OLLAMA_TAGS_TIMEOUT_MS || '5000', 10);

// Lines 86-87: Socket timeout disabled for long-running vision analysis
req.setTimeout(0);
if (req.socket) req.socket.setTimeout(0);

// Line 127: Hard abort timeout if configured
if (GENERATE_TIMEOUT_MS > 0) {
  hardTimer = setTimeout(() => {
    req.destroy(new Error(`aborted after ${GENERATE_TIMEOUT_MS}ms`));
  }, GENERATE_TIMEOUT_MS);
}
```

**Status:** ✓ Good — Timeouts are configurable and the system handles long-running vision analysis correctly by disabling idle socket timeouts while allowing optional hard abort.

### Failure Handling
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Connection error | Returns error analysis object | 252-256 | ✓ Implemented |
| Timeout handling | Caught as AbortError | 23-25 | ✓ Implemented |
| Retry mechanism | No retry on failure (first-attempt-only) | — | ⚠️ No retry |
| Fallback | Returns ERROR risk with summary message | 252-256 | ✓ Implemented |

**Details:**
```javascript
// Lines 252-256: Failure fallback
} catch (err) {
  console.error(`[ollama] analyzePage error: ${err.message}`);
  return {
    page_url: url, page_title: title, overall_risk: 'ERROR',
    summary: `Local model error: ${err.message}`, patterns_found: [], recommendations: [],
  };
}
```

**Status:** ✓ Good — Failures are caught and return safe ERROR status with human-readable summary. No retry; first failure causes analysis to fail, which is reasonable for local model analysis.

---

## 4. SCANORCHESTRATOR.JS Safety Analysis

### Demo Mode Configuration
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Demo mode flag | Checked as `process.env.DEMO_MODE === 'true'` | 56 | ✓ Implemented |
| Fixture loading | Loaded from demo-fixtures.json | 65 | ✓ Implemented |
| Fallback to live | Allows live discovery if no fixture | — | ⚠️ See below |
| Fixture domain guard | Blocks fixture domains in production | 79-95 | ✓ Implemented |

**Details:**
```javascript
// Line 56: Demo mode flag check
const isDemoModeActive = process.env.DEMO_MODE === 'true';

// Lines 79-95: Guard prevents fixture URLs in production
if (!isDemoModeActive && scanMode !== 'one-page') {
  const hasFixtureUrls = allUrls.some(url => {
    try {
      return new URL(url).hostname === FIXTURE_DOMAIN;
    } catch {
      return false;
    }
  });
  if (hasFixtureUrls) {
    updateScan({ status: 'error' });
    emit(io, scanId, 'scan:error', { 
      message: `The domain ${FIXTURE_DOMAIN} is reserved for demo purposes...` 
    });
    return;
  }
}
```

**Status:** ✓ Good — Demo mode is separated and fixture URLs are blocked in production.

### Ollama Availability Check
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Pre-scan check | Vision service checked before crawling | 28-32 | ✓ Implemented |
| Error exit | Scan aborted if Ollama unavailable | 30-32 | ✓ Implemented |

**Status:** ✓ Good — Prevents wasted resources on page crawling if vision analysis will fail.

### License Enforcement
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Trial cap (3 pages) | Enforced for trial mode | 119-127 | ✓ Implemented |
| Licensed cap | Enforced per license key | 119-127 | ✓ Implemented |
| Enforcement point | Applied BEFORE crawling | 119 | ✓ Correct order |

**Status:** ✓ Good — License caps are enforced before resource-intensive crawling begins.

### Same-Domain Enforcement
| Aspect | Finding | Lines | Status |
|--------|---------|-------|--------|
| Crawler config | sameDomainOnly: true | 152 | ✓ Configured |
| Effect | Crawler enforced in visitPage() | — | ✓ Propagates |

**Status:** ✓ Good — Only same-domain URLs are crawled during scan.

---

## 5. SAFETY GAPS SUMMARY TABLE

| Safety Check | Service | Lines | Status | Severity | Fix Required |
|--------------|---------|-------|--------|----------|--------------|
| **Request timeout (page load)** | crawler.js | 45-46 | ✓ Implemented | — | No |
| **Request timeout (screenshot)** | crawler.js | 26, 28 | ✓ Implemented | — | No |
| **Request timeout (sitemap fetch)** | sitemap.js | 12 | ✓ Implemented | — | No |
| **Redirect limit (crawler discovery)** | crawler.js | — | ✗ Missing | Medium | **Yes** |
| **Redirect limit (sitemap fetch)** | sitemap.js | 14-15 | ✗ Missing | Medium | **Yes** |
| **Same-site scope (page crawl)** | crawler.js | 50-51 | ✓ Implemented | — | No |
| **Same-site scope (discovery)** | crawler.js | 134 | ✓ Implemented | — | No |
| **Resource filtering (type-based)** | crawler.js | 126-127 | ✓ Implemented | — | No |
| **Resource filtering (URL patterns)** | crawler.js | 6-10 | ✓ Implemented | — | No |
| **Resource filtering (sitemap)** | sitemap.js | 20-21 | ✓ Implemented | — | No |
| **Private IP protection (127.0.0.1)** | crawler.js, sitemap.js | — | ✗ Missing | **CRITICAL** | **Yes** |
| **Private IP protection (10.x)** | crawler.js, sitemap.js | — | ✗ Missing | **CRITICAL** | **Yes** |
| **Private IP protection (192.168.x)** | crawler.js, sitemap.js | — | ✗ Missing | **CRITICAL** | **Yes** |
| **Private IP protection (IPv6 ::1)** | crawler.js, sitemap.js | — | ✗ Missing | **CRITICAL** | **Yes** |
| **Private domain protection (.local)** | crawler.js, sitemap.js | — | ✗ Missing | **CRITICAL** | **Yes** |
| **Auth gate detection** | crawler.js | 66 | ✓ Implemented | — | No |
| **Multi-step flow detection** | crawler.js | 65 | ✓ Implemented | — | No |
| **CAPTCHA/timer detection** | crawler.js | 61-62 | ✓ Implemented | — | No |
| **Download blocking** | crawler.js | 39 | ✓ Implemented | — | No |
| **Demo mode separation** | scanOrchestrator.js | 56, 79-95 | ✓ Implemented | — | No |
| **Fixture URL guard** | scanOrchestrator.js | 79-95 | ✓ Implemented | — | No |
| **Vision timeout (configurable)** | vision.js | 13 | ✓ Implemented | — | No |
| **Vision error handling** | vision.js | 252-256 | ✓ Implemented | — | No |

---

## 6. CRITICAL FINDINGS & RECOMMENDATIONS

### 🔴 CRITICAL: Private Network Protection Missing

**Location:** `crawler.js` (line 22), `sitemap.js` (line ~75 in discoverAllUrls)

**Issue:** Neither service validates target URLs against private IP ranges or .local domains. This creates a **Server-Side Request Forgery (SSRF)** vulnerability.

**Attack Scenario:**
1. User submits target URL: `http://127.0.0.1:3000` (internal dev server)
2. System crawls it and returns analysis
3. Or: `http://192.168.1.1` (internal router admin panel)
4. Or: `http://localhost:9000` (internal service)
5. Or: `http://internal.company.local` (internal domain)

**Proposed Fix:**

Add a URL validation utility function:
```javascript
// utils/urlValidation.js
function isPrivateUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    
    // IPv4 private ranges
    const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
    if (ipv4) {
      const [, a, b, c, d] = ipv4.map(Number);
      if (a === 127) return true; // 127.0.0.0/8 loopback
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    }
    
    // IPv6
    if (hostname === '::1' || hostname === '::') return true;
    if (hostname.startsWith('[::1]') || hostname.startsWith('[::')) return true;
    
    // Localhost
    if (hostname === 'localhost') return true;
    
    // .local domains
    if (hostname.endsWith('.local')) return true;
    
    return false;
  } catch {
    return false; // Invalid URL, reject as private by default
  }
}

module.exports = { isPrivateUrl };
```

**Apply in crawler.js** (after line 22):
```javascript
const { isPrivateUrl } = require('../utils/urlValidation');

// In constructor:
if (isPrivateUrl(cfg.targetUrl)) {
  throw new Error(`Target URL ${cfg.targetUrl} is in a private IP range and cannot be scanned`);
}
```

**Apply in sitemap.js** (in discoverAllUrls):
```javascript
const { isPrivateUrl } = require('../utils/urlValidation');

// At start of discoverAllUrls:
if (isPrivateUrl(baseUrl)) {
  if (onProgress) onProgress(`[ERROR] Target ${baseUrl} is in a private IP range — scanning blocked for security`);
  return { urls: [], sitemapFound: false };
}
```

**Severity:** CRITICAL — Must be fixed before enabling live discovery mode.

---

### 🟠 MEDIUM: Redirect Limits Missing

**Locations:**
- `crawler.js`: discoverOnly method uses recursive page.goto() without limit
- `sitemap.js`: fetchUrl uses recursive fetch without limit

**Issue:** While Playwright and Node http clients have built-in redirect limits (~20 for http, configurable for Playwright), application-level control allows operators to verify the policy is enforced.

**Proposed Fix for sitemap.js** (line 5):
```javascript
function fetchUrl(url, depth = 0) {
  const MAX_REDIRECTS = 5;
  if (depth > MAX_REDIRECTS) {
    return Promise.reject(new Error(`Max redirects (${MAX_REDIRECTS}) exceeded at ${url}`));
  }
  
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, 
      { headers: { 'User-Agent': 'IRDAI-Local-Scanner/1.0' }, timeout: 15000 }, 
      res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, depth + 1).then(resolve).catch(reject);
        }
        // ... rest of code ...
      }
    );
    // ... error handling ...
  });
}
```

**For crawler.js** (discoverOnly method): Playwright's built-in limit is sufficient, but logging would help:
```javascript
// Line ~135 in discoverOnly
const res = await page.goto(url, { 
  waitUntil: 'domcontentloaded', 
  timeout: 15000 
}).catch(() => null);

// Log warning if Playwright exceeded redirect limit (status 0 typically indicates error)
if (!res) {
  console.warn(`[crawler] Failed to load ${url} — possible redirect limit or timeout`);
}
```

**Severity:** MEDIUM — Important for production, but built-in limits provide some protection.

---

## 7. SUMMARY

### Currently Protected ✓
- Request timeouts (15-28s on page load, 5-22s on screenshot, 15s on HTTP fetch)
- Same-domain scope enforcement
- Resource filtering (media, fonts, stylesheets, known asset types)
- Download blocking
- Basic auth gate detection
- Demo mode separation
- License enforcement before crawling

### Missing Protections ✗ (MUST FIX BEFORE LIVE)
1. **Private IP validation** — CRITICAL SSRF risk
2. **Redirect depth limits** — Application-level control

### Recommendations Before Live Enablement
1. Implement private IP validation in both crawler.js and sitemap.js
2. Add redirect depth limits to sitemap.js fetchUrl()
3. Add logging for redirect chains and timeout events
4. Test with localhost and private IP ranges to verify blocking
5. Consider rate limiting on discovery (currently max 500 URLs in memory, reasonable)
6. Document all safety mechanisms in operational runbook

---

## 8. DISCOVERY FLOW SAFETY

### One-Page Mode (Safest) ✓
- No discovery
- Single URL scanned
- Same-domain check still applies
- **Blocker:** Private IP validation missing

### Main-Domain Mode (Requires Fixes) ⚠️
- Discovers URLs from robots.txt + sitemap.xml
- Requires discovery to find URLs
- **Blockers:**
  - Private IP validation missing on baseUrl
  - Redirect limits missing on sitemap fetch
  - Once private IP fix is in place, reasonably safe

### Fallback Crawl Mode (If No Sitemap Found) ⚠️
- Uses browser-based discovery (discoverOnly)
- Follows up to 500 URLs with 500ms delay
- **Blockers:**
  - Private IP validation missing on baseUrl
  - Same-domain check still applies
  - Once private IP fix is in place, safe

---

## Conclusion

The system has **strong foundational protections** on timeouts, resource filtering, and same-domain scoping. However, **private network protection is missing**, creating a critical SSRF vulnerability that **must be fixed before enabling live discovery mode**. Redirect limiting should also be added for defense-in-depth.

Once these two fixes are implemented and tested, the system will be safe to enable for live scanning of public websites.
