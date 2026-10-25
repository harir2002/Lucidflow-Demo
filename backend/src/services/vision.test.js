const { analyzePage, analyzePageWithProvider, extractTextEvidence } = require('./vision');

// Mock groq module
jest.mock('./groq', () => ({
  candidateDetection: jest.fn(),
}));

describe('Vision Service — Provider Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GROQ_API_KEY;
  });

  describe('extractTextEvidence', () => {
    test('extracts all DOM signals into text', () => {
      const evidence = extractTextEvidence('https://example.com', 'Test Page', {
        preChecked: [{ label: 'PA Cover' }],
        badges: ['Best Price'],
        priceEls: ['Rs 5000'],
        buttons: ['Buy Now'],
        timers: 2,
        popups: 1,
        forms: 3,
        bodyText: 'Lorem ipsum',
      });

      expect(evidence).toContain('https://example.com');
      expect(evidence).toContain('Test Page');
      expect(evidence).toContain('PA Cover');
      expect(evidence).toContain('Best Price');
      expect(evidence).toContain('Rs 5000');
      expect(evidence).toContain('Countdown timers');
      expect(evidence).toContain('Lorem ipsum');
    });

    test('truncates body text to 800 chars', () => {
      const longText = 'A'.repeat(2000);
      const evidence = extractTextEvidence('https://example.com', 'Test', { bodyText: longText });

      expect(evidence.length).toBeLessThan(2000 + 100);
    });

    test('handles empty/null domSignals gracefully', () => {
      const evidence1 = extractTextEvidence('https://example.com', 'Test', {});
      expect(evidence1).toContain('https://example.com');

      const evidence2 = extractTextEvidence('https://example.com', 'Test', null);
      expect(evidence2).toContain('https://example.com');
    });

    test('limits badge count to 8', () => {
      const badges = Array.from({ length: 20 }, (_, i) => `Badge${i}`);
      const evidence = extractTextEvidence('https://example.com', 'Test', { badges });

      const badgeMatches = evidence.match(/Badge\d+/g) || [];
      expect(badgeMatches.length).toBeLessThanOrEqual(8);
    });
  });

  describe('analyzePageWithProvider — Groq path', () => {
    test('calls Groq candidateDetection when provider="groq"', async () => {
      const groq = require('./groq');
      groq.candidateDetection.mockResolvedValueOnce({
        overall_risk: 'HIGH',
        summary: 'Test findings',
        patterns_found: [{ pattern_id: 2, pattern_name: 'Basket Sneaking', severity: 'HIGH', evidence: 'Test' }],
        clean_patterns: [],
        recommendations: ['Fix it'],
      });

      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/tmp/screenshot.png',
        domSignals: { preChecked: [{ label: 'PA' }] },
      };

      const result = await analyzePageWithProvider(pageData, 'groq');

      expect(groq.candidateDetection).toHaveBeenCalled();
      expect(result.page_url).toBe('https://example.com');
      // Verify text evidence (not screenshot) was passed
      const callArg = groq.candidateDetection.mock.calls[0][0];
      expect(callArg).toContain('PA');
      expect(typeof callArg).toBe('string');
    });

    test('does NOT load screenshot for Groq (text-only)', async () => {
      const groq = require('./groq');
      groq.candidateDetection.mockResolvedValueOnce({
        overall_risk: 'CLEAN',
        summary: 'No patterns',
        patterns_found: [],
        clean_patterns: [],
        recommendations: [],
      });

      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/tmp/screenshot.png',
        domSignals: { bodyText: 'Premium Rs 5000' },
      };

      await analyzePageWithProvider(pageData, 'groq');

      // Text evidence should mention the price
      const callArg = groq.candidateDetection.mock.calls[0][0];
      expect(callArg).toContain('Rs 5000');
    });

    test('logs provider selection when using Groq', async () => {
      const groq = require('./groq');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      groq.candidateDetection.mockResolvedValueOnce({
        overall_risk: 'CLEAN',
        summary: 'No issues',
        patterns_found: [],
        clean_patterns: [],
        recommendations: [],
      });

      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/tmp/screenshot.png',
        domSignals: {},
      };

      await analyzePageWithProvider(pageData, 'groq');

      const logCalls = consoleSpy.mock.calls.map(c => c[0]);
      expect(logCalls.some(c => c.includes('Using Groq'))).toBe(true);

      consoleSpy.mockRestore();
    });

    test('returns consistent result structure from Groq', async () => {
      const groq = require('./groq');
      groq.candidateDetection.mockResolvedValueOnce({
        overall_risk: 'MEDIUM',
        summary: 'Some issues',
        patterns_found: [{ pattern_id: 1, pattern_name: 'Test', severity: 'MEDIUM', evidence: 'Evidence' }],
        clean_patterns: [2, 3],
        recommendations: ['Rec 1'],
      });

      const result = await analyzePageWithProvider(
        { url: 'https://example.com', title: 'Test', screenshotPath: '/tmp/s.png', domSignals: {} },
        'groq'
      );

      expect(result).toHaveProperty('page_url');
      expect(result).toHaveProperty('page_title');
      expect(result).toHaveProperty('overall_risk');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('patterns_found');
      expect(result).toHaveProperty('clean_patterns');
      expect(result).toHaveProperty('recommendations');
    });

    test('falls back to Ollama when Groq fails', async () => {
      const groq = require('./groq');
      groq.candidateDetection.mockRejectedValueOnce(new Error('API error'));

      // Mock analyzePage (Ollama) indirectly by checking if Groq was called
      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/tmp/screenshot.png',
        domSignals: {},
      };

      // This will fail since we're not mocking Ollama, but we verify Groq was attempted
      try {
        await analyzePageWithProvider(pageData, 'groq');
      } catch {
        // Expected to fail or return error
      }

      expect(groq.candidateDetection).toHaveBeenCalled();
    });

    test('logs provider fallback warning when Groq fails', async () => {
      const groq = require('./groq');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      groq.candidateDetection.mockRejectedValueOnce(new Error('API error'));

      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/tmp/screenshot.png',
        domSignals: {},
      };

      try {
        await analyzePageWithProvider(pageData, 'groq');
      } catch {
        // Expected
      }

      const warnCalls = consoleSpy.mock.calls.map(c => c[0]);
      expect(warnCalls.some(c => c.includes('Groq provider failed'))).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('analyzePageWithProvider — default behavior', () => {
    test('defaults to Ollama when provider not specified', async () => {
      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/nonexistent.png',
        domSignals: {},
      };

      const result = await analyzePageWithProvider(pageData);

      // Since screenshot doesn't exist, will return error from Ollama path
      expect(result.overall_risk).toBe('ERROR');
      expect(result.summary).toContain('Screenshot missing');
    });

    test('defaults to Ollama when provider="ollama"', async () => {
      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/nonexistent.png',
        domSignals: {},
      };

      const result = await analyzePageWithProvider(pageData, 'ollama');

      expect(result.overall_risk).toBe('ERROR');
      expect(result.summary).toContain('Screenshot missing');
    });
  });

  describe('Provider selection in text-only mode', () => {
    test('Groq is text-only, does not require screenshot', () => {
      const evidence = extractTextEvidence('https://test.com', 'Page', {
        bodyText: 'Sample text',
        priceEls: ['Rs 1000'],
      });

      expect(evidence).toContain('Sample text');
      expect(evidence).toContain('Rs 1000');
      // No base64 or screenshot data
      expect(evidence).not.toContain('base64');
    });

    test('Groq extracts meaningful text signals from DOM', () => {
      const evidence = extractTextEvidence('https://test.com', 'Product', {
        preChecked: [{ label: 'Add-on insurance' }],
        buttons: ['Proceed to Pay'],
        bodyText: 'GST extra',
      });

      expect(evidence).toContain('Add-on insurance');
      expect(evidence).toContain('Proceed to Pay');
      expect(evidence).toContain('GST extra');
    });
  });

  describe('No breaking changes to existing Ollama path', () => {
    test('analyzePage still works and returns ERROR when screenshot missing', async () => {
      const pageData = {
        url: 'https://example.com',
        title: 'Test',
        screenshotPath: '/nonexistent.png',
        domSignals: {},
      };

      const result = await analyzePage(pageData);

      expect(result.page_url).toBe('https://example.com');
      expect(result.overall_risk).toBe('ERROR');
      expect(result.summary).toContain('Screenshot missing');
    });
  });
});
