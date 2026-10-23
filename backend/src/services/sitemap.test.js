/**
 * Tests for sitemap.js discovery service with demo mode support
 */

const { discoverAllUrls } = require('./sitemap');
const fs = require('fs');
const path = require('path');

// Test fixtures
const demoFixtures = {
  'demo.tata-aig.local': {
    urls: [
      'https://demo.tata-aig.local/',
      'https://demo.tata-aig.local/car-insurance',
      'https://demo.tata-aig.local/car-insurance/quote',
      'https://demo.tata-aig.local/checkout',
      'https://demo.tata-aig.local/claims',
      'https://demo.tata-aig.local/faq',
      'https://demo.tata-aig.local/about'
    ],
    sitemapFound: true,
    label: 'Demo fixture — live domain discovery is not active in this demo'
  }
};

describe('discoverAllUrls with demo mode', () => {
  
  beforeEach(() => {
    // Save original env
    this.originalDemoMode = process.env.DEMO_MODE;
    this.originalFixturePath = process.env.DEMO_FIXTURE_PATH;
    
    // Create temporary fixture file for tests
    const fixturesDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    const fixturePath = path.join(fixturesDir, 'test-fixtures.json');
    fs.writeFileSync(fixturePath, JSON.stringify(demoFixtures));
    process.env.DEMO_FIXTURE_PATH = fixturePath;
  });

  afterEach(() => {
    // Restore original env
    process.env.DEMO_MODE = this.originalDemoMode;
    process.env.DEMO_FIXTURE_PATH = this.originalFixturePath;
  });

  describe('Demo mode OFF (default behavior)', () => {
    
    test('DEMO_MODE unset: should use live discovery', async () => {
      delete process.env.DEMO_MODE;
      // Note: This would attempt real network discovery, which may fail in test environment
      // In a real scenario, this should be mocked or skipped if network is unavailable
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://example.com/', onProgress);
      
      expect(result).toHaveProperty('urls');
      expect(result).toHaveProperty('sitemapFound');
      expect(Array.isArray(result.urls)).toBe(true);
    });

    test('DEMO_MODE=false: should use live discovery', async () => {
      process.env.DEMO_MODE = 'false';
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://example.com/', onProgress);
      
      expect(result).toHaveProperty('urls');
      expect(result).toHaveProperty('sitemapFound');
      expect(Array.isArray(result.urls)).toBe(true);
    });

    test('DEMO_MODE="any-other-value": should use live discovery', async () => {
      process.env.DEMO_MODE = 'anything';
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://example.com/', onProgress);
      
      expect(result).toHaveProperty('urls');
      expect(result).toHaveProperty('sitemapFound');
      expect(Array.isArray(result.urls)).toBe(true);
    });
  });

  describe('Demo mode ON (DEMO_MODE=true)', () => {
    
    beforeEach(() => {
      process.env.DEMO_MODE = 'true';
    });

    test('Returns fixture when domain matches demo.tata-aig.local', async () => {
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://demo.tata-aig.local/', onProgress);
      
      expect(result.urls).toHaveLength(7);
      expect(result.urls[0]).toBe('https://demo.tata-aig.local/');
      expect(result.sitemapFound).toBe(true);
      expect(result.label).toContain('live discovery is not active');
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));
    });

    test('Returns fixture for any demo.tata-aig.local path variation', async () => {
      const onProgress = jest.fn();
      
      // Test different URL variations of same domain
      const variations = [
        'https://demo.tata-aig.local/',
        'https://demo.tata-aig.local/some/path',
        'https://demo.tata-aig.local:443/'
      ];

      for (const url of variations) {
        const result = await discoverAllUrls(url, onProgress);
        expect(result.urls).toHaveLength(7);
        expect(result.sitemapFound).toBe(true);
      }
    });

    test('Returns empty for non-fixture domain in demo mode', async () => {
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://example.com/', onProgress);
      
      expect(result.urls).toHaveLength(0);
      expect(result.sitemapFound).toBe(false);
      expect(result.demoMode).toBe(true);
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('No fixture'));
    });

    test('Returns empty for unmapped domain with clear error message', async () => {
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://unmapped-domain.com/', onProgress);
      
      expect(result.urls.length).toBe(0);
      expect(result.sitemapFound).toBe(false);
      expect(onProgress).toHaveBeenCalledWith(
        expect.stringContaining('No fixture configured for unmapped-domain.com')
      );
    });
  });

  describe('Fixture response shape consistency', () => {
    
    test('Fixture response includes all required fields', async () => {
      process.env.DEMO_MODE = 'true';
      const result = await discoverAllUrls('https://demo.tata-aig.local/', jest.fn());
      
      expect(result).toHaveProperty('urls');
      expect(result).toHaveProperty('sitemapFound');
      expect(result).toHaveProperty('label');
      expect(Array.isArray(result.urls)).toBe(true);
      expect(typeof result.sitemapFound).toBe('boolean');
      expect(typeof result.label).toBe('string');
    });

    test('Fixture URLs are exactly as specified', async () => {
      process.env.DEMO_MODE = 'true';
      const result = await discoverAllUrls('https://demo.tata-aig.local/', jest.fn());
      
      const expectedUrls = demoFixtures['demo.tata-aig.local'].urls;
      expect(result.urls).toEqual(expectedUrls);
    });

    test('Fixture label matches expected demo message', async () => {
      process.env.DEMO_MODE = 'true';
      const result = await discoverAllUrls('https://demo.tata-aig.local/', jest.fn());
      
      expect(result.label).toContain('Demo fixture');
      expect(result.label).toContain('live discovery is not active');
    });
  });

  describe('Progress callback behavior', () => {
    
    test('Calls onProgress with [DEMO] message when using fixture', async () => {
      process.env.DEMO_MODE = 'true';
      const onProgress = jest.fn();
      
      await discoverAllUrls('https://demo.tata-aig.local/', onProgress);
      
      const calls = onProgress.mock.calls.map(c => c[0]);
      expect(calls.some(msg => msg.includes('[DEMO]'))).toBe(true);
      expect(calls.some(msg => msg.includes('fixture'))).toBe(true);
    });

    test('Calls onProgress with error message for unmapped domain in demo mode', async () => {
      process.env.DEMO_MODE = 'true';
      const onProgress = jest.fn();
      
      await discoverAllUrls('https://unknown.com/', onProgress);
      
      const calls = onProgress.mock.calls.map(c => c[0]);
      expect(calls.some(msg => msg.includes('[DEMO]'))).toBe(true);
      expect(calls.some(msg => msg.includes('No fixture'))).toBe(true);
    });
  });

  describe('No silent fallback', () => {
    
    test('Demo mode never silently switches to fixture on live discovery failure', async () => {
      process.env.DEMO_MODE = 'false';
      const onProgress = jest.fn();
      
      // Attempt to discover from domain with no fixture
      // Should fail gracefully, not silently use fixture
      const result = await discoverAllUrls('https://nonexistent-test-domain-xyz.com/', onProgress);
      
      // Should not contain fixture data
      expect(result.urls).not.toEqual(demoFixtures['demo.tata-aig.local'].urls);
    });
  });
});
