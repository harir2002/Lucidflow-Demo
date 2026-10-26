const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { v4: uuid } = require('uuid');

// Exact URL to JSON report mapping
const URL_TO_JSON_MAPPING = [
  {
    domain: 'creditinsurancecalculator.allianceinsurance.in',
    path: '/',
    jsonFile: path.join(__dirname, '..', '..', 'reports', 'alliance-insurance.json'),
    filePath: path.join(__dirname, '..', '..', 'reports', 'Lucidflow_Dark Pattern_Alliance Insurance.pdf'),
    reportId: 'LF-AIBPL-2026-001',
  },
  {
    domain: 'insurance-deception-explorer.lovable.app',
    path: '/compare',
    jsonFile: path.join(__dirname, '..', '..', 'reports', 'abc-insurance.json'),
    filePath: path.join(__dirname, '..', '..', 'reports', 'Lucidflow_Dark Pattern Report_ABC Insurance.pdf'),
    reportId: 'LF-AIBL-2026-001',
  },
];

/**
 * Check if URL matches a JSON report (exact domain + path)
 */
function normalizeUrlForJsonReport(url) {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();
    let pathSegment = parsed.pathname;
    if (!pathSegment || pathSegment === '') pathSegment = '/';
    if (pathSegment.endsWith('/') && pathSegment !== '/') {
      pathSegment = pathSegment.slice(0, -1);
    }
    return { domain, path: pathSegment };
  } catch (err) {
    return null;
  }
}

/**
 * Match URL to JSON report mapping
 */
function matchJsonReport(userUrl) {
  const normalized = normalizeUrlForJsonReport(userUrl);
  if (!normalized) return null;

  for (const mapping of URL_TO_JSON_MAPPING) {
    const mappingPath = mapping.path || '/';
    const normalizedPath = normalized.path === '' ? '/' : normalized.path;

    if (
      normalized.domain === mapping.domain.toLowerCase() &&
      (normalizedPath === mappingPath || normalizedPath === mappingPath + '/')
    ) {
      return mapping;
    }
  }
  return null;
}

/**
 * Load JSON report from file
 */
function loadJsonReport(jsonFile) {
  try {
    if (!fs.existsSync(jsonFile)) {
      return null;
    }
    const data = fs.readFileSync(jsonFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load JSON report from ${jsonFile}:`, err.message);
    return null;
  }
}

/**
 * Get JSON report for URL
 */
function getJsonReportForUrl(userUrl) {
  const mapping = matchJsonReport(userUrl);
  if (!mapping) return null;

  const jsonReport = loadJsonReport(mapping.jsonFile);
  if (!jsonReport) return null;

  return {
    mapping,
    report: jsonReport,
  };
}

/**
 * Convert imported JSON report to scan result format for UI display
 * This creates a transient representation without modifying the live scan schema
 */
function convertJsonToReportView(jsonReport) {
  const cover = jsonReport.cover || {};
  const summary = jsonReport.executive_summary || {};
  const findings = jsonReport.findings || [];
  const cap = jsonReport.corrective_action_plan || {};

  // Build KPI summary from source data
  const kpis = summary.kpis_source_reported || {};
  const patternDist = summary.pattern_distribution || [];

  // Risk counts from findings
  const riskCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, CLEAN: 0 };
  findings.forEach((f) => {
    const sev = f.severity || 'LOW';
    if (riskCounts[sev] !== undefined) {
      riskCounts[sev]++;
    }
  });

  return {
    // Header information
    organisation: cover.prepared_for || 'Unknown',
    reportId: cover.report_id || 'Unknown',
    issueDate: cover.issue_date_source || 'Unknown',
    version: cover.version || '1.0',
    assessedUrl: jsonReport.url_mapping?.url || 'Unknown',
    assessmentScope: cover.assessment_scope || 'Unknown',

    // Executive summary
    summary: {
      pagesAssessed: kpis.pages_screens_assessed || 0,
      potentialFindings: kpis.potential_findings || 0,
      highCritical: kpis.high_critical || 0,
      revalidatedClosed: kpis.revalidated_closed || 0,
    },

    // Risk distribution
    riskCounts,

    // Pattern distribution
    patternDistribution: patternDist,

    // Overall posture
    overallPosture: summary.overall_posture || '',

    // Priority themes
    priorityThemes: summary.priority_themes || [],

    // Findings
    findings: findings.map((f) => ({
      id: f.id || 'F-Unknown',
      title: f.title || 'Unknown',
      severity: f.severity || 'LOW',
      pattern: f.pattern_source || 'Unknown',
      assessedUrl: f.assessed_url || 'Unknown',
      remedyEffort: f.remediation_effort || 'Unknown',
      owner: f.owner || 'Unknown',
      evidence: f.evidence || {},
      whyMatters: f.why_this_matters || '',
      remediation: f.remediation || [],
    })),

    // CAP
    cap: {
      heading: cap.heading || 'Corrective Action Plan',
      items: (cap.items || []).map((item) => ({
        id: item.id || 'Unknown',
        findingId: item.finding_id || '',
        findingLabel: item.finding_label || '',
        rootCause: item.root_cause_source || '',
        action: item.action || '',
        owner: item.owner || '',
        due: item.due_source || 'TBD',
        status: item.status_source || 'OPEN',
      })),
    },

    // Appendix
    appendix: jsonReport.appendix || {},

    // Review notes
    reviewNotes: jsonReport.review_notes || [],

    // Source flag
    isImportedReport: true,
    sourceFilename: jsonReport.source?.filename || 'imported_report.pdf',
    provenance: 'Report content is displayed from the supplied assessment PDF.',
  };
}

module.exports = {
  normalizeUrlForJsonReport,
  matchJsonReport,
  loadJsonReport,
  getJsonReportForUrl,
  convertJsonToReportView,
  URL_TO_JSON_MAPPING,
};
