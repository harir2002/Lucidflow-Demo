import { Home, Shield, FileText, Clock, Calendar, Settings } from 'lucide-react';
import { useEffect } from 'react';

export default function Layout({ view, onViewChange, children }) {
  // Apply theme CSS variables to document root on mount
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-bg', 'var(--surface)');
    root.style.setProperty('--sidebar-bg', 'var(--surface)');
    root.style.setProperty('--sidebar-border', 'var(--border)');
    root.style.setProperty('--nav-text', 'var(--text)');
    root.style.setProperty('--nav-active', 'var(--primary)');
  }, []);

  const navigationItems = [
    { id: 'new-scan', label: 'Home', icon: Home },
    { id: 'new-scan', label: 'New scan', icon: Shield, highlight: true },
    { id: 'report', label: 'Reports', icon: FileText },
    { id: 'history', label: 'History', icon: Clock, disabled: true },
    { id: 'schedule', label: 'Schedule', icon: Calendar, disabled: true },
    { id: 'settings', label: 'Settings', icon: Settings, disabled: true },
  ];

  return (
    <div
      className="app-container"
      style={{
        minHeight: '100vh',
        background: 'var(--surface)',
        display: 'flex',
        fontFamily: 'var(--font-family)',
        color: 'var(--text)',
      }}
    >
      {/* LEFT SIDEBAR */}
      <aside
        className="sidebar"
        style={{
          width: 'var(--sidebar-width, 192px)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: 'var(--spacing-lg, 24px) var(--spacing-md, 16px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-xl, 32px)',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          className="logo"
          onClick={() => onViewChange('new-scan')}
          style={{
            cursor: 'pointer',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <img
            src="/lucidflow-logo.png"
            alt="LucidFlow"
            style={{ height: '32px', width: 'auto' }}
          />
        </div>

        {/* Navigation */}
        <nav
          className="navigation"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-sm, 12px)',
          }}
        >
          {navigationItems.map((item) => (
            <button
              key={`${item.id}-${item.label}`}
              onClick={() => !item.disabled && onViewChange(item.id)}
              className={`nav-button ${view === item.id ? 'active' : ''} ${item.disabled ? 'disabled' : ''} ${item.highlight ? 'highlight' : ''}`}
              disabled={item.disabled}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-xs, 10px)',
                background: 'transparent',
                border: view === item.id ? '1px solid var(--primary)' : '1px solid transparent',
                padding: 'var(--spacing-sm, 10px) var(--spacing-xs, 12px)',
                borderRadius: '4px',
                color: item.highlight ? 'var(--primary)' : item.disabled ? 'var(--muted)' : 'var(--text)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                fontSize: 'var(--fs-s, 13px)',
                fontWeight: item.highlight || view === item.id ? 600 : 500,
                fontFamily: 'var(--font-family)',
                transition: 'all 0.2s ease',
                opacity: item.disabled ? 0.5 : 1,
              }}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div
        className="main-content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <header
          className="header"
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: 'var(--spacing-md, 16px) var(--spacing-lg, 32px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div
            className="header-title"
            style={{
              fontSize: 'var(--fs-l, 24px)',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {view === 'new-scan' && 'Start a scan'}
            {view === 'report' && 'Report'}
            {view === 'console' && 'Scan in progress'}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main
          className="page-content"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 'var(--spacing-lg, 32px)',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
