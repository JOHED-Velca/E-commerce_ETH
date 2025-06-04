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