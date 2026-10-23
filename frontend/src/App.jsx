import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { SOCKET_URL } from './api/client';
import Layout from './components/Layout';
import NewScan from './pages/NewScan';
import ScanConsole from './pages/ScanConsole';
import ReportDashboard from './pages/ReportDashboard';

export default function App() {
  const [view, setView] = useState('new-scan'); // new-scan | console | report
  const [activeScanId, setActiveScanId] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);
    return () => s.close();
  }, []);

  const handleScanCreated = (scanId) => {
    setActiveScanId(scanId);
    setView('console');
  };

  return (
    <Layout view={view} onViewChange={setView}>
      {view === 'new-scan' && <NewScan onScanCreated={handleScanCreated} />}
      {view === 'console' && activeScanId && <ScanConsole scanId={activeScanId} socket={socket} onViewReport={() => setView('report')} />}
      {view === 'report' && activeScanId && <ReportDashboard scanId={activeScanId} />}
    </Layout>
  );
}
