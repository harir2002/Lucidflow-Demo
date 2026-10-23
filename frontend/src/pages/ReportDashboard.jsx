import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Filter, Download, Hand, Bot } from 'lucide-react';
import { api } from '../api/client';
import FindingsView from '../components/FindingsView';

export default function ReportDashboard({ scanId }) {
  const [scan, setScan] = useState(null);
  const [pages, setPages] = useState([]);
  const [expandedPage, setExpandedPage] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [tab, setTab] = useState('overview');

  useEffect(() => { api.getScan(scanId).then(setScan).catch(() => {}); }, [scanId]);
  useEffect(() => { api.getPages(scanId, filterSeverity).then(setPages).catch(() => {}); }, [scanId, filterSeverity]);

  const severityColor = {
    HIGH:   { bg: '#F8E8E4', text: '#8B2E1F', border: '#B8442E', dot: '#B8442E' },
    MEDIUM: { bg: '#FBF3DC', text: '#8A6D1F', border: '#C99A2E', dot: '#C99A2E' },
    LOW:    { bg: '#E8EFE9', text: '#2F5A3E', border: '#4A7C59', dot: '#4A7C59' },
    CLEAN:  { bg: '#E8EFE9', text: '#2F5A3E', border: '#4A7C59', dot: '#4A7C59' },
    ERROR:  { bg: '#F1F5F9', text: '#64748B', border: '#94A3B8', dot: '#94A3B8' },
  };

  if (!scan) return <div style={{ textAlign: 'center', padding: 80, color: '#8B8378' }}>Loading report...</div>;

  const riskCounts = scan.risk_counts || {};
  const topPatterns = scan.top_patterns || [];
  const maxFreq = Math.max(...topPatterns.map(p => p.page_count), 1);

  const displayPages = pages.filter(p => p.overall_risk !== 'PENDING');

  return (
    <div>
      <div style={{ background: '#0B1929', borderBottom: '3px double #C9A961', padding: '20px 32px', margin: '-32px -32px 28px' }}>
        <div style={{ maxWidth: 1136, margin: '0 auto' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#C9A961', letterSpacing: '0.12em', marginBottom: 8 }}>
            IRDAI DARK PATTERN COMPLIANCE REPORT
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 22, fontWeight: 700, color: '#F5F1E8' }}>{scan.target_url}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#8B9BAA', marginTop: 4 }}>
                {scan.total_pages} discovered · {scan.scanned_pages} analysed
              </div>
            </div>
            <a href={api.reportUrl(scanId)} style={{
              padding: '10px 18px', background: '#C9A961', color: '#0B1929', textDecoration: 'none',
              fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12.5, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Download size={14} /> Export PDF
            </a>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: '#0B1929', marginBottom: 24 }}>
        {[
          { label: 'PAGES SCANNED', value: scan.scanned_pages },
          { label: 'TOTAL FINDINGS', value: scan.findings_count },
          { label: 'HIGH', value: riskCounts.HIGH || 0, color: '#B8442E' },
          { label: 'MEDIUM', value: riskCounts.MEDIUM || 0, color: '#C99A2E' },
          { label: 'LOW', value: riskCounts.LOW || 0, color: '#4A7C59' },
          { label: 'MANUAL', value: scan.manual_review_count || 0, color: '#5C7285' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#F5F1E8', padding: '18px 16px' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#8B8378', letterSpacing: '0.08em', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 30, fontWeight: 700, color: s.color || '#0B1929' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #0B1929' }}>
        {['overview', 'findings', 'pages'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', background: tab === t ? '#0B1929' : 'transparent',
            color: tab === t ? '#F5F1E8' : '#0B1929', border: 'none', cursor: 'pointer',
            fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 500, textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          {/* Dark Pattern Findings Summary */}
          <div style={{ background: 'white', border: '1px solid #D8D0C0', marginBottom: 20, cursor: 'pointer' }} onClick={() => setTab('findings')}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #D8D0C0', background: '#EFE9DB' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 500 }}>▸ DARK PATTERN FINDINGS SUMMARY</span>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1929' }}>
                {scan.findings_count} finding{scan.findings_count !== 1 ? 's' : ''}: {riskCounts.HIGH || 0} HIGH, {riskCounts.MEDIUM || 0} MEDIUM, {riskCounts.LOW || 0} LOW
              </div>
              <div style={{ fontSize: 12, color: '#8B8378', marginTop: 8 }}>
                Click to view all findings with search, filter, and sort options.
              </div>
            </div>
          </div>

          {/* Most Frequent Patterns */}
          <div style={{ background: 'white', border: '1px solid #D8D0C0' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #D8D0C0', background: '#EFE9DB' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 500 }}>▸ MOST FREQUENT PATTERNS</span>
            </div>
            <div style={{ padding: 20 }}>
              {topPatterns.length === 0 && <div style={{ color: '#8B8378', fontSize: 13 }}>No findings yet.</div>}
              {topPatterns.map((p, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 500 }}>{p.pattern_name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#8B8378' }}>{p.page_count}</span>
                  </div>
                  <div style={{ height: 8, background: '#EFE9DB' }}>
                    <div style={{ height: '100%', width: `${(p.page_count / maxFreq) * 100}%`, background: '#B8442E' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'findings' && (
        <FindingsView findings={pages.flatMap(p => p.findings)} pages={pages} />
      )}

      {tab === 'pages' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <Filter size={14} color="#8B8378" />
            {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)} style={{
                padding: '6px 14px', fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace",
                background: filterSeverity === s ? '#0B1929' : 'white',
                color: filterSeverity === s ? '#F5F1E8' : '#0B1929', border: '1px solid #0B1929', cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>

          <div style={{ background: 'white', border: '1px solid #D8D0C0' }}>
            {displayPages.length === 0 && <div style={{ padding: 24, color: '#8B8378', fontSize: 13 }}>No pages to show.</div>}
            {displayPages.map((page, idx) => {
              const isExpanded = expandedPage === page.id;
              const rc = severityColor[page.overall_risk] || severityColor.LOW;
              return (
                <div key={page.id} style={{ borderBottom: idx < displayPages.length - 1 ? '1px solid #D8D0C0' : 'none' }}>
                  <button onClick={() => setExpandedPage(isExpanded ? null : page.id)} style={{
                    width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {isExpanded ? <ChevronDown size={16} color="#8B8378" /> : <ChevronRight size={16} color="#8B8378" />}
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: rc.dot, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14.5, fontWeight: 600 }}>{page.title || page.url}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#8B8378', marginTop: 2 }}>{page.url}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11.5, color: '#8B8378', fontFamily: "'IBM Plex Mono', monospace" }}>{page.findings.length} finding{page.findings.length !== 1 ? 's' : ''}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, padding: '3px 9px', background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>{page.overall_risk}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '0 20px 20px 48px', background: '#FAF8F2' }}>
                      {page.screenshot_path && (
                        <img
                          src={api.screenshotUrl(page.screenshot_path)}
                          alt="Page screenshot"
                          style={{ maxWidth: '100%', border: '1px solid #D8D0C0', marginBottom: 14 }}
                        />
                      )}
                      {page.findings.map((f, fi) => {
                        const sc = severityColor[f.severity] || severityColor.LOW;
                        return (
                          <div key={fi} style={{
                            padding: 16, background: 'white', border: `1px solid ${sc.border}44`,
                            borderLeft: `3px solid ${sc.border}`, marginBottom: fi < page.findings.length - 1 ? 10 : 0,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, fontWeight: 700, padding: '2px 7px', background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{f.severity}</span>
                                <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, fontWeight: 600 }}>{f.pattern_name}</span>
                              </div>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: f.source === 'manual' ? '#8A6D1F' : '#5C7285' }}>
                                {f.source === 'manual' ? <Hand size={11} /> : <Bot size={11} />}
                                {f.source === 'manual' ? 'MANUAL' : 'AI-DETECTED (LOCAL)'}
                              </span>
                            </div>
                            {f.location && <div style={{ fontSize: 11, color: '#8B8378', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>{f.location}</div>}
                            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#1E2A35' }}>{f.evidence}</div>
                            {f.reviewed_by && <div style={{ fontSize: 10.5, color: '#8A6D1F', marginTop: 6 }}>Reviewed by: {f.reviewed_by}</div>}
                          </div>
                        );
                      })}
                      {page.recommendations?.length > 0 && (
                        <div style={{ marginTop: 12, padding: 12, background: '#F0FDF4', border: '1px solid #6EE7B7' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#059669', marginBottom: 6 }}>Recommended Fixes</div>
                          {page.recommendations.map((r, ri) => (
                            <div key={ri} style={{ fontSize: 12, color: '#065F46', marginBottom: 4 }}>{ri + 1}. {r}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
