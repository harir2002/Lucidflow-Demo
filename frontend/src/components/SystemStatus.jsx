export default function SystemStatus({ status }) {
  if (!status) {
    return <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#999999' }}>Checking...</div>;
  }

  const isReady = status.backend === 'ok' && status.ollama_available;
  const dotColor = isReady ? '#00cc00' : status.backend !== 'ok' ? '#e7000b' : '#ffaa00';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#cccccc',
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
        {status.backend !== 'ok' && 'BACKEND UNREACHABLE'}
        {status.backend === 'ok' && status.ollama_available && `LOCAL AI READY — ${status.model}`}
        {status.backend === 'ok' && !status.ollama_available && (status.ollama_message || 'LOCAL AI NOT READY')}
      </div>
    </div>
  );
}
