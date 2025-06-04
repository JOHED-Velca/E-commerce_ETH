chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runLookup') {
    console.log('Background: Received runLookup message:', request);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        console.log('Background: Injecting script into tab:', tabs[0].id);
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (ticketNum, plateNum) => {
            console.log('Background: Executing runLookup in content script with:', { ticketNum, plateNum });
            chrome.runtime.sendMessage({
              action: 'runLookup',
              ticketNum,
              plateNum
            });
          },
          args: [request.ticketNum, request.plateNum]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Background: Injection error:', chrome.runtime.lastError.message);
            sendResponse({ error: true, message: chrome.runtime.lastError.message });
          }
        });
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