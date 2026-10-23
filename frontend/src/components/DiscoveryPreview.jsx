import { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

export default function DiscoveryPreview({ urls, maxSelectable, demoLabel, onSelectionChange }) {
  const [selected, setSelected] = useState(new Set());

  const handleToggle = (url) => {
    const newSelected = new Set(selected);
    if (newSelected.has(url)) {
      newSelected.delete(url);
    } else if (newSelected.size < maxSelectable) {
      newSelected.add(url);
    }
    setSelected(newSelected);
    onSelectionChange(Array.from(newSelected));
  };

  const handleSelectAll = () => {
    const newSelected = new Set(urls.slice(0, maxSelectable));
    setSelected(newSelected);
    onSelectionChange(Array.from(newSelected));
  };

  const handleClearAll = () => {
    setSelected(new Set());
    onSelectionChange([]);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {demoLabel && (
        <div style={{
          background: '#1a0000', 
          border: '1px solid #e7000b', 
          padding: '12px 14px',
          marginBottom: 16,
          fontSize: 12.5,
          color: '#ff6666',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {demoLabel}
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 12,
        fontSize: 11.5
      }}>
        <button
          onClick={handleSelectAll}
          style={{
            background: '#000000',
            border: '1px solid #333333',
            padding: '8px 12px',
            cursor: 'pointer',
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: '#ffffff',
            borderRadius: 3,
            transition: 'all 0.2s'
          }}
        >
          Select All
        </button>
        <button
          onClick={handleClearAll}
          style={{
            background: '#000000',
            border: '1px solid #333333',
            padding: '8px 12px',
            cursor: 'pointer',
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: '#ffffff',
            borderRadius: 3,
            transition: 'all 0.2s'
          }}
        >
          Clear All
        </button>
      </div>

      <div style={{
        fontSize: 12,
        color: '#999999',
        marginBottom: 12,
        fontWeight: 500
      }}>
        Selected: {selected.size} / {urls.length} (limit: {maxSelectable})
      </div>

      <div style={{
        fontSize: 11,
        color: '#666666',
        marginBottom: 12,
        lineHeight: 1.5
      }}>
        Discovery lists publicly available URLs found from the site map and internal links. It does not guarantee every page on the website.
      </div>

      <div style={{
        border: '1px solid #333333',
        background: '#000000',
        maxHeight: 300,
        overflowY: 'auto',
        borderRadius: 3
      }}>
        {urls.map((url, idx) => {
          const isSelected = selected.has(url);
          const isDisabled = !isSelected && selected.size >= maxSelectable;
          return (
            <div
              key={idx}
              onClick={() => !isDisabled && handleToggle(url)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 14px',
                borderBottom: idx < urls.length - 1 ? '1px solid #222222' : 'none',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                background: isSelected ? '#0a2a1f' : '#000000',
                opacity: isDisabled ? 0.5 : 1,
                transition: 'background 0.2s'
              }}
            >
              <div style={{ flexShrink: 0, marginTop: 1 }}>
                {isSelected ? (
                  <CheckCircle2 size={18} color="#e7000b" />
                ) : (
                  <Circle size={18} color={isDisabled ? '#444444' : '#666666'} />
                )}
              </div>
              <div style={{
                flex: 1,
                fontSize: 12,
                fontFamily: "'IBM Plex Mono', monospace",
                color: isSelected ? '#ff6666' : '#cccccc',
                wordBreak: 'break-all'
              }}>
                {url}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
