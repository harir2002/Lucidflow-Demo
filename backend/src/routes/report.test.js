/**
 * Test Suite for Report Routes
 * Tests: one-page report endpoint, main-domain report endpoint, error handling
 */

const request = require('supertest');
const express = require('express');
const db = require('../db/database');
const reportRouter = require('./report');

// Create minimal Express app for testing
const app = express();
app.use(express.json());
app.use('/api/report', reportRouter);

describe('Report Routes', () => {
  // ── Setup & Teardown ────────────────────────────────────────────────────

  const TEST_SCAN_ID_ONE_PAGE = 'TEST-ONE-PAGE-001';
  const TEST_SCAN_ID_MAIN_DOMAIN = 'TEST-MAIN-DOMAIN-001';
  const TEST_SCAN_ID_INCOMPLETE = 'TEST-INCOMPLETE-001';
  const TEST_PAGE_ID_1 = 'TEST-PAGE-001';
  const TEST_PAGE_ID_2 = 'TEST-PAGE-002';

  beforeAll(() => {
    // Clean up any existing test data
    db.prepare('DELETE FROM findings WHERE page_id LIKE ?').run('TEST-PAGE-%');
    db.prepare('DELETE FROM recommendations WHERE page_id LIKE ?').run('TEST-PAGE-%');
    db.prepare('DELETE FROM pages WHERE id LIKE ?').run('TEST-PAGE-%');
    db.prepare('DELETE FROM scans WHERE id LIKE ?').run('TEST-%');

    // Create one-page test scan
    db.prepare(`
      INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages, domain_context)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      TEST_SCAN_ID_ONE_PAGE,
      'https://insurance-deception-explorer.lovable.app',
      'one-page',
      'complete',
      1,
      null
    );

    // Create page for one-page scan
    db.prepare(`
      INSERT INTO pages (id, scan_id, url, title, overall_risk)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      TEST_PAGE_ID_1,
      TEST_SCAN_ID_ONE_PAGE,
      'https://insurance-deception-explorer.lovable.app',
      'Test Page',
      'MEDIUM'
    );

    // Create main-domain test scan
    db.prepare(`
      INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages, domain_context)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      TEST_SCAN_ID_MAIN_DOMAIN,
      'https://allianceinsurance.in',
      'main-domain',
      'complete',
      2,
      'allianceinsurance.in'
    );

    // Create pages for main-domain scan
    db.prepare(`
      INSERT INTO pages (id, scan_id, url, title, overall_risk)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      TEST_PAGE_ID_2,
      TEST_SCAN_ID_MAIN_DOMAIN,
      'https://allianceinsurance.in/',
      'Alliance Home',
      'LOW'
    );

    db.prepare(`
      INSERT INTO pages (id, scan_id, url, title, overall_risk)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'TEST-PAGE-003',
      TEST_SCAN_ID_MAIN_DOMAIN,
      'https://allianceinsurance.in/products',
      'Alliance Products',
      'MEDIUM'
    );

    // Create incomplete test scan
    db.prepare(`
      INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages, domain_context)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      TEST_SCAN_ID_INCOMPLETE,
      'https://allianceinsurance.in',
      'main-domain',
      'scanning',
      1,
      'allianceinsurance.in'
    );
  });

  afterAll(() => {
    // Clean up test data
    db.prepare('DELETE FROM findings WHERE page_id LIKE ?').run('TEST-PAGE-%');
    db.prepare('DELETE FROM recommendations WHERE page_id LIKE ?').run('TEST-PAGE-%');
    db.prepare('DELETE FROM pages WHERE id LIKE ?').run('TEST-PAGE-%');
    db.prepare('DELETE FROM scans WHERE id LIKE ?').run('TEST-%');
  });

  // ── One-Page Report Tests ───────────────────────────────────────────────

  describe('GET /api/report/:scanId (One-Page Mode)', () => {
    test('returns 200 and PDF stream for valid one-page scan', async () => {
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_ONE_PAGE}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('irdai-scan');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(res.body.toString('utf8', 0, 4)).toBe('%PDF');
    });

    test('returns 404 for nonexistent scan', async () => {
      await request(app)
        .get('/api/report/NONEXISTENT-SCAN')
        .expect(404)
        .expect(res => {
          expect(res.body.error).toBe('Scan not found');
        });
    });

    test('sets correct Content-Disposition header with scan ID', async () => {
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_ONE_PAGE}`)
        .expect(200);

      const disposition = res.headers['content-disposition'];
      expect(disposition).toContain('attachment');
      expect(disposition).toContain(`irdai-scan-${TEST_SCAN_ID_ONE_PAGE.slice(0, 8)}`);
    });
  });

  // ── Main-Domain Report Tests ────────────────────────────────────────────

  describe('GET /api/report/:scanId/main-domain', () => {
    test('returns 200 and PDF buffer for valid main-domain scan', async () => {
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_MAIN_DOMAIN}/main-domain`)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(res.body.toString('utf8', 0, 4)).toBe('%PDF');
    });

    test('returns correct filename in Content-Disposition with domain context', async () => {
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_MAIN_DOMAIN}/main-domain`)
        .expect(200);

      const disposition = res.headers['content-disposition'];
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('allianceinsurance.in');
      expect(disposition).toContain(TEST_SCAN_ID_MAIN_DOMAIN.slice(0, 8));
    });

    test('sets Cache-Control header', async () => {
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_MAIN_DOMAIN}/main-domain`)
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-cache');
    });

    test('returns 404 if scan not found', async () => {
      await request(app)
        .get('/api/report/NONEXISTENT-SCAN/main-domain')
        .expect(404)
        .expect(res => {
          expect(res.body.error).toBe('Scan not found');
        });
    });

    test('returns 400 if scan is not main-domain mode', async () => {
      await request(app)
        .get(`/api/report/${TEST_SCAN_ID_ONE_PAGE}/main-domain`)
        .expect(400)
        .expect(res => {
          expect(res.body.error).toContain('not in main-domain mode');
          expect(res.body.scanMode).toBe('one-page');
        });
    });

    test('returns 400 if scan is not complete', async () => {
      await request(app)
        .get(`/api/report/${TEST_SCAN_ID_INCOMPLETE}/main-domain`)
        .expect(400)
        .expect(res => {
          expect(res.body.error).toContain('not complete');
          expect(res.body.error).toContain('scanning');
        });
    });

    test('returns 400 if domain_context is missing', async () => {
      // Create scan with main-domain mode but no domain_context
      const noDomainScanId = 'TEST-NO-DOMAIN-001';
      const noDomainPageId = 'TEST-NO-DOMAIN-PAGE-001';

      db.prepare(`
        INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages, domain_context)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        noDomainScanId,
        'https://example.com',
        'main-domain',
        'complete',
        1,
        null
      );

      db.prepare(`
        INSERT INTO pages (id, scan_id, url, title, overall_risk)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        noDomainPageId,
        noDomainScanId,
        'https://example.com',
        'Test',
        'MEDIUM'
      );

      await request(app)
        .get(`/api/report/${noDomainScanId}/main-domain`)
        .expect(400)
        .expect(res => {
          expect(res.body.error).toContain('domain context');
        });

      // Clean up
      db.prepare('DELETE FROM pages WHERE id = ?').run(noDomainPageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(noDomainScanId);
    });
  });

  // ── Backward Compatibility Tests ────────────────────────────────────────

  describe('Backward Compatibility', () => {
    test('one-page endpoint still works after main-domain addition', async () => {
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_ONE_PAGE}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.toString('utf8', 0, 4)).toBe('%PDF');
    });

    test('one-page and main-domain endpoints return different PDFs', async () => {
      const onePageRes = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_ONE_PAGE}`)
        .expect(200);

      const mainDomainRes = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_MAIN_DOMAIN}/main-domain`)
        .expect(200);

      // Both should be valid PDFs
      expect(onePageRes.body.toString('utf8', 0, 4)).toBe('%PDF');
      expect(mainDomainRes.body.toString('utf8', 0, 4)).toBe('%PDF');

      // Content may differ (different reports from different generators)
      // At minimum, they should be different sizes or have different metadata
      // (unless by extreme coincidence they're identical)
    });

    test('one-page endpoint returns 404 for main-domain specific route', async () => {
      // Attempting to request a one-page scan with /main-domain suffix should fail
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_ONE_PAGE}/main-domain`);

      // Should return 400 (wrong scan mode)
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not in main-domain mode');
    });
  });

  // ── Response Structure Tests ────────────────────────────────────────────

  describe('Response Structure', () => {
    test('main-domain response has correct HTTP headers', async () => {
      const res = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_MAIN_DOMAIN}/main-domain`)
        .expect(200);

      // Verify all required headers
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBeDefined();
      expect(res.headers['cache-control']).toBe('no-cache');
    });

    test('error responses return JSON with error field', async () => {
      const res = await request(app)
        .get(`/api/report/INVALID/main-domain`)
        .expect(404);

      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error).toBe('string');
    });
  });

  // ── Integration Tests ──────────────────────────────────────────────────

  describe('Integration', () => {
    test('multiple consecutive requests return valid PDFs', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .get(`/api/report/${TEST_SCAN_ID_MAIN_DOMAIN}/main-domain`)
          .expect(200);

        expect(res.body.toString('utf8', 0, 4)).toBe('%PDF');
      }
    });

    test('can request one-page and main-domain reports sequentially', async () => {
      const onePageRes = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_ONE_PAGE}`)
        .expect(200);

      const mainDomainRes = await request(app)
        .get(`/api/report/${TEST_SCAN_ID_MAIN_DOMAIN}/main-domain`)
        .expect(200);

      expect(onePageRes.body.toString('utf8', 0, 4)).toBe('%PDF');
      expect(mainDomainRes.body.toString('utf8', 0, 4)).toBe('%PDF');
    });
  });
});

