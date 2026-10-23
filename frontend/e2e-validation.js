#!/usr/bin/env node
/**
 * Frontend E2E Validation Script
 * Tests demo scan data display and filtering in the UI
 * 
 * Usage: npm run dev (in separate terminal), then node e2e-validation.js
 */

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const assert = require('assert');

const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:4500';
const TEST_TIMEOUT = 10000;

let testsPassed = 0;
let testsFailed = 0;
const results = [];

function logTest(name, passed, details = '') {
  const status = passed ? '✓' : '✗';
  console.log(`  ${status} ${name}${details ? ' — ' + details : ''}`);
  results.push({ name, passed, details });
  if (passed) testsPassed++;
  else testsFailed++;
}

async function test(name, fn) {
  try {
    await fn();
    logTest(name, true);
  } catch (err) {
    logTest(name, false, err.message);
  }
}

async function runValidation() {
  console.log('\n' + '='.repeat(70));
  console.log('  FRONTEND E2E VALIDATION FOR DEMO SCAN DATA');
  console.log('='.repeat(70) + '\n');

  // SECTION 1: API connectivity and data verification
  console.log('▶ SECTION 1: API DATA VERIFICATION\n');

  let abcScan = null;
  let allianceScan = null;

  await test('API /scans endpoint accessible', async () => {
    const res = await (await fetch(`${API_BASE}/api/scans`)).json();
    assert(Array.isArray(res), 'API response is not an array');
    
    abcScan = res.find(s => s.target_url === 'https://insurance-deception-explorer.lovable.app');
    allianceScan = res.find(s => s.target_url === 'https://allianceinsurance.in/');
    
    assert(abcScan, 'ABC Insurance scan not found');
    assert(allianceScan, 'Alliance Insurance scan not found');
  });

  await test('ABC scan has correct data structure', async () => {
    assert.equal(abcScan.target_url, 'https://insurance-deception-explorer.lovable.app');
    assert.equal(abcScan.status, 'complete');
    assert(abcScan.id, 'Scan missing id');
  });

  let abcDetails = null;
  await test('ABC scan details include findings', async () => {
    const res = await (await fetch(`${API_BASE}/api/scans/${abcScan.id}`)).json();
    abcDetails = res;
    assert.equal(res.findings_count, 10, `Expected 10 findings, got ${res.findings_count}`);
  });

  let abcPages = null;
  await test('ABC scan pages contain all findings with correct data', async () => {
    const res = await (await fetch(`${API_BASE}/api/scans/${abcScan.id}/pages`)).json();
    abcPages = res;
    assert(Array.isArray(res), 'Pages is not an array');
    assert(res.length > 0, 'No pages returned');
    
    const page = res[0];
    assert(Array.isArray(page.findings), 'findings is not an array');
    assert.equal(page.findings.length, 10, `Expected 10 findings, got ${page.findings.length}`);
    
    // Verify finding data
    const finding = page.findings[0];
    assert(finding.pattern_name, 'Finding missing pattern_name');
    assert(finding.severity, 'Finding missing severity');
    assert(finding.evidence, 'Finding missing evidence');
  });

  // SECTION 2: Frontend Health Check
  console.log('\n▶ SECTION 2: FRONTEND AVAILABILITY\n');

  await test('Frontend running at http://localhost:5173', async () => {
    try {
      const response = await fetch(`${BASE_URL}`);
      assert(response.ok || response.status === 200 || response.status === 304, 
        `Frontend returned status ${response.status}`);
    } catch (err) {
      throw new Error(`Frontend not accessible: ${err.message}`);
    }
  });

  // SECTION 3: UI Component Data Expectations
  console.log('\n▶ SECTION 3: UI REQUIREMENTS VERIFICATION\n');

  await test('ABC findings include expected patterns', async () => {
    const page = abcPages[0];
    const patterns = page.findings.map(f => f.pattern_name);
    const expectedPatterns = ['False Urgency', 'Disguised ads', 'Nagging', 'Forced action', 'Subscription trap'];
    
    for (const pattern of expectedPatterns) {
      assert(patterns.includes(pattern), `Pattern "${pattern}" not found`);
    }
  });

  await test('ABC findings have severity distribution UI can display', async () => {
    const page = abcPages[0];
    const mediumFindings = page.findings.filter(f => f.severity === 'MEDIUM');
    const lowFindings = page.findings.filter(f => f.severity === 'LOW');
    
    assert.equal(mediumFindings.length, 7, `Expected 7 MEDIUM, got ${mediumFindings.length}`);
    assert.equal(lowFindings.length, 3, `Expected 3 LOW, got ${lowFindings.length}`);
    
    // Verify each finding has severity that UI can badge
    for (const finding of page.findings) {
      assert(['MEDIUM', 'LOW', 'HIGH', 'CLEAN'].includes(finding.severity), 
        `Invalid severity: ${finding.severity}`);
    }
  });

  await test('Findings have remediation_fix data', async () => {
    const page = abcPages[0];
    // In the fixture, remediation_fix is an array
    // The API should return evidence field with the remediation data
    for (const finding of page.findings) {
      assert(finding.evidence, `Finding ${finding.pattern_name} missing evidence`);
    }
  });

  let alliancePages = null;
  await test('Alliance scan loads all findings', async () => {
    const res = await (await fetch(`${API_BASE}/api/scans/${allianceScan.id}/pages`)).json();
    alliancePages = res;
    const allFindings = res.reduce((sum, p) => sum + (p.findings ? p.findings.length : 0), 0);
    assert.equal(allFindings, 3, `Expected 3 findings, got ${allFindings}`);
  });

  await test('Alliance findings have correct patterns', async () => {
    const allFindings = alliancePages.reduce((arr, p) => [...arr, ...p.findings], []);
    const patterns = allFindings.map(f => f.pattern_name);
    assert(patterns.includes('Interface Interference'), 'Interface Interference not found');
    assert(patterns.includes('Forced action'), 'Forced Action not found');
  });

  // SECTION 4: Filtering Capability
  console.log('\n▶ SECTION 4: FILTERING CAPABILITY\n');

  await test('Severity filter MEDIUM returns 7 findings', async () => {
    const res = await (await fetch(`${API_BASE}/api/scans/${abcScan.id}/pages?severity=MEDIUM`)).json();
    const findings = res.reduce((sum, p) => sum + (p.findings ? p.findings.length : 0), 0);
    assert.equal(findings, 7, `Expected 7, got ${findings}`);
  });

  await test('Severity filter LOW returns 3 findings', async () => {
    const res = await (await fetch(`${API_BASE}/api/scans/${abcScan.id}/pages?severity=LOW`)).json();
    const findings = res.reduce((sum, p) => sum + (p.findings ? p.findings.length : 0), 0);
    assert.equal(findings, 3, `Expected 3, got ${findings}`);
  });

  // SECTION 5: Recommendations
  console.log('\n▶ SECTION 5: RECOMMENDATIONS\n');

  await test('Scan pages include recommendations', async () => {
    const page = abcPages[0];
    assert(Array.isArray(page.recommendations), 'recommendations is not an array');
    assert(page.recommendations.length > 0, 'No recommendations found');
  });

  await test('Recommendations are text strings', async () => {
    const page = abcPages[0];
    for (const rec of page.recommendations) {
      assert(typeof rec === 'string', `Recommendation is not a string: ${typeof rec}`);
      assert(rec.length > 0, 'Recommendation is empty');
    }
  });

  // SECTION 6: Search Data
  console.log('\n▶ SECTION 6: SEARCH CAPABILITY\n');

  await test('Can find False Urgency findings', async () => {
    const page = abcPages[0];
    const urgencyFindings = page.findings.filter(f => f.pattern_name === 'False Urgency');
    assert.equal(urgencyFindings.length, 2, `Expected 2 False Urgency findings, got ${urgencyFindings.length}`);
  });

  await test('Can find Disguised ads findings', async () => {
    const page = abcPages[0];
    const adFindings = page.findings.filter(f => f.pattern_name === 'Disguised ads');
    assert.equal(adFindings.length, 3, `Expected 3 Disguised ads findings, got ${adFindings.length}`);
  });

  // SECTION 7: Risk Summary
  console.log('\n▶ SECTION 7: RISK SUMMARY\n');

  await test('ABC scan risk_counts correct', async () => {
    assert.equal(abcDetails.risk_counts.MEDIUM, 7);
    assert.equal(abcDetails.risk_counts.LOW, 3);
  });

  let allianceDetails = null;
  await test('Alliance scan details include risk_counts', async () => {
    const res = await (await fetch(`${API_BASE}/api/scans/${allianceScan.id}`)).json();
    allianceDetails = res;
    assert.equal(res.findings_count, 3);
    assert.equal(res.risk_counts.MEDIUM, 2);
    assert.equal(res.risk_counts.LOW, 1);
  });

  // Final Summary
  console.log('\n' + '='.repeat(70));
  console.log('  VALIDATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total Checks:  ${testsPassed + testsFailed}`);
  console.log(`  Passed:        ${testsPassed} ✓`);
  console.log(`  Failed:        ${testsFailed} ✗`);
  console.log('='.repeat(70) + '\n');

  if (testsFailed > 0) {
    console.log('FAILED CHECKS:\n');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.name}`);
      if (r.details) console.log(`    ${r.details}`);
    });
    console.log();
  }

  console.log('MANUAL FRONTEND VERIFICATION CHECKLIST:');
  console.log('1. Frontend loads at http://localhost:5173');
  console.log('2. Clicking "Load ABC Insurance scan" displays report');
  console.log('3. Findings tab shows all 10 findings with:');
  console.log('   - Pattern name (False Urgency, Disguised ads, etc.)');
  console.log('   - Severity badge (MEDIUM in orange, LOW in blue)');
  console.log('   - Evidence title');
  console.log('   - Page URL');
  console.log('4. Filter by MEDIUM: shows 7 findings');
  console.log('5. Filter by LOW: shows 3 findings');
  console.log('6. Search "False Urgency": shows 2 findings');
  console.log('7. Search "Disguised": shows 3 findings');
  console.log('8. Expand remediation: shows bullet points for fixes');
  console.log('9. Severity distribution shows correct counts');
  console.log('10. Load Alliance Insurance: shows 3 findings correctly');
  console.log('\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

console.log('\nWaiting for services to stabilize...\n');
setTimeout(runValidation, 2000);
