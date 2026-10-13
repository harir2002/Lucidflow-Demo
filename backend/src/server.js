const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Serve screenshots as static files
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
app.use('/screenshots', express.static(SCREENSHOTS_DIR));

// Socket.io — clients join a room per scan_id to get live updates
io.on('connection', (socket) => {
  socket.on('subscribe', (scanId) => socket.join(scanId));
  socket.on('unsubscribe', (scanId) => socket.leave(scanId));
});

app.use('/api/scans', require('./routes/scans')(io));
app.use('/api/report', require('./routes/report'));
app.use('/api/system', require('./routes/system'));
app.use('/api/license', require('./routes/license'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'fully-local' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4500;
server.listen(PORT, () => {
  console.log('═'.repeat(60));
  console.log('  IRDAI Dark Pattern Scanner — LOCAL BACKEND');
  console.log('═'.repeat(60));
  console.log(`  API running at    : http://localhost:${PORT}`);
  console.log(`  Screenshots served: http://localhost:${PORT}/screenshots`);
  console.log(`  Mode              : Fully offline (no external API calls)`);
  console.log('═'.repeat(60));
});
