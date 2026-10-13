import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { api, SOCKET_URL } from './api/client';
import NewScan from './pages/NewScan';
import ScanConsole from './pages/ScanConsole';
import ReportDashboard from './pages/ReportDashboard';
import SystemStatus from './components/SystemStatus';

export default function App() {
  const [view, setView] = useState('new-scan'); // new-scan | console | report
  const [activeScanId, setActiveScanId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);

  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);
    return () => s.close();
  }, []);

  useEffect(() => {
    api.getSystemStatus().then(setSystemStatus).catch(() => setSystemStatus({ backend: 'unreachable' }));
    const interval = setInterval(() => {
      api.getSystemStatus().then(setSystemStatus).catch(() => setSystemStatus({ backend: 'unreachable' }));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleScanCreated = (scanId) => {
    setActiveScanId(scanId);
    setView('console');
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#F5F1E8',
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", color: '#0B1929',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: #B8442E; color: white; }
      `}</style>

      <header style={{ background: '#0B1929', borderBottom: '3px double #C9A961', padding: '18px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setView('new-scan')}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', border: '2px solid #C9A961',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Source Serif 4', serif", fontWeight: 700, fontSize: 15, color: '#C9A961',
            }}>IS</div>
            <div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 19, fontWeight: 700, color: '#F5F1E8' }}>
                Dark Pattern Compliance Scanner
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#8B9BAA', letterSpacing: '0.08em', marginTop: 2 }}>
                FULLY LOCAL · CCPA 2023 · IRDAI DIRECTIVE 02-APR-2026
              </div>
            </div>
          </div>
          <SystemStatus status={systemStatus} />
        </div>
      </header>

      {view !== 'new-scan' && (
        <div style={{ background: '#0B1929', borderBottom: '1px solid #1E3348' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', padding: '0 32px' }}>
            {[
              { id: 'console', label: 'Scan Console' },
              { id: 'report', label: 'Report Dashboard' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                style={{
                  padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 500,
                  color: view === tab.id ? '#F5F1E8' : '#5C7285',
                  borderBottom: view === tab.id ? '2px solid #C9A961' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => setView('new-scan')}
              style={{
                padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 500,
                color: '#5C7285', marginLeft: 'auto',
              }}
            >
              + New Scan
            </button>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>
        {view === 'new-scan' && <NewScan onScanCreated={handleScanCreated} systemStatus={systemStatus} />}
        {view === 'console' && activeScanId && <ScanConsole scanId={activeScanId} socket={socket} onViewReport={() => setView('report')} />}
        {view === 'report' && activeScanId && <ReportDashboard scanId={activeScanId} />}
      </main>
    </div>
  );
}
