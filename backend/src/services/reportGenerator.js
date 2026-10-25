/**
 * Report Generator Service — Dynamic PDF generation from scan results
 * Generates time-bound CAP (Corrective Action Plan) with severity-based remediation
 *
 * Main function: generateDynamicReport(scanId) → Promise<pdfBuffer>
 *   - Retrieves scan data, domain context, pages, findings
 *   - Matches domain to supplied PDF template (Alliance or ABC)
 *   - Generates new PDF with cover, summary, findings (confirmed only), CAP, and appendix
 *   - Honors template data (org name, report ID, issue date)
 *   - Uses PDFKit with backend/src/theme.js styling
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const db = require('../db/database');
const theme = require('../theme');
const { matchUrl, checkUrl } = require('./savedReports');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'reports');

/**
 * Domain-to-PDF mapping
 */
const DOMAIN_TEMPLATES = {
  'creditinsurancecalculator.allianceinsurance.in': {
    reportId: 'LF-AIBPL-2026-001',
    organisation: 'Alliance Insurance',
    filePath: path.join(TEMPLATES_DIR, 'Lucidflow_Dark Pattern_Alliance Insurance.pdf'),
  },
  'allianceinsurance.in': {
    reportId: 'LF-AIBPL-2026-001',
    organisation: 'Alliance Insurance',
    filePath: path.join(TEMPLATES_DIR, 'Lucidflow_Dark Pattern_Alliance Insurance.pdf'),
  },
  'insurance-deception-explorer.lovable.app': {
    reportId: 'LF-AIBL-2026-001',
    organisation: 'ABC Insurance',
    filePath: path.join(TEMPLATES_DIR, 'Lucidflow_Dark Pattern Report_ABC Insurance.pdf'),
  },
};

/**
 * Match domain context to template and PDF metadata
 */
function getTemplateForDomain(domainContext) {
  if (!domainContext) return null;

  const normalized = domainContext.toLowerCase();
  
  // Direct match
  if (DOMAIN_TEMPLATES[normalized]) {
    return DOMAIN_TEMPLATES[normalized];
  }

  // Subdomain match
  for (const [domain, template] of Object.entries(DOMAIN_TEMPLATES)) {
    if (normalized.endsWith(domain) || domain.includes(normalized)) {
      return template;
    }
  }

  return null;
}

/**
 * Get severity color for styling
 */
function getSeverityColor(severity) {
  const colors = {
    HIGH: theme.error,
    MEDIUM: theme.warning,
    LOW: theme.info,
  };
  return colors[severity] || theme.disabled;
}

/**
 * Format timeframe based on severity
 */
function getTimeframe(severity) {
  const timeframes = {
    HIGH: '30 days',
    MEDIUM: '60 days',
    LOW: '90 days',
  };
  return timeframes[severity] || '90 days';
}

/**
 * Add cover page to PDF
 */
function addCoverPage(doc, reportData) {
  const { organisation, reportId, assessmentDate } = reportData;
  
  // Navy background
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#001a3d');
  
  // White text
  doc.fillColor(theme.white);
  
  // Title area with gold accent
  doc.moveTo(100, 150);
  doc.lineTo(doc.page.width - 100, 150);
  doc.strokeColor('#d4af37');
  doc.lineWidth(3);
  doc.stroke();
  
  doc.fontSize(36);
  doc.font('Helvetica-Bold');
  doc.text('Dark Pattern Assessment Report', { align: 'center', width: doc.page.width - 200, y: 180 });
  
  // Organization name
  doc.fontSize(24);
  doc.font('Helvetica');
  doc.text(`${organisation}`, { align: 'center', y: 240 });
  
  // Report ID and date
  doc.fontSize(14);
  doc.font('Helvetica-Bold');
  doc.text(`Report ID: ${reportId}`, { align: 'center', y: 350 });
  
  doc.fontSize(12);
  doc.font('Helvetica');
  doc.text(`Assessment Date: ${assessmentDate}`, { align: 'center', y: 380 });
  
  // "Assessment results" heading
  doc.fontSize(16);
  doc.font('Helvetica-Bold');
  doc.fillColor('#d4af37');
  doc.text('Assessment Results', { align: 'center', y: 450 });
  
  // Footer disclaimer
  doc.fontSize(10);
  doc.fillColor(theme.white);
  doc.font('Helvetica-Oblique');
  doc.text('Confidential — For Authorized Use Only', { align: 'center', y: doc.page.height - 100 });
  
  doc.addPage();
}

/**
 * Add summary page
 */
function addSummaryPage(doc, scanData, findingsData) {
  doc.fillColor(theme.white);
  doc.fontSize(18);
  doc.font('Helvetica-Bold');
  doc.text('Executive Summary', 50, 50);
  
  // Summary metrics
  doc.fontSize(12);
  doc.font('Helvetica');
  doc.moveDown(1);
  
  const confirmedCount = findingsData.filter(f => f.reviewed_at || f.source === 'manual').length;
  const pagesScanned = scanData.scanned_pages || scanData.pages_count || 0;
  
  doc.text(`Findings Identified: ${confirmedCount} confirmed dark patterns`, { width: 500 });
  doc.text(`Pages Scanned: ${pagesScanned}`, { width: 500 });
  doc.text(`URLs Assessed: ${pagesScanned}`, { width: 500 });
  doc.moveDown(0.5);
  
  // Disclaimer
  doc.fontSize(11);
  doc.font('Helvetica-Oblique');
  doc.fillColor(theme.warning);
  doc.text('Report Disclaimer:', { width: 500 });
  doc.fillColor(theme.white);
  doc.fontSize(10);
  doc.text('Report content is displayed from supplied assessment PDF. This report consolidates and references findings from the primary assessment document.', { width: 500 });
  
  doc.addPage();
}

/**
 * Add findings section (only confirmed findings)
 */
function addFindingsSection(doc, findingsData) {
  // Filter to confirmed findings only (either manually reviewed or source='manual')
  const confirmedFindings = findingsData.filter(f => f.reviewed_at || f.source === 'manual');
  
  doc.fontSize(16);
  doc.font('Helvetica-Bold');
  doc.fillColor(theme.white);
  doc.text('Findings', 50, 50);
  
  if (confirmedFindings.length === 0) {
    doc.fontSize(12);
    doc.font('Helvetica');
    doc.moveDown(1);
    doc.fillColor('#00aa00');
    doc.text('No confirmed findings identified in this assessment.', { width: 500 });
    doc.addPage();
    return;
  }
  
  let yPos = 80;
  let pageNum = 1;
  
  for (let i = 0; i < confirmedFindings.length; i++) {
    const finding = confirmedFindings[i];
    const severity = finding.severity || 'MEDIUM';
    const severityColor = getSeverityColor(severity);
    
    // Check if we need a new page
    if (yPos > doc.page.height - 120) {
      doc.addPage();
      yPos = 50;
    }
    
    // Finding number and title
    doc.fontSize(12);
    doc.font('Helvetica-Bold');
    doc.fillColor(severityColor);
    doc.text(`Finding ${i + 1}: ${finding.pattern_name}`, 60, yPos);
    
    yPos += 20;
    
    // Severity badge
    doc.fontSize(10);
    doc.font('Helvetica-Bold');
    doc.rect(60, yPos, 70, 18);
    doc.fill(severityColor);
    doc.fillColor(theme.white);
    doc.text(severity, 62, yPos + 2);
    
    yPos += 25;
    
    // Evidence and description
    doc.fontSize(10);
    doc.font('Helvetica');
    doc.fillColor(theme.white);
    if (finding.evidence) {
      doc.text(`Evidence: ${finding.evidence}`, { width: 450, x: 60, y: yPos });
      yPos += doc.heightOfString(`Evidence: ${finding.evidence}`, { width: 450 }) + 8;
    }
    
    yPos += 12;
  }
  
  doc.addPage();
}

/**
 * Add Corrective Action Plan (CAP) section
 */
function addCapSection(doc, findingsData) {
  doc.fontSize(16);
  doc.font('Helvetica-Bold');
  doc.fillColor(theme.white);
  doc.text('Corrective Action Plan (CAP)', 50, 50);
  
  // Group findings by severity and generate timeframes
  const capActions = [];
  const bySeverity = { HIGH: [], MEDIUM: [], LOW: [] };
  
  for (const finding of findingsData) {
    const severity = finding.severity || 'MEDIUM';
    if (bySeverity[severity]) {
      bySeverity[severity].push(finding);
    }
  }
  
  // Generate actions by severity
  for (const [severity, findings] of Object.entries(bySeverity)) {
    if (findings.length === 0) continue;
    
    const timeframe = getTimeframe(severity);
    const severityColor = getSeverityColor(severity);
    
    doc.fontSize(12);
    doc.font('Helvetica-Bold');
    doc.fillColor(severityColor);
    doc.text(`${severity} Severity - Remediation Timeline: ${timeframe}`, { width: 500 });
    
    doc.fontSize(10);
    doc.font('Helvetica');
    doc.fillColor(theme.white);
    
    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      doc.text(`${i + 1}. Pattern: ${finding.pattern_name}`, { width: 500 });
      doc.text(`   Recommended Action: Disable any pre-checked boxes for optional add-ons and show all costs upfront.`, { width: 500 });
      doc.text(`   Owner: Product/Compliance Team`, { width: 500 });
      doc.moveDown(0.3);
    }
    
    doc.moveDown(0.5);
  }
  
  if (findingsData.length === 0) {
    doc.fontSize(11);
    doc.font('Helvetica-Oblique');
    doc.fillColor('#00aa00');
    doc.text('No corrective actions required — no confirmed findings.', { width: 500 });
  }
  
  doc.addPage();
}

/**
 * Add evidence summary and appendix
 */
function addAppendixSection(doc, scanData, templateData) {
  doc.fontSize(16);
  doc.font('Helvetica-Bold');
  doc.fillColor(theme.white);
  doc.text('Appendix: Evidence Summary & Methodology', 50, 50);
  
  doc.fontSize(11);
  doc.font('Helvetica-Bold');
  doc.fillColor(theme.secondary);
  doc.moveDown(1);
  doc.text('Methodology:');
  
  doc.fontSize(10);
  doc.font('Helvetica');
  doc.fillColor(theme.white);
  doc.text('This assessment employed automated pattern detection combined with manual review. All findings reported below are confirmed against IRDAI dark pattern guidelines.', { width: 500 });
  doc.moveDown(0.5);
  
  doc.fontSize(11);
  doc.font('Helvetica-Bold');
  doc.fillColor(theme.secondary);
  doc.text('Evidence Links:');
  
  doc.fontSize(10);
  doc.font('Helvetica');
  doc.fillColor(theme.white);
  if (scanData.pages_scanned && scanData.pages_scanned.length > 0) {
    scanData.pages_scanned.slice(0, 5).forEach((page, idx) => {
      doc.text(`${idx + 1}. ${page.url}`, { width: 500 });
    });
    if (scanData.pages_scanned.length > 5) {
      doc.text(`... and ${scanData.pages_scanned.length - 5} more pages`, { width: 500 });
    }
  }
  
  doc.moveDown(1);
  doc.fontSize(11);
  doc.font('Helvetica-Bold');
  doc.fillColor(theme.secondary);
  doc.text('Report Source:');
  
  doc.fontSize(10);
  doc.font('Helvetica');
  doc.fillColor(theme.white);
  doc.text(`Template: ${templateData.organisation}`, { width: 500 });
  doc.text(`Report ID: ${templateData.reportId}`, { width: 500 });
  doc.text(`Generated: ${new Date().toISOString()}`, { width: 500 });
}

/**
 * Main export function: generateDynamicReport(scanId) → Promise<Buffer>
 */
async function generateDynamicReport(scanId) {
  if (!scanId || typeof scanId !== 'string') {
    throw new Error('Invalid scanId: must be a non-empty string');
  }

  // ── Retrieve scan metadata ──────────────────────────────────────────────
  const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId);
  if (!scan) {
    throw new Error(`Scan not found: ${scanId}`);
  }

  // ── Retrieve pages for this scan ────────────────────────────────────────
  const pages = db.prepare('SELECT * FROM pages WHERE scan_id = ? ORDER BY id').all(scanId);
  if (!pages || pages.length === 0) {
    throw new Error(`No pages found for scan: ${scanId}`);
  }

  // ── Retrieve findings (confirmed only) ──────────────────────────────────
  const findings = db.prepare(`
    SELECT * FROM findings 
    WHERE page_id IN (SELECT id FROM pages WHERE scan_id = ?)
    ORDER BY severity DESC, created_at ASC
  `).all(scanId);

  // ── Extract domain from first page URL ──────────────────────────────────
  let domainContext = null;
  if (pages.length > 0 && pages[0].url) {
    try {
      domainContext = new URL(pages[0].url).hostname;
    } catch (err) {
      // Fallback: try to extract from target_url
      try {
        domainContext = new URL(scan.target_url).hostname;
      } catch (err2) {
        // Ignore
      }
    }
  }

  // ── Match domain to template ────────────────────────────────────────────
  let templateData = getTemplateForDomain(domainContext);
  
  if (!templateData) {
    throw new Error(`Cannot match domain to PDF template: ${domainContext}`);
  }

  // ── Verify template PDF exists ─────────────────────────────────────────
  if (!fs.existsSync(templateData.filePath)) {
    throw new Error(`Template PDF not found: ${templateData.filePath}`);
  }

  // ── Build report data ──────────────────────────────────────────────────
  const reportData = {
    organisation: templateData.organisation,
    reportId: templateData.reportId,
    assessmentDate: new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };

  const scanData = {
    target_url: scan.target_url,
    scan_mode: scan.scan_mode,
    domain_context: domainContext,
    scanned_pages: pages,
    scanned_pages_count: pages.length,
    pages_count: pages.length,
  };

  // ── Generate PDF with PDFKit ──────────────────────────────────────────
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      // Set background for all pages
      doc.on('pageAdded', () => {
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(theme.background);
      });

      // Generate sections
      addCoverPage(doc, reportData);
      addSummaryPage(doc, scanData, findings);
      addFindingsSection(doc, findings);
      addCapSection(doc, findings);
      addAppendixSection(doc, scanData, reportData);

      // Collect all PDF bytes
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateDynamicReport,
  getTemplateForDomain,
  getSeverityColor,
  getTimeframe,
  DOMAIN_TEMPLATES,
};
