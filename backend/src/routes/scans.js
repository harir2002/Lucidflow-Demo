const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const fs = require('fs');
const path = require('path');
const { startScan, pauseScan, resumeScan, cancelScan, isScanActive } = require('../services/scanOrchestrator');

module.exports = (io) => {
  const router = express.Router();

  // Create + start a new scan
  router.post('/', (req, res) => {
    const { target_url, url_pattern, scan_mode, selected_urls } = req.body;
    if (!target_url) return res.status(400).json({ error: 'target_url is required' });

    // Validate scan_mode if provided
    if (scan_mode && !['one-page', 'main-domain'].includes(scan_mode)) {
      return res.status(400).json({ error: 'scan_mode must be "one-page" or "main-domain"' });
    }

    // Validate selected_urls if provided
    if (selected_urls && (!Array.isArray(selected_urls) || !selected_urls.every(u => typeof u === 'string'))) {
      return res.status(400).json({ error: 'selected_urls must be an array of strings' });
    }

    let parsed;
    try { parsed = new URL(target_url); } catch { return res.status(400).json({ error: 'target_url is not a valid URL' }); }

    const id = uuid();
    db.prepare(`INSERT INTO scans (id, target_url, url_pattern, scan_mode, status) VALUES (?, ?, ?, ?, 'discovering')`)
      .run(id, target_url, url_pattern || null, scan_mode || 'one-page');

    // Fire and forget — progress streamed via websocket
    startScan(id, target_url, url_pattern, io, {
      scanMode: scan_mode || 'one-page',
      selectedUrls: selected_urls || []
    }).catch(err => console.error('Scan crashed:', err));

    res.status(201).json({ id, target_url, status: 'discovering' });
  });

  // Discover URLs from a domain (for Main Domain mode)
  router.post('/discover', async (req, res) => {
    const { base_url } = req.body;
    if (!base_url) return res.status(400).json({ error: 'base_url is required' });

    try {
      new URL(base_url);
    } catch {
      return res.status(400).json({ error: 'base_url is not a valid URL' });
    }

    try {
      const discovery = await discoverAllUrls(base_url, null);
      res.json({
        urls: discovery.urls || [],
        sitemapFound: discovery.sitemapFound || false,
        demoLabel: discovery.demoLabel || null
      });
    } catch (err) {
      res.status(500).json({ error: `Discovery failed: ${err.message}` });
    }
  });

  // List all scans
  router.get('/', (req, res) => {
    const scans = db.prepare(`SELECT * FROM scans ORDER BY created_at DESC`).all();
    res.json(scans.map(s => ({ ...s, is_active: isScanActive(s.id) })));
  });

  // Get one scan with summary stats
  router.get('/:id', (req, res) => {
    const scan = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(req.params.id);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const riskCounts = db.prepare(`
      SELECT overall_risk, COUNT(*) as count FROM pages WHERE scan_id = ? GROUP BY overall_risk
    `).all(req.params.id);

    const findingsCount = db.prepare(`
      SELECT COUNT(*) as c FROM findings f JOIN pages p ON p.id = f.page_id WHERE p.scan_id = ?
    `).get(req.params.id).c;

    const topPatterns = db.prepare(`
      SELECT f.pattern_name, COUNT(DISTINCT p.id) as page_count
      FROM findings f JOIN pages p ON p.id = f.page_id
      WHERE p.scan_id = ? GROUP BY f.pattern_name ORDER BY page_count DESC LIMIT 10
    `).all(req.params.id);

    const manualReviewCount = db.prepare(`SELECT COUNT(*) c FROM pages WHERE scan_id = ? AND manual_review_required = 1`).get(req.params.id).c;

    res.json({
      ...scan,
      is_active: isScanActive(scan.id),
      risk_counts: Object.fromEntries(riskCounts.map(r => [r.overall_risk, r.count])),
      findings_count: findingsCount,
      top_patterns: topPatterns,
      manual_review_count: manualReviewCount,
    });
  });

  // List pages for a scan (with findings)
  router.get('/:id/pages', (req, res) => {
    const { severity } = req.query;
    let query = `SELECT * FROM pages WHERE scan_id = ?`;
    const params = [req.params.id];
    if (severity && severity !== 'ALL') { query += ` AND overall_risk = ?`; params.push(severity); }
    query += ` ORDER BY CASE overall_risk WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 WHEN 'CLEAN' THEN 3 ELSE 4 END`;

    const pages = db.prepare(query).all(...params);
    const findingsStmt = db.prepare(`SELECT * FROM findings WHERE page_id = ?`);
    const recsStmt = db.prepare(`SELECT text FROM recommendations WHERE page_id = ? ORDER BY sort_order`);

    const result = pages.map(p => ({
      ...p,
      dom_signals: p.dom_signals ? JSON.parse(p.dom_signals) : null,
      manual_review_reasons: p.manual_review_reasons ? JSON.parse(p.manual_review_reasons) : [],
      findings: findingsStmt.all(p.id),
      recommendations: recsStmt.all(p.id).map(r => r.text),
    }));

    res.json(result);
  });

  // Manual review worklist
  router.get('/:id/manual-review', (req, res) => {
    const items = db.prepare(`SELECT * FROM manual_findings_queue WHERE scan_id = ? ORDER BY created_at`).all(req.params.id);
    res.json(items.map(i => ({ ...i, reasons: i.reasons ? JSON.parse(i.reasons) : [] })));
  });

  // Add a manual finding
  router.post('/:id/manual-findings', (req, res) => {
    const { page_url, page_title, pattern_id, pattern_name, severity, evidence, location, reviewed_by, recommendations } = req.body;
    if (!page_url || !pattern_name || !severity || !evidence) {
      return res.status(400).json({ error: 'page_url, pattern_name, severity, evidence are required' });
    }

    let page = db.prepare(`SELECT * FROM pages WHERE scan_id = ? AND url = ?`).get(req.params.id, page_url);
    if (!page) {
      const pageId = uuid();
      db.prepare(`INSERT INTO pages (id, scan_id, url, title, overall_risk, summary) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(pageId, req.params.id, page_url, page_title || page_url, severity, `Manually reviewed — ${pattern_name} identified`);
      page = { id: pageId };
    } else {
      const order = { CLEAN: 0, LOW: 1, MEDIUM: 2, HIGH: 3, PENDING: -1, ERROR: -1 };
      if ((order[severity] ?? 0) > (order[page.overall_risk] ?? 0)) {
        db.prepare(`UPDATE pages SET overall_risk = ? WHERE id = ?`).run(severity, page.id);
      }
    }

    const findingId = uuid();
    db.prepare(`
      INSERT INTO findings (id, page_id, pattern_id, pattern_name, severity, evidence, location, source, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, datetime('now'))
    `).run(findingId, page.id, pattern_id || 0, pattern_name, severity, evidence, location || 'Manual walkthrough', reviewed_by || 'Unspecified');

    if (recommendations?.length) {
      const insertRec = db.prepare(`INSERT INTO recommendations (id, page_id, text, sort_order) VALUES (?, ?, ?, ?)`);
      recommendations.forEach((r, i) => insertRec.run(uuid(), page.id, r, 1000 + i));
    }

    // Mark corresponding worklist item as reviewed
    db.prepare(`UPDATE manual_findings_queue SET status = 'reviewed' WHERE scan_id = ? AND page_url = ?`).run(req.params.id, page_url);

    res.status(201).json({ id: findingId, page_id: page.id });
  });

  // Pause / Resume / Cancel controls
  router.post('/:id/pause', (req, res) => { pauseScan(req.params.id); res.json({ status: 'paused' }); });
  router.post('/:id/resume', (req, res) => { resumeScan(req.params.id); res.json({ status: 'resumed' }); });
  router.post('/:id/cancel', (req, res) => { cancelScan(req.params.id); res.json({ status: 'cancelling' }); });

  // Restart a scan that stopped (resumes from pending pages)
  router.post('/:id/restart', (req, res) => {
    const scan = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(req.params.id);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    if (isScanActive(req.params.id)) return res.status(409).json({ error: 'Scan already running' });

    db.prepare(`UPDATE scans SET status = 'scanning' WHERE id = ?`).run(req.params.id);
    startScan(req.params.id, scan.target_url, scan.url_pattern, io, {
      scanMode: scan.scan_mode || 'one-page',
      selectedUrls: []
    }).catch(err => console.error('Scan crashed:', err));
    res.json({ status: 'scanning' });
  });

  // Seed endpoint: Load demo fixture data (idempotent)
  router.post('/seed', (req, res) => {
    try {
      const fixtureData = req.body.fixture || loadFixtureFromFile();
      const scansCreated = [];

      if (!fixtureData.scans || !Array.isArray(fixtureData.scans)) {
        return res.status(400).json({ error: 'Invalid fixture: scans array is required' });
      }

      const insertScan = db.prepare(`
        INSERT OR IGNORE INTO scans (id, target_url, scan_mode, status)
        VALUES (?, ?, ?, 'complete')
      `);

      const insertPage = db.prepare(`
        INSERT OR IGNORE INTO pages (id, scan_id, url, title, overall_risk, summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertFinding = db.prepare(`
        INSERT INTO findings (id, page_id, pattern_name, severity, evidence)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertRec = db.prepare(`
        INSERT INTO recommendations (id, page_id, text, sort_order)
        VALUES (?, ?, ?, ?)
      `);

      for (const scanFixture of fixtureData.scans) {
        // Check if scan with this target_url already exists
        const existingScan = db.prepare(`SELECT id FROM scans WHERE target_url = ?`).get(scanFixture.target_url);
        if (existingScan) {
          scansCreated.push({
            scan_name: scanFixture.scan_name,
            target_url: scanFixture.target_url,
            status: 'skipped',
            reason: 'Scan with this URL already exists'
          });
          continue;
        }

        const scanId = uuid();
        const pageId = uuid();

        // Determine overall_risk based on findings severity
        let overallRisk = 'CLEAN';
        if (scanFixture.findings && scanFixture.findings.length > 0) {
          const hasMedium = scanFixture.findings.some(f => f.severity === 'MEDIUM');
          const hasHigh = scanFixture.findings.some(f => f.severity === 'HIGH');
          if (hasHigh) overallRisk = 'HIGH';
          else if (hasMedium) overallRisk = 'MEDIUM';
          else overallRisk = 'LOW';
        }

        // Insert scan record
        insertScan.run(scanId, scanFixture.target_url, scanFixture.scan_mode || 'one-page');

        // Insert page record
        insertPage.run(
          pageId,
          scanId,
          scanFixture.target_url,
          scanFixture.scan_name || scanFixture.target_url,
          overallRisk,
          `Scan of ${scanFixture.target_url} — ${scanFixture.findings.length} findings`
        );

        // Insert findings
        if (scanFixture.findings && Array.isArray(scanFixture.findings)) {
          for (const finding of scanFixture.findings) {
            insertFinding.run(
              finding.finding_id || uuid(),
              pageId,
              finding.pattern_name,
              finding.severity,
              finding.evidence_title || finding.pattern_name
            );
          }
        }

        // Insert auto-generated recommendations based on findings
        const recommendations = generateRecommendations(scanFixture.findings || []);
        recommendations.forEach((rec, index) => {
          insertRec.run(uuid(), pageId, rec, index);
        });

        scansCreated.push({
          id: scanId,
          scan_name: scanFixture.scan_name,
          target_url: scanFixture.target_url,
          scan_mode: scanFixture.scan_mode || 'one-page',
          status: 'created',
          findings_count: (scanFixture.findings || []).length
        });
      }

      res.json({
        success: true,
        scansCreated
      });
    } catch (err) {
      console.error('Seed error:', err);
      res.status(500).json({ error: `Seed failed: ${err.message}` });
    }
  });

  /**
   * Load demo fixture from file
   */
  function loadFixtureFromFile() {
    const fixtureFile = path.join(__dirname, '..', '..', 'data', 'demo-scans.json');
    if (!fs.existsSync(fixtureFile)) {
      throw new Error(`Fixture file not found: ${fixtureFile}`);
    }
    return JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  }

  /**
   * Generate summary recommendations based on findings
   */
  function generateRecommendations(findings) {
    const recommendations = [];
    const uniquePatterns = [...new Set(findings.map(f => f.pattern_name))];

    if (uniquePatterns.includes('False Urgency')) {
      recommendations.push('Review and remove artificial time pressure tactics from the user experience');
    }
    if (uniquePatterns.includes('Disguised ads')) {
      recommendations.push('Clearly label all sponsored content and paid partnerships');
    }
    if (uniquePatterns.includes('Nagging')) {
      recommendations.push('Implement frequency caps and clear dismiss options for all notifications');
    }
    if (uniquePatterns.includes('Forced action')) {
      recommendations.push('Ensure all user actions are truly optional and not mandatory for progression');
    }
    if (uniquePatterns.includes('Subscription trap')) {
      recommendations.push('Review renewal flows to ensure explicit informed consent');
    }
    if (uniquePatterns.includes('Interface Interference')) {
      recommendations.push('Audit UI components to ensure all controls are accessible and visible');
    }
    if (uniquePatterns.includes('Trick question')) {
      recommendations.push('Simplify language and remove confusing phrasing from all user-facing text');
    }
    if (uniquePatterns.includes('Drip pricing')) {
      recommendations.push('Display complete pricing information upfront before checkout');
    }

    // Ensure at least one recommendation
    if (recommendations.length === 0) {
      recommendations.push('Conduct comprehensive accessibility and UX review');
    }

    return recommendations.slice(0, 5);
  }

  return router;
};
