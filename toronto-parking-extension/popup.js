const toggleBtn = document.getElementById('toggleBtn');
const statusDiv = document.getElementById('status');

function updateUi(state) {
  toggleBtn.textContent = state.enabled ? 'Disable Worker' : 'Enable Worker';
  statusDiv.textContent = `Status: ${state.busy ? 'busy' : 'available'}`;
}

chrome.runtime.sendMessage({ action: 'getStatus' }, updateUi);

toggleBtn.addEventListener('click', () => {
  const enable = toggleBtn.textContent === 'Enable Worker';
  chrome.runtime.sendMessage({ action: 'setEnabled', enabled: enable }, updateUi);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'status') {
    updateUi(msg);
  }
});
