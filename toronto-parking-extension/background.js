// background.js
// ─────────────────────────────────────────────────────────────────────────────
// Polling-based worker. When enabled, it polls the server every second for work
// and sends heartbeats while processing a ticket. Uses HTTP endpoints instead of
// Socket.IO. Single interval manages both tasks.
// No retries or local-storage fallbacks: each lookup is a single sendMessage.
// Assumes content.js is injected once via manifest.
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_URL = 'http://localhost:3000';
const POLL_INTERVAL_MS = 1000; // queue polling & heartbeat interval
const TARGET_URL_PREFIX = 'https://secure.toronto.ca/webapps/parking';
const ALARM_NAME = 'tp-keepalive';
const ALARM_INTERVAL_MIN = 1;

// Stable id for this worker instance. Previously this was generated every time
// `getClientId()` was called which meant heartbeats and results used a new id
// each request. The queue server expects a consistent id, so generate it once.
const CLIENT_ID = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

let enabled = false;
let busy = false;
let currentTicket = null; // { ticketNum, plateNum }
let lastProcessed = null;
let pollTimer = null;
let lookupTimeoutId = null;

// Load last enabled state from storage and set up keepalive alarm
chrome.storage.local.get(['enabled'], (res) => {
  enabled = res.enabled === true;
  if (enabled) {
    startPollAndHeartbeat();
  }
  updatePopupStatus();
});

chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_INTERVAL_MIN });

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
      body: JSON.stringify(payload),
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
  postJSON('/register', { clientId: getClientId() });
}

function getClientId() {
  // Return the stable id generated at startup
  return CLIENT_ID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling & heartbeat management (single interval)
// ─────────────────────────────────────────────────────────────────────────────
function startPollAndHeartbeat() {
  if (pollTimer) return;
  registerWorker();

  pollTimer = setInterval(async () => {
    if (!enabled) return;

    if (busy) {
      // While processing, send a heartbeat if we have valid data
      if (
        currentTicket &&
        currentTicket.ticketNum != null &&
        currentTicket.plateNum != null
      ) {
        postJSON('/heartbeat', {
          clientId: getClientId(),
          ticketNum: currentTicket.ticketNum,
          plateNum: currentTicket.plateNum,
        });
      }
      return; // don’t fetch new work while busy
    }

    // Fetch new work if not busy
    try {
      const work = await getJSON(`/work/${getClientId()}`);
      if (work && work.ticketNum && work.plateNum) {
        handleTicket(work.ticketNum, work.plateNum);
      }
    } catch (err) {
      console.error('Error fetching work:', err);
    }
  }, POLL_INTERVAL_MS);
}

function stopPollAndHeartbeat() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
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
  currentTicket = null;
  busy = false;
  updatePopupStatus();
}

const refreshParkingTab = () => {
  try {
    // Find any tab whose URL starts with TARGET_URL_PREFIX
    chrome.tabs.query({ url: `${TARGET_URL_PREFIX}*` }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id && tab.url) {
        chrome.tabs.remove(tab.id);
      }
      // If none found, just open a new one
      chrome.tabs.create({ url: TARGET_URL_PREFIX }, (newTab) => {
        console.log('Opened new parking tab as', newTab.id);
      });
    });
  } catch (reloadErr) {
    console.error('Failed to refresh parking tab:', reloadErr);
  }
}

function sendResult(response) {
  if (!currentTicket) return;
  const { ticketNum, plateNum } = currentTicket;
  postJSON('/result', {
    clientId: getClientId(),
    ticketNum,
    plateNum,
    response,
  }).then(() => {
    lastProcessed = `${ticketNum}|${plateNum}`;
    updatePopupLastProcessed();
  });
}

function handleTicket(ticketNum, plateNum) {
  currentTicket = { ticketNum, plateNum };
  busy = true;
  updatePopupStatus();

  const key = `${ticketNum}|${plateNum}`;
  console.log(`Processing ticket ${key}`);

  runLookupInParkingTab(ticketNum, plateNum)
  .then((result) => {
    sendResult(result || { error: true, message: 'Empty response from lookup.' });
  })
  .catch((err) => {
    sendResult({ error: true, message: err.message || 'Lookup failed' });
  }).finally(() => {
    // Clear the current lookup after processing
    clearCurrentLookup();
    // Refresh the parking tab to show the latest state
    refreshParkingTab();
  });
}

// Run a single sendMessage; assumes content.js is already injected via manifest
// Find an open Toronto parking tab and run the lookup there
function runLookupInParkingTab(ticketNum, plateNum) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: `${TARGET_URL_PREFIX}*` }, (tabs) => {
      const tab = tabs && tabs.length > 0 ? tabs[0] : null;
      if (!tab?.id) {
        clearTimeout(lookupTimeoutId);
        lookupTimeoutId = null;
        return reject(new Error('Toronto parking tab not found'));
      }
      const tabId = tab.id;

      // Send the runLookup message to the already‐injected content script
      chrome.tabs.sendMessage(
        tabId,
        { action: 'runLookup', ticketNum, plateNum },
        (response) => {
          clearTimeout(lookupTimeoutId);
          lookupTimeoutId = null;

          if (chrome.runtime.lastError || !response) {
            const msg = chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : 'No response from content script';
            return reject(new Error(msg));
          }
          resolve(response);
        }
      );
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Enable/disable handling & popup communication
// ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'setEnabled':
      enabled = request.enabled;
      chrome.storage.local.set({ enabled });
      updatePopupStatus();
      if (enabled) {
        startPollAndHeartbeat();
      } else {
        stopPollAndHeartbeat();
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
      // Manual lookup from popup: send the message to the first parking tab
      chrome.tabs.query({ url: `${TARGET_URL_PREFIX}*` }, (tabs) => {
        const tab = tabs && tabs.length > 0 ? tabs[0] : null;
        if (tab?.id) {
          const tabId = tab.id;
          chrome.tabs.sendMessage(
            tabId,
            {
              action: 'runLookup',
              ticketNum: request.ticketNum,
              plateNum: request.plateNum,
            },
            (resp) => {
              if (chrome.runtime.lastError || !resp) {
                const msg = chrome.runtime.lastError
                  ? chrome.runtime.lastError.message
                  : 'No response from content script';
                return sendResponse({ error: true, message: msg });
              }
              sendResponse(resp);
            }
          );
        } else {
          sendResponse({
            error: true,
            message: 'Toronto parking tab not found.',
          });
        }
      });
      return true; // indicate async sendResponse

    default:
      sendResponse({ error: true, message: 'Unknown action' });
      break;
  }
  return true;
});

// ─────────────────────────────────────────────────────────────────────────────
// Alarm-based keepalive to ensure polling resumes
// ─────────────────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  if (enabled) {
    startPollAndHeartbeat();
    chrome.tabs.query({ url: `${TARGET_URL_PREFIX}*` }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        chrome.tabs.create({ url: TARGET_URL_PREFIX });
      }
    });
  }
});
