importScripts('socket.io.min.js');

const SERVER_URL = 'http://localhost:3000';
const clientId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const socket = io(SERVER_URL, { transports: ['websocket'] });
let busy = false;

function requestTicket() {
  if (!busy) {
    socket.emit('ready', { clientId });
  }
}

socket.on('connect', () => {
  console.log('Background: connected to server as', clientId);
  socket.emit('register', clientId);
  requestTicket();
});

socket.on('ticket', ({ ticketNum, plateNum }) => {
  console.log('Background: received ticket', ticketNum, plateNum);
  busy = true;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'runLookup', ticketNum, plateNum },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Background: sendMessage error:', chrome.runtime.lastError.message);
            socket.emit('result', { clientId, ticketNum, plateNum, response: { error: true, message: chrome.runtime.lastError.message } });
          } else {
            socket.emit('result', { clientId, ticketNum, plateNum, response });
          }
          busy = false;
          requestTicket();
        }
      );
    } else {
      socket.emit('result', { clientId, ticketNum, plateNum, response: { error: true, message: 'No active tab found' } });
      busy = false;
      requestTicket();
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runLookup') {
    console.log('Background: Received runLookup message:', request);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        console.log('Background: Sending runLookup to tab:', tabs[0].id);
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'runLookup', ticketNum: request.ticketNum, plateNum: request.plateNum },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Background: sendMessage error:', chrome.runtime.lastError.message);
              sendResponse({ error: true, message: chrome.runtime.lastError.message });
            } else {
              sendResponse(response);
            }
          }
        );
      } else {
        console.error('Background: No active tab found');
        sendResponse({ error: true, message: 'No active tab found' });
      }
    });
  } else if (request.action === 'lookupResult') {
    console.log('Background: Forwarding lookupResult:', request);
    chrome.runtime.sendMessage(request); // Forward to popup
  }
  return true; // Keep message channel open for async response
});