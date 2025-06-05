const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ─── In‐memory data structures ────────────────────────────────────────────────

// 1) Tickets waiting to be assigned.
const pending = [];

// 2) Map<ticketKey, socket.id> for tickets currently being processed.
const processing = new Map();

// 3) Set<ticketKey> for tickets whose results have arrived.
const completed = new Set();

// 4) Map<ticketKey, responsePayload> for tickets with ready results.
const results = new Map();

// 5) Set<Socket> of idle workers that have signaled “ready” and aren’t processing right now.
const availableWorkers = new Set();

// 6) Map<socket.id, ticketObject> to track which ticket each worker is handling.
const currentTickets = new Map();

function ticketKey(t) {
  return `${t.ticketNum}|${t.plateNum}`;
}

/**
 * Remove a ticketKey from *all* in‐memory stores: pending, processing, completed, results.
 */
function clearTicket(key) {
  // 1) If it’s still pending, remove it from pending[]
  const idx = pending.findIndex(t => ticketKey(t) === key);
  if (idx !== -1) {
    pending.splice(idx, 1);
  }

  // 2) Remove from processing, completed, results
  processing.delete(key);
  completed.delete(key);
  results.delete(key);
}

/**
 * Attempt to assign as many pending tickets as possible to idle workers.
 * Each worker can only process one ticket at a time.
 * Called from enqueue endpoint, from 'ready' handlers, and from the 1s scheduler.
 */
function assignPendingTickets() {
  while (pending.length > 0 && availableWorkers.size > 0) {
    // Take the next ticket
    const ticket = pending.shift();
    const key = ticketKey(ticket);

    // Take one arbitrary available worker:
    const workerSocket = availableWorkers.values().next().value;
    availableWorkers.delete(workerSocket);

    // Mark this ticket as processing by that socket
    processing.set(key, workerSocket.id);
    currentTickets.set(workerSocket.id, ticket);

    // Push it to that worker
    workerSocket.emit('ticket', ticket);
    console.log(`Assigned ticket ${key} to worker ${workerSocket.id}`);
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  let workerId = null;

  // If the client wants to register a human-readable ID (optional)
  socket.on('register', (id) => {
    workerId = id;
    console.log(`Worker ${workerId} registered on socket ${socket.id}`);
  });

  /**
   * Worker is saying “I’m idle and ready for work.” 
   * If they aren’t already processing something, add them to availableWorkers
   * and immediately attempt to assign a pending ticket.
   */
  socket.on('ready', () => {
    if (currentTickets.has(socket.id)) {
      // They’re already working on something; ignore.
      return;
    }
    availableWorkers.add(socket);
    assignPendingTickets();
  });

  /**
   * When a worker returns a result for the ticket they currently hold.
   * We stash that result and broadcast it to everyone.
   */
  socket.on('result', (data) => {
    const ticketObj = currentTickets.get(socket.id);
    if (!ticketObj) {
      // Worker sent a result, but we didn’t think they had a ticket—ignore.
      return;
    }
    const key = ticketKey(ticketObj);

    // 1) Remove from “processing” and mark as completed
    processing.delete(key);
    completed.add(key);
    results.set(key, data.response);

    // 2) Clear their “currently processing” slot
    currentTickets.delete(socket.id);

    // 3) Broadcast to all clients that this ticket’s result is ready
    io.emit('result', {
      ticketNum: ticketObj.ticketNum,
      plateNum: ticketObj.plateNum,
      response: data.response
    });
    console.log(`Result from worker ${workerId || socket.id} for ticket ${key}:`, data.response);

    // 4) That worker is now idle again—add them back to availableWorkers and
    //    immediately see if there’s another pending ticket to assign.
    availableWorkers.add(socket);
    assignPendingTickets();
  });

  /**
   * If a worker disconnects while idle or while processing:
   * - Remove them from availableWorkers if they were there.
   * - If they were processing a ticket, re‐enqueue that ticket at the front.
   */
  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected.`);
    if (availableWorkers.has(socket)) {
      availableWorkers.delete(socket);
    }
    const ticketObj = currentTickets.get(socket.id);
    if (ticketObj) {
      // They disconnected mid‐job. Re‐queue that ticket.
      const key = ticketKey(ticketObj);
      console.log(`Re-queueing ticket ${key} because worker disconnected.`);
      pending.unshift(ticketObj);
      processing.delete(key);
      currentTickets.delete(socket.id);
    }
  });
});

// ─── Scheduler: Every 1 second, broadcast queue size & try to assign leftovers ──────────────────────────────
setInterval(() => {
  // 1) Broadcast to all sockets how many jobs are still pending
  io.emit('queue_size', pending.length);

  // 2) In case something changed, try to push any remaining tickets to idle workers
  assignPendingTickets();
}, 1000);

// ─── REST ENDPOINTS ──────────────────────────────────────────────────────────

/**
 * Enqueue a new ticket. Body: { ticketNum: '...', plateNum: '...' }.
 * If there’s already a ticket with the same key in pending/processing/completed, return 409.
 * Otherwise, add it to pending[] and immediately try to assign it to any idle worker.
 */
app.post('/enqueue', (req, res) => {
  const { ticketNum, plateNum } = req.body;
  if (!ticketNum || !plateNum) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const key = `${ticketNum}|${plateNum}`;
  if (
    processing.has(key) ||
    pending.some(t => ticketKey(t) === key) ||
    completed.has(key)
  ) {
    return res.status(409).json({ error: 'duplicate' });
  }

  const ticket = { ticketNum, plateNum };
  pending.push(ticket);

  // Immediately broadcast new queue size and attempt assignment
  io.emit('queue_size', pending.length);
  assignPendingTickets();

  res.json({ queued: true });
});

/**
 * Poll for a result. GET /result/:ticketNum/:plateNum
 * – If results.has(key), return { response } and clear that ticket from memory.
 * – Otherwise 404 until it’s ready.
 */
app.get('/result/:ticketNum/:plateNum', (req, res) => {
  const key = `${req.params.ticketNum}|${req.params.plateNum}`;
  if (results.has(key)) {
    const response = results.get(key);
    clearTicket(key);
    return res.json(response);
  }
  res.status(404).json({ error: 'not ready' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
