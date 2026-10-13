import { useState, useEffect, useRef } from 'react';
import { Play, Pause, FileText, ChevronRight, Clock, Download } from 'lucide-react';
import { api } from '../api/client';

export default function ScanConsole({ scanId, socket, onViewReport }) {
  const [scan, setScan] = useState(null);
  const [logs, setLogs] = useState([]);
  const [recentPages, setRecentPages] = useState([]);
  const [manualCount, setManualCount] = useState(0);
  const [licenseLimited, setLicenseLimited] = useState(null);
  const logEndRef = useRef(null);

  const refreshScan = () => api.getScan(scanId).then(setScan).catch(() => {});

  useEffect(() => { refreshScan(); }, [scanId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('subscribe', scanId);

    const onLog = (data) => setLogs(prev => [...prev.slice(-60), data.message]);
    const onDiscovered = () => refreshScan();
    const onPageDone = (data) => {
      setRecentPages(prev => [data, ...prev.slice(0, 9)]);
      refreshScan();
    };
    const onComplete = () => refreshScan();
    const onPaused = () => refreshScan();
    const onError = (data) => { setLogs(prev => [...prev, `ERROR: ${data.message}`]); refreshScan(); };
    const onLicenseLimited = (data) => setLicenseLimited(data);

    socket.on('scan:log', onLog);
    socket.on('scan:discovered', onDiscovered);
    socket.on('scan:page-done', onPageDone);
    socket.on('scan:complete', onComplete);
    socket.on('scan:paused', onPaused);
    socket.on('scan:error', onError);
    socket.on('scan:license-limited', onLicenseLimited);

    return () => {
      socket.emit('unsubscribe', scanId);
      socket.off('scan:log', onLog);
      socket.off('scan:discovered', onDiscovered);
      socket.off('scan:page-done', onPageDone);
      socket.off('scan:complete', onComplete);
      socket.off('scan:paused', onPaused);
      socket.off('scan:error', onError);
      socket.off('scan:license-limited', onLicenseLimited);
    };
  }, [socket, scanId]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  useEffect(() => {
    api.getManualReview(scanId).then(items => setManualCount(items.filter(i => i.status === 'pending').length)).catch(() => {});
  }, [scanId, scan?.scanned_pages]);

  if (!scan) return <div style={{ textAlign: 'center', padding: 80, color: '#8B8378' }}>Loading scan...</div>;

  const progress = scan.total_pages > 0 ? Math.round((scan.scanned_pages / scan.total_pages) * 100) : 0;
  const riskCounts = scan.risk_counts || {};

  const severityStyle = {
    HIGH:   { bg: '#F8E8E4', text: '#8B2E1F', border: '#B8442E' },
    MEDIUM: { bg: '#FBF3DC', text: '#8A6D1F', border: '#C99A2E' },
    LOW:    { bg: '#E8EFE9', text: '#2F5A3E', border: '#4A7C59' },
    ERROR:  { bg: '#F1F5F9', text: '#64748B', border: '#94A3B8' },
    CLEAN:  { bg: '#E8EFE9', text: '#2F5A3E', border: '#4A7C59' },
  };

  const handlePauseResume = async () => {
    if (scan.status === 'scanning') await api.pauseScan(scanId);
    else if (scan.status === 'paused') await api.restartScan(scanId);
    refreshScan();
  };

  return (
    <>
      {licenseLimited && (
        <div style={{
          background: '#FBF3DC', border: '1px solid #C99A2E', padding: '12px 18px',
          marginBottom: 20, fontSize: 12.5, color: '#78350F',
        }}>
          <strong style={{ color: '#8A6D1F' }}>
            {licenseLimited.trial ? 'TRIAL MODE' : 'LICENSE CAP'}
          </strong>
          {' — '}scanning {licenseLimited.limit} of {licenseLimited.discovered} discovered pages.
          {licenseLimited.trial && ' Install a license key on the New Scan page to unlock more.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#0B1929', marginBottom: 28 }}>
        {[
          { label: 'DISCOVERED', value: scan.total_pages },
          { label: 'SCANNED', value: scan.scanned_pages },
          { label: 'HIGH RISK', value: riskCounts.HIGH || 0, color: '#B8442E' },
          { label: 'MEDIUM RISK', value: riskCounts.MEDIUM || 0, color: '#C99A2E' },
          { label: 'CLEAN', value: riskCounts.CLEAN || 0, color: '#4A7C59' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#F5F1E8', padding: '16px 18px' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#8B8378', letterSpacing: '0.1em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 28, fontWeight: 700, color: s.color || '#0B1929' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        <div style={{ background: 'white', border: '1px solid #D8D0C0' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #D8D0C0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#EFE9DB' }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, letterSpacing: '0.06em', fontWeight: 500 }}>
              {scan.status === 'scanning' && '▸ SCANNING'}
              {scan.status === 'paused' && '▸ PAUSED'}
              {scan.status === 'complete' && '▸ COMPLETE'}
              {scan.status === 'error' && '▸ ERROR'}
              {scan.status === 'discovering' && '▸ DISCOVERING PAGES'}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#8B8378' }}>{progress}%</span>
          </div>

          <div style={{ padding: 24 }}>
            <div style={{ height: 6, background: '#EFE9DB', marginBottom: 20 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#0B1929', transition: 'width 0.3s' }} />
            </div>

            <div style={{
              background: '#0B1929', color: '#8FD19E', fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11, padding: 16, height: 220, overflowY: 'auto', lineHeight: 1.7,
            }}>
              {logs.length === 0 && <div style={{ color: '#5C7285' }}>Waiting for scan activity...</div>}
              {logs.map((log, i) => (
                <div key={i} style={{ color: log.startsWith('ERROR') ? '#F87171' : undefined }}>{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={handlePauseResume}
                disabled={scan.status === 'complete' || scan.status === 'discovering'}
                style={{
                  flex: 1, padding: '12px', background: '#0B1929', color: '#F5F1E8', border: 'none',
                  cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: (scan.status === 'complete' || scan.status === 'discovering') ? 0.5 : 1,
                }}
              >
                {scan.status === 'scanning' ? <Pause size={15} /> : <Play size={15} />}
                {scan.status === 'scanning' ? 'PAUSE SCAN' : 'RESUME SCAN'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #D8D0C0' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #D8D0C0', background: '#EFE9DB' }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, letterSpacing: '0.06em', fontWeight: 500 }}>
              ▸ LATEST FINDINGS
            </span>
          </div>
          <div>
            {recentPages.length === 0 && (
              <div style={{ padding: 20, fontSize: 12.5, color: '#8B8378' }}>No pages analyzed yet.</div>
            )}
            {recentPages.map((p, i) => {
              const s = severityStyle[p.risk] || severityStyle.LOW;
              return (
                <div key={i} style={{ padding: '14px 20px', borderBottom: i < recentPages.length - 1 ? '1px solid #EFE9DB' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, fontWeight: 600, padding: '2px 7px', background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{p.risk}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.findingsCount} finding{p.findingsCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#8B8378' }}>{p.url}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '18px 24px', background: '#0B1929', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#8B9BAA', fontSize: 12.5 }}>
          <Clock size={15} /> {scan.total_pages - scan.scanned_pages} pages remaining · Fully local — $0 cost
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {manualCount > 0 && (
            <span style={{ padding: '10px 18px', color: '#F5F1E8', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7 }}>
              <FileText size={14} /> {manualCount} pages need manual review
            </span>
          )}
          <a
            href={api.reportUrl(scanId)}
            style={{
              padding: '10px 18px', background: '#C9A961', color: '#0B1929', border: 'none',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            <Download size={14} /> Download PDF
          </a>
          <button
            onClick={onViewReport}
            style={{
              padding: '10px 18px', background: 'transparent', color: '#F5F1E8', border: '1px solid #5C7285',
              cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            View Dashboard <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
