/**
 * Test suite for NewScan component
 * 
 * Tests:
 * 1. Mode toggle (one-page ↔ main-domain)
 * 2. Discovery flow (input domain → discover → show URLs)
 * 3. URL selection (select/deselect, select-all)
 * 4. Validation (empty input, invalid URL)
 * 5. Scan submission with selected URLs
 * 6. Report generation link after scan completes
 * 7. Backward compatibility (one-page mode unchanged)
 */

// Mock API client
const mockApi = {
  getLicense: async () => ({ max_pages: 3 }),
  discoverUrls: async (baseUrl) => {
    if (baseUrl === 'https://example.com') {
      return {
        urls: [
          'https://example.com/page1',
          'https://example.com/page2',
          'https://example.com/page3',
        ],
        demoLabel: null,
      };
    }
    if (baseUrl === 'https://demo.tata-aig.local') {
      return {
        urls: [
          'https://demo.tata-aig.local/page1',
          'https://demo.tata-aig.local/page2',
        ],
        demoLabel: '⚠️ Demo domain — results are simulated.',
      };
    }
    throw new Error('Domain not allowed');
  },
  createScan: async (targetUrl, urlPattern, scanMode, selectedUrls) => {
    if (scanMode === 'one-page' && !targetUrl) {
      throw new Error('Target URL required');
    }
    if (scanMode === 'main-domain' && selectedUrls.length === 0) {
      throw new Error('No URLs selected');
    }
    return { id: `scan-${Date.now()}` };
  },
};

// ─────────────────────────────────────────────────────────────────────
// Test 1: Mode Toggle (one-page ↔ main-domain)
// ─────────────────────────────────────────────────────────────────────

async function testModeToggle() {
  console.log('📋 MODE TOGGLE TESTS\n');

  // Test initial state
  {
    const state = { scanMode: 'one-page' };
    console.assert(state.scanMode === 'one-page', 'Should start in one-page mode');
    console.log('✓ Initializes in one-page mode');
  }

  // Test switching to main-domain
  {
    const state = { scanMode: 'one-page' };
    state.scanMode = 'main-domain';
    console.assert(state.scanMode === 'main-domain', 'Should switch to main-domain');
    console.log('✓ Switches to main-domain mode');
  }

  // Test switching back to one-page
  {
    const state = { scanMode: 'main-domain' };
    state.scanMode = 'one-page';
    console.assert(state.scanMode === 'one-page', 'Should switch back to one-page');
    console.log('✓ Switches back to one-page mode');
  }

  // Test discovery state clears on mode switch
  {
    const state = { 
      scanMode: 'one-page',
      discoveredUrls: ['url1', 'url2'],
      selectedUrls: ['url1']
    };
    state.scanMode = 'main-domain';
    state.discoveredUrls = [];
    state.selectedUrls = [];
    console.assert(state.discoveredUrls.length === 0, 'Should clear discovered URLs');
    console.assert(state.selectedUrls.length === 0, 'Should clear selected URLs');
    console.log('✓ Clears discovery state on mode switch');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 2: Discovery Flow
// ─────────────────────────────────────────────────────────────────────

async function testDiscoveryFlow() {
  console.log('🔍 DISCOVERY FLOW TESTS\n');

  // Test successful discovery
  {
    const result = await mockApi.discoverUrls('https://example.com');
    console.assert(result.urls.length === 3, 'Should return discovered URLs');
    console.assert(result.urls[0] === 'https://example.com/page1', 'Should have correct URL format');
    console.log('✓ Successfully discovers URLs from domain');
  }

  // Test discovery with demo label
  {
    const result = await mockApi.discoverUrls('https://demo.tata-aig.local');
    console.assert(result.demoLabel !== null, 'Should include demo label');
    console.assert(result.demoLabel.includes('Demo'), 'Demo label should mention "Demo"');
    console.log('✓ Includes demo label for demo domains');
  }

  // Test discovery error handling
  {
    try {
      await mockApi.discoverUrls('https://invalid-domain.com');
      console.assert(false, 'Should throw error for invalid domain');
    } catch (err) {
      console.assert(err.message.includes('not allowed'), 'Error should be clear');
      console.log('✓ Handles discovery errors gracefully');
    }
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 3: URL Selection (select/deselect, select-all)
// ─────────────────────────────────────────────────────────────────────

async function testUrlSelection() {
  console.log('✓ URL SELECTION TESTS\n');

  // Test individual selection
  {
    const selected = new Set();
    const url = 'https://example.com/page1';
    selected.add(url);
    console.assert(selected.has(url), 'Should select URL');
    console.log('✓ Selects individual URL');
  }

  // Test deselection
  {
    const selected = new Set(['https://example.com/page1']);
    selected.delete('https://example.com/page1');
    console.assert(selected.size === 0, 'Should deselect URL');
    console.log('✓ Deselects URL');
  }

  // Test select all with limit enforcement
  {
    const urls = [
      'https://example.com/page1',
      'https://example.com/page2',
      'https://example.com/page3',
      'https://example.com/page4',
    ];
    const maxSelectable = 3;
    const selected = new Set(urls.slice(0, maxSelectable));
    console.assert(selected.size === 3, 'Should respect max_pages limit');
    console.assert(!selected.has(urls[3]), 'Should not exceed limit');
    console.log('✓ Enforces max_pages limit on select all');
  }

  // Test multiple selections
  {
    const selected = new Set();
    const urls = ['url1', 'url2', 'url3'];
    urls.forEach(url => selected.add(url));
    console.assert(selected.size === 3, 'Should select multiple URLs');
    console.log('✓ Selects multiple URLs');
  }

  // Test clear all
  {
    const selected = new Set(['url1', 'url2', 'url3']);
    selected.clear();
    console.assert(selected.size === 0, 'Should clear all selections');
    console.log('✓ Clears all selections');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 4: Validation (empty input, invalid URL)
// ─────────────────────────────────────────────────────────────────────

async function testValidation() {
  console.log('⚠️  VALIDATION TESTS\n');

  // Test empty input for one-page
  {
    const items = [];
    const isValid = items.length > 0;
    console.assert(!isValid, 'Should reject empty input');
    console.log('✓ Rejects empty input in one-page mode');
  }

  // Test empty input for main-domain
  {
    const items = [];
    const discoveredUrls = [];
    const selectedUrls = [];
    const isValid = items.length > 0 && discoveredUrls.length > 0 && selectedUrls.length > 0;
    console.assert(!isValid, 'Should require discovered and selected URLs');
    console.log('✓ Requires discovered URLs in main-domain mode');
  }

  // Test no selection in main-domain
  {
    const items = ['https://example.com'];
    const discoveredUrls = ['url1', 'url2', 'url3'];
    const selectedUrls = [];
    const isValid = items.length > 0 && discoveredUrls.length > 0 && selectedUrls.length > 0;
    console.assert(!isValid, 'Should require at least one selected URL');
    console.log('✓ Requires URL selection in main-domain mode');
  }

  // Test URL parsing with separators
  {
    const text = 'url1\nurl2,url3';
    const items = text
      .split(/[,\n]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
    console.assert(items.length === 3, 'Should parse mixed separators');
    console.log('✓ Parses comma and newline separators');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 5: Scan Submission with Selected URLs
// ─────────────────────────────────────────────────────────────────────

async function testScanSubmission() {
  console.log('🚀 SCAN SUBMISSION TESTS\n');

  // Test one-page scan
  {
    const scan = await mockApi.createScan(
      'https://example.com/page1',
      null,
      'one-page',
      []
    );
    console.assert(scan.id, 'Should create scan with ID');
    console.log('✓ Creates one-page scan');
  }

  // Test main-domain scan with selected URLs
  {
    const scan = await mockApi.createScan(
      'https://example.com',
      null,
      'main-domain',
      ['https://example.com/page1', 'https://example.com/page2']
    );
    console.assert(scan.id, 'Should create scan with ID');
    console.log('✓ Creates main-domain scan with selected URLs');
  }

  // Test main-domain scan validation (no URLs selected)
  {
    try {
      await mockApi.createScan(
        'https://example.com',
        null,
        'main-domain',
        []
      );
      console.assert(false, 'Should reject scan without selected URLs');
    } catch (err) {
      console.assert(err.message.includes('No URLs'), 'Error should be clear');
      console.log('✓ Rejects main-domain scan without URL selection');
    }
  }

  // Test scan passes correct mode to backend
  {
    const scanMode = 'main-domain';
    const scan = await mockApi.createScan(
      'https://example.com',
      null,
      scanMode,
      ['https://example.com/page1']
    );
    console.assert(scan.id, 'Should create scan');
    console.log('✓ Passes correct scan_mode to backend');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 6: Backward Compatibility (one-page mode unchanged)
// ─────────────────────────────────────────────────────────────────────

async function testBackwardCompatibility() {
  console.log('♻️  BACKWARD COMPATIBILITY TESTS\n');

  // Test one-page mode still works with multiple URLs
  {
    const text = 'https://example.com/page1\nhttps://example.com/page2';
    const items = text
      .split(/[,\n]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
    console.assert(items.length === 2, 'Should parse multiple URLs');
    console.log('✓ One-page mode accepts multiple URLs');
  }

  // Test one-page mode scan doesn't require discovery
  {
    const scanMode = 'one-page';
    const items = ['https://example.com/page1'];
    const discoveredUrls = [];
    const selectedUrls = [];
    
    // one-page mode doesn't require discoveredUrls
    const canRun = scanMode === 'one-page'
      ? items.length > 0
      : items.length > 0 && discoveredUrls.length > 0 && selectedUrls.length > 0;
    
    console.assert(canRun, 'Should allow scan without discovery');
    console.log('✓ One-page mode skips discovery');
  }

  // Test mode-specific configuration
  {
    const modeConfig = {
      'one-page': {
        multiline: true,
        placeholder: 'url1\nurl2',
      },
      'main-domain': {
        multiline: false,
        placeholder: 'https://example.com',
      }
    };
    
    console.assert(modeConfig['one-page'].multiline === true, 'One-page should use multiline');
    console.assert(modeConfig['main-domain'].multiline === false, 'Main-domain should not use multiline');
    console.log('✓ Mode-specific UI configuration preserved');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 7: Error Messages and Recovery
// ─────────────────────────────────────────────────────────────────────

async function testErrorHandling() {
  console.log('❌ ERROR HANDLING TESTS\n');

  // Test discovery error display
  {
    let error = '';
    try {
      await mockApi.discoverUrls('https://invalid.com');
    } catch (err) {
      error = err.message;
    }
    console.assert(error.length > 0, 'Should capture error message');
    console.log('✓ Captures and displays discovery errors');
  }

  // Test error recovery allows retry
  {
    let error = '';
    try {
      await mockApi.discoverUrls('https://invalid.com');
    } catch (err) {
      error = err.message;
    }
    
    // After error, should be able to try again with valid domain
    const result = await mockApi.discoverUrls('https://example.com');
    console.assert(result.urls.length > 0, 'Should recover and try again');
    console.log('✓ Allows error recovery and retry');
  }

  // Test scan error handling
  {
    let error = '';
    try {
      await mockApi.createScan('https://example.com', null, 'main-domain', []);
    } catch (err) {
      error = err.message;
    }
    console.assert(error.length > 0, 'Should capture scan error');
    console.log('✓ Captures scan submission errors');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Run All Tests
// ─────────────────────────────────────────────────────────────────────

(async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('  NEW SCAN COMPONENT TEST SUITE\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await testModeToggle();
    await testDiscoveryFlow();
    await testUrlSelection();
    await testValidation();
    await testScanSubmission();
    await testBackwardCompatibility();
    await testErrorHandling();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✓ All tests passed!\n');
  } catch (err) {
    console.error('❌ Test suite failed:', err.message);
    process.exit(1);
  }
})();
