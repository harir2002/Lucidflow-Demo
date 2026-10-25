/**
 * Groq AI Provider — Text-only candidate detection for dark patterns.
 * No vision/images — text analysis only using Groq API.
 * Default model: qwen/qwen3.8-27b (override with GROQ_MODEL env)
 */

const https = require('https');
const { URL } = require('url');
const { PATTERNS, resolveSeverity } = require('./severity');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const GROQ_HOST = 'https://api.groq.com/openai/v1/chat/completions';

// Retry constants
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function formatFetchError(err) {
  const cause = err?.cause;
  const parts = [err?.message || String(err)];
  if (err?.code) parts.push(err.code);
  if (cause) {
    parts.push(cause.code || cause.name || 'cause');
    if (cause.message) parts.push(cause.message);
  }
  return parts.filter(Boolean).join(' | ');
}

async function checkGroqAvailable() {
  if (!GROQ_API_KEY) {
    return { available: false, reason: 'GROQ_API_KEY not set' };
  }
  try {
    // Try a simple text completion to verify API key and service availability
    const response = await makeGroqRequest(
      'Respond with "OK".',
      1000,
      0
    );
    return { available: true, reason: `Groq ready (${GROQ_MODEL})` };
  } catch (err) {
    return { available: false, reason: `Groq unreachable: ${formatFetchError(err)}` };
  }
}

/**
 * Make HTTP request to Groq API with retry logic.
 */
function makeGroqRequest(userMessage, maxTokens = 1024, temperature = 0.1, retryCount = 0) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) {
      return reject(new Error('GROQ_API_KEY not configured'));
    }

    const payload = JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: maxTokens,
      temperature,
      response_format: { type: 'json_object' },
    });

    const bodyBytes = Buffer.byteLength(payload);
    const endpoint = new URL(GROQ_HOST);
    const started = Date.now();

    const req = https.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        path: endpoint.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBytes,
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'User-Agent': 'IRDAI-Groq-Scanner/1.0',
        },
        timeout: 30000,
      },
      (res) => {
        console.log(`[groq] POST /chat/completions status=${res.statusCode} after ${Date.now() - started}ms`);

        if (res.statusCode < 200 || res.statusCode >= 300) {
          let errBody = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { errBody += c; });
          res.on('end', () => {
            // Retry on 429 (rate limit), 500+ (server error)
            if ((res.statusCode === 429 || res.statusCode >= 500) && retryCount < MAX_RETRIES) {
              console.log(`[groq] Transient error ${res.statusCode}; retrying (${retryCount + 1}/${MAX_RETRIES})`);
              setTimeout(() => {
                makeGroqRequest(userMessage, maxTokens, temperature, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, RETRY_DELAY_MS * (retryCount + 1));
              return;
            }
            reject(new Error(`Groq API error (${res.statusCode}): ${errBody.slice(0, 240)}`));
          });
          return;
        }

        let out = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          out += chunk;
        });
        res.on('end', () => {
          if (!out.trim()) {
            reject(new Error('Groq returned empty response'));
            return;
          }
          console.log(`[groq] response OK chars=${out.length} elapsed_ms=${Date.now() - started}`);
          resolve(out);
        });
        res.on('error', (err) => {
          reject(new Error(`Groq response stream failed after ${Date.now() - started}ms: ${formatFetchError(err)}`));
        });
      }
    );

    req.on('error', (err) => {
      // Retry on network errors
      if (retryCount < MAX_RETRIES) {
        console.log(`[groq] Network error; retrying (${retryCount + 1}/${MAX_RETRIES}): ${formatFetchError(err)}`);
        setTimeout(() => {
          makeGroqRequest(userMessage, maxTokens, temperature, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, RETRY_DELAY_MS * (retryCount + 1));
        return;
      }
      reject(new Error(`Groq request failed after ${Date.now() - started}ms: ${formatFetchError(err)}`));
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error('Groq request timeout'));
    });

    console.log(`[groq] POST /chat/completions model=${GROQ_MODEL} prompt_chars=${userMessage.length} body_bytes=${bodyBytes}`);
    req.write(payload);
    req.end();
  });
}

function buildCandidateDetectionPrompt(evidenceText) {
  const patterns = PATTERNS.map(p => `${p.id}:${p.name}`).join(' | ');

  return `You are an IRDAI dark-pattern auditor. Analyze the following text evidence for dark patterns in insurance products.

TEXT EVIDENCE:
${evidenceText}

PATTERNS TO DETECT: ${patterns}

SEVERITY RULES:
- HIGH: Direct regulatory violation. Misleads on price, coverage, or legal obligation.
- MEDIUM: Significant UX manipulation. Coerces or pressures consumer.
- LOW: Design concern or minor non-conformance.

INSURANCE-SPECIFIC HIGH SEVERITY (always HIGH regardless of context):
  1. Price shown excludes mandatory PA cover (Motor Vehicles Act) without immediate adjacent disclosure
  2. Price shown excludes GST (18%) without "+ GST" label immediately adjacent to the price
  3. Any checkbox pre-ticked for a paid add-on at checkout
  4. Opt-out button forces user to "agree" to self-incriminating statement
  5. Policy cancellation only via phone/branch — no online option
  6. Grievance redressal link absent from product/checkout pages

Reply ONLY with valid JSON:
{
  "overall_risk": "HIGH|MEDIUM|LOW|CLEAN",
  "summary": "One sentence summary of findings",
  "patterns_found": [
    {
      "pattern_id": <number>,
      "pattern_name": "<pattern name>",
      "severity": "HIGH|MEDIUM|LOW",
      "evidence": "Relevant text excerpt"
    }
  ],
  "clean_patterns": [<pattern ids not found>],
  "recommendations": ["Fix recommendation 1", "Fix recommendation 2"]
}`;
}

/**
 * Analyze text evidence for dark patterns.
 * Function: candidateDetection(evidenceText) → Promise<findings>
 */
async function candidateDetection(evidenceText) {
  if (!evidenceText || typeof evidenceText !== 'string') {
    return {
      overall_risk: 'ERROR',
      summary: 'No text evidence provided',
      patterns_found: [],
      clean_patterns: [],
      recommendations: [],
      error: 'Invalid input: evidenceText must be a non-empty string',
    };
  }

  // Truncate evidence if too long (API limits)
  const truncatedEvidence = evidenceText.slice(0, 8000);

  try {
    const prompt = buildCandidateDetectionPrompt(truncatedEvidence);
    const response = await makeGroqRequest(prompt, 1500, 0.1);
    const analysis = parseGroqJson(response);

    // Re-apply severity resolution based on evidence
    if (analysis.patterns_found) {
      analysis.patterns_found = analysis.patterns_found.map(p => ({
        ...p,
        severity: resolveSeverity(p.pattern_id, p.evidence, p.severity),
      }));
      const sevs = analysis.patterns_found.map(p => p.severity);
      if (sevs.includes('HIGH')) analysis.overall_risk = 'HIGH';
      else if (sevs.includes('MEDIUM')) analysis.overall_risk = 'MEDIUM';
      else if (sevs.includes('LOW')) analysis.overall_risk = 'LOW';
      else if (analysis.patterns_found.length === 0) analysis.overall_risk = 'CLEAN';
    }

    return analysis;
  } catch (err) {
    console.error(`[groq] candidateDetection error: ${err.message}`);
    return {
      overall_risk: 'ERROR',
      summary: `Groq analysis failed: ${err.message}`,
      patterns_found: [],
      clean_patterns: [],
      recommendations: [],
      error: err.message,
    };
  }
}

/**
 * Generate remediation plan for a finding.
 * Function: generateRemediation(finding) → Promise<capActions>
 */
async function generateRemediation(finding) {
  if (!finding || typeof finding !== 'object') {
    return {
      actions: [],
      error: 'Invalid finding object',
    };
  }

  const { pattern_id, pattern_name, severity, evidence } = finding;

  // Time-bounded remediation by severity
  const timeframe = severity === 'HIGH' ? '30 days' : severity === 'MEDIUM' ? '60 days' : '90 days';

  const remediationPrompt = `You are a compliance remediation expert. Generate 3-4 specific corrective action plan (CAP) items for the following dark pattern finding.

PATTERN: ${pattern_name} (ID: ${pattern_id})
SEVERITY: ${severity}
EVIDENCE: ${evidence}
TIMEFRAME: ${timeframe}

Generate actionable, specific remediation steps. Reply ONLY with valid JSON:
{
  "pattern_id": ${pattern_id},
  "pattern_name": "${pattern_name}",
  "severity": "${severity}",
  "timeframe": "${timeframe}",
  "actions": [
    {
      "action": "Specific remediation step 1",
      "description": "How to implement this fix",
      "owner": "Team or role responsible",
      "priority": "High|Medium|Low"
    }
  ]
}`;

  try {
    const response = await makeGroqRequest(remediationPrompt, 1200, 0.2);
    const remediation = parseGroqJson(response);
    return remediation;
  } catch (err) {
    console.error(`[groq] generateRemediation error: ${err.message}`);
    return {
      pattern_id,
      pattern_name,
      severity,
      actions: [],
      error: err.message,
    };
  }
}

function parseGroqJson(raw) {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    return {
      overall_risk: 'UNKNOWN',
      summary: 'Could not parse Groq response as JSON',
      patterns_found: [],
      clean_patterns: [],
      recommendations: [],
      raw_response: raw.slice(0, 500),
    };
  }
}

// Mock data for testing
const MOCK_FINDINGS = {
  overall_risk: 'HIGH',
  summary: 'Multiple dark patterns detected on the insurance product page.',
  patterns_found: [
    {
      pattern_id: 2,
      pattern_name: 'Basket Sneaking',
      severity: 'HIGH',
      evidence: 'PA cover was pre-checked at checkout',
    },
    {
      pattern_id: 7,
      pattern_name: 'Drip Pricing',
      severity: 'MEDIUM',
      evidence: 'GST (18%) shown only at final payment step',
    },
  ],
  clean_patterns: [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13],
  recommendations: [
    'Disable pre-ticked checkboxes for paid add-ons at checkout',
    'Show GST clearly adjacent to base price at all stages',
    'Add grievance redressal link on product pages',
  ],
};

const MOCK_REMEDIATION = {
  pattern_id: 2,
  pattern_name: 'Basket Sneaking',
  severity: 'HIGH',
  timeframe: '30 days',
  actions: [
    {
      action: 'Disable pre-ticked PA cover checkbox',
      description: 'Update checkout form to set checked=false for PA add-on by default',
      owner: 'Frontend Team',
      priority: 'High',
    },
    {
      action: 'Add clear PA cost disclosure',
      description: 'Display PA premium amount in checkout summary before final confirmation',
      owner: 'Product Team',
      priority: 'High',
    },
    {
      action: 'Test and verify user journey',
      description: 'QA to verify PA add-on is truly optional and cancellation is smooth',
      owner: 'QA Team',
      priority: 'High',
    },
  ],
};

module.exports = {
  MODEL_NAME: GROQ_MODEL,
  GROQ_HOST,
  checkGroqAvailable,
  candidateDetection,
  generateRemediation,
  // Internal for testing
  makeGroqRequest,
  parseGroqJson,
  buildCandidateDetectionPrompt,
  // Mock data
  MOCK_FINDINGS,
  MOCK_REMEDIATION,
};
