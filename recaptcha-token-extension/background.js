importScripts('socket.io.min.js');

const SERVER_URL = 'http://localhost:3000';
const clientId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const socket = io(SERVER_URL, { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('Token extension connected as', clientId);
  socket.emit('register', clientId);
});

socket.on('generate_token', ({ siteKey, requestId }) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      socket.emit('token', { clientId, requestId, error: 'No active tab' });
      return;
    }
    chrome.tabs.sendMessage(
      tabs[0].id,
      siteKey ? { action: 'getToken', siteKey } : { action: 'getToken' },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          socket.emit('token', { clientId, requestId, error: chrome.runtime.lastError?.message || 'No response' });
        } else if (response.error) {
          socket.emit('token', { clientId, requestId, error: response.message });
        } else {
          socket.emit('token', { clientId, requestId, token: response.token });
        }
      }
    );
  });
});
