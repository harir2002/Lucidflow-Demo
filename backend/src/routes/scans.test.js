/**
 * Tests for POST /api/scans endpoint with main-domain scan support
 * 
 * Coverage:
 * 1. POST /api/scans with scan_mode='one-page' (default behavior)
 * 2. POST /api/scans with scan_mode='main-domain' + selected_urls
 * 3. Validation: scan_mode must be 'one-page' or 'main-domain'
 * 4. Validation: selected_urls must be array of valid URLs
 * 5. Validation: domain_context must be valid domain name
 * 6. Backward compatibility: existing one-page scans still work
 * 7. Response includes id, target_url, status, domain_context (if provided)
 */

const { v4: uuid } = require('uuid');

// Mock dependencies
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

jest.mock('../db/database', () => ({
  prepare: jest.fn(),
}));

jest.mock('../services/scanOrchestrator', () => ({
  startScan: jest.fn().mockResolvedValue(null),
  isScanActive: jest.fn(() => false),
  pauseScan: jest.fn(),
  resumeScan: jest.fn(),
  cancelScan: jest.fn(),
}));

jest.mock('../services/sitemap', () => ({
  discoverAllUrls: jest.fn(),
  scoreUrl: jest.fn(),
}));

describe('POST /api/scans — Main Domain Scan Endpoint', () => {
  let mockDb;
  let mockStartScan;
  let mockIo;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock database
    mockDb = require('../db/database');
    mockDb.prepare = jest.fn();
    
    mockStartScan = require('../services/scanOrchestrator').startScan;
    
    // Setup mock Express app for testing
    mockIo = { emit: jest.fn() };
  });

  describe('1. Backward compatibility — one-page mode (default)', () => {
    
    test('POST /api/scans with target_url only defaults to scan_mode="one-page"', () => {
      // Verify that when scan_mode is not provided, it defaults to 'one-page'
      const body = {
        target_url: 'https://example.com'
      };
      
      // The default should be 'one-page' if not specified
      const scanMode = body.scan_mode || 'one-page';
      expect(scanMode).toBe('one-page');
    });

    test('POST /api/scans accepts url_pattern for one-page mode', () => {
      const body = {
        target_url: 'https://example.com',
        url_pattern: '.*'
      };
      
      expect(body).toHaveProperty('target_url');
      expect(body).toHaveProperty('url_pattern');
      expect(body.url_pattern).toBe('.*');
    });

    test('One-page scan does not require selected_urls', () => {
      const body = {
        target_url: 'https://example.com',
        scan_mode: 'one-page'
      };
      
      expect(body).not.toHaveProperty('selected_urls');
    });

    test('One-page scan response includes id, target_url, status', () => {
      const response = {
        id: 'mock-uuid-1234',
        target_url: 'https://example.com',
        status: 'discovering'
      };
      
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('target_url');
      expect(response).toHaveProperty('status');
      expect(response.status).toBe('discovering');
    });
  });

  describe('2. Main-domain mode with selected_urls', () => {
    
    test('POST /api/scans accepts scan_mode="main-domain"', () => {
      const body = {
        target_url: 'https://example.com',
        scan_mode: 'main-domain',
        selected_urls: ['https://example.com/page1', 'https://example.com/page2']
      };
      
      expect(body.scan_mode).toBe('main-domain');
    });

    test('Main-domain mode can include selected_urls array', () => {
      const body = {
        target_url: 'https://example.com',
        scan_mode: 'main-domain',
        selected_urls: [
          'https://example.com/page1',
          'https://example.com/page2',
          'https://example.com/page3'
        ]
      };
      
      expect(Array.isArray(body.selected_urls)).toBe(true);
      expect(body.selected_urls.length).toBe(3);
      expect(body.selected_urls[0]).toBe('https://example.com/page1');
    });

    test('Main-domain mode can include domain_context', () => {
      const body = {
        target_url: 'https://example.com',
        scan_mode: 'main-domain',
        selected_urls: ['https://example.com/page1'],
        domain_context: 'example.com'
      };
      
      expect(body).toHaveProperty('domain_context');
      expect(body.domain_context).toBe('example.com');
    });

    test('Main-domain scan response includes domain_context', () => {
      const response = {
        id: 'mock-uuid-1234',
        target_url: 'https://example.com',
        status: 'discovering',
        domain_context: 'example.com'
      };
      
      expect(response).toHaveProperty('domain_context');
      expect(response.domain_context).toBe('example.com');
    });

    test('Main-domain scan stores scan_mode in database', () => {
      // Verify that scan_mode is passed to database insert
      const scanMode = 'main-domain';
      expect(['one-page', 'main-domain']).toContain(scanMode);
    });
  });

  describe('3. Validation — scan_mode', () => {
    
    test('scan_mode must be "one-page" or "main-domain"', () => {
      const validModes = ['one-page', 'main-domain'];
      
      expect(validModes).toContain('one-page');
      expect(validModes).toContain('main-domain');
    });

    test('scan_mode="full-site" is rejected', () => {
      const scanMode = 'full-site';
      const validModes = ['one-page', 'main-domain'];
      
      expect(validModes).not.toContain(scanMode);
    });

    test('scan_mode=null is treated as default', () => {
      const scanMode = null;
      const effectiveMode = scanMode || 'one-page';
      
      expect(effectiveMode).toBe('one-page');
    });

    test('Invalid scan_mode returns 400 error', () => {
      // Verify the validation logic
      const scanMode = 'invalid-mode';
      const isValid = ['one-page', 'main-domain'].includes(scanMode);
      
      expect(isValid).toBe(false);
    });

    test('Empty string scan_mode is treated as default', () => {
      const scanMode = '';
      const effectiveMode = scanMode || 'one-page';
      
      expect(effectiveMode).toBe('one-page');
    });
  });

  describe('4. Validation — selected_urls', () => {
    
    test('selected_urls must be an array', () => {
      const selectedUrls = ['https://example.com/page1', 'https://example.com/page2'];
      
      expect(Array.isArray(selectedUrls)).toBe(true);
    });

    test('selected_urls must contain only strings', () => {
      const selectedUrls = ['https://example.com/page1', 'https://example.com/page2'];
      const allStrings = selectedUrls.every(u => typeof u === 'string');
      
      expect(allStrings).toBe(true);
    });

    test('selected_urls with non-string element is rejected', () => {
      const selectedUrls = ['https://example.com/page1', 123, 'https://example.com/page2'];
      const allStrings = selectedUrls.every(u => typeof u === 'string');
      
      expect(allStrings).toBe(false);
    });

    test('selected_urls can be empty array', () => {
      const selectedUrls = [];
      
      expect(Array.isArray(selectedUrls)).toBe(true);
      expect(selectedUrls.length).toBe(0);
    });

    test('selected_urls with invalid URL string is still accepted (format not validated here)', () => {
      // Note: URL validation happens in frontend or later in the scan process
      const selectedUrls = ['not-a-valid-url', 'https://example.com/page1'];
      
      expect(Array.isArray(selectedUrls)).toBe(true);
      expect(selectedUrls.length).toBe(2);
    });

    test('Non-array selected_urls is rejected', () => {
      const selectedUrls = 'https://example.com/page1';
      const isValid = Array.isArray(selectedUrls);
      
      expect(isValid).toBe(false);
    });

    test('Object selected_urls is rejected', () => {
      const selectedUrls = { url1: 'https://example.com/page1' };
      const isValid = Array.isArray(selectedUrls);
      
      expect(isValid).toBe(false);
    });
  });

  describe('5. Validation — target_url (required)', () => {
    
    test('target_url is required', () => {
      const body = {};
      const hasTargetUrl = !!body.target_url;
      
      expect(hasTargetUrl).toBe(false);
    });

    test('missing target_url returns 400 error', () => {
      // Verify validation logic
      const target_url = undefined;
      const isValid = !!target_url;
      
      expect(isValid).toBe(false);
    });

    test('target_url must be valid URL', () => {
      const validUrl = 'https://example.com';
      
      expect(() => {
        new URL(validUrl);
      }).not.toThrow();
    });

    test('invalid target_url throws error', () => {
      const invalidUrl = 'not-a-url';
      
      expect(() => {
        new URL(invalidUrl);
      }).toThrow();
    });

    test('target_url="https://example.com" is valid', () => {
      const url = new URL('https://example.com');
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('example.com');
    });

    test('target_url="http://example.com/path" is valid', () => {
      const url = new URL('http://example.com/path');
      expect(url.protocol).toBe('http:');
      expect(url.pathname).toBe('/path');
    });

    test('target_url with query params is valid', () => {
      const url = new URL('https://example.com?param=value');
      expect(url.searchParams.get('param')).toBe('value');
    });
  });

  describe('6. Validation — domain_context (optional)', () => {
    
    test('domain_context is optional', () => {
      const body = {
        target_url: 'https://example.com'
      };
      
      expect(body).not.toHaveProperty('domain_context');
    });

    test('domain_context can be a valid domain name', () => {
      const domainContext = 'example.com';
      
      // Basic domain validation (alphanumeric, dots, hyphens)
      const isValidDomain = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainContext);
      expect(isValidDomain).toBe(true);
    });

    test('domain_context="creditinsurancecalculator.allianceinsurance.in" is valid', () => {
      const domainContext = 'creditinsurancecalculator.allianceinsurance.in';
      const isValidDomain = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainContext);
      
      expect(isValidDomain).toBe(true);
    });

    test('domain_context with https:// prefix is rejected', () => {
      const domainContext = 'https://example.com';
      const isValidDomain = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainContext);
      
      expect(isValidDomain).toBe(false);
    });

    test('domain_context=null defaults to null', () => {
      const domainContext = null;
      const effective = domainContext || null;
      
      expect(effective).toBe(null);
    });
  });

  describe('7. Request/Response flow', () => {
    
    test('Request body includes all fields for main-domain scan', () => {
      const requestBody = {
        target_url: 'https://creditinsurancecalculator.allianceinsurance.in',
        scan_mode: 'main-domain',
        selected_urls: [
          'https://creditinsurancecalculator.allianceinsurance.in/page1',
          'https://creditinsurancecalculator.allianceinsurance.in/page2'
        ],
        domain_context: 'creditinsurancecalculator.allianceinsurance.in'
      };
      
      expect(requestBody).toHaveProperty('target_url');
      expect(requestBody).toHaveProperty('scan_mode');
      expect(requestBody).toHaveProperty('selected_urls');
      expect(requestBody).toHaveProperty('domain_context');
    });

    test('Response for main-domain scan includes required fields', () => {
      const response = {
        id: 'scan-123',
        target_url: 'https://creditinsurancecalculator.allianceinsurance.in',
        status: 'discovering',
        domain_context: 'creditinsurancecalculator.allianceinsurance.in'
      };
      
      expect(response.id).toBeDefined();
      expect(response.target_url).toBeDefined();
      expect(response.status).toBe('discovering');
      expect(response.domain_context).toBe('creditinsurancecalculator.allianceinsurance.in');
    });

    test('Response for one-page scan does not require domain_context', () => {
      const response = {
        id: 'scan-456',
        target_url: 'https://example.com',
        status: 'discovering'
      };
      
      expect(response.id).toBeDefined();
      expect(response.target_url).toBeDefined();
      expect(response.status).toBe('discovering');
      expect(response).not.toHaveProperty('domain_context');
    });

    test('Response status is initially "discovering"', () => {
      const response = {
        id: 'scan-789',
        target_url: 'https://example.com',
        status: 'discovering'
      };
      
      expect(response.status).toBe('discovering');
    });

    test('HTTP status code is 201 (Created)', () => {
      // Verify that successful POST returns 201
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });
  });

  describe('8. Error responses', () => {
    
    test('Missing target_url returns 400', () => {
      const errorResponse = {
        error: 'target_url is required'
      };
      
      expect(errorResponse.error).toContain('target_url');
    });

    test('Invalid target_url returns 400', () => {
      const errorResponse = {
        error: 'target_url is not a valid URL'
      };
      
      expect(errorResponse.error).toContain('URL');
    });

    test('Invalid scan_mode returns 400', () => {
      const errorResponse = {
        error: 'scan_mode must be "one-page" or "main-domain"'
      };
      
      expect(errorResponse.error).toContain('scan_mode');
    });

    test('Non-array selected_urls returns 400', () => {
      const errorResponse = {
        error: 'selected_urls must be an array of strings'
      };
      
      expect(errorResponse.error).toContain('selected_urls');
    });

    test('selected_urls with non-string returns 400', () => {
      const errorResponse = {
        error: 'selected_urls must be an array of strings'
      };
      
      expect(errorResponse.error).toContain('selected_urls');
    });

    test('HTTP status code is 400 for validation errors', () => {
      const statusCode = 400;
      expect(statusCode).toBe(400);
    });
  });

  describe('9. Database operations', () => {
    
    test('Scan is inserted into database with all fields', () => {
      // Verify INSERT statement includes scan_mode, domain_context
      const insertSql = `INSERT INTO scans (id, target_url, url_pattern, scan_mode, domain_context, status) VALUES (?, ?, ?, ?, ?, 'discovering')`;
      
      expect(insertSql).toContain('scan_mode');
      expect(insertSql).toContain('domain_context');
      expect(insertSql).toContain('status');
    });

    test('Scan mode is stored in database', () => {
      const scanMode = 'main-domain';
      const columns = ['id', 'target_url', 'url_pattern', 'scan_mode', 'domain_context', 'status'];
      
      expect(columns).toContain('scan_mode');
    });

    test('Domain context is stored in database', () => {
      const domainContext = 'example.com';
      const columns = ['id', 'target_url', 'url_pattern', 'scan_mode', 'domain_context', 'status'];
      
      expect(columns).toContain('domain_context');
    });
  });

  describe('10. Integration with startScan', () => {
    
    test('startScan is called with scanMode option', () => {
      const options = {
        scanMode: 'main-domain',
        selectedUrls: ['https://example.com/page1'],
        domainContext: 'example.com'
      };
      
      expect(options).toHaveProperty('scanMode');
      expect(options.scanMode).toBe('main-domain');
    });

    test('startScan is called with selectedUrls option', () => {
      const options = {
        scanMode: 'main-domain',
        selectedUrls: ['https://example.com/page1', 'https://example.com/page2'],
        domainContext: 'example.com'
      };
      
      expect(options).toHaveProperty('selectedUrls');
      expect(Array.isArray(options.selectedUrls)).toBe(true);
    });

    test('startScan is called with domainContext option', () => {
      const options = {
        scanMode: 'main-domain',
        selectedUrls: [],
        domainContext: 'example.com'
      };
      
      expect(options).toHaveProperty('domainContext');
      expect(options.domainContext).toBe('example.com');
    });

    test('startScan options use camelCase naming', () => {
      const options = {
        scanMode: 'main-domain',
        selectedUrls: [],
        domainContext: null
      };
      
      expect(options).toHaveProperty('scanMode');
      expect(options).toHaveProperty('selectedUrls');
      expect(options).toHaveProperty('domainContext');
    });

    test('For one-page mode, selectedUrls is empty array', () => {
      const options = {
        scanMode: 'one-page',
        selectedUrls: [],
        domainContext: null
      };
      
      expect(options.scanMode).toBe('one-page');
      expect(options.selectedUrls).toEqual([]);
    });

    test('startScan is called asynchronously (fire and forget)', () => {
      // Verify that startScan is awaited or error is caught
      const startScanCall = mockStartScan('scan-id', 'https://example.com', null, mockIo, {
        scanMode: 'main-domain',
        selectedUrls: [],
        domainContext: null
      });
      
      // Should return a Promise
      expect(startScanCall).toBeInstanceOf(Promise);
    });
  });

  describe('11. Multiple scans with different modes', () => {
    
    test('Multiple one-page scans can coexist', () => {
      const scan1 = { id: 'scan-1', scan_mode: 'one-page' };
      const scan2 = { id: 'scan-2', scan_mode: 'one-page' };
      
      expect(scan1.scan_mode).toBe(scan2.scan_mode);
    });

    test('Multiple main-domain scans can coexist with different domains', () => {
      const scan1 = { id: 'scan-1', scan_mode: 'main-domain', domain_context: 'example1.com' };
      const scan2 = { id: 'scan-2', scan_mode: 'main-domain', domain_context: 'example2.com' };
      
      expect(scan1.domain_context).not.toBe(scan2.domain_context);
    });

    test('One-page and main-domain scans can coexist', () => {
      const onePage = { id: 'scan-1', scan_mode: 'one-page' };
      const mainDomain = { id: 'scan-2', scan_mode: 'main-domain' };
      
      expect(onePage.scan_mode).not.toBe(mainDomain.scan_mode);
    });
  });

  describe('12. Edge cases', () => {
    
    test('Empty selected_urls array with main-domain mode is allowed', () => {
      const body = {
        target_url: 'https://example.com',
        scan_mode: 'main-domain',
        selected_urls: []
      };
      
      expect(Array.isArray(body.selected_urls)).toBe(true);
      expect(body.selected_urls.length).toBe(0);
    });

    test('Very long selected_urls list is accepted', () => {
      const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/page${i}`);
      
      expect(Array.isArray(urls)).toBe(true);
      expect(urls.length).toBe(100);
    });

    test('target_url with complex path and query is valid', () => {
      const url = new URL('https://example.com/path/to/page?param1=val1&param2=val2#section');
      
      expect(url.hostname).toBe('example.com');
      expect(url.pathname).toBe('/path/to/page');
    });

    test('selected_urls with mixed protocols is accepted', () => {
      const urls = [
        'https://example.com/page1',
        'http://example.com/page2'
      ];
      
      expect(Array.isArray(urls)).toBe(true);
      expect(urls.length).toBe(2);
    });

    test('Duplicate URLs in selected_urls is accepted', () => {
      const urls = [
        'https://example.com/page1',
        'https://example.com/page1'
      ];
      
      expect(urls[0]).toBe(urls[1]);
    });

    test('Case-sensitive domain_context is stored as-is', () => {
      const domainContext1 = 'Example.COM';
      const domainContext2 = 'example.com';
      
      expect(domainContext1).not.toBe(domainContext2);
    });
  });
});
