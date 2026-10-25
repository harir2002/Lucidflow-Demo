import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Download, Eye } from 'lucide-react';

export default function SavedReportBanner({ url, onOpenReport }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url || !url.trim()) {
      setReport(null);
      return;
    }

    // Debounce URL check
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.checkSavedReport(url);
        if (result.found) {
          setReport(result);
        } else {
          setReport(null);
        }
      } catch (err) {
        console.error('Failed to check saved report:', err);
        setError(err.message);
        setReport(null);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [url]);

  if (!report && !loading) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 'var(--spacing-lg, 24px)',
        background: 'var(--surface2)',
        border: '2px solid var(--secondary)',
        borderRadius: '4px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--spacing-md, 16px)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 'var(--fs-s)',
              fontWeight: 'bold',
              color: 'var(--secondary)',
              marginBottom: 'var(--spacing-xs, 8px)',
            }}
          >
            ✓ Saved Report Found
          </div>
          {loading ? (
            <div style={{ color: 'var(--muted)' }}>Checking for saved reports...</div>
          ) : report ? (
            <div>
              <div
                style={{
                  color: 'var(--primary)',
                  fontWeight: 'bold',
                  marginBottom: '4px',
                }}
              >
                {report.organisation}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-s)',
                  color: 'var(--muted)',
                }}
              >
                Report ID: {report.reportId} • Issued: {report.issueDate}
              </div>
            </div>
          ) : null}
          {error && (
            <div
              style={{
                color: 'var(--secondary)',
                fontSize: 'var(--fs-s)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {report && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-sm, 12px)',
            }}
          >
            <button
              className="btn secondary"
              onClick={() => onOpenReport(report.reportId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
              }}
            >
              <Eye size={16} />
              View Report
            </button>
            <a
              href={api.downloadSavedReportUrl(report.reportId)}
              download
              className="btn secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
              }}
            >
              <Download size={16} />
              Download PDF
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
