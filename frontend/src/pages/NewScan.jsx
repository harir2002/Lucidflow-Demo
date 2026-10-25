import { useState, useEffect } from 'react';
import { api } from '../api/client';
import DiscoveryPreview from '../components/DiscoveryPreview';

export default function NewScan({ onScanCreated }) {
  const [scanMode, setScanMode] = useState('one-page');
  const [text, setText] = useState({ 'one-page': '', 'main-domain': '' });
  const [starting, setStarting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState('');
  const [license, setLicense] = useState(null);
  const [discoveredUrls, setDiscoveredUrls] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState([]);
  const [demoLabel, setDemoLabel] = useState(null);
  const [items, setItems] = useState([]);

  const maxSelectable = license?.max_pages || 3;
  const currentText = text[scanMode];
  const modeConfig = {
    'one-page': {
      label: 'Page URLs',
      inputLabel: 'Page URLs',
      placeholder: 'https://www.example.com/page1\nhttps://www.example.com/page2',
      multiline: true,
      help: 'Add one or more page URLs, separated by commas or new lines.',
    },
    'main-domain': {
      label: 'Whole domain',
      inputLabel: 'Domain',
      placeholder: 'https://www.example.com',
      multiline: false,
      help: 'Enter only the domain to discover and scan all public pages.',
    },
  };

  const current = modeConfig[scanMode];

  useEffect(() => {
    const fetchLicense = async () => {
      try {
        const licenseData = await api.getLicense();
        setLicense(licenseData);
      } catch (err) {
        console.error('Failed to fetch license:', err);
      }
    };
    fetchLicense();
  }, []);

  // Parse URLs from text input
  useEffect(() => {
    if (!currentText.trim()) {
      setItems([]);
      return;
    }
    const urls = currentText
      .split(/[,\n]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
    setItems(urls);
  }, [currentText, scanMode]);

  const handleSetText = (value) => {
    setText({ ...text, [scanMode]: value });
  };

  const handleRemoveItem = (raw) => {
    const newUrls = items.filter(u => u !== raw).join(scanMode === 'one-page' ? '\n' : '');
    handleSetText(newUrls);
  };

  const handleDiscover = async () => {
    setError('');
    setDiscovering(true);
    try {
      const result = await api.discoverUrls(items[0]);
      setDiscoveredUrls(result.urls || []);
      setSelectedUrls([]);
      setDemoLabel(result.demoLabel || null);
      if (!result.urls || result.urls.length === 0) {
        setError('No pages discovered. Please check the domain and try again.');
      }
    } catch (err) {
      setError(err.message);
      setDiscoveredUrls([]);
    } finally {
      setDiscovering(false);
    }
  };

  const handleStart = async () => {
    setError('');
    setStarting(true);
    try {
      if (scanMode === 'one-page') {
        if (items.length === 0) {
          setError('Please add at least one page URL');
          setStarting(false);
          return;
        }
        const scan = await api.createScan(items[0], null, 'one-page', []);
        onScanCreated(scan.id);
      } else {
        if (selectedUrls.length === 0) {
          setError('Please select at least one page to scan');
          setStarting(false);
          return;
        }
        const scan = await api.createScan(items[0], null, 'main-domain', selectedUrls);
        onScanCreated(scan.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const canRun =
    scanMode === 'one-page'
      ? items.length > 0
      : items.length > 0 && discoveredUrls.length > 0 && selectedUrls.length > 0;

  return (
    <div
      className="content narrow"
      style={{
        maxWidth: '760px',
        width: '100%',
        margin: '0 auto',
      }}
    >
      {/* MAIN FORM CARD */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
        {error && (
          <div
            className="error"
            style={{
              background: 'var(--surface3)',
              border: '1px solid var(--secondary)',
              color: 'var(--secondary)',
              padding: 'var(--spacing-xs, 10px) var(--spacing-sm, 12px)',
              fontSize: 'var(--fs-s)',
              marginBottom: 'var(--spacing-sm, 12px)',
              borderRadius: '3px',
            }}
          >
            {error}
          </div>
        )}

        {/* MODE SELECTOR TABS */}
        <div className="tabs" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
          {Object.entries(modeConfig).map(([key, mode]) => (
            <button
              key={key}
              className={scanMode === key ? 'on' : ''}
              onClick={() => {
                setScanMode(key);
                setDiscoveredUrls([]);
                setSelectedUrls([]);
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* INPUT FIELD */}
        <label className="label">{current.inputLabel}</label>
        {current.multiline ? (
          <textarea
            value={currentText}
            onChange={(e) => handleSetText(e.target.value)}
            placeholder={current.placeholder}
            rows={5}
          />
        ) : (
          <input
            value={currentText}
            onChange={(e) => handleSetText(e.target.value)}
            placeholder={current.placeholder}
          />
        )}
        <p className="muted">{current.help}</p>

        {/* CHIPS */}
        {items.length > 0 && (
          <div className="chips">
            {items.map((item) => (
              <span key={item} className="chip">
                {item}
                <button onClick={() => handleRemoveItem(item)}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* DISCOVERY & RUN BUTTON */}
        {scanMode === 'main-domain' && items.length > 0 && discoveredUrls.length === 0 && !discovering && (
          <button
            className="btn primary"
            onClick={handleDiscover}
            disabled={discovering}
            style={{ marginBottom: 'var(--spacing-lg, 24px)' }}
          >
            {discovering ? 'Discovering...' : 'Discover URLs'}
          </button>
        )}

        {discovering && (
          <p className="muted" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
            Discovering pages...
          </p>
        )}

        {discoveredUrls.length > 0 && (
          <DiscoveryPreview
            urls={discoveredUrls}
            maxSelectable={maxSelectable}
            demoLabel={demoLabel}
            onSelectionChange={setSelectedUrls}
          />
        )}

        {/* RUN BUTTON */}
        <button
          className="btn primary"
          disabled={!canRun || starting}
          onClick={handleStart}
        >
          {starting ? 'Starting...' : 'Run scan'}
        </button>
      </div>

      {/* RECENT SCANS SECTION */}
      <h3 className="section">Recent scans</h3>
      <table className="list">
        <tbody>
          {[
            { domain: 'www.abcinsurance.example', date: '16 Oct 2026', status: 'Completed', result: '10 potential dark patterns' },
            { domain: 'www.allianceinsurance.example', date: '15 Oct 2026', status: 'Completed', result: '3 potential dark patterns' },
            { domain: 'www.orbitcover.example', date: '10 Oct 2026', status: 'Completed', result: '2 potential dark patterns' },
          ].map((scan) => (
            <tr key={scan.domain}>
              <td>
                <b>{scan.domain}</b>
              </td>
              <td>{scan.date}</td>
              <td>
                <b>{scan.status}</b>
              </td>
              <td>{scan.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
