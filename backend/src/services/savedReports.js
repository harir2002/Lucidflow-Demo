const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// URL-to-Report mappings (Option B)
const URL_TO_REPORT_MAPPING = [
  {
    domain: 'allianceinsurance.in',
    filePath: path.join(__dirname, '..', '..', 'reports', 'Lucidflow_Dark Pattern_Alliance Insurance.pdf'),
    reportId: 'LF-AIBPL-2026-001',
  },
  {
    domain: 'insurance-deception-explorer.lovable.app',
    filePath: path.join(__dirname, '..', '..', 'reports', 'Lucidflow_Dark Pattern Report_ABC Insurance.pdf'),
    reportId: 'LF-AIBL-2026-001',
  },
];

const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'saved-reports.json');

/**
 * Normalize URL: remove trailing slash, lowercase, extract domain
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Return scheme + domain (lowercased), no trailing slash
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
  } catch (err) {
    return null;
  }
}

/**
 * Match user URL against mapping
 */
function matchUrl(userUrl) {
  const normalized = normalizeUrl(userUrl);
  if (!normalized) return null;

  for (const mapping of URL_TO_REPORT_MAPPING) {
    const mappingUrl = `https://${mapping.domain.toLowerCase()}`;
    if (normalized === mappingUrl) {
      return mapping;
    }
  }
  return null;
}

/**
 * Extract PDF content using pdf-parse
 * Returns object with extracted fields
 */
async function extractPdfContent(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    
    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    
    // Parse PDF
    const data = await pdfParse(fileBuffer);
    const fullText = data.text || '';
    const pageCount = data.numpages || 0;
    
    // Extract fields from text (simple pattern matching)
    const organisation = extractField(fullText, 'organisation|company|insurance', 50);
    const reportId = extractField(fullText, 'report.*id|report.*number', 30);
    const version = extractField(fullText, 'version|v\\d+', 20);
    const issueDate = extractField(fullText, 'date|issued|issued on', 50);
    
    // Extract findings section
    const findings = extractFindings(fullText);
    
    // Extract CAP (Corrective Action Plan)
    const cap = extractCap(fullText);
    
    // Extract appendix
    const appendix = extractAppendix(fullText);
    
    // Calculate source hash
    const sourceHash = crypto.createHash('sha256').update(fullText).digest('hex');
    
    return {
      organisation: organisation || 'Unknown',
      reportId: reportId || 'Unknown',
      version: version || '1.0',
      issueDate: issueDate || 'Unknown',
      findings,
      cap,
      appendix,
      sourceHash,
      pageCount,
    };
  } catch (err) {
    console.error('PDF extraction error:', err.message);
    return {
      organisation: 'Unknown',
      reportId: 'Unknown',
      version: '1.0',
      issueDate: 'Unknown',
      findings: [],
      cap: [],
      appendix: '',
      sourceHash: '',
      pageCount: 0,
    };
  }
}

/**
 * Simple field extraction from text
 */
function extractField(text, pattern, maxLength = 100) {
  const regex = new RegExp(pattern, 'i');
  const match = text.match(regex);
  if (match) {
    const startIndex = Math.max(0, match.index - 20);
    const endIndex = Math.min(text.length, startIndex + maxLength);
    return text.substring(startIndex, endIndex).trim();
  }
  return null;
}

/**
 * Extract findings from PDF text
 */
function extractFindings(text) {
  const findings = [];
  
  // Look for sections with "finding" or "pattern" or severity levels
  const lines = text.split('\n');
  let currentFinding = null;
  
  for (const line of lines) {
    if (line.match(/finding\s*\d+|pattern\s*\d+/i)) {
      if (currentFinding) findings.push(currentFinding);
      currentFinding = {
        title: line.trim(),
        severity: extractSeverity(line),
        description: '',
      };
    } else if (currentFinding && line.trim().length > 0) {
      currentFinding.description += line + ' ';
      if (currentFinding.description.length > 500) {
        findings.push(currentFinding);
        currentFinding = null;
      }
    }
  }
  
  if (currentFinding) findings.push(currentFinding);
  
  return findings;
}

/**
 * Extract severity from text
 */
function extractSeverity(text) {
  if (/high/i.test(text)) return 'HIGH';
  if (/medium/i.test(text)) return 'MEDIUM';
  if (/low/i.test(text)) return 'LOW';
  return 'MEDIUM';
}

/**
 * Extract CAP (Corrective Action Plan) from PDF text
 */
function extractCap(text) {
  const cap = [];
  const capMatch = text.match(/corrective action plan[\s\S]*?(?=appendix|$)/i);
  
  if (capMatch) {
    const capText = capMatch[0];
    const lines = capText.split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      if (line.match(/^\d+\.|action|remediation/i)) {
        cap.push({
          action: line.trim(),
          timeline: 'TBD',
          owner: 'TBD',
        });
      }
    }
  }
  
  return cap;
}

/**
 * Extract appendix from PDF text
 */
function extractAppendix(text) {
  const appendixMatch = text.match(/appendix[\s\S]*?$/i);
  if (appendixMatch) {
    return appendixMatch[0].substring(0, 1000); // First 1000 chars
  }
  return '';
}

/**
 * Load cache from JSON file
 */
function loadCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const data = fs.readFileSync(CACHE_PATH, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to load cache:', err);
      return { reports: [] };
    }
  }
  return { reports: [] };
}

/**
 * Save cache to JSON file
 */
function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save cache:', err);
  }
}

/**
 * Initialize cache by extracting all PDFs
 */
async function initializeCache() {
  const cache = loadCache();
  
  // Check if cache already populated
  if (cache.reports && cache.reports.length > 0) {
    console.log('SavedReports cache already populated');
    return cache;
  }
  
  console.log('Initializing SavedReports cache...');
  
  for (const mapping of URL_TO_REPORT_MAPPING) {
    if (!fs.existsSync(mapping.filePath)) {
      console.warn(`PDF not found: ${mapping.filePath}`);
      continue;
    }
    
    const extracted = await extractPdfContent(mapping.filePath);
    
    // Add to cache if not already there
    const existing = cache.reports.find(r => r.reportId === mapping.reportId);
    if (!existing) {
      cache.reports.push({
        reportId: mapping.reportId,
        organisation: extracted.organisation,
        filePath: mapping.filePath,
        extractedContent: extracted,
        extractedAt: new Date().toISOString(),
      });
    }
  }
  
  saveCache(cache);
  console.log('SavedReports cache initialized');
  return cache;
}

/**
 * Get cached reports
 */
function getCachedReports() {
  return loadCache();
}

/**
 * Check if URL has a saved report and return it
 */
function checkUrl(url) {
  const mapping = matchUrl(url);
  if (!mapping) {
    return {
      found: false,
      reportId: null,
      organisation: null,
      extractedContent: null,
    };
  }
  
  const cache = loadCache();
  const report = cache.reports.find(r => r.reportId === mapping.reportId);
  
  if (report) {
    return {
      found: true,
      reportId: report.reportId,
      organisation: report.organisation,
      extractedContent: report.extractedContent,
    };
  }
  
  return {
    found: false,
    reportId: null,
    organisation: null,
    extractedContent: null,
  };
}

module.exports = {
  normalizeUrl,
  matchUrl,
  extractPdfContent,
  checkUrl,
  getCachedReports,
  initializeCache,
  loadCache,
  saveCache,
  CACHE_PATH,
};
