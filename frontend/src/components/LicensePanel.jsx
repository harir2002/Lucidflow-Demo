import { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '../api/client';

export default function LicensePanel({ onLicenseChange }) {
  const [license, setLicense] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showInput, setShowInput] = useState(false);

  const refresh = () => api.getLicense().then(l => { setLicense(l); onLicenseChange?.(l); }).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const handleActivate = async () => {
    setError(''); setBusy(true);
    try {
      await api.activateLicense(keyInput);
      setKeyInput(''); setShowInput(false);
      refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleRemove = async () => {
    setBusy(true);
    try { await api.removeLicense(); refresh(); }
    finally { setBusy(false); }
  };

  if (!license) return null;

  return (
    <div style={{ background: 'white', border: '1px solid #D8D0C0', marginBottom: 20 }}>
      <div style={{
        padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: license.licensed ? '#E8EFE9' : '#FBF3DC',
        borderBottom: showInput ? '1px solid #D8D0C0' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {license.licensed
            ? <ShieldCheck size={17} color="#2F5A3E" />
            : <ShieldAlert size={17} color="#8A6D1F" />}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: license.licensed ? '#2F5A3E' : '#8A6D1F' }}>
              {license.licensed
                ? `Licensed to ${license.licensee}`
                : 'Trial Mode — 3 pages per scan'}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#8B8378', marginTop: 2 }}>
              {license.licensed
                ? `${license.max_pages === -1 ? 'Unlimited pages' : license.max_pages + ' pages per scan'} · expires ${license.expires} · key ${license.key_id}`
                : license.reason}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {license.licensed ? (
            <button onClick={handleRemove} disabled={busy} style={{
              padding: '7px 14px', background: 'transparent', border: '1px solid #8B8378',
              color: '#5C6B78', cursor: 'pointer', fontSize: 11.5, fontFamily: "'IBM Plex Sans', sans-serif",
            }}>
              Remove Key
            </button>
          ) : (
            <button onClick={() => setShowInput(!showInput)} style={{
              padding: '7px 14px', background: '#0B1929', border: 'none', color: '#F5F1E8',
              cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif",
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <KeyRound size={13} /> Enter License Key
            </button>
          )}
        </div>
      </div>

      {showInput && !license.licensed && (
        <div style={{ padding: 18 }}>
          {error && (
            <div style={{ background: '#F8E8E4', border: '1px solid #B8442E', color: '#8B2E1F', padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}
          <textarea
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="Paste license key here (starts with IRDAI1.)"
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #D8D0C0',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <button
            onClick={handleActivate}
            disabled={busy || !keyInput.trim()}
            style={{
              marginTop: 10, padding: '10px 20px', background: '#0B1929', color: '#F5F1E8',
              border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              fontFamily: "'IBM Plex Sans', sans-serif", opacity: (busy || !keyInput.trim()) ? 0.5 : 1,
            }}
          >
            {busy ? 'Activating...' : 'Activate License'}
          </button>
        </div>
      )}
    </div>
  );
}
