import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Download, X } from 'lucide-react';

export default function ReportViewer({ reportId, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!reportId) return;

    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSavedReport(reportId);
        setReport(data);
      } catch (err) {
        console.error('Failed to fetch report:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  if (!reportId) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--surface)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--spacing-lg, 24px)',
            paddingBottom: 'var(--spacing-md, 16px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: 'var(--primary)' }}>Saved Report</h2>
            {report && (
              <p style={{ margin: '8px 0 0 0', color: 'var(--muted)' }}>
                {report.organisation}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={24} color="var(--primary)" />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-lg, 24px)' }}>
            Loading report...
          </div>
        ) : error ? (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid var(--secondary)',
              color: 'var(--secondary)',
              padding: 'var(--spacing-md, 16px)',
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        ) : report ? (
          <>
            {/* Metadata */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--spacing-md, 16px)',
                marginBottom: 'var(--spacing-lg, 24px)',
                padding: 'var(--spacing-md, 16px)',
                background: 'var(--surface2)',
                borderRadius: '4px',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)' }}>Report ID</div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{report.reportId}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)' }}>Issue Date</div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{report.issueDate}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)' }}>Version</div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{report.version}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)' }}>Pages</div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{report.pageCount}</div>
              </div>
            </div>

            {/* Findings Section */}
            {report.findings && report.findings.length > 0 && (
              <div style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
                <h3
                  style={{
                    color: 'var(--primary)',
                    marginBottom: 'var(--spacing-md, 16px)',
                  }}
                >
                  Findings ({report.findings.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm, 12px)' }}>
                  {report.findings.slice(0, 10).map((finding, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 'var(--spacing-sm, 12px)',
                        background: 'var(--surface2)',
                        borderLeft: '4px solid var(--secondary)',
                        borderRadius: '2px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {finding.title}
                      </div>
                      {finding.severity && (
                        <div
                          style={{
                            fontSize: 'var(--fs-s)',
                            color: 'var(--secondary)',
                            marginBottom: '4px',
                          }}
                        >
                          Severity: {finding.severity}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 'var(--fs-s)',
                          color: 'var(--muted)',
                          lineHeight: '1.4',
                        }}
                      >
                        {finding.description ? finding.description.substring(0, 150) + '...' : 'No description'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CAP Section */}
            {report.cap && report.cap.length > 0 && (
              <div style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
                <h3
                  style={{
                    color: 'var(--primary)',
                    marginBottom: 'var(--spacing-md, 16px)',
                  }}
                >
                  Corrective Actions ({report.cap.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm, 12px)' }}>
                  {report.cap.slice(0, 5).map((action, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 'var(--spacing-sm, 12px)',
                        background: 'var(--surface2)',
                        borderLeft: '4px solid var(--primary)',
                        borderRadius: '2px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{action.action}</div>
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)', marginTop: '4px' }}>
                        Timeline: {action.timeline} • Owner: {action.owner}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Appendix Section */}
            {report.appendix && (
              <div style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
                <h3
                  style={{
                    color: 'var(--primary)',
                    marginBottom: 'var(--spacing-md, 16px)',
                  }}
                >
                  Appendix
                </h3>
                <div
                  style={{
                    padding: 'var(--spacing-md, 16px)',
                    background: 'var(--surface2)',
                    borderRadius: '4px',
                    fontSize: 'var(--fs-s)',
                    lineHeight: '1.5',
                    color: 'var(--muted)',
                    maxHeight: '300px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                  }}
                >
                  {report.appendix.substring(0, 500)}...
                </div>
              </div>
            )}

            {/* Download Button */}
            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-sm, 12px)',
                paddingTop: 'var(--spacing-md, 16px)',
                borderTop: '1px solid var(--border)',
              }}
            >
              <a
                href={api.downloadSavedReportUrl(reportId)}
                download
                className="btn secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                <Download size={16} />
                Download PDF
              </a>
              <button className="btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
