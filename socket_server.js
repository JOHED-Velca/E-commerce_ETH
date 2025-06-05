const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const pending = [];
const processing = new Map();
const completed = new Set();
const results = new Map();

function ticketKey(t) {
  return `${t.ticketNum}|${t.plateNum}`;
}

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);
  let clientId = null;
  let current = null;

  socket.on('register', (id) => {
    clientId = id;
    console.log('Registered client', clientId);
  });

  socket.on('ready', () => {
    if (current || !clientId) return;
    const ticket = pending.shift();
    if (ticket) {
      current = ticket;
      processing.set(ticketKey(ticket), clientId);
      socket.emit('ticket', ticket);
    }
  });

  socket.on('result', (data) => {
    if (!current) return;
    const key = ticketKey(current);
    processing.delete(key);
    completed.add(key);
    results.set(key, data.response);
    io.emit('result', { ticketNum: current.ticketNum, plateNum: current.plateNum, response: data.response });
    console.log('Result from', clientId, data.response);
    current = null;
  });

  socket.on('disconnect', () => {
    if (current) {
      pending.unshift(current);
    }
    console.log('Client disconnected', clientId);
  });
});

app.post('/enqueue', (req, res) => {
  const { ticketNum, plateNum } = req.body;
  if (!ticketNum || !plateNum) {
    return res.status(400).json({ error: 'missing fields' });
  }
  const key = `${ticketNum}|${plateNum}`;
  if (processing.has(key) || pending.some(t => ticketKey(t) === key) || completed.has(key)) {
    return res.status(409).json({ error: 'duplicate' });
  }
  const ticket = { ticketNum, plateNum };
  pending.push(ticket);
  io.emit('queue_size', pending.length);
  res.json({ queued: true });
});

app.get('/result/:ticketNum/:plateNum', (req, res) => {
  const key = `${req.params.ticketNum}|${req.params.plateNum}`;
  if (results.has(key)) {
    const response = results.get(key);
    results.delete(key);
    return res.json({ response });
  }
  res.status(404).json({ error: 'not ready' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
