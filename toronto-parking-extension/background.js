// background.js
// ─────────────────────────────────────────────────────────────────────────────
// Polling-based worker. When enabled it polls the server every second for work
// and sends heartbeats while processing a ticket. Uses HTTP endpoints instead of
// Socket.IO.
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_URL = 'http://localhost:3000';
const POLL_INTERVAL_MS = 1000; // queue polling & heartbeat interval
const LOOKUP_TIMEOUT_MS = 30000;

// Stable id for this worker instance
const clientId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

let enabled = false;
let busy = false;
let currentTicket = null; // { ticketNum, plateNum }
let lastProcessed = null;

let pollTimer = null;
let heartbeatTimer = null;
let lookupTimeoutId = null;

// ─────────────────────────────────────────────────────────────────────────────
// Popup communication helpers
// ─────────────────────────────────────────────────────────────────────────────
function updatePopupStatus() {
  chrome.runtime.sendMessage({ action: 'statusUpdate', enabled, busy });
}

function updatePopupLastProcessed() {
  chrome.runtime.sendMessage({ action: 'lastProcessedUpdate', last: lastProcessed });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────
async function postJSON(path, payload) {
  try {
    await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error(`POST ${path} failed`, err);
  }
}

async function getJSON(path) {
  try {
    const res = await fetch(`${SERVER_URL}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`GET ${path} failed`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker registration
// ─────────────────────────────────────────────────────────────────────────────
function registerWorker() {
  postJSON('/register', { clientId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling & heartbeat management
// ─────────────────────────────────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) return;
  registerWorker();
  pollTimer = setInterval(async () => {
    if (!enabled || busy) return;
    const work = await getJSON(`/work/${clientId}`);
    if (work && work.ticketNum && work.plateNum) {
      handleTicket(work.ticketNum, work.plateNum);
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startHeartbeat() {
  if (heartbeatTimer || !currentTicket) return;
  heartbeatTimer = setInterval(() => {
    if (currentTicket) {
      postJSON('/heartbeat', {
        clientId,
        ticketNum: currentTicket.ticketNum,
        plateNum: currentTicket.plateNum
      });
    }
  }, POLL_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket handling
// ─────────────────────────────────────────────────────────────────────────────
function clearCurrentLookup() {
  if (lookupTimeoutId) {
    clearTimeout(lookupTimeoutId);
    lookupTimeoutId = null;
  }
  stopHeartbeat();
  currentTicket = null;
  busy = false;
  updatePopupStatus();
}

function sendResult(response) {
  if (!currentTicket) return;
  const { ticketNum, plateNum } = currentTicket;
  postJSON('/result', { clientId, ticketNum, plateNum, response }).then(() => {
    lastProcessed = `${ticketNum}|${plateNum}`;
    updatePopupLastProcessed();
  });
  clearCurrentLookup();
}

function handleTicket(ticketNum, plateNum) {
  currentTicket = { ticketNum, plateNum };
  busy = true;
  updatePopupStatus();
  startHeartbeat();

  const key = `${ticketNum}|${plateNum}`;
  console.log(`Processing ticket ${key}`);

  lookupTimeoutId = setTimeout(() => {
    console.error(`Lookup for ${key} timed out; reloading page`);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
    });
    sendResult({ error: true, message: 'Lookup timeout (30 s). Page reloaded.' });
  }, LOOKUP_TIMEOUT_MS);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      console.error('No active tab found');
      sendResult({ error: true, message: 'No active tab found' });
      return;
    }
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(
      tabId,
      { action: 'runLookup', ticketNum, plateNum },
      (response) => {
        clearTimeout(lookupTimeoutId);
        lookupTimeoutId = null;
        if (chrome.runtime.lastError || !response) {
          const msg = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'No response from content script';
          sendResult({ error: true, message: msg });
        } else {
          sendResult(response);
        }
      }
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Enable/disable handling & popup communication
// ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'setEnabled':
      enabled = request.enabled;
      updatePopupStatus();
      if (enabled) startPolling(); else stopPolling();
      sendResponse({ enabled, busy });
      break;
    case 'getStatus':
      sendResponse({ enabled, busy });
      break;
    case 'getLastProcessed':
      sendResponse({ last: lastProcessed });
      break;
    case 'runLookup':
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
      return true;
    default:
      sendResponse({ error: true, message: 'Unknown action' });
  }
  return true;
});
