// background.js
// ─────────────────────────────────────────────────────────────────────────────
// Polling-based worker. When enabled it polls the server every second for work
// and sends heartbeats while processing a ticket. Uses HTTP endpoints instead of
// Socket.IO. Single interval manages both tasks.
// If “Could not establish connection” is detected, we re-inject content.js and retry.
// We also listen for “lookupResult” messages that content.js may send after navigation.
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_URL = 'http://localhost:3000';
const POLL_INTERVAL_MS = 1000; // queue polling & heartbeat interval
const LOOKUP_TIMEOUT_MS = 30000;
const TARGET_URL_PREFIX = 'https://secure.toronto.ca/webapps/parking';

let enabled = false;
let busy = false;
let currentTicket = null; // { ticketNum, plateNum }
let lastProcessed = null;
let pollTimer = null;
let lookupTimeoutId = null;

// Keep a temporary resolver so that if content.js sends back “lookupResult” we
// can fulfill the original lookup Promise.
let pendingLookupResolver = null;

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
  // Stable id for this worker instance
  return `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
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
  pendingLookupResolver = null;
}

// Send the final lookup result (or error) back to the server
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
  clearCurrentLookup();
}

// Main entry for handling a new ticket
function handleTicket(ticketNum, plateNum) {
  currentTicket = { ticketNum, plateNum };
  busy = true;
  updatePopupStatus();

  const key = `${ticketNum}|${plateNum}`;
  console.log(`Processing ticket ${key}`);

  // If no lookup within TIMEOUT, reload and report error
  lookupTimeoutId = setTimeout(() => {
    console.error(`Lookup for ${key} timed out; reloading page`);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
    });
    sendResult({ error: true, message: 'Lookup timeout (30 s). Page reloaded.' });
  }, LOOKUP_TIMEOUT_MS);

  // Try to run the lookup; if the content script isn't there, re-inject and retry once
  runLookupInActiveTab(ticketNum, plateNum)
    .then((result) => {
      if (result) {
        sendResult(result);
      } else {
        // Should not happen—runLookup always resolves with something.
        sendResult({ error: true, message: 'Empty response from lookup.' });
      }
    })
    .catch((err) => {
      sendResult({ error: true, message: err.message || 'Lookup failed' });
    });
}

// Attempt to inject content.js, send “runLookup,” and await a response.
// If “Could not establish connection” is seen, re‐inject and retry once.
function runLookupInActiveTab(ticketNum, plateNum) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        clearTimeout(lookupTimeoutId);
        lookupTimeoutId = null;
        return reject(new Error('No active tab found'));
      }
      const tabId = tab.id;

      // Ensure we’re on the correct domain
      if (!tab.url.startsWith(TARGET_URL_PREFIX)) {
        clearTimeout(lookupTimeoutId);
        lookupTimeoutId = null;
        return reject(
          new Error('Lookup can only run on the Toronto parking page.')
        );
      }

      // Step 1: Inject content.js
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ['content.js'],
        },
        () => {
          // After injection, send the “runLookup” message
          sendRunLookupMessage(tabId, ticketNum, plateNum, /*retry=*/ false)
            .then((result) => {
              clearTimeout(lookupTimeoutId);
              lookupTimeoutId = null;
              resolve(result);
            })
            .catch((err) => {
              // If the error is “Could not establish connection…”, try once more
              if (
                err.message &&
                err.message.includes('Receiving end does not exist')
              ) {
                console.warn(
                  'First sendMessage failed—retrying after re-injection'
                );
                // Re-inject and retry
                chrome.scripting.executeScript(
                  {
                    target: { tabId },
                    files: ['content.js'],
                  },
                  () => {
                    sendRunLookupMessage(tabId, ticketNum, plateNum, /*retry=*/ true)
                      .then((result2) => {
                        clearTimeout(lookupTimeoutId);
                        lookupTimeoutId = null;
                        resolve(result2);
                      })
                      .catch((err2) => {
                        clearTimeout(lookupTimeoutId);
                        lookupTimeoutId = null;
                        reject(err2);
                      });
                  }
                );
              } else {
                clearTimeout(lookupTimeoutId);
                lookupTimeoutId = null;
                reject(err);
              }
            });
        }
      );
    });

    // Also listen for a “lookupResult” event, in case content.js navigated and sent by runtime.sendMessage
    function onLookupResult(msg, sender) {
      if (msg.action === 'lookupResult') {
        chrome.runtime.onMessage.removeListener(onLookupResult);
        if (pendingLookupResolver) {
          pendingLookupResolver(msg.result);
          pendingLookupResolver = null;
        }
      }
    }
    chrome.runtime.onMessage.addListener(onLookupResult);
  });
}

// Send the actual runLookup message; return a promise that resolves with the response
function sendRunLookupMessage(tabId, ticketNum, plateNum, retry) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: 'runLookup', ticketNum, plateNum },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          const msg = chrome.runtime.lastError
            ? chrome.runtime.lastError.message
            : 'No response from content script';

          // If this was our retry attempt, give up
          if (retry) {
            return reject(new Error(msg));
          }
          // Otherwise, report back up so caller can choose to re-inject & retry
          return reject(new Error(msg));
        }
        // Normal successful response
        resolve(response);
      }
    );

    // Set up pendingLookupResolver in case content.js does navigation and calls chrome.runtime.sendMessage({action:'lookupResult', result})
    pendingLookupResolver = resolve;
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
      // If user manually clicks “Lookup” from popup, we do the same injection & send logic:
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url.startsWith(TARGET_URL_PREFIX)) {
          const tabId = tab.id;
          chrome.scripting.executeScript(
            {
              target: { tabId },
              files: ['content.js'],
            },
            () => {
              sendRunLookupMessage(
                tabId,
                request.ticketNum,
                request.plateNum,
                /*retry=*/ false
              )
                .then((resp) => sendResponse(resp))
                .catch((err) =>
                  sendResponse({ error: true, message: err.message })
                );
            }
          );
        } else {
          sendResponse({
            error: true,
            message: 'Lookup can only run on the Toronto parking page.',
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
