import { Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';

export default function ImportedReportView({ scanId, reportData }) {
  const [expandedSections, setExpandedSections] = useState({ findings: true, cap: true });

  if (!reportData) return null;

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const severityColor = {
    HIGH: '#e7000b',
    MEDIUM: '#ff9800',
    LOW: '#2196f3',
    CLEAN: '#4caf50',
  };

  const severityBg = {
    HIGH: '#ffebee',
    MEDIUM: '#fff3e0',
    LOW: '#e3f2fd',
    CLEAN: '#e8f5e9',
  };

  return (
    <div style={{ padding: '0 20px 40px' }}>
      {/* Header */}
      <div
        style={{
          background: '#000000',
          color: '#ffffff',
          padding: '40px 30px',
          marginBottom: '30px',
          borderRadius: '4px',
        }}
      >
        <h1 style={{ margin: '0 0 10px 0', fontSize: '28px', fontWeight: 600 }}>
          Assessment results
        </h1>
        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#cccccc' }}>
          {reportData.provenance}
        </p>
        <a
          href={api.reportUrl(scanId)}
          download
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: '#e7000b',
            color: '#ffffff',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Download size={16} />
          Download PDF
        </a>
      </div>

      {/* Report Details */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '30px',
        }}
      >
        <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '4px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>
            Organisation
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#000' }}>
            {reportData.organisation}
          </div>
        </div>

        <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '4px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>
            Report ID
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#000' }}>
            {reportData.reportId}
          </div>
        </div>

        <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '4px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>
            Issue Date
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#000' }}>
            {reportData.issueDate}
          </div>
        </div>

        <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '4px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>
            Version
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#000' }}>
            {reportData.version}
          </div>
        </div>
      </div>

      {/* Assessment Scope */}
      <div style={{ background: '#f9f9f9', padding: '20px', marginBottom: '30px', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
          Assessment Scope
        </div>
        <div style={{ fontSize: '14px', color: '#333', marginBottom: '8px' }}>
          {reportData.assessmentScope}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600, marginTop: '12px' }}>
          Assessed URL
        </div>
        <code style={{ fontSize: '12px', background: '#efefef', padding: '4px 8px', borderRadius: '2px', color: '#333' }}>
          {reportData.assessedUrl}
        </code>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '30px',
        }}
      >
        {[
          { label: 'PAGES', value: reportData.summary.pagesAssessed },
          { label: 'FINDINGS', value: reportData.summary.potentialFindings },
          { label: 'HIGH', value: reportData.riskCounts.HIGH },
          { label: 'MEDIUM', value: reportData.riskCounts.MEDIUM },
          { label: 'LOW', value: reportData.riskCounts.LOW },
        ].map((kpi, i) => (
          <div
            key={i}
            style={{
              background: '#f5f5f5',
              padding: '16px',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: severityColor[kpi.label] || '#333' }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', textTransform: 'uppercase' }}>
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* Overall Posture */}
      {reportData.overallPosture && (
        <div style={{ background: '#fffbf0', padding: '20px', marginBottom: '30px', borderRadius: '4px', border: '1px solid #ffe0b2' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#333' }}>
            Overall Assessment Posture
          </h3>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#555' }}>
            {reportData.overallPosture}
          </p>
        </div>
      )}

      {/* Priority Themes */}
      {reportData.priorityThemes && reportData.priorityThemes.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#000' }}>
            Priority Themes
          </h3>
          {reportData.priorityThemes.map((theme, i) => (
            <div
              key={i}
              style={{
                background: '#f9f9f9',
                padding: '16px',
                marginBottom: '12px',
                borderRadius: '4px',
                border: '1px solid #e0e0e0',
              }}
            >
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#000' }}>
                {theme.title}
              </h4>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5', color: '#666' }}>
                {theme.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Findings */}
      {reportData.findings && reportData.findings.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <div
            onClick={() => toggleSection('findings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '16px',
              color: '#000',
            }}
          >
            {expandedSections.findings ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            Findings ({reportData.findings.length})
          </div>

          {expandedSections.findings && (
            <div>
              {reportData.findings.map((finding, i) => (
                <div
                  key={i}
                  style={{
                    background: severityBg[finding.severity] || '#f5f5f5',
                    border: `2px solid ${severityColor[finding.severity] || '#ccc'}`,
                    borderRadius: '4px',
                    padding: '16px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '12px' }}>
                    <div
                      style={{
                        background: severityColor[finding.severity] || '#999',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '2px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {finding.severity}
                    </div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#000', flex: 1 }}>
                      {finding.title}
                    </h4>
                  </div>

                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Pattern:</strong> {finding.pattern}
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Owner:</strong> {finding.owner}
                    </div>
                    <div>
                      <strong>Remediation Effort:</strong> {finding.remedyEffort}
                    </div>
                  </div>

                  {finding.evidence && finding.evidence.description && (
                    <div style={{ background: '#fff', padding: '12px', borderRadius: '2px', marginBottom: '12px', fontSize: '13px', lineHeight: '1.5', color: '#444' }}>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>Evidence:</strong>
                      {finding.evidence.description}
                    </div>
                  )}

                  {finding.whyMatters && (
                    <div style={{ background: '#fff', padding: '12px', borderRadius: '2px', marginBottom: '12px', fontSize: '13px', lineHeight: '1.5', color: '#444' }}>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>Why This Matters:</strong>
                      {finding.whyMatters}
                    </div>
                  )}

                  {finding.remediation && finding.remediation.length > 0 && (
                    <div>
                      <strong style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>Remediation:</strong>
                      <ul style={{ margin: '0 0 0 20px', padding: 0, fontSize: '13px', color: '#444', lineHeight: '1.5' }}>
                        {finding.remediation.map((rem, j) => (
                          <li key={j}>{rem}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CAP */}
      {reportData.cap && reportData.cap.items && reportData.cap.items.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <div
            onClick={() => toggleSection('cap')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '16px',
              color: '#000',
            }}
          >
            {expandedSections.cap ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            Corrective Action Plan
          </div>

          {expandedSections.cap && (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#333' }}>
                      Finding
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#333' }}>
                      Action
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#333' }}>
                      Owner
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#333' }}>
                      Due
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#333' }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.cap.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: i < reportData.cap.items.length - 1 ? '1px solid #eee' : 'none' }}>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#333' }}>
                        {item.findingLabel}
                      </td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#333' }}>
                        {item.action}
                      </td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#333' }}>
                        {item.owner}
                      </td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#333' }}>
                        {item.due}
                      </td>
                      <td
                        style={{
                          padding: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: item.status === 'OPEN' ? '#e7000b' : '#333',
                        }}
                      >
                        {item.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Review Notes */}
      {reportData.reviewNotes && reportData.reviewNotes.length > 0 && (
        <div style={{ background: '#f0f0f0', padding: '16px', borderRadius: '4px', marginBottom: '30px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 600, color: '#333', textTransform: 'uppercase' }}>
            Review Notes
          </h4>
          {reportData.reviewNotes.map((note, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#666', marginBottom: i < reportData.reviewNotes.length - 1 ? '8px' : 0, lineHeight: '1.4' }}>
              <strong style={{ color: '#333' }}>{note.code}:</strong> {note.message}
            </div>
          ))}
        </div>
      )}

      {/* Appendix */}
      {reportData.appendix && (
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#000' }}>
            {reportData.appendix.heading || 'Appendix'}
          </h3>

          {reportData.appendix.definition && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#333' }}>
                What are dark patterns?
              </h4>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#555', margin: 0 }}>
                {reportData.appendix.definition}
              </p>
            </div>
          )}

          {reportData.appendix.insurance_context && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#333' }}>
                Insurance Context
              </h4>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#555', margin: 0 }}>
                {reportData.appendix.insurance_context}
              </p>
            </div>
          )}

          {reportData.appendix.regulatory_context_source && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#333' }}>
                Regulatory Context
              </h4>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#555', margin: 0 }}>
                {reportData.appendix.regulatory_context_source}
              </p>
            </div>
          )}

          {reportData.appendix.disclaimer_source && (
            <div style={{ background: '#fff3cd', padding: '12px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #ffc107' }}>
              <p style={{ fontSize: '12px', lineHeight: '1.4', color: '#333', margin: 0 }}>
                <strong>Disclaimer:</strong> {reportData.appendix.disclaimer_source}
              </p>
            </div>
          )}

          {reportData.appendix.dark_pattern_categories && reportData.appendix.dark_pattern_categories.length > 0 && (
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#333' }}>
                Dark Pattern Categories
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {reportData.appendix.dark_pattern_categories.map((cat, i) => (
                  <div key={i} style={{ background: '#f5f5f5', padding: '12px', borderRadius: '2px', fontSize: '12px' }}>
                    <strong style={{ color: '#333' }}>
                      {cat.number}. {cat.pattern}
                    </strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#666', lineHeight: '1.4' }}>
                      {cat.definition}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
