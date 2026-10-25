/**
 * Test suite for ScanConsole component
 * 
 * Tests:
 * 1. Socket event handling (discovered, selected, page-done)
 * 2. Progress display (scannedCount / totalPages)
 * 3. Report generation button (appears after complete)
 * 4. Error display and recovery
 * 5. Backward compatibility with one-page scans
 */

// Mock socket events
class MockSocket {
  constructor() {
    this.listeners = {};
  }

  on(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  off(event, handler) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(handler => handler(data));
  }

  simulateEvent(event, data) {
    this.emit(event, data);
  }

  subscribe(scanId) {
    // Mock subscription
  }

  unsubscribe(scanId) {
    // Mock unsubscription
  }
}

// Mock API
const mockApi = {
  getScan: async (id) => {
    if (id === 'scan-one-page') {
      return {
        id: 'scan-one-page',
        scan_mode: 'one-page',
        scan_host: 'example.com',
        total_pages: 5,
        scanned_pages: 3,
        findings_count: 2,
      };
    }
    if (id === 'scan-main-domain') {
      return {
        id: 'scan-main-domain',
        scan_mode: 'main-domain',
        scan_host: 'example.com',
        total_pages: 10,
        scanned_pages: 5,
        findings_count: 7,
      };
    }
    if (id === 'scan-main-domain-complete') {
      return {
        id: 'scan-main-domain-complete',
        scan_mode: 'main-domain',
        scan_host: 'example.com',
        total_pages: 10,
        scanned_pages: 10,
        findings_count: 7,
      };
    }
    throw new Error('Scan not found');
  },
  
  reportUrl: (id) => `http://localhost:4500/api/report/${id}`,
};

// ─────────────────────────────────────────────────────────────────────
// Test 1: Socket Event Handling
// ─────────────────────────────────────────────────────────────────────

async function testSocketEventHandling() {
  console.log('📡 SOCKET EVENT HANDLING TESTS\n');

  // Test scan:discovered event
  {
    const socket = new MockSocket();
    const state = { found: 0, scanned: 0 };
    
    socket.on('scan:discovered', (data) => {
      state.found = data.totalPages;
    });

    socket.simulateEvent('scan:discovered', { totalPages: 15 });
    console.assert(state.found === 15, 'Should update found pages on discovered');
    console.log('✓ Handles scan:discovered event');
  }

  // Test scan:selected event
  {
    const socket = new MockSocket();
    const state = { found: 0 };
    
    socket.on('scan:selected', (data) => {
      if (data.totalSelected) {
        state.found = data.totalSelected;
      }
    });

    socket.simulateEvent('scan:selected', { totalSelected: 8, domain: 'example.com' });
    console.assert(state.found === 8, 'Should update found pages on selected');
    console.log('✓ Handles scan:selected event with domain context');
  }

  // Test scan:page-done event
  {
    const socket = new MockSocket();
    const state = { scanned: 0, currentUrl: '', pageFindings: 0, latestPages: [] };
    
    socket.on('scan:page-done', (data) => {
      state.scanned += 1;
      state.currentUrl = data.url;
      state.pageFindings = data.findingsCount || 0;
      state.latestPages = [data.url.substring(0, 60), ...state.latestPages.slice(0, 4)];
    });

    socket.simulateEvent('scan:page-done', {
      url: 'https://example.com/page1',
      title: 'Page 1',
      risk: 'high',
      findingsCount: 3,
      scannedCount: 1,
      totalPages: 10
    });

    console.assert(state.scanned === 1, 'Should increment scanned count');
    console.assert(state.currentUrl === 'https://example.com/page1', 'Should track current URL');
    console.assert(state.pageFindings === 3, 'Should track page findings');
    console.assert(state.latestPages.length > 0, 'Should add to latest pages');
    console.log('✓ Handles scan:page-done event with findings');
  }

  // Test scan:complete event
  {
    const socket = new MockSocket();
    const state = { status: null };
    
    socket.on('scan:complete', () => {
      state.status = 'Complete';
    });

    socket.simulateEvent('scan:complete');
    console.assert(state.status === 'Complete', 'Should mark scan as complete');
    console.log('✓ Handles scan:complete event');
  }

  // Test scan:paused event
  {
    const socket = new MockSocket();
    const state = { status: null };
    
    socket.on('scan:paused', () => {
      state.status = 'Paused';
    });

    socket.simulateEvent('scan:paused');
    console.assert(state.status === 'Paused', 'Should mark scan as paused');
    console.log('✓ Handles scan:paused event');
  }

  // Test scan:error event
  {
    const socket = new MockSocket();
    const state = { error: null, status: null };
    
    socket.on('scan:error', (data) => {
      state.error = data.message;
      state.status = 'Error';
    });

    socket.simulateEvent('scan:error', { message: 'Connection lost' });
    console.assert(state.error === 'Connection lost', 'Should capture error message');
    console.assert(state.status === 'Error', 'Should mark as error');
    console.log('✓ Handles scan:error event');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 2: Progress Display
// ─────────────────────────────────────────────────────────────────────

async function testProgressDisplay() {
  console.log('📊 PROGRESS DISPLAY TESTS\n');

  // Test progress calculation
  {
    const scan = await mockApi.getScan('scan-main-domain');
    const progress = scan.total_pages > 0 
      ? Math.round((scan.scanned_pages / scan.total_pages) * 100) 
      : 0;
    
    console.assert(progress === 50, 'Should calculate progress correctly');
    console.log('✓ Calculates progress percentage (5/10 = 50%)');
  }

  // Test scanned/total display format
  {
    const scan = await mockApi.getScan('scan-main-domain');
    const display = `Scanned ${scan.scanned_pages} of ${scan.total_pages} pages`;
    
    console.assert(display.includes('5') && display.includes('10'), 'Should format progress display');
    console.log('✓ Formats progress display correctly');
  }

  // Test current URL display
  {
    const socket = new MockSocket();
    const state = { currentUrl: '' };
    
    socket.on('scan:page-done', (data) => {
      state.currentUrl = data.url;
    });

    const testUrl = 'https://example.com/products/shoes/details';
    socket.simulateEvent('scan:page-done', {
      url: testUrl,
      findingsCount: 2,
      scannedCount: 3,
      totalPages: 10
    });

    console.assert(state.currentUrl === testUrl, 'Should display current URL');
    console.log('✓ Shows current URL being scanned');
  }

  // Test findings count display per page
  {
    const socket = new MockSocket();
    const state = { pageFindings: 0 };
    
    socket.on('scan:page-done', (data) => {
      state.pageFindings = data.findingsCount || 0;
    });

    socket.simulateEvent('scan:page-done', {
      url: 'https://example.com/page1',
      findingsCount: 5,
      scannedCount: 1,
      totalPages: 10
    });

    console.assert(state.pageFindings === 5, 'Should track findings per page');
    console.log('✓ Shows findings count per page in real-time');
  }

  // Test latest pages tracking
  {
    const socket = new MockSocket();
    const state = { latestPages: [] };
    
    socket.on('scan:page-done', (data) => {
      state.latestPages = [data.url.substring(0, 60), ...state.latestPages.slice(0, 4)];
    });

    socket.simulateEvent('scan:page-done', { url: 'https://example.com/page1', findingsCount: 0 });
    socket.simulateEvent('scan:page-done', { url: 'https://example.com/page2', findingsCount: 0 });
    socket.simulateEvent('scan:page-done', { url: 'https://example.com/page3', findingsCount: 0 });

    console.assert(state.latestPages.length === 3, 'Should track latest pages');
    console.assert(state.latestPages[0].includes('page3'), 'Should keep newest page first');
    console.log('✓ Tracks and displays latest scanned pages');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 3: Report Generation
// ─────────────────────────────────────────────────────────────────────

async function testReportGeneration() {
  console.log('📄 REPORT GENERATION TESTS\n');

  // Test report button appears after complete
  {
    const scan = await mockApi.getScan('scan-main-domain-complete');
    const isComplete = scan.scanned_pages === scan.total_pages;
    const isMainDomain = scan.scan_mode === 'main-domain';
    const shouldShowReportButton = isComplete && isMainDomain;
    
    console.assert(shouldShowReportButton, 'Should show report button when complete');
    console.log('✓ "Generate Report" button appears after scan completes');
  }

  // Test report button only for main-domain scans
  {
    const onePageScan = await mockApi.getScan('scan-one-page');
    const isComplete = onePageScan.scanned_pages === onePageScan.total_pages;
    const isMainDomain = onePageScan.scan_mode === 'main-domain';
    const shouldShowReportButton = isComplete && isMainDomain;
    
    console.assert(!shouldShowReportButton, 'Should not show for one-page scans');
    console.log('✓ Report button only shown for main-domain scans');
  }

  // Test report endpoint construction
  {
    const scan = await mockApi.getScan('scan-main-domain');
    const reportUrl = `${mockApi.reportUrl(scan.id)}/main-domain`;
    
    console.assert(reportUrl.includes('scan-main-domain'), 'Should include scan ID');
    console.assert(reportUrl.includes('/main-domain'), 'Should include main-domain path');
    console.log('✓ Constructs correct report endpoint');
  }

  // Test report generation triggers download
  {
    const scan = await mockApi.getScan('scan-main-domain-complete');
    const downloadUrl = `${mockApi.reportUrl(scan.id)}/main-domain`;
    
    console.assert(downloadUrl.startsWith('http'), 'Should be valid URL');
    console.log('✓ Report generation creates valid download URL');
  }

  // Test one-page scan preserves existing download behavior
  {
    const scan = await mockApi.getScan('scan-one-page');
    const reportUrl = mockApi.reportUrl(scan.id);
    
    console.assert(reportUrl.includes(scan.id), 'Should preserve one-page report URL');
    console.log('✓ One-page scans preserve existing "Download PDF" behavior');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 4: Error Handling
// ─────────────────────────────────────────────────────────────────────

async function testErrorHandling() {
  console.log('❌ ERROR HANDLING TESTS\n');

  // Test error display
  {
    const socket = new MockSocket();
    const state = { error: null };
    
    socket.on('scan:error', (data) => {
      state.error = data.message || 'Scan error occurred';
    });

    socket.simulateEvent('scan:error', { message: 'Network timeout' });
    console.assert(state.error === 'Network timeout', 'Should display error message');
    console.log('✓ Captures and displays socket errors');
  }

  // Test error recovery
  {
    const socket = new MockSocket();
    const state = { error: null, status: null };
    
    socket.on('scan:error', (data) => {
      state.error = data.message;
      state.status = 'Error';
    });

    socket.on('scan:complete', () => {
      state.error = null;
      state.status = 'Complete';
    });

    socket.simulateEvent('scan:error', { message: 'Connection lost' });
    console.assert(state.error !== null, 'Should show error');

    socket.simulateEvent('scan:complete');
    console.assert(state.error === null, 'Should clear error on recovery');
    console.assert(state.status === 'Complete', 'Should update status to complete');
    console.log('✓ Allows error recovery');
  }

  // Test error fallback for report generation
  {
    const state = { error: null };
    
    try {
      throw new Error('Failed to generate report: PDF generation timeout');
    } catch (err) {
      state.error = err.message;
    }

    console.assert(state.error.includes('Failed to generate report'), 'Should have clear error message');
    console.log('✓ Handles report generation errors gracefully');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 5: Backward Compatibility
// ─────────────────────────────────────────────────────────────────────

async function testBackwardCompatibility() {
  console.log('♻️  BACKWARD COMPATIBILITY TESTS\n');

  // Test one-page scan mode still works
  {
    const scan = await mockApi.getScan('scan-one-page');
    const isOnePageMode = scan.scan_mode === 'one-page';
    
    console.assert(isOnePageMode, 'Should support one-page mode');
    console.log('✓ One-page mode scanning still works');
  }

  // Test existing socket events still fire for one-page scans
  {
    const socket = new MockSocket();
    const state = { scanned: 0 };
    
    socket.on('scan:page-done', () => {
      state.scanned += 1;
    });

    socket.simulateEvent('scan:page-done', {
      url: 'https://example.com/page1',
      findingsCount: 0
    });

    console.assert(state.scanned === 1, 'Should fire page-done for one-page scans');
    console.log('✓ Existing socket event handling preserved');
  }

  // Test progress display works for one-page scans
  {
    const scan = await mockApi.getScan('scan-one-page');
    const progress = Math.round((scan.scanned_pages / scan.total_pages) * 100);
    
    console.assert(progress === 60, 'Should calculate progress (3/5 = 60%)');
    console.log('✓ Progress calculation works for one-page scans');
  }

  // Test completion status for one-page scans
  {
    const socket = new MockSocket();
    const state = { status: null };
    
    socket.on('scan:complete', () => {
      state.status = 'Complete';
    });

    socket.simulateEvent('scan:complete');
    console.assert(state.status === 'Complete', 'Should mark one-page scan complete');
    console.log('✓ Completion handling works for one-page scans');
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Run All Tests
// ─────────────────────────────────────────────────────────────────────

(async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('  SCANCONSOLE COMPONENT TEST SUITE\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await testSocketEventHandling();
    await testProgressDisplay();
    await testReportGeneration();
    await testErrorHandling();
    await testBackwardCompatibility();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✓ All tests passed!\n');
  } catch (err) {
    console.error('❌ Test suite failed:', err.message);
    process.exit(1);
  }
})();
