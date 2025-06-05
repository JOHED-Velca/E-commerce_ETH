// popup.js
// ─────────────────────────────────────────────────────────────────────────────
// Query background for current status + lastProcessed. Update UI accordingly.
// Toggle button sends setEnabled→background. Also listen for live status updates.
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const stateText = document.getElementById('statetext');
  const lastText = document.getElementById('lastText');

  // Internal state
  let enabled = false;
  let busy = false;

  // 1) Fetch initial status & last processed from background
  chrome.runtime.sendMessage({ action: 'getStatus' }, (resp) => {
    if (resp) {
      enabled = resp.enabled;
      busy = resp.busy;
      updateButton();
    }
  });
  chrome.runtime.sendMessage({ action: 'getLastProcessed' }, (resp) => {
    if (resp && resp.last) {
      lastText.innerText = resp.last;
    }
  });

  // 2) Listen for live status updates from background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'statusUpdate') {
      enabled = msg.enabled;
      busy = msg.busy;
      updateButton();
    }
    if (msg.action === 'lastProcessedUpdate') {
      lastText.innerText = msg.last;
    }
  });

  // 3) Toggle button click: enable or disable worker
  toggleBtn.addEventListener('click', () => {
    enabled = !enabled;
    chrome.runtime.sendMessage({ action: 'setEnabled', enabled }, (resp) => {
      // resp should echo { enabled, busy }
      if (resp) {
        enabled = resp.enabled;
        busy = resp.busy;
        updateButton();
      }
    });
  });

  // 4) Update the button’s appearance/text and the status line
  function updateButton() {
    if (enabled) {
      toggleBtn.classList.remove('disabled');
      toggleBtn.classList.add('enabled');
      toggleBtn.innerText = busy ? 'Working...' : 'Disable Worker';
      stateText.innerText = busy ? 'busy' : 'enabled';
    } else {
      toggleBtn.classList.remove('enabled');
      toggleBtn.classList.add('disabled');
      toggleBtn.innerText = 'Enable Worker';
      stateText.innerText = 'disabled';
    }
  }
});
