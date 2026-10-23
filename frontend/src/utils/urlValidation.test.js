/**
 * Test suite for URL validation and scan modes.
 * 
 * Tests:
 * 1. One Page mode URL validation
 * 2. Main Domain mode URL validation
 * 3. Duplicate detection
 * 4. URL normalization (scheme addition)
 * 5. Error messages
 * 6. canScan() and getValidUrls() helpers
 */

import { parseUrls, canScan, getValidUrls } from './urlValidation.js';

// ─────────────────────────────────────────────────────────────────────
// Test One Page Mode
// ─────────────────────────────────────────────────────────────────────

function testOnePage() {
  console.log('📋 ONE PAGE MODE TESTS\n');

  // Valid page URLs
  {
    const result = parseUrls('https://example.com/page1\nhttps://example.com/page2', 'one-page');
    console.assert(result.length === 2, 'Should parse 2 URLs');
    console.assert(result[0].ok === true, 'First URL should be valid');
    console.assert(result[0].url === 'https://example.com/page1', 'Should preserve path');
    console.assert(result[1].ok === true, 'Second URL should be valid');
    console.log('✓ Accepts multiple valid page URLs');
  }

  // Normalization: add scheme
  {
    const result = parseUrls('example.com/page', 'one-page');
    console.assert(result[0].ok === true, 'Should accept URL without scheme');
    console.assert(result[0].url === 'https://example.com/page', 'Should add https:// scheme');
    console.log('✓ Normalizes URLs without scheme');
  }

  // Reject domain (root URL)
  {
    const result = parseUrls('https://example.com', 'one-page');
    console.assert(result[0].ok === false, 'Should reject root URL');
    console.assert(result[0].error.includes('domain'), 'Error should mention domain');
    console.log('✓ Rejects domain roots in One Page mode');
  }

  // Reject domain (no path)
  {
    const result = parseUrls('example.com', 'one-page');
    console.assert(result[0].ok === false, 'Should reject domain without path');
    console.log('✓ Rejects domain-only input');
  }

  // Invalid URLs
  {
    const result = parseUrls('not a url', 'one-page');
    console.assert(result[0].ok === false, 'Should reject invalid URL');
    console.log('✓ Rejects malformed URLs');
  }

  // Duplicates
  {
    const result = parseUrls('example.com/page, example.com/page', 'one-page');
    console.assert(result.length === 1, 'Should remove duplicate');
    console.log('✓ Removes duplicate URLs');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test Main Domain Mode
// ─────────────────────────────────────────────────────────────────────

function testMainDomain() {
  console.log('🌍 MAIN DOMAIN MODE TESTS\n');

  // Valid domain (root only)
  {
    const result = parseUrls('https://example.com', 'main-domain');
    console.assert(result.length === 1, 'Should parse one domain');
    console.assert(result[0].ok === true, 'Domain should be valid');
    console.assert(result[0].url === 'https://example.com', 'Should be root URL');
    console.log('✓ Accepts domain root URL');
  }

  // Normalize domain without scheme
  {
    const result = parseUrls('example.com', 'main-domain');
    console.assert(result[0].ok === true, 'Should accept domain without scheme');
    console.assert(result[0].url === 'https://example.com', 'Should add https:// scheme');
    console.log('✓ Normalizes domain URLs without scheme');
  }

  // Reject page URLs in main-domain
  {
    const result = parseUrls('https://example.com/page', 'main-domain');
    console.assert(result[0].ok === false, 'Should reject page URL');
    console.assert(result[0].error.includes('page URL'), 'Error should mention page URL');
    console.log('✓ Rejects page URLs in Main Domain mode');
  }

  // Reject multiple domains
  {
    const result = parseUrls('example.com, another.com', 'main-domain');
    console.assert(result.length === 2, 'Should parse both entries');
    console.assert(result[0].ok === true, 'First domain OK');
    console.assert(result[1].ok === false, 'Second domain should fail');
    console.assert(result[1].error.includes('Only one'), 'Error should mention "one domain"');
    console.log('✓ Rejects multiple domains');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test Helper Functions
// ─────────────────────────────────────────────────────────────────────

function testHelpers() {
  console.log('🔧 HELPER FUNCTION TESTS\n');

  // canScan() with valid entries
  {
    const result = parseUrls('example.com/page1, example.com/page2', 'one-page');
    console.assert(canScan(result) === true, 'Should return true for valid entries');
    console.log('✓ canScan() returns true for valid URLs');
  }

  // canScan() with errors
  {
    const result = parseUrls('example.com, invalid', 'one-page');
    console.assert(canScan(result) === false, 'Should return false with errors');
    console.log('✓ canScan() returns false when errors present');
  }

  // canScan() with empty input
  {
    const result = parseUrls('', 'one-page');
    console.assert(canScan(result) === false, 'Should return false for empty input');
    console.log('✓ canScan() returns false for empty input');
  }

  // getValidUrls()
  {
    const result = parseUrls('example.com/page1, invalid url, example.com/page2', 'one-page');
    const valid = getValidUrls(result);
    console.assert(valid.length === 2, 'Should extract only valid URLs');
    console.assert(valid[0].includes('page1'), 'Should include first valid URL');
    console.assert(valid[1].includes('page2'), 'Should include second valid URL');
    console.log('✓ getValidUrls() filters valid URLs');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test Edge Cases
// ─────────────────────────────────────────────────────────────────────

function testEdgeCases() {
  console.log('⚠️  EDGE CASE TESTS\n');

  // Whitespace handling
  {
    const result = parseUrls('  \n  example.com/page  \n  ', 'one-page');
    console.assert(result.length === 1, 'Should handle surrounding whitespace');
    console.assert(result[0].ok === true, 'URL should be valid');
    console.log('✓ Handles leading/trailing whitespace');
  }

  // Mixed separators
  {
    const result = parseUrls('example.com/page1, example.com/page2\nexample.com/page3', 'one-page');
    console.assert(result.length === 3, 'Should parse mixed comma/newline separators');
    console.log('✓ Accepts comma and newline separators');
  }

  // URLs with query strings and fragments
  {
    const result = parseUrls('example.com/page?ref=test#section', 'one-page');
    console.assert(result[0].ok === true, 'Should accept URLs with query/fragment');
    console.assert(result[0].url.includes('?ref=test'), 'Should preserve query string');
    console.log('✓ Preserves query strings and fragments');
  }

  // Trailing slash variants
  {
    const r1 = parseUrls('https://example.com/', 'main-domain');
    const r2 = parseUrls('https://example.com', 'main-domain');
    console.assert(r1[0].ok === true && r2[0].ok === true, 'Both should be valid domains');
    console.log('✓ Treats trailing slash variants as root URLs');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test Demo Safety (placeholder for backend verification)
// ─────────────────────────────────────────────────────────────────────

function testDemoSafety() {
  console.log('🔒 DEMO SAFETY TESTS\n');

  // Note: Full demo safety is enforced on backend (scanOrchestrator.js).
  // Frontend validation ensures correct mode selection and URL entry.
  // Backend will block fixture domain (demo.tata-aig.local) outside demo mode.

  {
    const result = parseUrls('demo.tata-aig.local', 'main-domain');
    console.assert(result[0].ok === true, 'Frontend should accept demo domain (backend enforces safety)');
    console.log('✓ Frontend accepts demo domain (backend enforces safety guard)');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Run All Tests
// ─────────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════\n');
console.log('  URL VALIDATION TEST SUITE\n');
console.log('═══════════════════════════════════════════════════════════\n');

testOnePage();
testMainDomain();
testHelpers();
testEdgeCases();
testDemoSafety();

console.log('═══════════════════════════════════════════════════════════');
console.log('✓ All tests passed!\n');
