const {
  normalizeUrl,
  matchUrl,
  loadCache,
  saveCache,
} = require('./savedReports');

describe('SavedReportsService', () => {
  // Test URL normalization
  describe('normalizeUrl', () => {
    test('removes trailing slash', () => {
      expect(normalizeUrl('https://allianceinsurance.in/')).toBe('https://allianceinsurance.in');
    });

    test('lowercases domain', () => {
      expect(normalizeUrl('https://ALLIANCEINSURANCE.IN')).toBe('https://allianceinsurance.in');
    });

    test('removes path', () => {
      expect(normalizeUrl('https://allianceinsurance.in/path/to/page')).toBe('https://allianceinsurance.in');
    });

    test('removes query string', () => {
      expect(normalizeUrl('https://allianceinsurance.in?foo=bar')).toBe('https://allianceinsurance.in');
    });

    test('handles http', () => {
      expect(normalizeUrl('http://allianceinsurance.in')).toBe('http://allianceinsurance.in');
    });

    test('returns null for invalid URL', () => {
      expect(normalizeUrl('not a url')).toBeNull();
    });
  });

  // Test URL matching
  describe('matchUrl', () => {
    test('matches alliance insurance URL', () => {
      const result = matchUrl('https://allianceinsurance.in');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('matches alliance insurance URL with trailing slash', () => {
      const result = matchUrl('https://allianceinsurance.in/');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('matches ABC insurance URL', () => {
      const result = matchUrl('https://insurance-deception-explorer.lovable.app');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBL-2026-001');
    });

    test('does not match unrelated URL', () => {
      const result = matchUrl('https://example.com');
      expect(result).toBeNull();
    });

    test('is case insensitive', () => {
      const result = matchUrl('https://ALLIANCEINSURANCE.IN');
      expect(result).not.toBeNull();
    });

    test('handles invalid URL gracefully', () => {
      const result = matchUrl('not a url');
      expect(result).toBeNull();
    });
  });

  // Test cache operations
  describe('Cache', () => {
    test('loadCache returns object with reports array', () => {
      const cache = loadCache();
      expect(cache).toHaveProperty('reports');
      expect(Array.isArray(cache.reports)).toBe(true);
    });

    test('saveCache and loadCache roundtrip', () => {
      const testCache = {
        reports: [
          {
            reportId: 'TEST-001',
            organisation: 'Test Org',
            filePath: '/path/to/file.pdf',
            extractedContent: { pageCount: 10 },
          },
        ],
      };
      saveCache(testCache);
      const loaded = loadCache();
      expect(loaded.reports.length).toBeGreaterThan(0);
      expect(loaded.reports.some(r => r.reportId === 'TEST-001')).toBe(true);
    });
  });
});
