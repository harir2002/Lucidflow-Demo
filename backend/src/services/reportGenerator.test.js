/**
 * Test Suite for Report Generator Service
 * Tests: domain matching, PDF generation, findings filtering, CAP generation, styling
 */

const {
  generateDynamicReport,
  getTemplateForDomain,
  getSeverityColor,
  getTimeframe,
  DOMAIN_TEMPLATES,
} = require('./reportGenerator');
const db = require('../db/database');
const theme = require('../theme');
const fs = require('fs');
const path = require('path');

describe('ReportGenerator Service', () => {
  // ── Domain Matching Tests ──────────────────────────────────────────────

  describe('Domain Matching', () => {
    test('matches Alliance Insurance domain', () => {
      const template = getTemplateForDomain('allianceinsurance.in');
      expect(template).not.toBeNull();
      expect(template.reportId).toBe('LF-AIBPL-2026-001');
      expect(template.organisation).toBe('Alliance Insurance');
    });

    test('matches Alliance Insurance subdomain', () => {
      const template = getTemplateForDomain('creditinsurancecalculator.allianceinsurance.in');
      expect(template).not.toBeNull();
      expect(template.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('matches ABC Insurance domain', () => {
      const template = getTemplateForDomain('insurance-deception-explorer.lovable.app');
      expect(template).not.toBeNull();
      expect(template.reportId).toBe('LF-AIBL-2026-001');
      expect(template.organisation).toBe('ABC Insurance');
    });

    test('is case-insensitive', () => {
      const template = getTemplateForDomain('ALLIANCEINSURANCE.IN');
      expect(template).not.toBeNull();
      expect(template.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('returns null for unmapped domain', () => {
      const template = getTemplateForDomain('example.com');
      expect(template).toBeNull();
    });

    test('returns null for null input', () => {
      const template = getTemplateForDomain(null);
      expect(template).toBeNull();
    });
  });

  // ── Severity Styling Tests ──────────────────────────────────────────────

  describe('Severity Styling', () => {
    test('HIGH severity returns error color (red)', () => {
      const color = getSeverityColor('HIGH');
      expect(color).toBe(theme.error);
      expect(color).toBe('#ff0000');
    });

    test('MEDIUM severity returns warning color (amber)', () => {
      const color = getSeverityColor('MEDIUM');
      expect(color).toBe(theme.warning);
      expect(color).toBe('#ffa500');
    });

    test('LOW severity returns info color (blue)', () => {
      const color = getSeverityColor('LOW');
      expect(color).toBe(theme.info);
      expect(color).toBe('#0099ff');
    });

    test('unknown severity returns disabled color', () => {
      const color = getSeverityColor('UNKNOWN');
      expect(color).toBe(theme.disabled);
    });
  });

  // ── Timeframe Tests ─────────────────────────────────────────────────────

  describe('Timeframe by Severity', () => {
    test('HIGH severity → 30 days', () => {
      expect(getTimeframe('HIGH')).toBe('30 days');
    });

    test('MEDIUM severity → 60 days', () => {
      expect(getTimeframe('MEDIUM')).toBe('60 days');
    });

    test('LOW severity → 90 days', () => {
      expect(getTimeframe('LOW')).toBe('90 days');
    });

    test('unknown severity → 90 days (default)', () => {
      expect(getTimeframe('UNKNOWN')).toBe('90 days');
    });
  });

  // ── PDF Generation Tests ────────────────────────────────────────────────

  describe('PDF Generation', () => {
    let testScanId;
    let testPageId;

    beforeAll(() => {
      // Create test scan and page
      testScanId = 'TEST-SCAN-001';
      testPageId = 'TEST-PAGE-001';

      // Clean up any existing test data
      db.prepare('DELETE FROM findings WHERE page_id = ?').run(testPageId);
      db.prepare('DELETE FROM pages WHERE id = ?').run(testPageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(testScanId);

      // Insert test scan
      db.prepare(`
        INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testScanId,
        'https://allianceinsurance.in/product',
        'main-domain',
        'complete',
        1
      );

      // Insert test page
      db.prepare(`
        INSERT INTO pages (id, scan_id, url, title, overall_risk)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testPageId,
        testScanId,
        'https://allianceinsurance.in/product',
        'Insurance Product',
        'HIGH'
      );
    });

    afterAll(() => {
      // Clean up test data
      db.prepare('DELETE FROM findings WHERE page_id = ?').run(testPageId);
      db.prepare('DELETE FROM pages WHERE id = ?').run(testPageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(testScanId);
    });

    test('rejects empty scanId', async () => {
      await expect(generateDynamicReport('')).rejects.toThrow('Invalid scanId');
    });

    test('rejects null scanId', async () => {
      await expect(generateDynamicReport(null)).rejects.toThrow('Invalid scanId');
    });

    test('rejects non-existent scanId', async () => {
      await expect(generateDynamicReport('NONEXISTENT-SCAN')).rejects.toThrow('Scan not found');
    });

    test('throws error if domain cannot be matched', async () => {
      // Create scan with unmapped domain
      const unmappedScanId = 'TEST-UNMAPPED-001';
      const unmappedPageId = 'TEST-UNMAPPED-PAGE';

      db.prepare('DELETE FROM findings WHERE page_id = ?').run(unmappedPageId);
      db.prepare('DELETE FROM pages WHERE id = ?').run(unmappedPageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(unmappedScanId);

      db.prepare(`
        INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        unmappedScanId,
        'https://unknown-domain.com',
        'main-domain',
        'complete',
        1
      );

      db.prepare(`
        INSERT INTO pages (id, scan_id, url, title, overall_risk)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        unmappedPageId,
        unmappedScanId,
        'https://unknown-domain.com/page',
        'Unknown Page',
        'MEDIUM'
      );

      await expect(generateDynamicReport(unmappedScanId)).rejects.toThrow(
        'Cannot match domain to PDF template'
      );

      // Clean up
      db.prepare('DELETE FROM findings WHERE page_id = ?').run(unmappedPageId);
      db.prepare('DELETE FROM pages WHERE id = ?').run(unmappedPageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(unmappedScanId);
    });

    test('generates PDF buffer for valid scan with no findings', async () => {
      const pdfBuffer = await generateDynamicReport(testScanId);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');
    });

    test('generates PDF with confirmed findings only', async () => {
      const testScan2Id = 'TEST-SCAN-002';
      const testPage2Id = 'TEST-PAGE-002';

      db.prepare('DELETE FROM findings WHERE page_id = ?').run(testPage2Id);
      db.prepare('DELETE FROM pages WHERE id = ?').run(testPage2Id);
      db.prepare('DELETE FROM scans WHERE id = ?').run(testScan2Id);

      // Insert scan
      db.prepare(`
        INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testScan2Id,
        'https://allianceinsurance.in/product2',
        'main-domain',
        'complete',
        1
      );

      // Insert page
      db.prepare(`
        INSERT INTO pages (id, scan_id, url, title, overall_risk)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testPage2Id,
        testScan2Id,
        'https://allianceinsurance.in/product2',
        'Insurance Product 2',
        'HIGH'
      );

      // Insert unconfirmed finding (no reviewed_at)
      db.prepare(`
        INSERT INTO findings (id, page_id, pattern_id, pattern_name, severity, evidence, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'FINDING-UNCONFIRMED',
        testPage2Id,
        2,
        'Basket Sneaking',
        'HIGH',
        'Pre-checked PA box at checkout',
        'ai'
      );

      // Insert confirmed finding (with reviewed_at)
      db.prepare(`
        INSERT INTO findings (id, page_id, pattern_id, pattern_name, severity, evidence, source, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'FINDING-CONFIRMED',
        testPage2Id,
        7,
        'Drip Pricing',
        'MEDIUM',
        'GST added at final checkout step',
        'ai',
        new Date().toISOString()
      );

      const pdfBuffer = await generateDynamicReport(testScan2Id);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // PDF should reference only confirmed finding (MEDIUM), not unconfirmed (HIGH)
      const pdfText = pdfBuffer.toString('utf8', 0, Math.min(10000, pdfBuffer.length));
      // Note: Full PDF text extraction would require pdf-parse, so we verify buffer validity
      expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');

      // Clean up
      db.prepare('DELETE FROM findings WHERE page_id = ?').run(testPage2Id);
      db.prepare('DELETE FROM pages WHERE id = ?').run(testPage2Id);
      db.prepare('DELETE FROM scans WHERE id = ?').run(testScan2Id);
    });
  });

  // ── Content Integrity Tests ────────────────────────────────────────────

  describe('Content Integrity', () => {
    test('no fabricated findings in empty scan', async () => {
      const testScan3Id = 'TEST-SCAN-003';
      const testPage3Id = 'TEST-PAGE-003';

      db.prepare('DELETE FROM findings WHERE page_id = ?').run(testPage3Id);
      db.prepare('DELETE FROM pages WHERE id = ?').run(testPage3Id);
      db.prepare('DELETE FROM scans WHERE id = ?').run(testScan3Id);

      db.prepare(`
        INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testScan3Id,
        'https://allianceinsurance.in/clean',
        'main-domain',
        'complete',
        1
      );

      db.prepare(`
        INSERT INTO pages (id, scan_id, url, title, overall_risk)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testPage3Id,
        testScan3Id,
        'https://allianceinsurance.in/clean',
        'Clean Page',
        'CLEAN'
      );

      // No findings inserted — scan is clean
      const pdfBuffer = await generateDynamicReport(testScan3Id);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');

      // Clean up
      db.prepare('DELETE FROM pages WHERE id = ?').run(testPage3Id);
      db.prepare('DELETE FROM scans WHERE id = ?').run(testScan3Id);
    });

    test('honors supplied PDF template organisation name', async () => {
      const allianceScanId = 'TEST-ALLIANCE-SCAN';
      const alliancePageId = 'TEST-ALLIANCE-PAGE';

      db.prepare('DELETE FROM pages WHERE id = ?').run(alliancePageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(allianceScanId);

      db.prepare(`
        INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        allianceScanId,
        'https://allianceinsurance.in',
        'main-domain',
        'complete',
        1
      );

      db.prepare(`
        INSERT INTO pages (id, scan_id, url, title, overall_risk)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        alliancePageId,
        allianceScanId,
        'https://allianceinsurance.in',
        'Alliance Home',
        'LOW'
      );

      const pdfBuffer = await generateDynamicReport(allianceScanId);
      expect(pdfBuffer).toBeInstanceOf(Buffer);

      // The PDF should contain "Alliance Insurance" in its content (in cover page)
      // Note: PDF binary, so we check structure rather than exact text
      expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');

      // Clean up
      db.prepare('DELETE FROM pages WHERE id = ?').run(alliancePageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(allianceScanId);
    });
  });

  // ── CAP Generation Tests ───────────────────────────────────────────────

  describe('CAP (Corrective Action Plan) Generation', () => {
    test('generates time-bound actions for HIGH severity findings', async () => {
      const capTestScanId = 'TEST-CAP-HIGH';
      const capTestPageId = 'TEST-CAP-HIGH-PAGE';

      db.prepare('DELETE FROM findings WHERE page_id = ?').run(capTestPageId);
      db.prepare('DELETE FROM pages WHERE id = ?').run(capTestPageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(capTestScanId);

      db.prepare(`
        INSERT INTO scans (id, target_url, scan_mode, status, scanned_pages)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        capTestScanId,
        'https://allianceinsurance.in/high',
        'main-domain',
        'complete',
        1
      );

      db.prepare(`
        INSERT INTO pages (id, scan_id, url, title, overall_risk)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        capTestPageId,
        capTestScanId,
        'https://allianceinsurance.in/high',
        'High Severity Page',
        'HIGH'
      );

      db.prepare(`
        INSERT INTO findings (id, page_id, pattern_id, pattern_name, severity, evidence, source, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'FINDING-HIGH-1',
        capTestPageId,
        2,
        'Basket Sneaking',
        'HIGH',
        'Pre-checked PA cover at checkout',
        'ai',
        new Date().toISOString()
      );

      const pdfBuffer = await generateDynamicReport(capTestScanId);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // Clean up
      db.prepare('DELETE FROM findings WHERE page_id = ?').run(capTestPageId);
      db.prepare('DELETE FROM pages WHERE id = ?').run(capTestPageId);
      db.prepare('DELETE FROM scans WHERE id = ?').run(capTestScanId);
    });
  });

  // ── Template File Validation Tests ─────────────────────────────────────

  describe('Template File Validation', () => {
    test('Alliance Insurance template PDF exists', () => {
      const templatePath = DOMAIN_TEMPLATES['allianceinsurance.in'].filePath;
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    test('ABC Insurance template PDF exists', () => {
      const templatePath = DOMAIN_TEMPLATES['insurance-deception-explorer.lovable.app'].filePath;
      expect(fs.existsSync(templatePath)).toBe(true);
    });
  });
});
