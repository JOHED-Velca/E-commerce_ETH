// socket_server.js
// ───────────────────────────────────────────────────────────────────────────────
// In-memory ticket queue with single Map, explicit acks via REST endpoints,
// heartbeats, and periodic requeueing. WebSocket support has been removed in
// favour of simple HTTP polling.
// Logs to the terminal whenever a ticket is assigned to a worker.
// ───────────────────────────────────────────────────────────────────────────────

const express = require('express');

// Track polling workers
const workers = new Map();

const app = express();
app.use(express.json());

// Start express app

// ───────────────────────────────────────────────────────────────────────────────
// Single in‐memory Map of all tickets. Key = "ticketNum|plateNum"
const tickets = new Map();
/*
  TicketInfo {
    status: 'pending'    | 'assigned'    | 'completed'
    assignedTo?: string    // socket.id when status==='assigned'
    response?: any         // payload from worker when done
    lastSeen?: number      // timestamp of last heartbeat from assigned worker
  }
*/

// Helper: Broadcast how many tickets are still pending
function broadcastQueueSize() {
  let pendingCount = 0;
  for (const info of tickets.values()) {
    if (info.status === 'pending') pendingCount++;
  }
  // Previously emitted via WebSocket; now just log
  console.log(`Queue size: ${pendingCount} pending`);
}

// ───────────────────────────────────────────────────────────────────────────────
// HTTP endpoint to enqueue a new ticket
app.post('/enqueue', (req, res) => {
  const { ticketNum, plateNum } = req.body;
  if (!ticketNum || !plateNum) {
    return res.status(400).json({ error: 'ticketNum and plateNum required' });
  }
  const key = `${ticketNum}|${plateNum}`;

  if (!tickets.has(key)) {
    tickets.set(key, { status: 'pending' });
    console.log(`Enqueued ticket ${key}`);
  }

  broadcastQueueSize();
  return res.json({ queued: true });
});

// ───────────────────────────────────────────────────────────────────────────────
// HTTP endpoint to list all pending tickets
app.get('/queue', (_req, res) => {
  const pendingList = [];
  for (const [key, info] of tickets.entries()) {
    if (info.status === 'pending') {
      const [ticketNum, plateNum] = key.split('|');
      pendingList.push({ ticketNum, plateNum });
    }
  }
  return res.json({ pending: pendingList });
});

// ───────────────────────────────────────────────────────────────────────────────
// HTTP endpoint to get info on a specific ticket
app.get('/ticket/:ticketNum/:plateNum', (req, res) => {
  const { ticketNum, plateNum } = req.params;
  const key = `${ticketNum}|${plateNum}`;
  if (!tickets.has(key)) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  const info = tickets.get(key);
  // Return status and, if completed, the response
  const result = { status: info.status };
  if (info.status === 'completed') {
    result.response = info.response;
  }
  if (info.status === 'assigned') {
    result.assignedTo = info.assignedTo;
  }
  res.json(result);
  tickets.delete(key);
  return;
});

// ───────────────────────────────────────────────────────────────────────────────
// Polling API for extension workers
// ───────────────────────────────────────────────────────────────────────────────

// Worker registration
app.post('/register', (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!workers.has(clientId)) {
    workers.set(clientId, { currentKey: null, lastSeen: Date.now() });
    console.log(`Worker registered ${clientId}`);
  } else {
    const w = workers.get(clientId);
    w.lastSeen = Date.now();
    workers.set(clientId, w);
  }
  return res.json({ ok: true });
});

// Worker polling for next ticket
app.get('/work/:clientId', (req, res) => {
  const { clientId } = req.params;
  let worker = workers.get(clientId);
  if (!worker) {
    worker = { currentKey: null, lastSeen: Date.now() };
    workers.set(clientId, worker);
  }
  worker.lastSeen = Date.now();
  if (worker.currentKey) return res.json({ status: 'busy' });

  let foundKey = null;
  for (const [key, info] of tickets.entries()) {
    if (info.status === 'pending') {
      foundKey = key;
      break;
    }
  }

  if (!foundKey) return res.json({ status: 'none' });

  const info = tickets.get(foundKey);
  info.status = 'assigned';
  info.assignedTo = clientId;
  info.lastSeen = Date.now();
  tickets.set(foundKey, info);

  worker.currentKey = foundKey;
  workers.set(clientId, worker);

  const [ticketNum, plateNum] = foundKey.split('|');
  console.log(`Assigning ticket ${foundKey} to worker ${clientId} via polling`);
  broadcastQueueSize();
  return res.json({ ticketNum, plateNum });
});

// Heartbeat from worker
app.post('/heartbeat', (req, res) => {
  const { clientId, ticketNum, plateNum } = req.body;
  if (!clientId || !ticketNum || !plateNum)
    return res.status(400).json({ error: 'missing fields' });
  const key = `${ticketNum}|${plateNum}`;
  const info = tickets.get(key);
  const worker = workers.get(clientId);
  if (!info || !worker || worker.currentKey !== key || info.assignedTo !== clientId)
    return res.status(404).json({ error: 'not_assigned' });
  info.lastSeen = Date.now();
  tickets.set(key, info);
  worker.lastSeen = Date.now();
  workers.set(clientId, worker);
  return res.json({ ok: true });
});

// Result from worker
app.post('/result', (req, res) => {
  const { clientId, ticketNum, plateNum, response } = req.body;
  if (!clientId || !ticketNum || !plateNum)
    return res.status(400).json({ error: 'missing fields' });
  const key = `${ticketNum}|${plateNum}`;
  const info = tickets.get(key);
  const worker = workers.get(clientId);
  if (!info || !worker || worker.currentKey !== key || info.assignedTo !== clientId)
    return res.status(404).json({ error: 'not_assigned' });

  info.status = 'completed';
  info.response = response;
  delete info.assignedTo;
  delete info.lastSeen;
  tickets.set(key, info);

  worker.currentKey = null;
  workers.set(clientId, worker);

  console.log(`Worker ${clientId} completed ticket ${key} via polling`);
  broadcastQueueSize();
  return res.json({ ok: true });
});

// Periodic sweep: requeue any ticket whose worker heartbeat is older than 5s
setInterval(() => {
  const now = Date.now();
  for (const [key, info] of tickets.entries()) {
    if (
      info.status === 'assigned' &&
      (!info.lastSeen || now - info.lastSeen > 5_000)
    ) {
      console.log(`Requeueing ticket ${key} due to missed heartbeat`);
      const worker = workers.get(info.assignedTo);
      if (worker && worker.currentKey === key) {
        worker.currentKey = null;
        workers.set(info.assignedTo, worker);
      }
      info.status = 'pending';
      delete info.assignedTo;
      delete info.lastSeen;
      tickets.set(key, info);
      broadcastQueueSize();
    }
  }
}, 1_000);

// ───────────────────────────────────────────────────────────────────────────────
// Start the HTTP server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
