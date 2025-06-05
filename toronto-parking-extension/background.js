// background.js
// ─────────────────────────────────────────────────────────────────────────────
// Chrome MV3 service worker that:
//  • Only connects to Socket.IO when enabled.
//  • Every 5 seconds, checks WebSocket health; if not connected and enabled, reconnect.
//  • When connected and enabled (and not already busy), emits “ready” to fetch tickets.
//  • Implements 30 s lookup timeout + page reload.
//  • Sends a heartbeat every 10 s while busy.
//  • Tracks lastProcessed and notifies popup.
// ─────────────────────────────────────────────────────────────────────────────

importScripts('socket.io.min.js');

const SERVER_URL = 'http://localhost:3000';
const RECONNECT_INTERVAL_MS = 5000; // check every 5 seconds

// ─────────────────────────────────────────────────────────────────────────────
// Generate a stable clientId for registration
// ─────────────────────────────────────────────────────────────────────────────
const clientId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

let socket = null;
let busy = false;
let enabled = false;       // Worker is disabled by default
let currentTicket = null;  // { ticketNum, plateNum }
let lookupTimeoutId = null;
let heartbeatIntervalId = null;
let lastProcessed = null;

// ─────────────────────────────────────────────────────────────────────────────
// Popup communication: send status and lastProcessed updates
// ─────────────────────────────────────────────────────────────────────────────
function updatePopupStatus() {
  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    enabled,
    busy
  });
}

function updatePopupLastProcessed() {
  chrome.runtime.sendMessage({
    action: 'lastProcessedUpdate',
    last: lastProcessed
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// If worker is enabled, not busy, and socket is connected, request a ticket.
// ─────────────────────────────────────────────────────────────────────────────
function requestTicket() {
  if (enabled && !busy && socket && socket.connected) {
    console.log('Background: emitting ready to request next ticket');
    socket.emit('ready');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear in-flight lookup: cancel timeout & heartbeat, mark busy=false, notify popup.
// ─────────────────────────────────────────────────────────────────────────────
function clearCurrentLookup() {
  if (lookupTimeoutId !== null) {
    clearTimeout(lookupTimeoutId);
    lookupTimeoutId = null;
  }
  if (heartbeatIntervalId !== null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  currentTicket = null;
  busy = false;
  updatePopupStatus();
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialize Socket.IO connection and event handlers.
// Called when enabled transitions to true.
// ─────────────────────────────────────────────────────────────────────────────
function initSocket() {
  if (socket) return; // Already initialized

  socket = io(SERVER_URL, {
    transports: ['websocket'],
    autoConnect: false
  });

  // Prevent SW from sleeping until initial connect
  chrome.runtime.requestKeepAlive();

  socket.on('connect', () => {
    console.log('Background: WebSocket connected');
    socket.emit('register', clientId);
    updatePopupStatus();
    requestTicket(); // immediately ask for work

    // Release keepAlive once connected and initial ready is sent
    chrome.runtime.releaseKeepAlive();
  });

  socket.on('disconnect', (reason) => {
    console.warn('Background: WebSocket disconnected:', reason);
    // If in-flight ticket, drop it
    if (currentTicket) {
      clearTimeout(lookupTimeoutId);
      lookupTimeoutId = null;
      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
      }
      console.warn(`Dropping ticket ${currentTicket.ticketNum}|${currentTicket.plateNum} due to disconnect`);
      currentTicket = null;
      busy = false;
      updatePopupStatus();
    }
  });

  socket.on('assign_ticket', (data, serverAck) => {
    const { ticketNum, plateNum } = data;
    const key = `${ticketNum}|${plateNum}`;

    if (busy) {
      console.warn(`Already busy; refusing ticket ${key}`);
      return serverAck({ status: 'busy' });
    }

    currentTicket = { ticketNum, plateNum };
    busy = true;
    updatePopupStatus();

    console.log(`Background: accepted ticket ${key}`);
    serverAck({ status: 'received' });

    // Send heartbeat every 10 s
    heartbeatIntervalId = setInterval(() => {
      if (busy && currentTicket && socket && socket.connected) {
        socket.emit('heartbeat', { ticketNum, plateNum });
      }
    }, 10000);

    // 30 s watchdog: if content.js doesn't respond, reload page and report error
    lookupTimeoutId = setTimeout(() => {
      console.error(`Lookup for ${key} timed out after 30 s; reloading page`);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
      if (socket && socket.connected) {
        socket.emit('ticket_result', {
          ticketNum,
          plateNum,
          response: { error: true, message: 'Lookup timeout (30 s). Page reloaded.' }
        }, (ack) => {
          clearCurrentLookup();
          requestTicket();
        });
      } else {
        clearCurrentLookup();
      }
    }, 30000);

    // Forward lookup request to content.js
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        console.error('Background: No active tab to process ticket');
        clearTimeout(lookupTimeoutId);
        lookupTimeoutId = null;
        if (heartbeatIntervalId) {
          clearInterval(heartbeatIntervalId);
          heartbeatIntervalId = null;
        }
        if (socket && socket.connected) {
          socket.emit('ticket_result', {
            ticketNum,
            plateNum,
            response: { error: true, message: 'No active tab found' }
          }, (ack) => {
            clearCurrentLookup();
            requestTicket();
          });
        } else {
          clearCurrentLookup();
        }
        return;
      }

      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(
        tabId,
        { action: 'runLookup', ticketNum, plateNum },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            const errorMsg = chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : 'No response from content script';
            console.error('Background: runLookup error:', errorMsg);

            clearTimeout(lookupTimeoutId);
            lookupTimeoutId = null;
            if (heartbeatIntervalId) {
              clearInterval(heartbeatIntervalId);
              heartbeatIntervalId = null;
            }

            if (socket && socket.connected) {
              socket.emit('ticket_result', {
                ticketNum,
                plateNum,
                response: { error: true, message: errorMsg }
              }, (ack) => {
                clearCurrentLookup();
                requestTicket();
              });
            } else {
              clearCurrentLookup();
            }
          } else {
            clearTimeout(lookupTimeoutId);
            lookupTimeoutId = null;
            if (heartbeatIntervalId) {
              clearInterval(heartbeatIntervalId);
              heartbeatIntervalId = null;
            }

            if (socket && socket.connected) {
              socket.emit('ticket_result', {
                ticketNum,
                plateNum,
                response
              }, (ack) => {
                if (ack.ok) {
                  lastProcessed = key;
                  updatePopupLastProcessed();
                }
                clearCurrentLookup();
                requestTicket();
              });
            } else {
              clearCurrentLookup();
            }
          }
        }
      );
    });
  });

  socket.on('ticket_completed', (data, ack) => {
    const { ticketNum, plateNum, response } = data;
    console.log(`Ticket ${ticketNum}|${plateNum} completed by another worker`, response);
    ack?.({ ok: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tear down Socket.IO: drop in-flight work, disconnect, remove handlers.
// Called when enabled transitions to false.
// ─────────────────────────────────────────────────────────────────────────────
function tearDownSocket() {
  if (!socket) return;

  if (currentTicket) {
    clearTimeout(lookupTimeoutId);
    lookupTimeoutId = null;
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    console.warn(`Dropping ticket ${currentTicket.ticketNum}|${currentTicket.plateNum} due to disable`);
    currentTicket = null;
    busy = false;
    updatePopupStatus();
  }

  socket.disconnect();
  socket.removeAllListeners();
  socket = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Periodic health check: every 5 s, if enabled but socket is not healthy, reconnect.
// Also, if socket is healthy and not busy, request next ticket.
// ─────────────────────────────────────────────────────────────────────────────
setInterval(() => {
  if (enabled) {
    if (!socket || !socket.connected) {
      console.log('Background: WebSocket not connected; attempting to initialize/reconnect');
      initSocket();
    } else {
      // If connected and not busy, ask for work
      requestTicket();
    }
  }
}, RECONNECT_INTERVAL_MS);

// ─────────────────────────────────────────────────────────────────────────────
// POPUP COMMUNICATION & MANUAL LOOKUP
// ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'setEnabled':
      enabled = request.enabled;
      updatePopupStatus();
      if (enabled) {
        initSocket();
      } else {
        tearDownSocket();
      }
      sendResponse({ enabled, busy });
      break;

    case 'getStatus':
      sendResponse({ enabled, busy });
      break;

    case 'getLastProcessed':
      sendResponse({ last: lastProcessed });
      break;

    case 'runLookup':
      // Popup manually triggers a lookup (rare). Forward to content.js:
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: 'runLookup', ticketNum: request.ticketNum, plateNum: request.plateNum },
            (response) => {
              sendResponse(response || { error: true, message: 'No response from content' });
            }
          );
        } else {
          sendResponse({ error: true, message: 'No active tab found' });
        }
      });
      return true; // Indicate async sendResponse

    default:
      sendResponse({ error: true, message: 'Unknown action' });
  }
  return true; // Keep message channel open if needed
});
