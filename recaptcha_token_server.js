const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const clients = [];
let rrIndex = 0;
const tokens = [];

io.on('connection', (socket) => {
  console.log('Extension connected', socket.id);
  clients.push(socket);
  socket.on('register', (id) => {
    socket.clientId = id;
    console.log('Registered', id);
  });

  socket.on('token', ({ requestId, token, error }) => {
    if (error) {
      console.error('Token error from', socket.clientId, error);
    } else if (token) {
      tokens.push(token);
      console.log('Received token from', socket.clientId);
    }
  });

  socket.on('disconnect', () => {
    const idx = clients.indexOf(socket);
    if (idx >= 0) clients.splice(idx, 1);
    console.log('Client disconnected', socket.clientId);
  });
});

function requestTokenFromClient() {
  if (clients.length === 0) return;
  const socket = clients[rrIndex % clients.length];
  rrIndex = (rrIndex + 1) % clients.length;
  const requestId = Date.now() + '_' + Math.random().toString(36).slice(2);
  socket.emit('generate_token', { requestId });
}

app.get('/token', (req, res) => {
  if (tokens.length === 0) {
    requestTokenFromClient();
    return res.status(503).json({ error: 'No tokens available' });
  }
  const token = tokens.shift();
  requestTokenFromClient();
  res.json({ token });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Token server running on', PORT);
  requestTokenFromClient();
});
