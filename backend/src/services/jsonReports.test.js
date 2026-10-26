const { matchJsonReport, convertJsonToReportView, getJsonReportForUrl } = require('./jsonReports');

describe('JSON Report Service', () => {
  describe('matchJsonReport', () => {
    test('matches Alliance Insurance with exact URL and /', () => {
      const result = matchJsonReport('https://creditinsurancecalculator.allianceinsurance.in/');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('matches Alliance Insurance without trailing slash', () => {
      const result = matchJsonReport('https://creditinsurancecalculator.allianceinsurance.in');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
    });

    test('matches ABC Insurance with /compare path', () => {
      const result = matchJsonReport('https://insurance-deception-explorer.lovable.app/compare');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBL-2026-001');
    });

    test('matches ABC Insurance with /compare/ (trailing slash)', () => {
      const result = matchJsonReport('https://insurance-deception-explorer.lovable.app/compare/');
      expect(result).not.toBeNull();
      expect(result.reportId).toBe('LF-AIBL-2026-001');
    });

    test('rejects wrong path on ABC Insurance', () => {
      const result = matchJsonReport('https://insurance-deception-explorer.lovable.app/about');
      expect(result).toBeNull();
    });

    test('rejects unrelated URLs', () => {
      const result = matchJsonReport('https://example.com');
      expect(result).toBeNull();
    });

    test('is case insensitive', () => {
      const result = matchJsonReport('https://CREDITINSURANCECALCULATOR.ALLIANCEINSURANCE.IN/');
      expect(result).not.toBeNull();
    });

    test('handles invalid URLs gracefully', () => {
      const result = matchJsonReport('not a url');
      expect(result).toBeNull();
    });
  });

  describe('convertJsonToReportView', () => {
    test('converts Alliance JSON to report view format', () => {
      const mockJson = {
        cover: {
          prepared_for: 'Alliance Insurance',
          report_id: 'LF-AIBPL-2026-001',
          issue_date_source: '27th October 2026',
          version: 'v1.0',
          assessment_scope: 'Alliance Insurance Web journey',
        },
        url_mapping: { url: 'https://creditinsurancecalculator.allianceinsurance.in/' },
        executive_summary: {
          kpis_source_reported: {
            pages_screens_assessed: 1,
            potential_findings: 1,
            high_critical: 0,
            revalidated_closed: 0,
          },
          overall_posture: 'Test posture',
          priority_themes: [],
          pattern_distribution: [],
        },
        findings: [
          {
            id: 'F-001',
            title: 'Test Finding',
            severity: 'MEDIUM',
            pattern_source: 'Forced Action',
            assessed_url: 'https://creditinsurancecalculator.allianceinsurance.in/',
            owner: 'Test Owner',
            evidence: {},
          },
        ],
        corrective_action_plan: {
          heading: 'CAP',
          items: [],
        },
        appendix: {},
        review_notes: [],
        source: { filename: 'test.pdf' },
      };

      const result = convertJsonToReportView(mockJson);

      expect(result.organisation).toBe('Alliance Insurance');
      expect(result.reportId).toBe('LF-AIBPL-2026-001');
      expect(result.issueDate).toBe('27th October 2026');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe('MEDIUM');
      expect(result.isImportedReport).toBe(true);
      expect(result.riskCounts.MEDIUM).toBe(1);
    });

    test('handles missing optional fields', () => {
      const mockJson = {
        cover: {},
        findings: [],
        corrective_action_plan: {},
        appendix: {},
        review_notes: [],
        source: {},
      };

      const result = convertJsonToReportView(mockJson);

      expect(result.organisation).toBe('Unknown');
      expect(result.findings).toHaveLength(0);
      expect(result.riskCounts).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0, CLEAN: 0 });
    });

    test('correctly counts risk levels from findings', () => {
      const mockJson = {
        cover: {},
        findings: [
          { id: 'F-1', severity: 'HIGH' },
          { id: 'F-2', severity: 'HIGH' },
          { id: 'F-3', severity: 'MEDIUM' },
        ],
        corrective_action_plan: {},
        appendix: {},
        review_notes: [],
        source: {},
      };

      const result = convertJsonToReportView(mockJson);

      expect(result.riskCounts.HIGH).toBe(2);
      expect(result.riskCounts.MEDIUM).toBe(1);
      expect(result.riskCounts.LOW).toBe(0);
    });
  });
});
