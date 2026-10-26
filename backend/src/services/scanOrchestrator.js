const { v4: uuid } = require('uuid');
const path = require('path');
const db = require('../db/database');
const { Crawler } = require('./crawler');
const { discoverAllUrls, scoreUrl } = require('./sitemap');
const { analyzePage, analyzePageWithProvider, checkOllamaAvailable } = require('./vision');
const { needsManualReview } = require('./manualReview');
const { getLicenseState } = require('./license');

const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'screenshots');

// In-memory registry of running scans (for pause/status), DB is source of truth
const activeScans = new Map(); // scanId -> { paused: bool, cancelled: bool }

function emit(io, scanId, event, payload) {
  if (io) io.to(scanId).emit(event, payload);
}

async function startScan(scanId, targetUrl, urlPattern, io, options = {}) {
  const { scanMode = 'one-page', selectedUrls = [], domainContext = null } = options;
  activeScans.set(scanId, { paused: false, cancelled: false });

  const updateScan = (fields) => {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE scans SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
      .run(...Object.values(fields), scanId);
  };

  try {
    // ── Determine AI provider before checking availability ─────────────────
    // Priority: options.aiMode > env.AI_MODE > default to 'ollama'
    const aiModeFromEnv = process.env.AI_MODE || 'vision';
    const aiMode = options.aiMode || aiModeFromEnv;
    
    // Only check Ollama if NOT using Groq
    if (aiMode !== 'text-only' || !process.env.GROQ_API_KEY) {
      const ollamaCheck = await checkOllamaAvailable();
      if (!ollamaCheck.available) {
        // If Groq is configured and we can fall back, skip this error
        if (!(process.env.GROQ_API_KEY && aiMode !== 'ollama')) {
          updateScan({ status: 'error' });
          emit(io, scanId, 'scan:error', { message: `Local AI model not available: ${ollamaCheck.reason}` });
          return;
        }
      }
    }

    // ── URL Selection by Mode ─────────────────────────────────────────────
    let allUrls = [];
    let resolvedDomainContext = domainContext;
    
    if (scanMode === 'one-page') {
      // One Page mode: scan only the target URL, no discovery
      allUrls = [targetUrl];
      emit(io, scanId, 'scan:log', { message: `One Page mode: scanning ${targetUrl}` });
    } else if (scanMode === 'main-domain' && selectedUrls && selectedUrls.length > 0) {
      // Main Domain mode: use pre-selected URLs from discovery
      allUrls = selectedUrls;
      
      // Extract domain context from first selected URL if not provided
      if (!resolvedDomainContext && selectedUrls.length > 0) {
        try {
          resolvedDomainContext = new URL(selectedUrls[0]).hostname;
        } catch (err) {
          console.error('Failed to extract domain from first selected URL:', err);
        }
      }
      
      emit(io, scanId, 'scan:log', { message: `Main Domain mode: scanning ${selectedUrls.length} selected page(s) from ${resolvedDomainContext || 'unknown domain'}` });
      emit(io, scanId, 'scan:selected', { totalSelected: selectedUrls.length, domain: resolvedDomainContext });
    } else {
      // Fallback: discover URLs (backward compatibility or main-domain without selections)
      emit(io, scanId, 'scan:log', { message: 'Discovering pages from sitemap...' });
      const { urls: sitemapUrls, sitemapFound, demoLabel } = await discoverAllUrls(targetUrl, (msg) => emit(io, scanId, 'scan:log', { message: msg }));
      
      // Emit demo label if present (provides user visibility)
      if (demoLabel) {
        emit(io, scanId, 'scan:log', { message: demoLabel });
      }
      
      // Convert URL objects to strings (discoverAllUrls returns objects with { url, source } metadata)
      allUrls = (sitemapUrls || []).map(item => typeof item === 'string' ? item : item.url);
      if (!sitemapFound || allUrls.length === 0) {
        emit(io, scanId, 'scan:log', { message: 'No sitemap found — crawling to discover pages...' });
        const crawler = new Crawler({ targetUrl, crawlDelayMs: 600, screenshotsDir: SCREENSHOTS_DIR });
        allUrls = await crawler.discoverOnly((msg) => emit(io, scanId, 'scan:log', { message: msg }), 300);
      }
    }

    // ── Safety Guard: Block fixture URLs outside demo mode ────────────────
    const FIXTURE_DOMAIN = 'demo.tata-aig.local';
    const isDemoModeActive = process.env.DEMO_MODE === 'true';
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
          message: `The domain ${FIXTURE_DOMAIN} is reserved for demo purposes and cannot be scanned in production mode. To run a demo, set DEMO_MODE=true on the backend.` 
        });
        return;
      }
    }

    // ── Apply URL Pattern Filter (if provided) ─────────────────────────────
    if (urlPattern && scanMode !== 'one-page') {
      const re = new RegExp(urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
      allUrls = allUrls.filter(u => re.test(u));
    }
    allUrls.sort((a, b) => scoreUrl(b) - scoreUrl(a));

    // ── LICENSE ENFORCEMENT ───────────────────────────────────────────────
    // Trial mode (no valid key): capped at 3 pages per scan.
    // Licensed: capped at the key's max_pages (-1 = unlimited).
    const license = getLicenseState();
    const discoveredTotal = allUrls.length;
    if (license.max_pages !== -1 && allUrls.length > license.max_pages) {
      allUrls = allUrls.slice(0, license.max_pages);
      if (license.trial) {
        emit(io, scanId, 'scan:log', { message: `TRIAL MODE — scan limited to ${license.max_pages} of ${discoveredTotal} discovered pages. Install a license key to scan more.` });
      } else {
        emit(io, scanId, 'scan:log', { message: `License cap — scanning ${license.max_pages} of ${discoveredTotal} discovered pages (licensed to: ${license.licensee}).` });
      }
      emit(io, scanId, 'scan:license-limited', {
        trial: license.trial, limit: license.max_pages, discovered: discoveredTotal,
      });
    }

    updateScan({ total_pages: allUrls.length, status: 'scanning', domain_context: resolvedDomainContext });
    emit(io, scanId, 'scan:discovered', { totalPages: allUrls.length });

    // Insert page placeholders
    const insertPage = db.prepare(`INSERT OR IGNORE INTO pages (id, scan_id, url, overall_risk) VALUES (?, ?, ?, 'PENDING')`);
    const tx = db.transaction((urls) => { for (const u of urls) insertPage.run(uuid(), scanId, u); });
    tx(allUrls);

    // ── Scan loop: one page at a time so pause/resume works cleanly ──────
    const crawler = new Crawler({ targetUrl, sameDomainOnly: true, screenshotsDir: SCREENSHOTS_DIR });
    const browser = await crawler._browser();
    const context = await crawler._context(browser);

    let scannedCount = db.prepare(`SELECT COUNT(*) c FROM pages WHERE scan_id = ? AND overall_risk != 'PENDING'`).get(scanId).c;

    const pendingPages = db.prepare(`SELECT * FROM pages WHERE scan_id = ? AND overall_risk = 'PENDING'`).all(scanId);

    for (const pageRow of pendingPages) {
      const state = activeScans.get(scanId);
      if (!state || state.cancelled) break;
      while (state.paused) { await new Promise(r => setTimeout(r, 1000)); if (state.cancelled) break; }
      if (state.cancelled) break;

      emit(io, scanId, 'scan:log', { message: `Crawling: ${pageRow.url}` });
      const pageData = await crawler.visitPage(context, pageRow.url, () => {});

      if (!pageData) {
        db.prepare(`UPDATE pages SET overall_risk = 'ERROR', error_message = 'Failed to load/screenshot' WHERE id = ?`).run(pageRow.id);
        scannedCount++;
        updateScan({ scanned_pages: scannedCount });
        emit(io, scanId, 'scan:page-done', { url: pageRow.url, risk: 'ERROR' });
        continue;
      }

      emit(io, scanId, 'scan:log', { message: `Analyzing (local AI): ${pageData.title || pageData.url}` });
      
      // Determine provider: priority is options.aiMode > env.AI_MODE
      // If AI_MODE=text-only and GROQ_API_KEY is set, use Groq
      // Otherwise use Ollama
      let aiProvider = 'ollama'; // default
      const effectiveAiMode = options.aiMode || process.env.AI_MODE || 'vision';
      if (process.env.GROQ_API_KEY && effectiveAiMode === 'text-only') {
        aiProvider = 'groq';
      }
      
      const analysis = await analyzePageWithProvider(pageData, aiProvider);
      const review = needsManualReview(pageData);

      db.prepare(`
        UPDATE pages SET title=?, screenshot_path=?, overall_risk=?, summary=?, dom_signals=?,
        manual_review_required=?, manual_review_reasons=?, analyzed_at=datetime('now')
        WHERE id=?
      `).run(
        pageData.title, pageData.screenshotPath, analysis.overall_risk, analysis.summary,
        JSON.stringify(pageData.domSignals || {}), review.required ? 1 : 0,
        JSON.stringify(review.reasons), pageRow.id
      );

      const insertFinding = db.prepare(`
        INSERT INTO findings (id, page_id, pattern_id, pattern_name, severity, evidence, location, severity_rule_applied, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
      `);
      (analysis.patterns_found || []).forEach(f => {
        insertFinding.run(uuid(), pageRow.id, f.pattern_id || 0, f.pattern_name, f.severity, f.evidence, f.location, f.severity_rule_applied || null);
      });

      const insertRec = db.prepare(`INSERT INTO recommendations (id, page_id, text, sort_order) VALUES (?, ?, ?, ?)`);
      (analysis.recommendations || []).forEach((r, i) => insertRec.run(uuid(), pageRow.id, r, i));

      if (review.required) {
        db.prepare(`INSERT INTO manual_findings_queue (id, scan_id, page_url, page_title, reasons) VALUES (?, ?, ?, ?, ?)`)
          .run(uuid(), scanId, pageData.url, pageData.title, JSON.stringify(review.reasons.map(r => r.code)));
      }

      scannedCount++;
      updateScan({ scanned_pages: scannedCount });
      emit(io, scanId, 'scan:page-done', {
        url: pageData.url, title: pageData.title, risk: analysis.overall_risk,
        findingsCount: (analysis.patterns_found || []).length, scannedCount, totalPages: allUrls.length,
      });
    }

    await browser.close().catch(() => {});

    const finalState = activeScans.get(scanId);
    if (finalState?.cancelled) {
      updateScan({ status: 'paused' });
      emit(io, scanId, 'scan:paused', {});
    } else {
      updateScan({ status: 'complete' });
      emit(io, scanId, 'scan:complete', {});
    }
  } catch (err) {
    updateScan({ status: 'error' });
    console.error(`Scan error: ${err.message}`);
    emit(io, scanId, 'scan:error', { message: err.message });
  } finally {
    activeScans.delete(scanId);
  }
}

function pauseScan(scanId) {
  const state = activeScans.get(scanId);
  if (state) state.paused = true;
}
function resumeScan(scanId) {
  const state = activeScans.get(scanId);
  if (state) state.paused = false;
}
function cancelScan(scanId) {
  const state = activeScans.get(scanId);
  if (state) state.cancelled = true;
}
function isScanActive(scanId) {
  return activeScans.has(scanId);
}

module.exports = { startScan, pauseScan, resumeScan, cancelScan, isScanActive };
