const express = require('express');
const fs = require('fs');
const path = require('path');
const { checkUrl, getCachedReports } = require('../services/savedReports');

const router = express.Router();

// Allowlist: only these directories are permitted for serving PDFs
const ALLOWED_DIRS = [
  path.join(__dirname, '..', '..', 'reports'),
];

/**
 * Check if path is within allowed directories (security)
 */
function isPathAllowed(filePath) {
  const normalized = path.normalize(filePath);
  for (const allowedDir of ALLOWED_DIRS) {
    if (normalized.startsWith(path.normalize(allowedDir))) {
      return true;
    }
  }
  return false;
}

/**
 * GET /api/saved-reports/check?url=...
 * Check if a saved report exists for a given URL
 */
router.get('/check', (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'url query parameter is required' });
  }
  
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'url is not a valid URL' });
  }
  
  const result = checkUrl(url);
  
  if (result.found) {
    const extracted = result.extractedContent;
    return res.json({
      found: true,
      reportId: result.reportId,
      organisation: result.organisation,
      issueDate: extracted.issueDate || 'Unknown',
      version: extracted.version || 'Unknown',
      pageCount: extracted.pageCount || 0,
    });
  }
  
  return res.json({ found: false });
});

/**
 * GET /api/saved-reports/:reportId
 * Get metadata and extracted content for a saved report
 */
router.get('/:reportId', (req, res) => {
  const { reportId } = req.params;
  
  const cache = getCachedReports();
  const report = cache.reports.find(r => r.reportId === reportId);
  
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  
  const extracted = report.extractedContent;
  
  res.json({
    reportId: report.reportId,
    organisation: report.organisation,
    issueDate: extracted.issueDate || 'Unknown',
    version: extracted.version || 'Unknown',
    pageCount: extracted.pageCount || 0,
    findings: extracted.findings || [],
    cap: extracted.cap || [],
    appendix: extracted.appendix || '',
  });
});

/**
 * GET /api/saved-reports/:reportId/download
 * Download the original PDF file
 */
router.get('/:reportId/download', (req, res) => {
  const { reportId } = req.params;
  
  const cache = getCachedReports();
  const report = cache.reports.find(r => r.reportId === reportId);
  
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  
  const filePath = report.filePath;
  
  // Security: verify path is allowed
  if (!isPathAllowed(filePath)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Security: verify file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    res.send(fileBuffer);
  } catch (err) {
    console.error('Failed to download report:', err);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

module.exports = router;
