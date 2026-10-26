const {
  normalizeUrl,
  matchUrl,
  loadCache,
  saveCache,
} = require('./savedReports');

describe('SavedReportsService', () => {
  describe('normalizeUrl', () => {
    test('extracts domain and path correctly', () => {
      const result = normalizeUrl('https://creditinsurancecalculator.allianceinsurance.in/');
      expect(result.domain).toBe('creditinsurancecalculator.allianceinsurance.in');
      expect(result.path).toBe('/');
    });

    test('removes trailing slash from path', () => {
      const result = normalizeUrl('https://insurance-deception-explorer.lovable.app/compare/');
      expect(result.path).toBe('/compare');
    });

    test('lowercases domain', () => {
      const result = normalizeUrl('https://CREDITINSURANCECALCULATOR.ALLIANCEINSURANCE.IN/');
      expect(result.domain).toBe('creditinsurancecalculator.allianceinsurance.in');
    });

    test('returns null for invalid URL', () => {
      expect(normalizeUrl('not a url')).toBeNull();
    });
  });

  describe('matchUrl', () => {
    test('matches alliance insurance exact URL with path /', () => {
      const result = matchUrl('https://creditinsurancecalculator.allianceinsurance.in/');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
      expect(result.organisation).toBe('Alliance Insurance');
    });

    test('matches alliance insurance without trailing slash', () => {
      const result = matchUrl('https://creditinsurancecalculator.allianceinsurance.in');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('matches ABC insurance with /compare path', () => {
      const result = matchUrl('https://insurance-deception-explorer.lovable.app/compare');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBL-2026-001');
      expect(result.organisation).toBe('ABC Insurance');
    });

    test('matches ABC insurance with /compare/ (trailing slash)', () => {
      const result = matchUrl('https://insurance-deception-explorer.lovable.app/compare/');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBL-2026-001');
    });

    test('is case insensitive', () => {
      const result = matchUrl('https://CREDITINSURANCECALCULATOR.ALLIANCEINSURANCE.IN/');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('rejects URLs that do not match', () => {
      const result = matchUrl('https://example.com');
      expect(result).toBeNull();
    });

    test('rejects wrong path on ABC Insurance', () => {
      const result = matchUrl('https://insurance-deception-explorer.lovable.app/about');
      expect(result).toBeNull();
    });

    test('rejects wrong path on Alliance Insurance', () => {
      const result = matchUrl('https://creditinsurancecalculator.allianceinsurance.in/about');
      expect(result).toBeNull();
    });
  });

  describe('Cache', () => {
    test('loadCache returns object with reports array', () => {
      const cache = loadCache();
      expect(cache).toHaveProperty('reports');
      expect(Array.isArray(cache.reports)).toBe(true);
    });
  });
});
