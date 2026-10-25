/**
 * Local Vision Analysis via Ollama — screenshot + DOM text sent to the model.
 * Screenshots are also kept on disk for UI/PDF reports.
 *
 * Default API: http://192.168.2.107:11434 (override with OLLAMA_HOST env).
 *
 * Uses Node http/https for /api/generate (no undici ~5min headersTimeout).
 * The 5s timeout applies ONLY to /api/tags health checks.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { PATTERNS, resolveSeverity } = require('./severity');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://192.168.2.107:11434';
const MODEL_NAME = process.env.OLLAMA_MODEL || 'gemma3:4b';
// Optional hard abort for the whole generate call (0 = wait until Ollama finishes).
const GENERATE_TIMEOUT_MS = parseInt(process.env.OLLAMA_GENERATE_TIMEOUT_MS || '0', 10);
// Health check only — does NOT apply to /api/generate.
const TAGS_TIMEOUT_MS = parseInt(process.env.OLLAMA_TAGS_TIMEOUT_MS || '5000', 10);

function formatFetchError(err) {
  const cause = err?.cause;
  const parts = [err?.message || String(err)];
  if (err?.code) parts.push(err.code);
  if (cause) {
    parts.push(cause.code || cause.name || 'cause');
    if (cause.message) parts.push(cause.message);
  }
  if (err?.name === 'AbortError' || cause?.name === 'AbortError') {
    parts.push(`aborted after ${GENERATE_TIMEOUT_MS || TAGS_TIMEOUT_MS}ms`);
  }
  return parts.filter(Boolean).join(' | ');
}

function buildAnalysisPrompt(url, title, domSignals) {
  const preChecked = domSignals?.preChecked?.length
    ? domSignals.preChecked.map(c => c.label || c.name || '?').join('; ')
    : 'none';
  const patterns = PATTERNS.map(p => `${p.id}:${p.name}`).join(' | ');
  const badges = (domSignals?.badges || []).slice(0, 8).join(', ') || 'none';
  const prices = (domSignals?.priceEls || []).slice(0, 5).join(' | ') || 'none';
  const buttons = (domSignals?.buttons || []).slice(0, 10).join(', ') || 'none';
  const body = (domSignals?.bodyText || '').slice(0, 800);

  return `IRDAI dark-pattern auditor. MODE: vision (screenshot + DOM). Infer dark patterns from the page screenshot and DOM evidence. Reply ONLY with JSON.

PAGE: ${url}
TITLE: ${title || 'Unknown'}
DOM: prechecked=[${preChecked}]; timers=${domSignals?.timers || 0}; modals=${domSignals?.popups || 0}; forms=${domSignals?.forms || 0}; badges=[${badges}]; prices=[${prices}]; buttons=[${buttons}]; text=${body}

PATTERNS: ${patterns}
SEVERITY: HIGH=price deception / pre-ticked paid add-on / guilt opt-out / no online cancel. MEDIUM=OTP-before-quote, many modals, bundled consent. LOW=mild UX issues.

JSON only:
{"overall_risk":"HIGH|MEDIUM|LOW|CLEAN","summary":"one sentence","patterns_found":[{"pattern_id":2,"pattern_name":"Basket Sneaking","severity":"HIGH","evidence":"what you see","location":"where"}],"clean_patterns":[1,3],"recommendations":["fix 1"]}`;
}

/**
 * POST /api/generate via http(s) with socket timeout disabled.
 * Sends prompt + screenshot base64 in Ollama `images` array (multimodal).
 */
function postGenerate(prompt, base64Image) {
  const payload = JSON.stringify({
    model: MODEL_NAME,
    prompt,
    images: [base64Image],
    stream: true,
    format: 'json',
    keep_alive: '30m',
    options: {
      temperature: 0.1,
      num_predict: 1024,
      num_ctx: 4096,
    },
  });

  const endpoint = new URL('/api/generate', OLLAMA_HOST);
  const transport = endpoint.protocol === 'https:' ? https : http;
  const started = Date.now();
  const bodyBytes = Buffer.byteLength(payload);

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        path: endpoint.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBytes,
          Connection: 'keep-alive',
        },
        timeout: 0,
      },
      (res) => {
        console.log(`[ollama] generate headers received after ${Date.now() - started}ms status=${res.statusCode}`);

        if (res.statusCode < 200 || res.statusCode >= 300) {
          let errBody = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { errBody += c; });
          res.on('end', () => {
            reject(new Error(`Ollama request failed (${res.statusCode}): ${errBody.slice(0, 240)}`));
          });
          return;
        }

        let out = '';
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buf += chunk;
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            try {
              const obj = JSON.parse(t);
              if (obj.response) out += obj.response;
              if (obj.error) {
                res.destroy();
                reject(new Error(String(obj.error)));
                return;
              }
            } catch {
              /* ignore partial JSON lines */
            }
          }
        });
        res.on('end', () => {
          if (buf.trim()) {
            try {
              const obj = JSON.parse(buf.trim());
              if (obj.response) out += obj.response;
              if (obj.error) {
                reject(new Error(String(obj.error)));
                return;
              }
            } catch { /* ignore */ }
          }
          if (!out.trim()) {
            reject(new Error('Ollama returned empty response'));
            return;
          }
          console.log(`[ollama] generate OK chars=${out.length} mode=vision elapsed_ms=${Date.now() - started}`);
          resolve(out);
        });
        res.on('error', (err) => {
          reject(new Error(`Ollama generate stream failed after ${Date.now() - started}ms: ${formatFetchError(err)}`));
        });
      }
    );

    // Disable idle socket timeout — vision prefill can take many minutes with no bytes.
    req.setTimeout(0);
    if (req.socket) req.socket.setTimeout(0);

    req.on('socket', (socket) => {
      socket.setTimeout(0);
      socket.setKeepAlive(true, 30_000);
    });

    let hardTimer = null;
    if (GENERATE_TIMEOUT_MS > 0) {
      hardTimer = setTimeout(() => {
        req.destroy(new Error(`aborted after ${GENERATE_TIMEOUT_MS}ms`));
      }, GENERATE_TIMEOUT_MS);
    }

    const clearHard = () => { if (hardTimer) clearTimeout(hardTimer); };

    req.on('error', (err) => {
      clearHard();
      reject(new Error(`Ollama generate failed after ${Date.now() - started}ms: ${formatFetchError(err)}`));
    });
    req.on('close', clearHard);

    console.log(`[ollama] POST /api/generate mode=vision prompt_chars=${prompt.length} body_bytes=${bodyBytes} (http, no socket timeout)`);
    req.write(payload);
    req.end();
  });
}

async function callOllama(prompt, base64Image) {
  return postGenerate(prompt, base64Image);
}

async function checkOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(TAGS_TIMEOUT_MS) });
    if (!res.ok) return { available: false, reason: `Ollama returned ${res.status}` };
    const data = await res.json();
    const hasModel = data.models?.some(m => m.name === MODEL_NAME || m.name.startsWith(MODEL_NAME.split(':')[0]));
    if (!hasModel) {
      return { available: false, reason: `Model ${MODEL_NAME} not found. Run: ollama pull ${MODEL_NAME}` };
    }
    return { available: true, reason: `Ready at ${OLLAMA_HOST}; model ${MODEL_NAME} present (vision analysis)` };
  } catch (err) {
    return { available: false, reason: `Cannot reach Ollama at ${OLLAMA_HOST}. Is it running on the LAN host? (${formatFetchError(err)})` };
  }
}

function parseModelJson(raw) {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return {
      overall_risk: 'UNKNOWN', summary: 'Could not parse model response as JSON',
      patterns_found: [], clean_patterns: [], recommendations: [], raw_response: raw,
    };
  }
}

function finalizeAnalysis(analysis, url, title) {
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
  return {
    page_url: url,
    page_title: title,
    overall_risk: analysis.overall_risk || 'UNKNOWN',
    summary: analysis.summary || '',
    patterns_found: analysis.patterns_found || [],
    clean_patterns: analysis.clean_patterns || [],
    recommendations: analysis.recommendations || [],
  };
}

async function analyzePage(pageData) {
  const { url, title, screenshotPath, domSignals } = pageData;

  if (!screenshotPath || !fs.existsSync(screenshotPath)) {
    console.error(`[ollama] screenshot missing — cannot run vision analysis: ${screenshotPath || '(none)'}`);
    return {
      page_url: url, page_title: title, overall_risk: 'ERROR',
      summary: 'Screenshot missing — vision analysis requires a page image',
      patterns_found: [], recommendations: [],
    };
  }

  const base64Image = fs.readFileSync(screenshotPath).toString('base64');
  console.log(`[ollama] screenshot loaded for vision (${Math.round(base64Image.length / 1024)} KB base64): ${screenshotPath}`);

  try {
    const raw = await callOllama(buildAnalysisPrompt(url, title, domSignals), base64Image);
    const analysis = parseModelJson(raw);
    return finalizeAnalysis(analysis, url, title);
  } catch (err) {
    console.error(`[ollama] analyzePage error: ${err.message}`);
    return {
      page_url: url, page_title: title, overall_risk: 'ERROR',
      summary: `Local model error: ${err.message}`, patterns_found: [], recommendations: [],
    };
  }
}

/**
 * Analyze page with specified provider (Ollama or Groq).
 * provider: "ollama" | "groq"
 * If provider="ollama": uses analyzePage() (screenshot + DOM)
 * If provider="groq": extracts text evidence from DOM and calls Groq candidateDetection()
 * If Groq fails: falls back to Ollama
 */
async function analyzePageWithProvider(pageData, provider = 'ollama') {
  const { url, title, domSignals } = pageData;

  if (provider === 'groq') {
    try {
      const groq = require('./groq');
      
      // Extract text evidence from DOM signals
      const textEvidence = extractTextEvidence(url, title, domSignals);
      console.log(`[vision] Using Groq (text-only) for: ${url}`);
      
      const analysis = await groq.candidateDetection(textEvidence);
      return finalizeAnalysis(analysis, url, title);
    } catch (err) {
      console.warn(`[vision] Groq provider failed, falling back to Ollama: ${err.message}`);
      // Fallback to Ollama
      return analyzePage(pageData);
    }
  }

  // Default: Ollama vision (screenshot + DOM)
  return analyzePage(pageData);
}

/**
 * Extract text evidence from DOM signals for Groq analysis.
 * Groq is text-only, so we don't send screenshot — only text signals.
 */
function extractTextEvidence(url, title, domSignals = {}) {
  const signals = domSignals || {};
  const parts = [];
  
  parts.push(`Page: ${url}`);
  if (title) parts.push(`Title: ${title}`);
  
  if (signals.preChecked?.length) {
    const checked = signals.preChecked
      .map(c => c.label || c.name || '?')
      .join('; ');
    parts.push(`Pre-checked items: ${checked}`);
  }
  
  if (signals.badges?.length) {
    parts.push(`Badges/Labels: ${signals.badges.slice(0, 8).join(', ')}`);
  }
  
  if (signals.priceEls?.length) {
    parts.push(`Prices shown: ${signals.priceEls.slice(0, 5).join(' | ')}`);
  }
  
  if (signals.buttons?.length) {
    parts.push(`Buttons: ${signals.buttons.slice(0, 10).join(', ')}`);
  }
  
  if (signals.timers) {
    parts.push(`Countdown timers detected: ${signals.timers}`);
  }
  
  if (signals.popups) {
    parts.push(`Modal popups: ${signals.popups}`);
  }
  
  if (signals.forms) {
    parts.push(`Form fields: ${signals.forms}`);
  }
  
  if (signals.bodyText) {
    const text = signals.bodyText.slice(0, 800);
    parts.push(`Page text: ${text}`);
  }
  
  return parts.join('\n');
}

module.exports = { 
  analyzePage, 
  analyzePageWithProvider,
  extractTextEvidence,
  checkOllamaAvailable, 
  MODEL_NAME, 
  OLLAMA_HOST 
};
