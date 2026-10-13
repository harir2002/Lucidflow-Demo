const API_BASE = 'http://localhost:4500/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  /** Cached Ollama status from backend — does not probe Ollama. */
  getSystemStatus: () => request('/system/status'),
  /** Manual readiness probe: GET /api/version + GET /api/tags on the Ollama host. */
  testOllamaConnection: () => request('/system/ollama/test', { method: 'POST' }),

  createScan: (targetUrl, urlPattern) =>
    request('/scans', { method: 'POST', body: JSON.stringify({ target_url: targetUrl, url_pattern: urlPattern }) }),

  listScans: () => request('/scans'),
  getScan: (id) => request(`/scans/${id}`),
  getPages: (id, severity) => request(`/scans/${id}/pages${severity && severity !== 'ALL' ? `?severity=${severity}` : ''}`),
  getManualReview: (id) => request(`/scans/${id}/manual-review`),
  addManualFinding: (id, finding) => request(`/scans/${id}/manual-findings`, { method: 'POST', body: JSON.stringify(finding) }),

  pauseScan: (id) => request(`/scans/${id}/pause`, { method: 'POST' }),
  resumeScan: (id) => request(`/scans/${id}/resume`, { method: 'POST' }),
  cancelScan: (id) => request(`/scans/${id}/cancel`, { method: 'POST' }),
  restartScan: (id) => request(`/scans/${id}/restart`, { method: 'POST' }),

  getLicense: () => request('/license'),
  activateLicense: (key) => request('/license', { method: 'POST', body: JSON.stringify({ key }) }),
  removeLicense: () => request('/license', { method: 'DELETE' }),

  reportUrl: (id) => `${API_BASE}/report/${id}`,
  screenshotUrl: (path) => `http://localhost:4500/screenshots/${path.split('/').pop()}`,
};

export const SOCKET_URL = 'http://localhost:4500';
