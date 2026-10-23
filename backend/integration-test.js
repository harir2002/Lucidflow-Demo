#!/usr/bin/env node
/**
 * Comprehensive Integration Test Suite for Demo Scan Data
 * Tests backend API, database, and fixture loading
 */

const http = require('http');
const assert = require('assert');
const db = require('./src/db/database');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:4500';
const TEST_TIMEOUT = 5000;

let testsPassed = 0;
let testsFailed = 0;
const results = [];

// Utility: HTTP request helper
function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
            headers: res.headers
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers,
            parseError: e.message
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test result logger
function logTest(name, passed, details = '') {
  const status = passed ? '✓' : '✗';
  console.log(`  ${status} ${name}${details ? ' — ' + details : ''}`);
  results.push({ name, passed, details });
  if (passed) testsPassed++;
  else testsFailed++;
}

// Test assertion helper
async function test(name, fn) {
  try {
    await fn();
    logTest(name, true);
  } catch (err) {
    logTest(name, false, err.message);
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  COMPREHENSIVE INTEGRATION TEST FOR DEMO SCAN DATA');
  console.log('='.repeat(70) + '\n');

  // SECTION 1: DATABASE VERIFICATION
  console.log('▶ SECTION 1: DATABASE INITIALIZATION\n');

  await test('Database connection established', async () => {
    const result = db.prepare('SELECT 1').get();
    assert(result !== undefined, 'Database query failed');
  });

  await test('Tables created', async () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all();
    const tableNames = tables.map(t => t.name);
    assert(tableNames.includes('scans'), 'scans table missing');
    assert(tableNames.includes('pages'), 'pages table missing');
    assert(tableNames.includes('findings'), 'findings table missing');
    assert(tableNames.includes('recommendations'), 'recommendations table missing');
  });

  // Clear demo data for fresh test
  console.log('\n▶ SECTION 2: FIXTURE DATA VERIFICATION\n');

  await test('Demo fixture file exists', async () => {
    const fixtureFile = path.join(__dirname, 'data', 'demo-scans.json');
    assert(fs.existsSync(fixtureFile), `Fixture file not found: ${fixtureFile}`);
  });

  let fixture = null;
  await test('Fixture file valid JSON', async () => {
    const fixtureFile = path.join(__dirname, 'data', 'demo-scans.json');
    fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
    assert(fixture.scans, 'Fixture missing scans array');
    assert(Array.isArray(fixture.scans), 'scans is not an array');
    assert(fixture.scans.length === 2, `Expected 2 scans, got ${fixture.scans.length}`);
  });

  await test('ABC Insurance scan defined', async () => {
    const abc = fixture.scans.find(s => s.target_url === 'https://insurance-deception-explorer.lovable.app');
    assert(abc, 'ABC Insurance scan not found');
    assert(abc.scan_name === 'ABC Insurance', 'Wrong scan name');
    assert(abc.scan_mode === 'one-page', 'Wrong scan mode');
    assert(abc.findings.length === 10, `Expected 10 findings, got ${abc.findings.length}`);
  });

  await test('Alliance Insurance scan defined', async () => {
    const alliance = fixture.scans.find(s => s.target_url === 'https://allianceinsurance.in/');
    assert(alliance, 'Alliance Insurance scan not found');
    assert(alliance.scan_name === 'Alliance Insurance', 'Wrong scan name');
    assert(alliance.scan_mode === 'main-domain', 'Wrong scan mode');
    assert(alliance.findings.length === 3, `Expected 3 findings, got ${alliance.findings.length}`);
  });

  // SECTION 3: SEED ENDPOINT
  console.log('\n▶ SECTION 3: SEED ENDPOINT & DATABASE LOADING\n');

  // Clean up before seeding
  db.prepare("DELETE FROM findings WHERE id LIKE ? OR id LIKE ?").run('ABC-%', 'ALLIANCE-%');
  db.prepare('DELETE FROM recommendations').run();
  db.prepare('DELETE FROM pages WHERE scan_id IN (SELECT id FROM scans WHERE target_url IN (?, ?))').run(
    'https://insurance-deception-explorer.lovable.app',
    'https://allianceinsurance.in/'
  );
  db.prepare('DELETE FROM scans WHERE target_url IN (?, ?)').run(
    'https://insurance-deception-explorer.lovable.app',
    'https://allianceinsurance.in/'
  );

  let seedResponse = null;
  await test('Seed endpoint seeds demo data', async () => {
    seedResponse = await httpRequest('POST', '/api/scans/seed');
    assert.equal(seedResponse.status, 200, `Seed failed with status ${seedResponse.status}`);
    assert(seedResponse.data.success === true, 'Seed did not return success');
    assert(seedResponse.data.scansCreated, 'No scansCreated in response');
    assert(seedResponse.data.scansCreated.length === 2, `Expected 2 scans, got ${seedResponse.data.scansCreated.length}`);
  });

  // SECTION 4: GET /api/scans (List)
  console.log('\n▶ SECTION 4: GET /api/scans (LIST ALL SCANS)\n');

  let scans = [];
  await test('GET /api/scans returns both demo scans', async () => {
    const res = await httpRequest('GET', '/api/scans');
    assert.equal(res.status, 200, `Failed with status ${res.status}`);
    assert(Array.isArray(res.data), 'Response is not an array');
    scans = res.data.filter(s => 
      s.target_url === 'https://insurance-deception-explorer.lovable.app' || 
      s.target_url === 'https://allianceinsurance.in/'
    );
    assert.equal(scans.length, 2, `Expected 2 scans in list, got ${scans.length}`);
  });

  let abcScan = scans.find(s => s.target_url === 'https://insurance-deception-explorer.lovable.app');
  let allianceScan = scans.find(s => s.target_url === 'https://allianceinsurance.in/');

  await test('ABC Insurance scan has correct target_url', async () => {
    assert.equal(abcScan.target_url, 'https://insurance-deception-explorer.lovable.app');
  });

  await test('ABC Insurance scan has status=complete', async () => {
    assert.equal(abcScan.status, 'complete', `Expected status "complete", got "${abcScan.status}"`);
  });

  await test('Alliance Insurance scan has status=complete', async () => {
    assert.equal(allianceScan.status, 'complete', `Expected status "complete", got "${allianceScan.status}"`);
  });

  // SECTION 5: GET /api/scans/:id (Individual Scan)
  console.log('\n▶ SECTION 5: GET /api/scans/:id (INDIVIDUAL SCAN DETAILS)\n');

  let abcDetails = null;
  await test('GET /api/scans/:id returns ABC scan with findings_count', async () => {
    const res = await httpRequest('GET', `/api/scans/${abcScan.id}`);
    assert.equal(res.status, 200, `Failed with status ${res.status}`);
    abcDetails = res.data;
    assert.equal(abcDetails.findings_count, 10, `Expected 10 findings, got ${abcDetails.findings_count}`);
  });

  await test('ABC scan has correct risk_counts distribution', async () => {
    // Expected: 7 MEDIUM, 3 LOW
    assert.equal(abcDetails.risk_counts.MEDIUM, 7, `Expected 7 MEDIUM findings, got ${abcDetails.risk_counts.MEDIUM}`);
    assert.equal(abcDetails.risk_counts.LOW, 3, `Expected 3 LOW findings, got ${abcDetails.risk_counts.LOW}`);
  });

  let allianceDetails = null;
  await test('GET /api/scans/:id returns Alliance scan with findings_count', async () => {
    const res = await httpRequest('GET', `/api/scans/${allianceScan.id}`);
    assert.equal(res.status, 200, `Failed with status ${res.status}`);
    allianceDetails = res.data;
    assert.equal(allianceDetails.findings_count, 3, `Expected 3 findings, got ${allianceDetails.findings_count}`);
  });

  await test('Alliance scan has correct risk_counts distribution', async () => {
    // Expected: 2 MEDIUM, 1 LOW
    assert.equal(allianceDetails.risk_counts.MEDIUM, 2, `Expected 2 MEDIUM findings, got ${allianceDetails.risk_counts.MEDIUM}`);
    assert.equal(allianceDetails.risk_counts.LOW, 1, `Expected 1 LOW findings, got ${allianceDetails.risk_counts.LOW}`);
  });

  // SECTION 6: GET /api/scans/:id/pages (Pages with Findings)
  console.log('\n▶ SECTION 6: GET /api/scans/:id/pages (PAGES & FINDINGS)\n');

  let abcPages = null;
  await test('ABC scan /pages returns page with all findings', async () => {
    const res = await httpRequest('GET', `/api/scans/${abcScan.id}/pages`);
    assert.equal(res.status, 200, `Failed with status ${res.status}`);
    abcPages = res.data;
    assert(Array.isArray(abcPages), 'Pages is not an array');
    assert(abcPages.length > 0, 'No pages returned');
    
    const page = abcPages[0];
    assert(page.findings, 'Page has no findings');
    assert.equal(page.findings.length, 10, `Expected 10 findings in page, got ${page.findings.length}`);
  });

  await test('ABC findings have correct pattern names', async () => {
    const page = abcPages[0];
    const patterns = page.findings.map(f => f.pattern_name);
    const expectedPatterns = ['False Urgency', 'Disguised ads', 'Nagging', 'Forced action', 'Subscription trap', 'Trick question', 'Drip pricing'];
    
    for (const pattern of expectedPatterns) {
      assert(patterns.includes(pattern), `Expected pattern "${pattern}" not found in findings`);
    }
  });

  await test('ABC findings have correct severity distribution', async () => {
    const page = abcPages[0];
    const mediumCount = page.findings.filter(f => f.severity === 'MEDIUM').length;
    const lowCount = page.findings.filter(f => f.severity === 'LOW').length;
    assert.equal(mediumCount, 7, `Expected 7 MEDIUM, got ${mediumCount}`);
    assert.equal(lowCount, 3, `Expected 3 LOW, got ${lowCount}`);
  });

  let alliancePages = null;
  await test('Alliance scan /pages returns page with all findings', async () => {
    const res = await httpRequest('GET', `/api/scans/${allianceScan.id}/pages`);
    assert.equal(res.status, 200, `Failed with status ${res.status}`);
    alliancePages = res.data;
    assert(Array.isArray(alliancePages), 'Pages is not an array');
    const page = alliancePages[0];
    assert.equal(page.findings.length, 3, `Expected 3 findings, got ${page.findings.length}`);
  });

  await test('Alliance findings have correct patterns', async () => {
    const page = alliancePages[0];
    const patterns = page.findings.map(f => f.pattern_name);
    assert(patterns.includes('Interface Interference'), 'Interface Interference not found');
    assert(patterns.includes('Forced action'), 'Forced action not found');
  });

  await test('Alliance findings have correct severity distribution', async () => {
    const page = alliancePages[0];
    const mediumCount = page.findings.filter(f => f.severity === 'MEDIUM').length;
    const lowCount = page.findings.filter(f => f.severity === 'LOW').length;
    assert.equal(mediumCount, 2, `Expected 2 MEDIUM, got ${mediumCount}`);
    assert.equal(lowCount, 1, `Expected 1 LOW, got ${lowCount}`);
  });

  // SECTION 7: FINDINGS DETAIL VERIFICATION
  console.log('\n▶ SECTION 7: FINDINGS DETAIL VERIFICATION\n');

  await test('ABC findings have evidence_title/evidence', async () => {
    const page = abcPages[0];
    for (const finding of page.findings) {
      assert(finding.evidence, `Finding ${finding.id} missing evidence`);
    }
  });

  await test('Recommendations are generated for findings', async () => {
    const page = abcPages[0];
    assert(Array.isArray(page.recommendations), 'Recommendations is not an array');
    assert(page.recommendations.length > 0, 'No recommendations generated');
  });

  // SECTION 8: SEVERITY FILTER
  console.log('\n▶ SECTION 8: SEVERITY FILTER\n');

  await test('Filter by MEDIUM severity returns correct count', async () => {
    const res = await httpRequest('GET', `/api/scans/${abcScan.id}/pages?severity=MEDIUM`);
    assert.equal(res.status, 200);
    const pages = res.data;
    const totalFindings = pages.reduce((sum, p) => sum + (p.findings ? p.findings.length : 0), 0);
    assert.equal(totalFindings, 7, `Expected 7 MEDIUM findings, got ${totalFindings}`);
  });

  await test('Filter by LOW severity returns correct count', async () => {
    const res = await httpRequest('GET', `/api/scans/${abcScan.id}/pages?severity=LOW`);
    assert.equal(res.status, 200);
    const pages = res.data;
    const totalFindings = pages.reduce((sum, p) => sum + (p.findings ? p.findings.length : 0), 0);
    assert.equal(totalFindings, 3, `Expected 3 LOW findings, got ${totalFindings}`);
  });

  // Final Summary
  console.log('\n' + '='.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total Tests:  ${testsPassed + testsFailed}`);
  console.log(`  Passed:       ${testsPassed} ✓`);
  console.log(`  Failed:       ${testsFailed} ✗`);
  console.log('='.repeat(70) + '\n');

  if (testsFailed > 0) {
    console.log('FAILED TESTS:\n');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.name}`);
      if (r.details) console.log(`    ${r.details}`);
    });
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Start server and run tests
console.log('\nStarting backend server...\n');
const server = require('./src/server.js');

// Wait for server to start, then run tests
setTimeout(runTests, 2000);

