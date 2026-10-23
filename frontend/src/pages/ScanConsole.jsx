import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function ScanConsole({ scanId, socket, onViewReport }) {
  const [scan, setScan] = useState(null);
  const [status, setStatus] = useState(null);
  const [found, setFound] = useState(0);
  const [scanned, setScanned] = useState(0);
  const [paused, setPaused] = useState(false);
  const [latestPages, setLatestPages] = useState([]);

  const refreshScan = () => api.getScan(scanId).then(setScan).catch(() => {});

  useEffect(() => {
    refreshScan();
  }, [scanId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('subscribe', scanId);

    const onPageDone = (data) => {
      setScanned((prev) => prev + 1);
      setLatestPages((prev) => [data.url.substring(0, 60), ...prev.slice(0, 4)]);
      refreshScan();
    };
    const onComplete = () => {
      setStatus('Complete');
      refreshScan();
    };
    const onDiscovered = () => {
      refreshScan();
    };

    socket.on('scan:page-done', onPageDone);
    socket.on('scan:complete', onComplete);
    socket.on('scan:discovered', onDiscovered);

    return () => {
      socket.emit('unsubscribe', scanId);
      socket.off('scan:page-done', onPageDone);
      socket.off('scan:complete', onComplete);
      socket.off('scan:discovered', onDiscovered);
    };
  }, [socket, scanId]);

  useEffect(() => {
    if (!scan) return;
    if (!status) {
      setStatus(scan.scan_mode === 'main-domain' ? 'Discovering' : 'Scanning');
    }
    if (scan.total_pages > 0) {
      setFound(scan.total_pages);
      setScanned(scan.scanned_pages);
    }
  }, [scan, status]);

  if (!scan) return <div className="content center" style={{ padding: '80px 0' }}>Loading scan...</div>;

  const total = scan.total_pages;
  const current = scan.scanned_pages;
  const progress = total > 0 ? Math.round((current / total) * 100) : 0;

  const isDiscovering = status === 'Discovering';
  const isComplete = status === 'Complete';

  if (isDiscovering) {
    return (
      <div className="content">
        <h2 className="big">Discovering pages on {scan.scan_host}</h2>
        <div className="bar">
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="stats">
          <div>
            <span>Pages found</span>
            <b>{found}</b>
          </div>
          <div>
            <span>Pages checked</span>
            <b>{scanned}</b>
          </div>
          <div>
            <span>Status</span>
            <b className="red">{status}</b>
          </div>
          <div>
            <span>Progress</span>
            <b>{progress}%</b>
          </div>
        </div>
        <hr />
        <h3 className="section">Latest pages found</h3>
        <ul className="rows">
          {latestPages.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <div className="actions left">
          <button className="btn ghost" onClick={() => setStatus('Scanning')}>
            Stop and review
          </button>
          <button className="btn primary" onClick={() => setStatus('Scanning')}>
            Continue to scan
          </button>
        </div>
        <p className="muted">Pages behind login are not assessed unless you provide test credentials.</p>
      </div>
    );
  }

  return (
    <div className="content center">
      <h2 className="big">Scanning</h2>
      <div
        className="ring"
        style={{
          '--p': (current / total) * 100,
          width: '150px',
          height: '150px',
          borderRadius: '50%',
          margin: '24px auto 16px',
          background: `conic-gradient(var(--secondary) calc(var(--p) * 1%), var(--track) 0)`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div
          style={{
            width: '130px',
            height: '130px',
            borderRadius: '50%',
            background: 'var(--surface)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--secondary)',
            fontSize: 'var(--fs-display, 24px)',
            fontWeight: 700,
          }}
        >
          ✓
        </div>
      </div>
      <div className="big-sm">
        Page {Math.max(current, 1)} of {total}
      </div>
      <div className="scan-card">
        <div className="thumb" />
        <div>
          <div style={{ fontSize: 'var(--fs-m)', marginBottom: '6px' }}>{latestPages[0]}</div>
          <b style={{ fontSize: 'var(--fs-l)' }}>
            {scan.findings_count || 0} potential dark pattern
            {scan.findings_count !== 1 ? 's' : ''} found so far
          </b>
        </div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="link" onClick={onViewReport}>
          View results
        </button>
      </div>
      <p className="muted">You can close this window. We will notify you when it finishes.</p>
    </div>
  );
}
