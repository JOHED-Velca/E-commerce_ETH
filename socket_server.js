// socket_server.js
// ───────────────────────────────────────────────────────────────────────────────
// In‐memory ticket queue with single Map, explicit acks via "assign_ticket" callbacks,
// heartbeats, and HTTP endpoints. Tickets are removed on failure instead of re‐queued.
// Logs to the terminal whenever a ticket is assigned to a worker.
// ───────────────────────────────────────────────────────────────────────────────

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Track polling workers
const workers = new Map();

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  // Socket.IO heartbeats: ping every 10s, timeout if no pong in 5s
  pingInterval: 10000,
  pingTimeout: 5000,
  cors: { origin: '*' },
});

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
  io.emit('queue_size', { pendingCount });
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


// ───────────────────────────────────────────────────────────────────────────────
// Socket.IO handling: registration, ready, assign_ticket, result, heartbeats, disconnect
io.on('connection', (socket) => {
  console.log(`Worker connected: ${socket.id}`);
  let currentKey = null; // Which ticket (key) this socket has assigned, if any

  // 1) Worker registration (no ack callback expected)
  socket.on('register', (data) => {
    console.log(`Worker ${socket.id} registered`);
    socket.emit('registered', { ok: true });
  });

  // 2) Worker says "ready" to get next ticket (no ack callback)
  socket.on('ready', () => {
    if (currentKey) {
      // Already processing something; just ignore
      return;
    }

    // Find the first pending ticket in the Map
    let foundKey = null;
    for (const [key, info] of tickets.entries()) {
      if (info.status === 'pending') {
        foundKey = key;
        break;
      }
    }

    if (!foundKey) {
      // No pending tickets right now; notify the worker
      socket.emit('no_ticket');
      return;
    }

    // Mark as assigned
    const info = tickets.get(foundKey);
    info.status = 'assigned';
    info.assignedTo = socket.id;
    info.lastSeen = Date.now();
    tickets.set(foundKey, info);

    currentKey = foundKey;
    const [ticketNum, plateNum] = foundKey.split('|');

    // Log assignment to terminal
    console.log(`Assigning ticket ${foundKey} to worker ${socket.id}`);

    // Emit the ticket to the worker, with a callback for ack
    socket.emit(
      'assign_ticket',
      { ticketNum, plateNum },
      (workerAck) => {
        // This callback runs when the worker acknowledges or rejects
        if (!workerAck || workerAck.status !== 'received') {
          // Worker did not ack → remove ticket entirely
          console.warn(`Worker ${socket.id} failed to ack ticket ${foundKey}; removing.`);
          if (tickets.has(foundKey)) {
            tickets.delete(foundKey);
            broadcastQueueSize();
          }
          currentKey = null;
        }
        // If workerAck.status==='received', keep status==='assigned'
      }
    );

    broadcastQueueSize();
  });

  // 3) Worker returns a result for a ticket
  socket.on('ticket_result', (data, ack) => {
    const { ticketNum, plateNum, response } = data;
    const key = `${ticketNum}|${plateNum}`;
    const info = tickets.get(key);

    // Validate ownership
    if (!info || info.status !== 'assigned' || info.assignedTo !== socket.id) {
      return ack?.({ ok: false, reason: 'not_owner_or_invalid_ticket' });
    }

    // Mark as completed and store the response
    info.status = 'completed';
    info.response = response;
    delete info.assignedTo;
    delete info.lastSeen;
    tickets.set(key, info);
    currentKey = null;

    console.log(`Worker ${socket.id} completed ticket ${key}`);

    // Broadcast to all workers that this ticket is done
    io.emit('ticket_completed', { ticketNum, plateNum, response }, (bcastAck) => {
      // No action needed for broadcast acks
    });

    ack({ ok: true });
  });

  // 4) Heartbeat from the worker (e.g., every 10 seconds)
  socket.on('heartbeat', () => {
    if (currentKey) {
      const info = tickets.get(currentKey);
      if (info && info.assignedTo === socket.id) {
        info.lastSeen = Date.now();
        tickets.set(currentKey, info);
      }
    }
  });

  // 5) Worker disconnects
  socket.on('disconnect', () => {
    console.log(`Worker disconnected: ${socket.id}`);
    if (currentKey) {
      const info = tickets.get(currentKey);
      if (
        info &&
        info.status === 'assigned' &&
        info.assignedTo === socket.id
      ) {
        // Remove ticket entirely
        console.log(`Removing ticket ${currentKey} due to worker disconnect`);
        tickets.delete(currentKey);
        broadcastQueueSize();
      }
      currentKey = null;
    }
  });
}); // end io.on('connection')

// ───────────────────────────────────────────────────────────────────────────────
// Periodic sweep: requeue any ticket whose worker heartbeat is older than 5s
setInterval(() => {
  const now = Date.now();
  for (const [key, info] of tickets.entries()) {
    if (
      info.status === 'assigned' &&
      info.lastSeen &&
      now - info.lastSeen > 5_000
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
// Start the HTTP + WebSocket server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket server listening on port ${PORT}`);
});
