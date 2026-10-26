import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import ImportedReportView from '../components/ImportedReportView';

export default function ReportDashboard({ scanId }) {
  const [scan, setScan] = useState(null);
  const [pages, setPages] = useState([]);
  const [importedReport, setImportedReport] = useState(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [expandedPage, setExpandedPage] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  useEffect(() => {
    api.getScan(scanId).then(setScan).catch(() => {});
  }, [scanId]);

  useEffect(() => {
    const fetchImportedReport = async () => {
      try {
        setIsLoadingReport(true);
        // Try to fetch imported report if this is a saved report URL
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4500/api'}/report/${scanId}/json`);
        if (res.ok) {
          const reportData = await res.json();
          setImportedReport(reportData);
          setIsLoadingReport(false);
          return; // Stop here - we have imported report
        }
      } catch (err) {
        console.log('No imported report available');
      }
      setIsLoadingReport(false);
    };
    fetchImportedReport();
  }, [scanId]);

  useEffect(() => {
    api.getPages(scanId, filterSeverity).then(setPages).catch(() => {});
  }, [scanId, filterSeverity]);

  const severityColor = {
    HIGH: { bg: 'var(--surface3)', text: 'var(--secondary)', border: 'var(--secondary)' },
    MEDIUM: { bg: 'var(--surface3)', text: 'var(--secondary)', border: 'var(--secondary)' },
    LOW: { bg: 'var(--surface3)', text: 'var(--muted)', border: 'var(--muted)' },
    CLEAN: { bg: 'var(--surface3)', text: 'var(--muted)', border: 'var(--muted)' },
  };

  if (!scan && isLoadingReport) return <div className="content center" style={{ padding: '80px 0' }}>Loading report...</div>;

  // If we have an imported JSON report, display that instead (even if live scan is still running)
  if (importedReport && !isLoadingReport) {
    return <ImportedReportView scanId={scanId} reportData={importedReport} />;
  }

  if (!scan) return <div className="content center" style={{ padding: '80px 0' }}>Loading report...</div>;

  const riskCounts = scan.risk_counts || {};
  const topPatterns = scan.top_patterns || [];
  const maxFreq = Math.max(...topPatterns.map(p => p.page_count), 1);
  const displayPages = pages.filter(p => p.overall_risk !== 'PENDING');

  return (
    <div>
      {/* HEADER SECTION */}
      <div
        style={{
          background: 'var(--surface2)',
          borderBottom: '1px solid var(--border)',
          padding: 'var(--spacing-lg, 24px) var(--spacing-lg, 32px)',
          marginBottom: 'var(--spacing-lg, 24px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
              {scan.target_url}
            </div>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)' }}>
              {scan.total_pages} discovered · {scan.scanned_pages} analysed
            </div>
          </div>
          <a
            href={api.reportUrl(scanId)}
            style={{
              padding: 'var(--spacing-sm, 12px) var(--spacing-md, 16px)',
              background: 'var(--secondary)',
              color: 'var(--surface)',
              textDecoration: 'none',
              fontSize: 'var(--fs-s)',
              fontWeight: 600,
              borderRadius: '4px',
            }}
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* STATS GRID */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1px',
          background: 'var(--border)',
          marginBottom: 'var(--spacing-lg, 24px)',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        {[
          { label: 'PAGES', value: scan.scanned_pages },
          { label: 'FINDINGS', value: scan.findings_count },
          { label: 'HIGH', value: riskCounts.HIGH || 0 },
          { label: 'MEDIUM', value: riskCounts.MEDIUM || 0 },
          { label: 'LOW', value: riskCounts.LOW || 0 },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface)',
              padding: 'var(--spacing-md, 16px)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)', marginBottom: '8px', fontWeight: 600 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--secondary)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* TOP PATTERNS */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
        <h3 className="big-sm">Most Frequent Patterns</h3>
        {topPatterns.length === 0 && <div className="muted">No findings yet.</div>}
        {topPatterns.map((p, i) => (
          <div
            key={i}
            style={{
              marginBottom: i < topPatterns.length - 1 ? 'var(--spacing-md, 16px)' : 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: 'var(--fs-m)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.pattern_name}</span>
              <span className="muted">{p.page_count} page{p.page_count !== 1 ? 's' : ''}</span>
            </div>
            <div
              style={{
                height: '6px',
                background: 'var(--track)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(p.page_count / maxFreq) * 100}%`,
                  background: 'var(--secondary)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* FINDINGS FILTER */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm, 12px)', marginBottom: 'var(--spacing-lg, 24px)', alignItems: 'center' }}>
        <Filter size={14} color="var(--muted)" />
        {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(s => (
          <button
            key={s}
            onClick={() => setFilterSeverity(s)}
            style={{
              padding: 'var(--spacing-xs, 10px) var(--spacing-sm, 12px)',
              fontSize: 'var(--fs-s)',
              background: filterSeverity === s ? 'var(--secondary)' : 'transparent',
              color: filterSeverity === s ? 'var(--surface)' : 'var(--text)',
              border: filterSeverity === s ? 'none' : `1px solid var(--border)`,
              cursor: 'pointer',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* FINDINGS LIST */}
      <div className="card">
        {displayPages.length === 0 && (
          <div className="muted" style={{ textAlign: 'center', padding: 'var(--spacing-lg, 24px)' }}>
            No pages found.
          </div>
        )}
        {displayPages.map((page, idx) => {
          const isExpanded = expandedPage === page.id;
          const rc = severityColor[page.overall_risk] || severityColor.LOW;
          return (
            <div
              key={page.id}
              style={{
                borderBottom: idx < displayPages.length - 1 ? `1px solid var(--border)` : 'none',
              }}
            >
              <button
                onClick={() => setExpandedPage(isExpanded ? null : page.id)}
                style={{
                  width: '100%',
                  padding: 'var(--spacing-md, 16px)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md, 16px)' }}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{page.title || page.url}</div>
                    <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)', marginTop: '4px' }}>
                      {page.url}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm, 12px)' }}>
                  <span style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)' }}>
                    {page.findings?.length || 0} finding{page.findings?.length !== 1 ? 's' : ''}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--fs-xxs)',
                      fontWeight: 700,
                      padding: '3px 8px',
                      background: rc.bg,
                      color: rc.text,
                      border: `1px solid ${rc.border}`,
                      borderRadius: '3px',
                    }}
                  >
                    {page.overall_risk}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div style={{ padding: `0 var(--spacing-md, 16px) var(--spacing-md, 16px) var(--spacing-xl, 32px)` }}>
                  {page.screenshot_path && (
                    <img
                      src={api.screenshotUrl(page.screenshot_path)}
                      alt="Page screenshot"
                      style={{
                        maxWidth: '100%',
                        border: '1px solid var(--border)',
                        marginBottom: 'var(--spacing-md, 16px)',
                        borderRadius: '4px',
                      }}
                    />
                  )}
                  {page.findings?.map((f, fi) => {
                    const sc = severityColor[f.severity] || severityColor.LOW;
                    return (
                      <div
                        key={fi}
                        style={{
                          padding: 'var(--spacing-md, 16px)',
                          background: 'var(--surface2)',
                          border: `1px solid var(--border)`,
                          borderLeft: `3px solid ${sc.border}`,
                          marginBottom: fi < (page.findings?.length || 0) - 1 ? 'var(--spacing-sm, 12px)' : 0,
                          borderRadius: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm, 12px)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm, 12px)' }}>
                            <span
                              style={{
                                fontSize: 'var(--fs-xxs)',
                                fontWeight: 700,
                                padding: '2px 6px',
                                background: sc.bg,
                                color: sc.text,
                                border: `1px solid ${sc.border}`,
                                borderRadius: '3px',
                              }}
                            >
                              {f.severity}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{f.pattern_name}</span>
                          </div>
                        </div>
                        {f.location && (
                          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--muted)', marginBottom: 'var(--spacing-sm, 12px)' }}>
                            {f.location}
                          </div>
                        )}
                        <div style={{ fontSize: 'var(--fs-m)', lineHeight: 1.6, color: 'var(--text)' }}>
                          {f.evidence}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
