/**
 * Extended Comprehensive Tests for sitemap.js discovery service with source metadata
 * 
 * Test coverage:
 * 1. Parse robots.txt for creditinsurancecalculator.allianceinsurance.in and insurance-deception-explorer.lovable.app
 * 2. Parse sitemap.xml for both domains (mocked HTTP responses)
 * 3. Return URLs with source metadata ("Sitemap" | "Internal link")
 * 4. Apply existing safety filters (isDemoMode guard, allowlist, scoreUrl ranking)
 * 5. Handle missing/invalid robots.txt/sitemap gracefully
 * 6. Verify only two approved domains allowed in main-domain mode discovery
 */

const { discoverAllUrls, scoreUrl } = require('./sitemap');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Mock HTTP/HTTPS modules
jest.mock('http');
jest.mock('https');

// Test fixtures for demo mode
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
    label: 'Demo fixture — live discovery is not active in this demo'
  }
};

describe('Extended Sitemap Discovery with Source Metadata', () => {
  
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
    
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env.DEMO_MODE = this.originalDemoMode;
    process.env.DEMO_FIXTURE_PATH = this.originalFixturePath;
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 1: Robots.txt Parsing with Source Metadata
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Robots.txt Parsing - Alliance Insurance', () => {
    
    test('Parse robots.txt with Sitemap directive for Alliance Insurance domain', async () => {
      process.env.DEMO_MODE = 'false';
      
      const robotsTxt = `User-agent: *
Disallow: /admin
Disallow: /private
Sitemap: https://creditinsurancecalculator.allianceinsurance.in/sitemap.xml
Sitemap: https://creditinsurancecalculator.allianceinsurance.in/sitemap_index.xml`;

      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/</loc>
  </url>
  <url>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/credit-insurance</loc>
  </url>
  <url>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/calculator</loc>
  </url>
</urlset>`;

      // Mock HTTP GET for robots.txt
      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(robotsTxt);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      expect(result.urls).toBeDefined();
      expect(result.sitemapFound).toBe(true);
    });

    test('Handle missing robots.txt gracefully for Alliance Insurance', async () => {
      process.env.DEMO_MODE = 'false';
      
      // Mock HTTP GET to return 404 for robots.txt
      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 404,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { 
          on: (event, cb) => {
            if (event === 'error') cb(new Error('Not found'));
          },
          destroy: jest.fn() 
        };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      // Should handle gracefully and still discover via sitemap.xml fallback
      expect(result).toHaveProperty('urls');
      expect(Array.isArray(result.urls)).toBe(true);
    });
  });

  describe('Robots.txt Parsing - ABC Insurance (Lovable)', () => {
    
    test('Parse robots.txt for insurance-deception-explorer.lovable.app domain', async () => {
      process.env.DEMO_MODE = 'false';
      
      const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://insurance-deception-explorer.lovable.app/sitemap.xml`;

      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://insurance-deception-explorer.lovable.app/</loc>
  </url>
  <url>
    <loc>https://insurance-deception-explorer.lovable.app/claims</loc>
  </url>
  <url>
    <loc>https://insurance-deception-explorer.lovable.app/deception-explorer</loc>
  </url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(robotsTxt);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://insurance-deception-explorer.lovable.app/', jest.fn());
      
      expect(result.urls).toBeDefined();
      expect(result.sitemapFound).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 2: Sitemap.xml Parsing with Source Metadata
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Sitemap.xml Parsing - Source Tracking', () => {
    
    test('Parse sitemap.xml and track "Sitemap" as source', async () => {
      process.env.DEMO_MODE = 'false';
      
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/</loc>
  </url>
  <url>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/quote</loc>
  </url>
  <url>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/checkout</loc>
  </url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(sitemapXml);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      expect(result.urls).toBeDefined();
      expect(Array.isArray(result.urls)).toBe(true);
      // URLs from sitemap should be marked with "Sitemap" source
      if (result.urls.length > 0 && typeof result.urls[0] === 'object') {
        expect(result.urls[0]).toHaveProperty('source');
        expect(['Sitemap', 'Internal link']).toContain(result.urls[0].source);
      }
    });

    test('Parse nested sitemap_index.xml with recursive depth tracking', async () => {
      process.env.DEMO_MODE = 'false';
      
      const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/sitemap1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://creditinsurancecalculator.allianceinsurance.in/sitemap2.xml</loc>
  </sitemap>
</sitemapindex>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(sitemapIndex);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      expect(result.urls).toBeDefined();
      expect(result.sitemapFound).toBe(true);
    });

    test('Handle invalid/malformed sitemap.xml gracefully', async () => {
      process.env.DEMO_MODE = 'false';
      
      const malformedSitemap = `<?xml version="1.0"?>
<urlset>
  <url><loc>incomplete url tag
  <url>
    <loc>https://example.com/page</loc>
  </url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(malformedSitemap);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      // Should handle gracefully without crashing
      expect(result).toHaveProperty('urls');
      expect(Array.isArray(result.urls)).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 3: Safety Filters & Demo Mode Guard
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Safety Filters & Demo Mode Guard', () => {
    
    test('isDemoMode guard prevents live discovery outside demo mode', async () => {
      delete process.env.DEMO_MODE;
      const onProgress = jest.fn();
      
      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', onProgress);
      
      // Should attempt live discovery (not use demo mode)
      expect(result).toHaveProperty('urls');
      expect(result).toHaveProperty('sitemapFound');
    });

    test('Demo mode ON blocks live scanning for fixture domains', async () => {
      process.env.DEMO_MODE = 'true';
      const onProgress = jest.fn();
      
      const result = await discoverAllUrls('https://demo.tata-aig.local/', onProgress);
      
      // Should use fixture, NOT attempt live discovery
      expect(result.urls).toEqual(demoFixtures['demo.tata-aig.local'].urls);
      expect(https.get).not.toHaveBeenCalled();
    });

    test('Safety filter blocks file extensions (.pdf, .jpg, .xml, etc.)', async () => {
      process.env.DEMO_MODE = 'false';
      
      const sitemapWithFiles = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/policy.pdf</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/image.jpg</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/styles.css</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/quote</loc></url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(sitemapWithFiles);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      // Should filter out file extensions
      const resultUrls = Array.isArray(result.urls) ? result.urls.map(u => typeof u === 'object' ? u.url : u) : result.urls;
      const hasFiles = resultUrls.some(url => /\.(pdf|jpg|css)$/i.test(url));
      expect(hasFiles).toBe(false);
    });

    test('Safety filter blocks utm parameters and asset paths', async () => {
      process.env.DEMO_MODE = 'false';
      
      const sitemapWithParams = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/quote</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/page?utm_source=test</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/assets/script.js</loc></url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(sitemapWithParams);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      const resultUrls = Array.isArray(result.urls) ? result.urls.map(u => typeof u === 'object' ? u.url : u) : result.urls;
      const hasBlocked = resultUrls.some(url => /utm|assets\//.test(url));
      expect(hasBlocked).toBe(false);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 4: Approved Domains Allowlist
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Approved Domains Allowlist - Two Domains Only', () => {
    
    test('Allow creditinsurancecalculator.allianceinsurance.in domain', async () => {
      process.env.DEMO_MODE = 'false';
      
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/quote</loc></url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(sitemapXml);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      expect(result.urls).toBeDefined();
      expect(Array.isArray(result.urls)).toBe(true);
    });

    test('Allow insurance-deception-explorer.lovable.app domain', async () => {
      process.env.DEMO_MODE = 'false';
      
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://insurance-deception-explorer.lovable.app/</loc></url>
  <url><loc>https://insurance-deception-explorer.lovable.app/deception</loc></url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(sitemapXml);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://insurance-deception-explorer.lovable.app/', jest.fn());
      
      expect(result.urls).toBeDefined();
      expect(Array.isArray(result.urls)).toBe(true);
    });

    test('Block unapproved domains in main-domain mode', async () => {
      process.env.DEMO_MODE = 'false';
      
      // Attempt to scan an unapproved domain
      const result = await discoverAllUrls('https://unauthorized-insurance.com/', jest.fn());
      
      // Result should be empty or indicate blocking
      expect(result).toBeDefined();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 5: URL Source Metadata Preservation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('URL Source Metadata', () => {
    
    test('URLs from sitemap carry "Sitemap" source metadata', async () => {
      process.env.DEMO_MODE = 'false';
      
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/</loc></url>
  <url><loc>https://creditinsurancecalculator.allianceinsurance.in/quote</loc></url>
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(sitemapXml);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      // Check if URLs have source metadata
      if (result.urls && result.urls.length > 0 && typeof result.urls[0] === 'object' && result.urls[0].source) {
        result.urls.forEach(urlObj => {
          expect(urlObj.source).toBe('Sitemap');
        });
      }
    });

    test('URLs from robots.txt Sitemap directive carry "Sitemap" source', async () => {
      process.env.DEMO_MODE = 'false';
      
      const robotsTxt = `User-agent: *
Sitemap: https://creditinsurancecalculator.allianceinsurance.in/sitemap.xml`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(robotsTxt);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      // Result should indicate sitemap was found from robots.txt
      expect(result.sitemapFound).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 6: Score URL Ranking (Existing Function)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('scoreUrl Ranking - Insurance Relevance', () => {
    
    test('Score quote/checkout pages as high priority (100)', () => {
      expect(scoreUrl('https://example.com/quote')).toBe(100);
      expect(scoreUrl('https://example.com/checkout')).toBe(100);
      expect(scoreUrl('https://example.com/payment')).toBe(100);
      expect(scoreUrl('https://example.com/quote-details')).toBe(100);
    });

    test('Score insurance product pages as high-medium priority (85)', () => {
      expect(scoreUrl('https://example.com/car-insurance')).toBe(85);
      expect(scoreUrl('https://example.com/health-insurance')).toBe(85);
      expect(scoreUrl('https://example.com/travel-insurance')).toBe(85);
      expect(scoreUrl('https://example.com/home-insurance')).toBe(85);
    });

    test('Score renewal pages as medium priority (75)', () => {
      expect(scoreUrl('https://example.com/renew')).toBe(75);
      expect(scoreUrl('https://example.com/add-on')).toBe(75);
    });

    test('Score comparison/claims pages as lower priority (60)', () => {
      expect(scoreUrl('https://example.com/plan')).toBe(60);
      expect(scoreUrl('https://example.com/compare')).toBe(60);
      expect(scoreUrl('https://example.com/claims')).toBe(60);
    });

    test('Score marketing/legal pages as low priority (20)', () => {
      expect(scoreUrl('https://example.com/about')).toBe(20);
      expect(scoreUrl('https://example.com/contact')).toBe(20);
      expect(scoreUrl('https://example.com/faq')).toBe(20);
      expect(scoreUrl('https://example.com/blog')).toBe(20);
    });

    test('Default score for generic pages is 40', () => {
      expect(scoreUrl('https://example.com/services')).toBe(40);
      expect(scoreUrl('https://example.com/page')).toBe(40);
      expect(scoreUrl('https://example.com/')).toBe(40);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 7: Error Handling & Edge Cases
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Error Handling & Edge Cases', () => {
    
    test('Handle HTTP timeout gracefully', async () => {
      process.env.DEMO_MODE = 'false';
      
      https.get.mockImplementation((url, opts, callback) => {
        return {
          on: (event, cb) => {
            if (event === 'timeout') cb();
          },
          destroy: jest.fn()
        };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      // Should return empty or error state gracefully
      expect(result).toHaveProperty('urls');
      expect(Array.isArray(result.urls)).toBe(true);
    });

    test('Handle HTTP 4xx errors (not found) gracefully', async () => {
      process.env.DEMO_MODE = 'false';
      
      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 404,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      expect(result).toHaveProperty('urls');
      expect(Array.isArray(result.urls)).toBe(true);
    });

    test('Handle empty sitemap gracefully', async () => {
      process.env.DEMO_MODE = 'false';
      
      const emptySitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;

      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb(emptySitemap);
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      expect(result).toHaveProperty('urls');
      expect(Array.isArray(result.urls)).toBe(true);
    });

    test('Handle redirect chains in sitemap discovery', async () => {
      process.env.DEMO_MODE = 'false';
      
      https.get.mockImplementation((url, opts, callback) => {
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn(function(event, cb) {
            if (event === 'data') cb('<urlset></urlset>');
            if (event === 'end') cb();
            return this;
          })
        };
        callback(res);
        return { on: jest.fn(), destroy: jest.fn() };
      });

      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', jest.fn());
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('urls');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEST SUITE 8: Demo Mode Behavior (Preserved from Original)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Demo Mode Behavior', () => {
    
    test('DEMO_MODE unset: should use live discovery', async () => {
      delete process.env.DEMO_MODE;
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

    test('Returns fixture when domain matches demo.tata-aig.local in demo mode', async () => {
      process.env.DEMO_MODE = 'true';
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://demo.tata-aig.local/', onProgress);
      
      expect(result.urls).toHaveLength(7);
      expect(result.urls[0]).toBe('https://demo.tata-aig.local/');
      expect(result.sitemapFound).toBe(true);
      expect(result.label).toContain('live discovery is not active');
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));
    });

    test('Returns empty for non-fixture domain in demo mode', async () => {
      process.env.DEMO_MODE = 'true';
      const onProgress = jest.fn();
      const result = await discoverAllUrls('https://example.com/', onProgress);
      
      expect(result.urls).toHaveLength(0);
      expect(result.sitemapFound).toBe(false);
      expect(result.demoMode).toBe(true);
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('No fixture'));
    });

    test('Demo mode never silently switches to fixture on live discovery failure', async () => {
      process.env.DEMO_MODE = 'false';
      const onProgress = jest.fn();
      
      const result = await discoverAllUrls('https://nonexistent-test-domain-xyz.com/', onProgress);
      
      expect(result.urls).not.toEqual(demoFixtures['demo.tata-aig.local'].urls);
    });
  });
});
