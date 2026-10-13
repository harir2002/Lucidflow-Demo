const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const { startScan, pauseScan, resumeScan, cancelScan, isScanActive } = require('../services/scanOrchestrator');

module.exports = (io) => {
  const router = express.Router();

  // Create + start a new scan
  router.post('/', (req, res) => {
    const { target_url, url_pattern } = req.body;
    if (!target_url) return res.status(400).json({ error: 'target_url is required' });

    let parsed;
    try { parsed = new URL(target_url); } catch { return res.status(400).json({ error: 'target_url is not a valid URL' }); }

    const id = uuid();
    db.prepare(`INSERT INTO scans (id, target_url, url_pattern, status) VALUES (?, ?, ?, 'discovering')`)
      .run(id, target_url, url_pattern || null);

    // Fire and forget — progress streamed via websocket
    startScan(id, target_url, url_pattern, io).catch(err => console.error('Scan crashed:', err));

    res.status(201).json({ id, target_url, status: 'discovering' });
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
    startScan(req.params.id, scan.target_url, scan.url_pattern, io).catch(err => console.error('Scan crashed:', err));
    res.json({ status: 'scanning' });
  });

  return router;
};
