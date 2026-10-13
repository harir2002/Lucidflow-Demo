import { useState } from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import LicensePanel from '../components/LicensePanel';

export default function NewScan({ onScanCreated, systemStatus }) {
  const [targetUrl, setTargetUrl] = useState('https://www.royalsundaram.in');
  const [urlPattern, setUrlPattern] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [license, setLicense] = useState(null);

  const isReady = systemStatus?.backend === 'ok' && systemStatus?.ollama_available;

  const handleStart = async () => {
    setError('');
    setStarting(true);
    try {
      const scan = await api.createScan(targetUrl, urlPattern || null);
      onScanCreated(scan.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '60px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          Start a New Compliance Scan
        </div>
        <div style={{ fontSize: 13, color: '#5C7285' }}>
          Runs entirely on this machine — no data leaves your network.
        </div>
      </div>

      {!isReady && systemStatus && (
        <div style={{
          background: '#FBF3DC', border: '1px solid #C99A2E', padding: '14px 18px',
          display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-start',
        }}>
          <AlertTriangle size={18} color="#8A6D1F" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#8A6D1F', marginBottom: 4 }}>
              Local AI model not ready
            </div>
            <div style={{ fontSize: 12.5, color: '#78350F', lineHeight: 1.5 }}>
              {systemStatus.backend !== 'ok'
                ? 'Backend server is not reachable. Make sure you ran "npm start" in the backend folder.'
                : systemStatus.ollama_message}
            </div>
          </div>
        </div>
      )}

      <LicensePanel onLicenseChange={setLicense} />

      <div style={{ background: 'white', border: '1px solid #D8D0C0', padding: 28 }}>
        {error && (
          <div style={{ background: '#F8E8E4', border: '1px solid #B8442E', color: '#8B2E1F', padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#8B8378', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
          TARGET URL
        </label>
        <input
          value={targetUrl}
          onChange={e => setTargetUrl(e.target.value)}
          placeholder="https://www.example.com"
          style={{
            width: '100%', padding: '11px 14px', border: '1px solid #D8D0C0',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, marginBottom: 18, boxSizing: 'border-box',
          }}
        />

        <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#8B8378', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
          URL PATTERN (OPTIONAL — LEAVE BLANK FOR FULL SITE)
        </label>
        <input
          value={urlPattern}
          onChange={e => setUrlPattern(e.target.value)}
          placeholder="example.com/car-insurance/*"
          style={{
            width: '100%', padding: '11px 14px', border: '1px solid #D8D0C0',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, marginBottom: 24, boxSizing: 'border-box',
          }}
        />

        <button
          onClick={handleStart}
          disabled={starting || !targetUrl}
          style={{
            width: '100%', padding: '14px', background: '#0B1929', color: '#F5F1E8',
            border: 'none', cursor: starting ? 'default' : 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: starting ? 0.6 : 1,
          }}
        >
          <Play size={16} /> {starting ? 'Starting...' : (license && !license.licensed ? 'Start Trial Scan (3 pages)' : 'Start Scan')}
        </button>
      </div>

      <div style={{ marginTop: 20, fontSize: 11.5, color: '#8B8378', textAlign: 'center', lineHeight: 1.6 }}>
        Scans run in your local browser session via Playwright + a locally-hosted<br />
        Gemma 3 vision model through Ollama. No screenshots or page content are sent<br />
        to any external server.
      </div>
    </div>
  );
}
