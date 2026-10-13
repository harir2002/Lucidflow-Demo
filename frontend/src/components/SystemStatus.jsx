export default function SystemStatus({ status }) {
  if (!status) {
    return <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C7285' }}>Checking...</div>;
  }

  const isReady = status.backend === 'ok' && status.ollama_available;
  const dotColor = isReady ? '#4A7C59' : status.backend !== 'ok' ? '#B8442E' : '#C99A2E';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#8B9BAA',
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
        {status.backend !== 'ok' && 'BACKEND UNREACHABLE'}
        {status.backend === 'ok' && status.ollama_available && `LOCAL AI READY — ${status.model}`}
        {status.backend === 'ok' && !status.ollama_available && (status.ollama_message || 'LOCAL AI NOT READY')}
      </div>
    </div>
  );
}
