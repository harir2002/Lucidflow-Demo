import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function ScanConsole({ scanId, socket, onViewReport }) {
  const [scan, setScan] = useState(null);
  const [status, setStatus] = useState(null);
  const [found, setFound] = useState(0);
  const [scanned, setScanned] = useState(0);
  const [paused, setPaused] = useState(false);
  const [latestPages, setLatestPages] = useState([]);
  const [error, setError] = useState(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [pageFindings, setPageFindings] = useState(0);

  const refreshScan = () => api.getScan(scanId).then(setScan).catch(() => {});

  const handleGenerateReport = async () => {
    if (!scan || scan.scan_mode !== 'main-domain') return;
    
    try {
      setError(null);
      // Trigger PDF download for main-domain report
      const downloadUrl = `${api.reportUrl(scanId)}/main-domain`;
      window.location.href = downloadUrl;
    } catch (err) {
      setError(`Failed to generate report: ${err.message}`);
    }
  };

  useEffect(() => {
    refreshScan();
  }, [scanId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('subscribe', scanId);

    const onPageDone = (data) => {
      setScanned((prev) => prev + 1);
      setCurrentUrl(data.url);
      setPageFindings(data.findingsCount || 0);
      setLatestPages((prev) => [data.url.substring(0, 60), ...prev.slice(0, 4)]);
      refreshScan();
    };

    const onDiscovered = (data) => {
      // For main-domain scans: show total discovered pages
      if (data.totalPages) {
        setFound(data.totalPages);
      }
      refreshScan();
    };

    const onSelected = (data) => {
      // For main-domain scans: show selected URLs context
      if (data.totalSelected) {
        setFound(data.totalSelected);
      }
      refreshScan();
    };

    const onComplete = () => {
      setStatus('Complete');
      setError(null);
      refreshScan();
    };

    const onPaused = () => {
      setStatus('Paused');
      refreshScan();
    };

    const onScanError = (data) => {
      setError(data.message || 'Scan error occurred');
      setStatus('Error');
      refreshScan();
    };

    socket.on('scan:page-done', onPageDone);
    socket.on('scan:complete', onComplete);
    socket.on('scan:discovered', onDiscovered);
    socket.on('scan:selected', onSelected);
    socket.on('scan:paused', onPaused);
    socket.on('scan:error', onScanError);

    return () => {
      socket.emit('unsubscribe', scanId);
      socket.off('scan:page-done', onPageDone);
      socket.off('scan:complete', onComplete);
      socket.off('scan:discovered', onDiscovered);
      socket.off('scan:selected', onSelected);
      socket.off('scan:paused', onPaused);
      socket.off('scan:error', onScanError);
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
  const isError = status === 'Error';

  // If scan is complete and has imported report, show completion with report findings
  const hasImportedReport = scan && scan.findings_count > 0 && isComplete;

  // Error display
  if (error) {
    return (
      <div className="content">
        <h2 className="big">Scan Error</h2>
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid var(--secondary)',
            color: 'var(--secondary)',
            padding: 'var(--spacing-md, 16px)',
            borderRadius: '4px',
            marginBottom: '24px',
          }}
        >
          {error}
        </div>
        <div className="actions left">
          <button className="btn primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

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

  // Scanning view
  const scanningDisplay = isComplete && scan.scan_mode === 'main-domain' 
    ? `Scanned ${scanned} of ${total} pages`
    : `Page ${Math.max(current, 1)} of ${total}`;

  return (
    <div className="content center">
      <h2 className="big">
        {isComplete ? 'Scan Complete' : 'Scanning'}
      </h2>
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
          {isComplete ? '✓' : '⏳'}
        </div>
      </div>
      <div className="big-sm">{scanningDisplay}</div>
      
      {currentUrl && (
        <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)', marginBottom: '16px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Current: {currentUrl.substring(0, 80)}
        </div>
      )}

      <div className="scan-card">
        <div className="thumb" />
        <div>
          <div style={{ fontSize: 'var(--fs-m)', marginBottom: '6px' }}>{latestPages[0] || 'Loading...'}</div>
          <b style={{ fontSize: 'var(--fs-l)', color: scan.findings_count > 0 ? 'var(--secondary)' : 'var(--text)' }}>
            {scan.findings_count || 0} potential dark pattern
            {scan.findings_count !== 1 ? 's' : ''} found{isComplete ? '' : ' so far'}
          </b>
          {pageFindings > 0 && !isComplete && (
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--secondary)', marginTop: '8px' }}>
              Current page: {pageFindings} finding{pageFindings !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
      
      <div className="actions">
        {isComplete ? (
          <>
            {scan.scan_mode === 'main-domain' && (
              <button className="btn primary" onClick={handleGenerateReport}>
                Generate Report
              </button>
            )}
            <button className="btn secondary" onClick={onViewReport}>
              View results
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={() => setPaused(!paused)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="link" onClick={onViewReport}>
              View results
            </button>
          </>
        )}
      </div>
      
      {!isComplete && (
        <p className="muted">You can close this window. We will notify you when it finishes.</p>
      )}
    </div>
  );
}
