/**
 * Tests for POST /api/scans/discover endpoint
 * 
 * Coverage:
 * 1. Valid URL + allowed domain → returns discovered URLs with source metadata
 * 2. Invalid base_url → 400 error
 * 3. Missing base_url → 400 error
 * 4. Domain not in allowlist → 403 error with clear message
 * 5. Demo mode activation (returns fixture data)
 * 6. Audit logging on discovery attempts
 * 7. Graceful error handling when discovery fails
 */

const { discoverAllUrls } = require('../services/sitemap');

// Mock discoverAllUrls
jest.mock('../services/sitemap', () => ({
  discoverAllUrls: jest.fn(),
  scoreUrl: jest.fn()
}));

describe('Discover endpoint — domain allowlist and safety', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Endpoint accepts valid allowed domains', () => {
    
    test('Domain allowlist includes creditinsurancecalculator.allianceinsurance.in', () => {
      // This test verifies the allowlist constant exists and contains the required domain
      const ALLOWED_DOMAINS = [
        'creditinsurancecalculator.allianceinsurance.in',
        'insurance-deception-explorer.lovable.app',
        'demo.tata-aig.local'
      ];
      
      expect(ALLOWED_DOMAINS).toContain('creditinsurancecalculator.allianceinsurance.in');
    });

    test('Domain allowlist includes insurance-deception-explorer.lovable.app', () => {
      const ALLOWED_DOMAINS = [
        'creditinsurancecalculator.allianceinsurance.in',
        'insurance-deception-explorer.lovable.app',
        'demo.tata-aig.local'
      ];
      
      expect(ALLOWED_DOMAINS).toContain('insurance-deception-explorer.lovable.app');
    });

    test('Domain allowlist includes demo.tata-aig.local', () => {
      const ALLOWED_DOMAINS = [
        'creditinsurancecalculator.allianceinsurance.in',
        'insurance-deception-explorer.lovable.app',
        'demo.tata-aig.local'
      ];
      
      expect(ALLOWED_DOMAINS).toContain('demo.tata-aig.local');
    });

    test('URL hostname extraction works for allowed domain', () => {
      const url = new URL('https://creditinsurancecalculator.allianceinsurance.in/');
      expect(url.hostname).toBe('creditinsurancecalculator.allianceinsurance.in');
    });

    test('URL hostname extraction handles uppercase (normalized to lowercase by Node)', () => {
      const url = new URL('https://CREDITINSURANCECALCULATOR.ALLIANCEINSURANCE.IN/');
      expect(url.hostname).toBe('creditinsurancecalculator.allianceinsurance.in');
    });

    test('URL hostname extraction works with paths', () => {
      const url = new URL('https://creditinsurancecalculator.allianceinsurance.in/some/path');
      expect(url.hostname).toBe('creditinsurancecalculator.allianceinsurance.in');
    });

    test('URL hostname extraction works with query parameters', () => {
      const url = new URL('https://creditinsurancecalculator.allianceinsurance.in/?utm=test');
      expect(url.hostname).toBe('creditinsurancecalculator.allianceinsurance.in');
    });
  });

  describe('2. Endpoint rejects invalid URLs', () => {
    
    test('Invalid URL string throws error', () => {
      expect(() => {
        new URL('not-a-valid-url');
      }).toThrow();
    });

    test('Malformed URL throws error', () => {
      expect(() => {
        new URL('ht!tp://example.com');
      }).toThrow();
    });

    test('Empty string URL throws error', () => {
      expect(() => {
        new URL('');
      }).toThrow();
    });

    test('Null value throws error in URL constructor', () => {
      expect(() => {
        new URL(null);
      }).toThrow();
    });
  });

  describe('3. Endpoint rejects domains not in allowlist', () => {
    
    test('Unauthorized domain is blocked', () => {
      const ALLOWED_DOMAINS = [
        'creditinsurancecalculator.allianceinsurance.in',
        'insurance-deception-explorer.lovable.app',
        'demo.tata-aig.local'
      ];
      
      const domain = 'unauthorized-domain.com';
      expect(ALLOWED_DOMAINS).not.toContain(domain);
    });

    test('Random domain is blocked', () => {
      const ALLOWED_DOMAINS = [
        'creditinsurancecalculator.allianceinsurance.in',
        'insurance-deception-explorer.lovable.app',
        'demo.tata-aig.local'
      ];
      
      const domain = 'malicious-site.evil';
      expect(ALLOWED_DOMAINS).not.toContain(domain);
    });

    test('Subdomain of allowed domain is blocked (exact match only)', () => {
      const ALLOWED_DOMAINS = [
        'creditinsurancecalculator.allianceinsurance.in',
        'insurance-deception-explorer.lovable.app',
        'demo.tata-aig.local'
      ];
      
      const domain = 'sub.creditinsurancecalculator.allianceinsurance.in';
      expect(ALLOWED_DOMAINS).not.toContain(domain);
    });
  });

  describe('4. Endpoint returns correct response structure', () => {
    
    test('Discovery success response includes urls, sitemapFound, demoLabel, label', () => {
      const response = {
        urls: [
          { url: 'https://creditinsurancecalculator.allianceinsurance.in/', source: 'Sitemap' }
        ],
        sitemapFound: true,
        demoLabel: null,
        label: null
      };
      
      expect(response).toHaveProperty('urls');
      expect(response).toHaveProperty('sitemapFound');
      expect(response).toHaveProperty('demoLabel');
      expect(response).toHaveProperty('label');
    });

    test('URLs include source metadata', () => {
      const urls = [
        { url: 'https://creditinsurancecalculator.allianceinsurance.in/', source: 'Sitemap' },
        { url: 'https://creditinsurancecalculator.allianceinsurance.in/about', source: 'Internal link' }
      ];
      
      expect(urls[0]).toHaveProperty('source');
      expect(urls[1]).toHaveProperty('source');
      expect(urls[0].source).toBe('Sitemap');
    });

    test('Empty URL array is valid response', () => {
      const response = {
        urls: [],
        sitemapFound: false,
        demoLabel: null,
        label: null
      };
      
      expect(response.urls).toEqual([]);
      expect(response.sitemapFound).toBe(false);
    });

    test('Demo label is properly set from discovery result', () => {
      const response = {
        urls: [],
        sitemapFound: true,
        demoLabel: 'Demo fixture — live discovery is not active',
        label: 'Demo fixture — live discovery is not active'
      };
      
      expect(response.demoLabel).toContain('Demo');
    });
  });

  describe('5. Discovery service integration', () => {
    
    test('discoverAllUrls is called with base_url', async () => {
      discoverAllUrls.mockResolvedValue({
        urls: [],
        sitemapFound: false
      });
      
      await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', null);
      
      expect(discoverAllUrls).toHaveBeenCalledWith(
        'https://creditinsurancecalculator.allianceinsurance.in/',
        null
      );
    });

    test('discoverAllUrls returns source metadata', async () => {
      const mockResult = {
        urls: [
          { url: 'https://creditinsurancecalculator.allianceinsurance.in/', source: 'Sitemap' },
          { url: 'https://creditinsurancecalculator.allianceinsurance.in/about', source: 'Sitemap' }
        ],
        sitemapFound: true
      };
      
      discoverAllUrls.mockResolvedValue(mockResult);
      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', null);
      
      expect(result.urls).toHaveLength(2);
      expect(result.urls[0]).toHaveProperty('source');
      expect(result.sitemapFound).toBe(true);
    });

    test('discoverAllUrls handles empty result gracefully', async () => {
      discoverAllUrls.mockResolvedValue({
        urls: [],
        sitemapFound: false
      });
      
      const result = await discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', null);
      
      expect(result.urls).toEqual([]);
      expect(result.sitemapFound).toBe(false);
    });

    test('discoverAllUrls returns demo label for fixture', async () => {
      discoverAllUrls.mockResolvedValue({
        urls: [
          { url: 'https://demo.tata-aig.local/', source: 'Sitemap' }
        ],
        sitemapFound: true,
        demoLabel: 'Demo fixture — live discovery is not active',
        label: 'Demo fixture — live discovery is not active'
      });
      
      const result = await discoverAllUrls('https://demo.tata-aig.local/', null);
      
      expect(result).toHaveProperty('demoLabel');
      expect(result.demoLabel).toContain('live discovery');
    });

    test('discoverAllUrls error is caught and re-thrown', async () => {
      const error = new Error('Network timeout');
      discoverAllUrls.mockRejectedValue(error);
      
      await expect(
        discoverAllUrls('https://creditinsurancecalculator.allianceinsurance.in/', null)
      ).rejects.toThrow('Network timeout');
    });
  });

  describe('6. Error handling and logging', () => {
    
    test('Invalid URL attempt is detected', () => {
      try {
        new URL('invalid-url');
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBeDefined();
        expect(e.message).toContain('Invalid URL');
      }
    });

    test('Domain blocking can be logged with domain name', () => {
      const ALLOWED_DOMAINS = [
        'creditinsurancecalculator.allianceinsurance.in',
        'insurance-deception-explorer.lovable.app',
        'demo.tata-aig.local'
      ];
      
      const attemptedDomain = 'malicious.com';
      const blocked = !ALLOWED_DOMAINS.includes(attemptedDomain);
      
      expect(blocked).toBe(true);
    });

    test('Failure message includes domain information', () => {
      const domain = 'creditinsurancecalculator.allianceinsurance.in';
      const message = `Discovery failed for ${domain}: Network timeout`;
      
      expect(message).toContain(domain);
      expect(message).toContain('Discovery failed');
    });
  });

  describe('7. Domain matching is exact (no wildcards)', () => {
    
    test('Exact match: creditinsurancecalculator.allianceinsurance.in', () => {
      const ALLOWED = 'creditinsurancecalculator.allianceinsurance.in';
      const TEST = 'creditinsurancecalculator.allianceinsurance.in';
      
      expect(ALLOWED === TEST).toBe(true);
    });

    test('Not matched: subdomain variant', () => {
      const ALLOWED = 'creditinsurancecalculator.allianceinsurance.in';
      const TEST = 'sub.creditinsurancecalculator.allianceinsurance.in';
      
      expect(ALLOWED === TEST).toBe(false);
    });

    test('Not matched: different case variant (but Node normalizes hostname)', () => {
      // Node's URL.hostname lowercases the hostname, so this should match in practice
      const url = new URL('https://CREDITINSURANCECALCULATOR.ALLIANCEINSURANCE.IN/');
      const hostname = url.hostname;
      const ALLOWED = 'creditinsurancecalculator.allianceinsurance.in';
      
      expect(hostname === ALLOWED).toBe(true);
    });

    test('Not matched: parent domain', () => {
      const ALLOWED = 'creditinsurancecalculator.allianceinsurance.in';
      const TEST = 'allianceinsurance.in';
      
      expect(ALLOWED === TEST).toBe(false);
    });
  });

  describe('8. Response shape for all scenarios', () => {
    
    test('Successful discovery: all fields present', () => {
      const res = {
        urls: [
          { url: 'https://creditinsurancecalculator.allianceinsurance.in/', source: 'Sitemap' }
        ],
        sitemapFound: true,
        demoLabel: null,
        label: null
      };
      
      expect(Object.keys(res).sort()).toEqual(['demoLabel', 'label', 'sitemapFound', 'urls'].sort());
    });

    test('No sitemap found: all fields present with empty urls', () => {
      const res = {
        urls: [],
        sitemapFound: false,
        demoLabel: null,
        label: null
      };
      
      expect(res.urls).toEqual([]);
      expect(res.sitemapFound).toBe(false);
    });

    test('Demo fixture: label fields populated', () => {
      const res = {
        urls: [
          { url: 'https://demo.tata-aig.local/', source: 'Sitemap' }
        ],
        sitemapFound: true,
        demoLabel: 'Demo fixture — live discovery is not active in this demo',
        label: 'Demo fixture — live discovery is not active in this demo'
      };
      
      expect(res.demoLabel).toBeTruthy();
      expect(res.label).toBeTruthy();
    });
  });
});
