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
    <div style={{ background: '#000000', border: '1px solid #333333', marginBottom: 20, borderRadius: 3 }}>
      <div style={{
        padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: license.licensed ? '#0a2a1f' : '#1a0000',
        borderBottom: showInput ? '1px solid #333333' : 'none',
        borderRadius: '3px 3px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {license.licensed
            ? <ShieldCheck size={17} color="#00cc00" />
            : <ShieldAlert size={17} color="#e7000b" />}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: license.licensed ? '#00cc00' : '#ff6666' }}>
              {license.licensed
                ? `Licensed to ${license.licensee}`
                : 'Trial Mode — 3 pages per scan'}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#999999', marginTop: 2 }}>
              {license.licensed
                ? `${license.max_pages === -1 ? 'Unlimited pages' : license.max_pages + ' pages per scan'} · expires ${license.expires} · key ${license.key_id}`
                : license.reason}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {license.licensed ? (
            <button onClick={handleRemove} disabled={busy} style={{
              padding: '7px 14px', background: 'transparent', border: '1px solid #666666',
              color: '#cccccc', cursor: 'pointer', fontSize: 11.5, fontFamily: "'IBM Plex Sans', sans-serif",
              borderRadius: 3,
            }}>
              Remove Key
            </button>
          ) : (
            <button onClick={() => setShowInput(!showInput)} style={{
              padding: '7px 14px', background: '#e7000b', border: 'none', color: '#ffffff',
              cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif",
              display: 'flex', alignItems: 'center', gap: 6,
              borderRadius: 3,
            }}>
              <KeyRound size={13} /> Enter License Key
            </button>
          )}
        </div>
      </div>

      {showInput && !license.licensed && (
        <div style={{ padding: 18 }}>
          {error && (
            <div style={{ background: '#1a0000', border: '1px solid #e7000b', color: '#ff6666', padding: '8px 12px', fontSize: 12, marginBottom: 12, borderRadius: 3 }}>
              {error}
            </div>
          )}
          <textarea
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="Paste license key here (starts with IRDAI1.)"
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #333333',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, boxSizing: 'border-box',
              resize: 'vertical',
              background: '#000000', color: '#ffffff', borderRadius: 3,
            }}
          />
          <button
            onClick={handleActivate}
            disabled={busy || !keyInput.trim()}
            style={{
              marginTop: 10, padding: '10px 20px', background: busy || !keyInput.trim() ? '#666666' : '#e7000b', color: '#ffffff',
              border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              fontFamily: "'IBM Plex Sans', sans-serif", opacity: (busy || !keyInput.trim()) ? 0.6 : 1,
              borderRadius: 3,
            }}
          >
            {busy ? 'Activating...' : 'Activate License'}
          </button>
        </div>
      )}
    </div>
  );
}
