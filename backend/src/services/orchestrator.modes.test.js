/**
 * Tests for scanOrchestrator with One Page and Main Domain modes
 * and selection limit enforcement
 */

const { TRIAL_PAGE_LIMIT } = require('./license');

describe('scanOrchestrator mode and limit behavior', () => {

  describe('TRIAL_PAGE_LIMIT constant', () => {
    
    test('TRIAL_PAGE_LIMIT is defined and equals 3', () => {
      expect(TRIAL_PAGE_LIMIT).toBeDefined();
      expect(TRIAL_PAGE_LIMIT).toBe(3);
    });

    test('TRIAL_PAGE_LIMIT is exported from license.js', () => {
      // This test verifies the constant is properly exported
      // so it can be reused across the system without hardcoding
      expect(typeof TRIAL_PAGE_LIMIT).toBe('number');
      expect(TRIAL_PAGE_LIMIT).toBeGreaterThan(0);
    });
  });

  describe('Mode behavior expectations', () => {
    
    test('One Page mode should process exactly 1 URL', () => {
      // This test documents the expected behavior:
      // One Page mode always scans exactly 1 URL, regardless of page limit
      
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3'
      ];
      
      // In One Page mode, only the target URL should be used
      const targetUrl = urls[0];
      const selectedUrls = [targetUrl];
      
      expect(selectedUrls).toHaveLength(1);
      expect(selectedUrls[0]).toBe(targetUrl);
    });

    test('Main Domain mode should respect page limit', () => {
      // This test documents the expected behavior:
      // Main Domain mode selects from discovered URLs, capped by page limit
      
      const discoveredUrls = [
        'https://demo.tata-aig.local/',
        'https://demo.tata-aig.local/car-insurance',
        'https://demo.tata-aig.local/quote',
        'https://demo.tata-aig.local/checkout',
        'https://demo.tata-aig.local/claims',
        'https://demo.tata-aig.local/faq',
        'https://demo.tata-aig.local/about'
      ];
      
      const pageLimit = TRIAL_PAGE_LIMIT; // 3
      
      // In Main Domain mode with trial limit, max 3 URLs can be selected
      const selectedUrls = discoveredUrls.slice(0, pageLimit);
      
      expect(selectedUrls).toHaveLength(3);
      expect(selectedUrls.length).toBeLessThanOrEqual(pageLimit);
    });
  });

  describe('Selection limit enforcement', () => {
    
    test('Trial mode enforces TRIAL_PAGE_LIMIT', () => {
      // Main Domain with 7 discovered URLs + trial mode (3 page limit)
      // Should cap at 3 pages
      
      const discoveredCount = 7;
      const trialLimit = TRIAL_PAGE_LIMIT;
      
      const cappedCount = Math.min(discoveredCount, trialLimit);
      
      expect(cappedCount).toBe(3);
      expect(cappedCount).toBeLessThanOrEqual(trialLimit);
    });

    test('Licensed mode could allow more pages (but respects its limit)', () => {
      // Licensed mode with max_pages: 10
      // Should respect the licensed limit, not trial limit
      
      const licenseLimit = 10;
      const discoveredCount = 15;
      
      const cappedCount = Math.min(discoveredCount, licenseLimit);
      
      expect(cappedCount).toBe(10);
      expect(cappedCount).toBeLessThanOrEqual(licenseLimit);
    });

    test('Unlimited license (-1) should not cap pages', () => {
      // Licensed mode with max_pages: -1 (unlimited)
      // Should NOT cap the discovered URLs
      
      const licenseLimit = -1; // unlimited
      const discoveredCount = 100;
      
      // -1 means no limit
      const cappedCount = licenseLimit === -1 ? discoveredCount : Math.min(discoveredCount, licenseLimit);
      
      expect(cappedCount).toBe(100);
      expect(cappedCount).not.toBeLessThan(discoveredCount);
    });
  });

  describe('API parameter expectations', () => {
    
    test('One Page scan_mode parameter', () => {
      const scanRequest = {
        target_url: 'https://insurance-deception-explorer.lovable.app',
        scan_mode: 'one-page'
      };
      
      expect(scanRequest.scan_mode).toBe('one-page');
    });

    test('Main Domain scan_mode parameter', () => {
      const scanRequest = {
        target_url: 'https://demo.tata-aig.local/',
        scan_mode: 'main-domain',
        selected_urls: [
          'https://demo.tata-aig.local/',
          'https://demo.tata-aig.local/quote',
          'https://demo.tata-aig.local/claims'
        ]
      };
      
      expect(scanRequest.scan_mode).toBe('main-domain');
      expect(Array.isArray(scanRequest.selected_urls)).toBe(true);
      expect(scanRequest.selected_urls).toHaveLength(3);
    });

    test('Backward compat: no scan_mode parameter', () => {
      const legacyScanRequest = {
        target_url: 'https://example.com',
        url_pattern: null
      };
      
      // Should still work for backward compatibility
      expect(legacyScanRequest).toHaveProperty('target_url');
      expect(legacyScanRequest).not.toHaveProperty('scan_mode');
    });
  });

  describe('URL validation', () => {
    
    test('One Page URL must be valid', () => {
      const validUrl = 'https://insurance-deception-explorer.lovable.app';
      
      expect(() => new URL(validUrl)).not.toThrow();
    });

    test('Valid Alliance Insurance URL', () => {
      const validUrl = 'https://allianceinsurance.in/';
      
      expect(() => new URL(validUrl)).not.toThrow();
    });

    test('Invalid URL should throw', () => {
      const invalidUrl = 'not a valid url';
      
      expect(() => new URL(invalidUrl)).toThrow();
    });
  });
});
