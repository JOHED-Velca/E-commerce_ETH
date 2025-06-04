async function waitForSelector(selector, timeout) {
  return new Promise((resolve) => {
    console.log(`Waiting for selector: ${selector}...`);
    const element = document.querySelector(selector);
    if (element) {
      console.log(`Found ${selector} immediately`);
      return resolve(element);
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Found ${selector} via observer`);
        observer.disconnect();
        resolve(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      console.log(`Timeout waiting for ${selector}`);
      resolve(null);
    }, timeout);
  });
}

async function torontoParkingGetTicketAmount(violationNum, plateNum, maxAttempts = 3) {
  console.log('Starting torontoParkingGetTicketAmount with', { violationNum, plateNum });

  // Normalize URL for comparison (remove query params, hash, and trailing slashes)
  const currentUrl = window.location.href.split('?')[0].split('#')[0].replace(/\/$/, '');
  const targetUrl = 'https://secure.toronto.ca/webapps/parking'.replace(/\/$/, '');

  // Track navigation attempts to prevent infinite loops
  let navigationAttempts = parseInt(localStorage.getItem('torontoParkingNavigationAttempts') || '0', 10);
  if (navigationAttempts > 5) {
    localStorage.removeItem('torontoParkingNavigationAttempts');
    localStorage.removeItem('torontoParkingParams');
    return { error: true, message: 'Too many navigation attempts, stopping to prevent loop' };
  }

  // Check if we're on the correct page; if not, navigate and store parameters
  if (currentUrl !== targetUrl) {
    console.log(`Not on the correct page (current: ${currentUrl}, target: ${targetUrl}), navigating...`);
    localStorage.setItem('torontoParkingParams', JSON.stringify({ violationNum, plateNum }));
    localStorage.setItem('torontoParkingNavigationAttempts', (navigationAttempts + 1).toString());
    window.location.href = 'https://secure.toronto.ca/webapps/parking/';
    return { error: true, message: 'Navigating to parking page...' };
  }

  // Reset navigation attempts
  localStorage.removeItem('torontoParkingNavigationAttempts');

  // Retrieve parameters from localStorage if present
  const params = JSON.parse(localStorage.getItem('torontoParkingParams') || '{}');
  if (params.violationNum && params.plateNum) {
    console.log('Using params from localStorage:', params);
    violationNum = params.violationNum;
    plateNum = params.plateNum;
    localStorage.removeItem('torontoParkingParams'); // Clean up
  }

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    try {
      console.log('Attempt', attempts + 1, 'starting...');
      // Wait for page to be fully loaded
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          console.log('Page already loaded');
          resolve();
        } else {
          console.log('Waiting for page to load...');
          window.addEventListener('load', resolve, { once: true });
        }
      });

      // Simulate human scroll and mouse movement
      const moveMouse = (x, y) => {
        const event = new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true });
        document.dispatchEvent(event);
      };
      console.log('Simulating mouse movement 1...');
      moveMouse(100 + Math.random() * 200, 200 + Math.random() * 100);
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (900 - 300 + 1)) + 300));
      console.log('Simulating mouse movement 2...');
      moveMouse(300 + Math.random() * 100, 400 + Math.random() * 100);
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (700 - 200 + 1)) + 200));
      console.log('Scrolling window...');
      window.scrollBy(0, 200 + Math.random() * 200);
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (700 - 200 + 1)) + 200));

      // Agree to terms
      const termsButton = await waitForSelector('#cot-terms-agree', 5000);
      if (!termsButton) throw new Error('Terms button (#cot-terms-agree) not found');
      console.log('Hovering over terms button...');
      termsButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (800 - 200 + 1)) + 200));
      console.log('Clicking terms button...');
      termsButton.click();
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (900 - 400 + 1)) + 400));

      // Click "Lookup by License Plate"
      const lookupButton = await waitForSelector('#lookupvialp', 5000);
      if (!lookupButton) throw new Error('Lookup button (#lookupvialp) not found');
      console.log('Hovering over lookup button...');
      lookupButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (800 - 200 + 1)) + 200));
      console.log('Clicking lookup button...');
      lookupButton.click();
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (900 - 400 + 1)) + 400));

      // Fill ticket number
      const ticketInput = await waitForSelector('#ticketnumB', 5000);
      if (!ticketInput) throw new Error('Ticket input (#ticketnumB) not found');
      console.log('Clicking ticket input...');
      ticketInput.click();
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (400 - 100 + 1)) + 100));
      ticketInput.value = '';
      console.log('Filling ticket number:', violationNum);
      for (const char of violationNum) {
        ticketInput.value += char;
        ticketInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (200 - 80 + 1)) + 80));
      }
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (400 - 100 + 1)) + 100));

      // Check for input errors
      const ticketInputErrorXpaths = [
        "//*[contains(text(), 'The tag number must be in the format XXXXXXXX')]",
        "//small[contains(text(), 'format XXXXXXXX.')]",
        "//p[contains(text(), 'You must provide a valid tag/ticket number.')]",
        "//div[contains(@class, 'form-group') and contains(@class, 'has-error')]/small[contains(text(), 'tag number must be.')]"
      ];
      console.log('Checking for ticket input errors...');
      for (const xpath of ticketInputErrorXpaths) {
        const elements = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
        let element = elements.iterateNext();
        while (element) {
          if (element.offsetParent !== null && (!element.dataset.fvResult || element.dataset.fvResult === 'INVALID')) {
            return { error: true, message: element.textContent.trim() };
          }
          element = elements.iterateNext();
        }
      }

      // Fill plate number
      const plateInput = await waitForSelector('#licenseplate', 5000);
      if (!plateInput) throw new Error('Plate input (#licenseplate) not found');
      console.log('Clicking plate input...');
      plateInput.click();
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (400 - 100 + 1)) + 100));
      plateInput.value = '';
      console.log('Filling plate number:', plateNum);
      for (const char of plateNum) {
        plateInput.value += char;
        plateInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (200 - 80 + 1)) + 80));
      }
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (400 - 100 + 1)) + 100));

      // Check for input errors again
      console.log('Checking for plate input errors...');
      for (const xpath of ticketInputErrorXpaths) {
        const elements = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
        let element = elements.iterateNext();
        while (element) {
          if (element.offsetParent !== null && (!element.dataset.fvResult || element.dataset.fvResult === 'INVALID')) {
            return { error: true, message: element.textContent.trim() };
          }
          element = elements.iterateNext();
        }
      }

      // Submit using the same selector as the driverless script
      const submitButton = await waitForSelector('#singlebutton', 5000);
      if (!submitButton) throw new Error('Submit button (#singlebutton) not found');
      console.log('Hovering over submit button...');
      submitButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (800 - 200 + 1)) + 200));
      console.log('Clicking submit button...');
      submitButton.click();
      console.log('Submit button clicked, waiting for response...');
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (1500 - 800 + 1)) + 800));

      // Wait for table or no-results message
      const table = await waitForSelector('#parkingtickets', 10000);
      if (!table) {
        const noResults = await waitForSelector('p:contains("No tickets found")', 5000);
        if (noResults) {
          return { error: true, message: 'No tickets found for this ticket number and plate combination' };
        }
        throw new Error('No ticket table (#parkingtickets) found');
      }
      const row = table.querySelector('td.tixamount')?.closest('tr');
      if (!row) throw new Error('No ticket row found');
      const tds = row.querySelectorAll('td');
      if (tds.length < 6) throw new Error('Not enough columns in ticket row');

      // Extract info
      const result = {
        error: false,
        number: tds[0].innerText.trim(),
        date: tds[1].innerText.trim(),
        plate: tds[2].innerText.trim(),
        status: tds[3].innerText.trim(),
        amount: tds[4].innerText.replace('$', '').trim(),
        action: tds[5].innerText.trim()
      };
      console.log('Extracted Ticket Info:', result);
      return result;
    } catch (e) {
      console.error('Attempt', attempts + 1, 'failed:', e.message);
      if (attempts < maxAttempts - 1 && (e.message.includes('No ticket row found') || e.message.includes('Not enough columns'))) {
        continue; // Retry on table-related errors
      }
      return { error: true, message: e.message || 'Unknown error' };
    }
  }
  console.error('Max attempts reached');
  return { error: true, message: 'Max attempts reached' };
}

// Custom :contains pseudo-class for querySelector
document.querySelectorAll = new Proxy(document.querySelectorAll, {
  apply(target, thisArg, args) {
    const [selector] = args;
    if (selector.includes(':contains(')) {
      const [, text] = selector.match(/:contains\("([^"]+)"\)/) || [];
      if (!text) return target.call(thisArg, ...args);
      const baseSelector = selector.replace(/:contains\("([^"]+)"\)/, '');
      return Array.from(target.call(thisArg, baseSelector)).filter(el => el.textContent.includes(text));
    }
    return target.call(thisArg, ...args);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runLookup') {
    console.log('Received runLookup message:', request);
    torontoParkingGetTicketAmount(request.ticketNum, request.plateNum).then(result => {
      console.log('Sending response:', result);
      sendResponse(result);
    }).catch(err => {
      console.error('Error in torontoParkingGetTicketAmount:', err);
      sendResponse({ error: true, message: err.message || 'Unexpected error' });
    });
    return true; // Keep message channel open for async response
  }
});