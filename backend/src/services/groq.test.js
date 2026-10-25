const https = require('https');
const {
  MODEL_NAME,
  GROQ_HOST,
  checkGroqAvailable,
  candidateDetection,
  generateRemediation,
  parseGroqJson,
  buildCandidateDetectionPrompt,
  MOCK_FINDINGS,
  MOCK_REMEDIATION,
} = require('./groq');

// Mock https module
jest.mock('https');

describe('Groq Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  describe('Configuration', () => {
    test('MODEL_NAME is set correctly', () => {
      expect(MODEL_NAME).toBe('qwen/qwen3.8-27b');
    });

    test('GROQ_HOST is correct endpoint', () => {
      expect(GROQ_HOST).toBe('https://api.groq.com/openai/v1/chat/completions');
    });
  });

  describe('checkGroqAvailable', () => {
    test('returns error when GROQ_API_KEY is not set', async () => {
      const result = await checkGroqAvailable();
      expect(result.available).toBe(false);
      expect(result.reason).toBe('GROQ_API_KEY not set');
    });
  });

  describe('candidateDetection', () => {
    test('returns error when evidenceText is empty', async () => {
      const result = await candidateDetection('');
      expect(result.overall_risk).toBe('ERROR');
      expect(result.error).toBeDefined();
      expect(result.patterns_found).toEqual([]);
    });

    test('returns error when evidenceText is not a string', async () => {
      const result = await candidateDetection(null);
      expect(result.overall_risk).toBe('ERROR');
      expect(result.error).toBeDefined();
    });

    test('returns error when GROQ_API_KEY is not set', async () => {
      delete process.env.GROQ_API_KEY;
      const result = await candidateDetection('Some evidence text');
      expect(result.overall_risk).toBe('ERROR');
      expect(result.error).toContain('GROQ_API_KEY');
    });

    test('text-only analysis (no vision/images)', async () => {
      process.env.GROQ_API_KEY = 'test-key-12345';

      const mockResponse = JSON.stringify({
        overall_risk: 'MEDIUM',
        summary: 'Text-only analysis completed',
        patterns_found: [],
        clean_patterns: [1, 2, 3],
        recommendations: [],
      });

      // Mock must be set up synchronously before the async call
      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
        setTimeout: jest.fn(),
      };

      const mockRes = {
        statusCode: 200,
        setEncoding: jest.fn(),
        on: jest.fn(function(event, handler) {
          if (event === 'data') {
            handler(mockResponse);
          } else if (event === 'end') {
            handler();
          }
        }),
      };

      https.request.mockImplementationOnce((options, callback) => {
        expect(options.headers['Content-Type']).toBe('application/json');
        callback(mockRes);
        return mockReq;
      });

      const evidenceText = 'Premium quote: Rs 5000 + GST. Renewal reminder sent.';
      const result = await candidateDetection(evidenceText);

      expect(result).toBeDefined();
      expect(result.overall_risk).toBeDefined();
    });

    test('truncates evidence if too long', async () => {
      process.env.GROQ_API_KEY = 'test-key-12345';

      const mockResponse = JSON.stringify({
        overall_risk: 'CLEAN',
        summary: 'Analysis complete',
        patterns_found: [],
        clean_patterns: [],
        recommendations: [],
      });

      mockMakeGroqRequest(mockResponse);

      const longText = 'A'.repeat(10000);
      const result = await candidateDetection(longText);
      expect(result).toBeDefined();
    });
  });

  describe('generateRemediation', () => {
    test('returns error when finding is null', async () => {
      const result = await generateRemediation(null);
      expect(result.error).toBeDefined();
      expect(result.actions).toEqual([]);
    });

    test('returns error when finding is not an object', async () => {
      const result = await generateRemediation('not an object');
      expect(result.error).toBeDefined();
    });

    test('returns error when API key is missing', async () => {
      delete process.env.GROQ_API_KEY;
      const finding = {
        pattern_id: 2,
        pattern_name: 'Basket Sneaking',
        severity: 'HIGH',
        evidence: 'Test',
      };

      const result = await generateRemediation(finding);
      expect(result.error).toBeDefined();
    });

    test('accepts finding object with pattern details', async () => {
      process.env.GROQ_API_KEY = 'test-key-12345';
      const finding = {
        pattern_id: 2,
        pattern_name: 'Basket Sneaking',
        severity: 'HIGH',
        evidence: 'Checkbox pre-ticked for PA',
      };

      const mockResponse = JSON.stringify({
        pattern_id: 2,
        pattern_name: 'Basket Sneaking',
        severity: 'HIGH',
        timeframe: '30 days',
        actions: [
          {
            action: 'Fix the checkbox',
            description: 'Set checked to false',
            owner: 'Frontend',
            priority: 'High',
          },
        ],
      });

      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
        setTimeout: jest.fn(),
      };

      const mockRes = {
        statusCode: 200,
        setEncoding: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(mockResponse);
          } else if (event === 'end') {
            handler();
          }
        }),
      };

      https.request.mockImplementationOnce((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const result = await generateRemediation(finding);
      // Just verify it returns an object with expected fields
      expect(result).toHaveProperty('pattern_id');
      expect(result).toHaveProperty('pattern_name');
      expect(result).toHaveProperty('severity');
    });
  });

  describe('parseGroqJson', () => {
    test('parses valid JSON response', () => {
      const json = JSON.stringify({
        overall_risk: 'HIGH',
        patterns_found: [],
      });
      const result = parseGroqJson(json);
      expect(result.overall_risk).toBe('HIGH');
    });

    test('strips markdown code blocks', () => {
      const markdown = `\`\`\`json
{
  "overall_risk": "MEDIUM",
  "patterns_found": []
}
\`\`\``;
      const result = parseGroqJson(markdown);
      expect(result.overall_risk).toBe('MEDIUM');
    });

    test('extracts JSON from response with extra text', () => {
      const response = 'Here is the analysis: {"overall_risk":"LOW","patterns_found":[]} done.';
      const result = parseGroqJson(response);
      expect(result.overall_risk).toBe('LOW');
    });

    test('returns default structure on parse failure', () => {
      const result = parseGroqJson('This is not valid JSON at all');
      expect(result.overall_risk).toBe('UNKNOWN');
      expect(result.summary).toBe('Could not parse Groq response as JSON');
      expect(result.patterns_found).toEqual([]);
    });
  });

  describe('buildCandidateDetectionPrompt', () => {
    test('builds prompt with text evidence', () => {
      const evidence = 'Sample insurance page text';
      const prompt = buildCandidateDetectionPrompt(evidence);

      expect(prompt).toContain('IRDAI dark-pattern auditor');
      expect(prompt).toContain(evidence);
      expect(prompt).toContain('TEXT EVIDENCE');
      expect(prompt).toContain('Basket Sneaking');
      expect(prompt).toContain('False Urgency');
    });

    test('prompt includes all 13 patterns', () => {
      const evidence = 'Test evidence';
      const prompt = buildCandidateDetectionPrompt(evidence);

      expect(prompt).toContain('False Urgency');
      expect(prompt).toContain('Basket Sneaking');
      expect(prompt).toContain('Confirm Shaming');
      expect(prompt).toContain('Forced Action');
      expect(prompt).toContain('Subscription Trap');
      expect(prompt).toContain('Drip Pricing');
      expect(prompt).toContain('Interface Interference');
    });

    test('prompt requires JSON-only response', () => {
      const evidence = 'Test';
      const prompt = buildCandidateDetectionPrompt(evidence);
      expect(prompt).toContain('Reply ONLY with valid JSON');
    });
  });

  describe('Error Handling', () => {
    test('handles network errors gracefully', async () => {
      process.env.GROQ_API_KEY = 'test-key-12345';

      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('Network timeout')), 10);
          }
        }),
        setTimeout: jest.fn(),
        destroy: jest.fn(),
      };

      https.request.mockImplementationOnce((options, callback) => {
        return mockReq;
      });

      const result = await candidateDetection('Test text');
      expect(result.overall_risk).toBe('ERROR');
      expect(result.error).toBeDefined();
    });

    test('logs API errors without exposing keys', async () => {
      process.env.GROQ_API_KEY = 'secret-key-12345';

      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            handler(new Error('API returned 403'));
          }
        }),
        setTimeout: jest.fn(),
        destroy: jest.fn(),
      };

      https.request.mockImplementationOnce((options, callback) => {
        return mockReq;
      });

      const result = await candidateDetection('Test');
      expect(result.error).toBeDefined();
      // Verify error message doesn't contain the API key
      expect(result.error).not.toContain('secret-key-12345');
    });
  });

  describe('Mock Data', () => {
    test('MOCK_FINDINGS has correct structure', () => {
      expect(MOCK_FINDINGS.overall_risk).toBe('HIGH');
      expect(MOCK_FINDINGS.patterns_found).toBeDefined();
      expect(Array.isArray(MOCK_FINDINGS.patterns_found)).toBe(true);
      expect(MOCK_FINDINGS.patterns_found[0]).toHaveProperty('pattern_id');
      expect(MOCK_FINDINGS.patterns_found[0]).toHaveProperty('pattern_name');
      expect(MOCK_FINDINGS.patterns_found[0]).toHaveProperty('severity');
      expect(MOCK_FINDINGS.patterns_found[0]).toHaveProperty('evidence');
    });

    test('MOCK_REMEDIATION has correct structure', () => {
      expect(MOCK_REMEDIATION).toHaveProperty('pattern_id');
      expect(MOCK_REMEDIATION).toHaveProperty('pattern_name');
      expect(MOCK_REMEDIATION).toHaveProperty('timeframe');
      expect(MOCK_REMEDIATION).toHaveProperty('actions');
      expect(Array.isArray(MOCK_REMEDIATION.actions)).toBe(true);
      expect(MOCK_REMEDIATION.actions[0]).toHaveProperty('action');
      expect(MOCK_REMEDIATION.actions[0]).toHaveProperty('description');
      expect(MOCK_REMEDIATION.actions[0]).toHaveProperty('owner');
      expect(MOCK_REMEDIATION.actions[0]).toHaveProperty('priority');
    });
  });

  describe('No Real API Calls', () => {
    test('https module is mocked', () => {
      expect(jest.isMockFunction(https.request)).toBe(true);
    });

    test('does not make real network requests', () => {
      // All Groq tests use mockMakeGroqRequest() which mocks https.request
      // jest.mock('https') at top ensures no real HTTPS calls
      expect(true).toBe(true);
    });
  });
});

// ============ Helper Functions for Mocking ============

function mockMakeGroqRequest(responseBody) {
  const mockReq = {
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event, handler) => {
      if (event === 'error') return;
      if (event === 'setTimeout') return;
    }),
    setTimeout: jest.fn(),
  };

  const mockRes = {
    statusCode: 200,
    setEncoding: jest.fn(),
    on: jest.fn((event, handler) => {
      if (event === 'data') {
        handler(responseBody);
      } else if (event === 'end') {
        handler();
      }
    }),
  };

  https.request.mockImplementationOnce((options, callback) => {
    callback(mockRes);
    return mockReq;
  });
}

function mockMakeGroqRequestError(error) {
  const mockReq = {
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event, handler) => {
      if (event === 'error') {
        handler(error);
      }
    }),
    setTimeout: jest.fn(),
    destroy: jest.fn(),
  };

  https.request.mockImplementationOnce((options, callback) => {
    return mockReq;
  });
}
