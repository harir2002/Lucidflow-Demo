import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Search, Filter, ArrowUpDown } from 'lucide-react';

export default function FindingsView({ findings, pages }) {
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('finding_id');
  const [expandedFinding, setExpandedFinding] = useState(null);

  // Group findings by page for display
  const findingsByPage = useMemo(() => {
    const grouped = {};
    findings.forEach((f, idx) => {
      const page = pages.find(p => p.id === f.page_id);
      if (!grouped[f.page_id]) {
        grouped[f.page_id] = { page, findings: [] };
      }
      grouped[f.page_id].findings.push({ ...f, index: idx + 1 });
    });
    return grouped;
  }, [findings, pages]);

  // Flatten findings for filtering/sorting
  const allFindings = useMemo(() => {
    const flat = [];
    Object.values(findingsByPage).forEach(item => {
      item.findings.forEach(f => {
        flat.push({ ...f, pageUrl: item.page?.url, pageTitle: item.page?.title });
      });
    });
    return flat;
  }, [findingsByPage]);

  // Apply filters and sorting
  const filteredFindings = useMemo(() => {
    let result = [...allFindings];

    // Filter by severity
    if (filterSeverity !== 'All') {
      result = result.filter(f => f.severity === filterSeverity);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(f =>
        (f.pattern_name || '').toLowerCase().includes(term) ||
        (f.evidence || '').toLowerCase().includes(term) ||
        (f.pageUrl || '').toLowerCase().includes(term)
      );
    }

    // Sort
    switch (sortBy) {
      case 'severity_high_first':
        const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        result.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));
        break;
      case 'pattern_name':
        result.sort((a, b) => (a.pattern_name || '').localeCompare(b.pattern_name || ''));
        break;
      case 'finding_id':
      default:
        result.sort((a, b) => a.index - b.index);
        break;
    }

    return result;
  }, [allFindings, filterSeverity, searchTerm, sortBy]);

  const severityColor = {
    HIGH: { bg: '#F8E8E4', text: '#8B2E1F', border: '#B8442E', badge: '#B8442E' },
    MEDIUM: { bg: '#FBF3DC', text: '#8A6D1F', border: '#C99A2E', badge: '#C99A2E' },
    LOW: { bg: '#E8EFE9', text: '#2F5A3E', border: '#4A7C59', badge: '#4A7C59' },
  };

  const totalFindings = allFindings.length;
  const countByHighSeverity = allFindings.filter(f => f.severity === 'HIGH').length;
  const countByMediumSeverity = allFindings.filter(f => f.severity === 'MEDIUM').length;
  const countByLowSeverity = allFindings.filter(f => f.severity === 'LOW').length;

  return (
    <div>
      {/* Header with summary */}
      <div style={{ background: '#FAF8F2', border: '1px solid #D8D0C0', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 500, color: '#8B8378', marginBottom: 8 }}>
          ▸ DARK PATTERN FINDINGS SUMMARY
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1929' }}>
          {totalFindings} finding{totalFindings !== 1 ? 's' : ''}: {countByHighSeverity} HIGH, {countByMediumSeverity} MEDIUM, {countByLowSeverity} LOW
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Severity filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={14} color="#8B8378" />
          <span style={{ fontSize: 11.5, color: '#8B8378', fontFamily: "'IBM Plex Mono', monospace" }}>SEVERITY:</span>
          {['All', 'HIGH', 'MEDIUM', 'LOW'].map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              style={{
                padding: '6px 12px',
                fontSize: 11.5,
                fontFamily: "'IBM Plex Mono', monospace",
                background: filterSeverity === sev ? '#0B1929' : 'white',
                color: filterSeverity === sev ? '#F5F1E8' : '#0B1929',
                border: '1px solid #0B1929',
                cursor: 'pointer',
              }}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <ArrowUpDown size={14} color="#8B8378" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '6px 10px',
              fontSize: 11.5,
              fontFamily: "'IBM Plex Mono', monospace",
              background: 'white',
              color: '#0B1929',
              border: '1px solid #D8D0C0',
              cursor: 'pointer',
            }}
          >
            <option value="finding_id">Sort by: Finding ID</option>
            <option value="severity_high_first">Sort by: Severity (High First)</option>
            <option value="pattern_name">Sort by: Pattern Name</option>
          </select>
        </div>
      </div>

      {/* Search box */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={14} color="#8B8378" />
        <input
          type="text"
          placeholder="Search by pattern name, evidence, or page URL..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: 12.5,
            fontFamily: "'IBM Plex Sans', sans-serif",
            border: '1px solid #D8D0C0',
            borderRadius: 0,
            background: 'white',
            color: '#0B1929',
          }}
        />
      </div>

      {/* Findings list */}
      <div style={{ background: 'white', border: '1px solid #D8D0C0' }}>
        {filteredFindings.length === 0 ? (
          <div style={{ padding: 24, color: '#8B8378', fontSize: 13, textAlign: 'center' }}>
            No findings match your filters.
          </div>
        ) : (
          filteredFindings.map((finding, idx) => {
            const isExpanded = expandedFinding === finding.id;
            const sc = severityColor[finding.severity] || severityColor.LOW;

            return (
              <div
                key={finding.id}
                style={{
                  borderBottom: idx < filteredFindings.length - 1 ? '1px solid #D8D0C0' : 'none',
                  background: isExpanded ? '#FAF8F2' : 'white',
                }}
              >
                {/* Finding card header */}
                <button
                  onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    textAlign: 'left',
                  }}
                >
                  {/* Expand/collapse icon */}
                  <div style={{ marginTop: 2 }}>
                    {isExpanded ? <ChevronUp size={16} color="#8B8378" /> : <ChevronDown size={16} color="#8B8378" />}
                  </div>

                  {/* Finding number and content */}
                  <div style={{ flex: 1 }}>
                    {/* Finding number and pattern name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#8B8378', fontWeight: 600 }}>
                        Finding {finding.index}/{totalFindings}
                      </span>
                      <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, fontWeight: 600, color: '#0B1929' }}>
                        {finding.pattern_name}
                      </span>
                    </div>

                    {/* Severity badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '3px 9px',
                          background: sc.bg,
                          color: sc.text,
                          border: `1px solid ${sc.border}`,
                        }}
                      >
                        {finding.severity}
                      </span>
                    </div>

                    {/* Evidence title */}
                    <div style={{ fontSize: 12.5, color: '#1E2A35', marginBottom: 6 }}>{finding.evidence}</div>

                    {/* Page URL and owner (if available) */}
                    <div style={{ fontSize: 11, color: '#8B8378', fontFamily: "'IBM Plex Mono', monospace" }}>
                      Page: {finding.pageUrl || 'Unknown'}
                    </div>
                  </div>

                  {/* Right side info */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '3px 9px',
                        background: sc.bg,
                        color: sc.text,
                        border: `1px solid ${sc.border}`,
                      }}
                    >
                      {finding.severity}
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '12px 20px 16px 48px', background: '#FAF8F2', borderTop: '1px solid #D8D0C0' }}>
                    {/* Full evidence details */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1929', marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                        EVIDENCE DETAILS
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#1E2A35', background: 'white', padding: 10, border: '1px solid #D8D0C0' }}>
                        {finding.evidence}
                      </div>
                    </div>

                    {/* Location if available */}
                    {finding.location && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1929', marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                          LOCATION
                        </div>
                        <div style={{ fontSize: 12, color: '#1E2A35', background: 'white', padding: 10, border: '1px solid #D8D0C0', fontFamily: "'IBM Plex Mono', monospace", wordBreak: 'break-all' }}>
                          {finding.location}
                        </div>
                      </div>
                    )}

                    {/* Page info */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1929', marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                        PAGE SCANNED
                      </div>
                      <div style={{ fontSize: 12, color: '#1E2A35', background: 'white', padding: 10, border: '1px solid #D8D0C0' }}>
                        {finding.pageTitle || finding.pageUrl || 'Unknown'}
                      </div>
                    </div>

                    {/* Source badge */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1929', marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                        DETECTION SOURCE
                      </div>
                      <div style={{ fontSize: 11, padding: '6px 10px', background: '#E8EFE9', color: '#2F5A3E', border: '1px solid #4A7C59', display: 'inline-block', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>
                        {finding.source === 'manual' ? 'MANUAL REVIEW' : 'AI-DETECTED (LOCAL)'}
                      </div>
                    </div>

                    {/* Reviewed by if manual */}
                    {finding.reviewed_by && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1929', marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                          REVIEWED BY
                        </div>
                        <div style={{ fontSize: 12, color: '#1E2A35', background: 'white', padding: 10, border: '1px solid #D8D0C0' }}>
                          {finding.reviewed_by}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
