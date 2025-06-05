// content.js
// ─────────────────────────────────────────────────────────────────────────────
// “runLookup” listener that tries up to 3 times, simulates human behavior,
// and returns structured data. If the page is navigated away or times out,
// it will fail fast. On navigation, it saves params in localStorage so that
// on page load it can pick them up and complete the lookup, then send a
// “lookupResult” back to background.
// ─────────────────────────────────────────────────────────────────────────────

async function waitForSelector(selector, timeout) {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) return resolve(element);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

async function torontoParkingGetTicketAmount(
  violationNum,
  plateNum,
  maxAttempts = 3
) {
  // Normalize URL (strip query/hash/trailing slash)
  const currentUrl = window.location.href
    .split('?')[0]
    .split('#')[0]
    .replace(/\/$/, '');
  const targetUrl = 'https://secure.toronto.ca/webapps/parking'.replace(
    /\/$/,
    ''
  );

  // Prevent infinite navigation loops
  let navigationAttempts = parseInt(
    localStorage.getItem('torontoParkingNavigationAttempts') || '0',
    10
  );
  if (navigationAttempts > 5) {
    localStorage.removeItem('torontoParkingNavigationAttempts');
    localStorage.removeItem('torontoParkingParams');
    return { error: true, message: 'Too many navigation attempts; aborting.' };
  }

  // If not on the lookup page, navigate and store params
  if (currentUrl !== targetUrl) {
    localStorage.setItem(
      'torontoParkingParams',
      JSON.stringify({ violationNum, plateNum })
    );
    localStorage.setItem(
      'torontoParkingNavigationAttempts',
      String(navigationAttempts + 1)
    );
    window.location.href = 'https://secure.toronto.ca/webapps/parking/';
    return { error: true, message: 'Navigating to parking page...' };
  }

  // Reset navigation attempts once we’re on the right page
  localStorage.removeItem('torontoParkingNavigationAttempts');

  // If we were given params in localStorage, use them
  const storedParams = JSON.parse(
    localStorage.getItem('torontoParkingParams') || '{}'
  );
  if (storedParams.violationNum && storedParams.plateNum) {
    violationNum = storedParams.violationNum;
    plateNum = storedParams.plateNum;
    localStorage.removeItem('torontoParkingParams');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // 1) Wait for page load
      await new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
        }
      });

      // 2) Simulate some human‐like movement/scroll
      const moveMouse = (x, y) => {
        const evt = new MouseEvent('mousemove', {
          clientX: x,
          clientY: y,
          bubbles: true,
        });
        document.dispatchEvent(evt);
      };
      moveMouse(100 + Math.random() * 200, 200 + Math.random() * 100);
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (900 - 300 + 1)) + 300)
      );
      moveMouse(300 + Math.random() * 100, 400 + Math.random() * 100);
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (700 - 200 + 1)) + 200)
      );
      window.scrollBy(0, 200 + Math.random() * 200);
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (700 - 200 + 1)) + 200)
      );

      // 3) Agree to terms if present
      const termsButton = await waitForSelector('#cot-terms-agree', 5000);
      if (termsButton) {
        termsButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await new Promise((r) =>
          setTimeout(r, Math.floor(Math.random() * (800 - 200 + 1)) + 200)
        );
        termsButton.click();
        await new Promise((r) =>
          setTimeout(r, Math.floor(Math.random() * (900 - 400 + 1)) + 400)
        );
      }

      // 4) Click “Lookup by License Plate”
      const lookupButton = await waitForSelector('#lookupvialp', 5000);
      if (!lookupButton) throw new Error('Lookup button (#lookupvialp) not found');
      lookupButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (800 - 200 + 1)) + 200)
      );
      lookupButton.click();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (900 - 400 + 1)) + 400)
      );

      // 5) Fill ticket number
      const ticketInput = await waitForSelector('#ticketnumB', 5000);
      if (!ticketInput) throw new Error('Ticket input (#ticketnumB) not found');
      ticketInput.click();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (400 - 100 + 1)) + 100)
      );
      ticketInput.value = '';
      for (const c of violationNum) {
        ticketInput.value += c;
        ticketInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) =>
          setTimeout(r, Math.floor(Math.random() * (200 - 80 + 1)) + 80)
        );
      }
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (400 - 100 + 1)) + 100)
      );

      // 6) Check for input errors
      const ticketInputErrorXpaths = [
        "//*[contains(text(), 'The tag number must be in the format XXXXXXXX')]",
        "//small[contains(text(), 'format XXXXXXXX.')]",
        "//p[contains(text(), 'You must provide a valid tag/ticket number.')]",
        "//div[contains(@class, 'form-group') and contains(@class, 'has-error')]/small[contains(text(), 'tag number must be.')]",
      ];
      for (const xpath of ticketInputErrorXpaths) {
        const iterator = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ANY_TYPE,
          null
        );
        let el = iterator.iterateNext();
        while (el) {
          if (
            el.offsetParent !== null &&
            (!el.dataset.fvResult || el.dataset.fvResult === 'INVALID')
          ) {
            return { error: true, message: el.textContent.trim() };
          }
          el = iterator.iterateNext();
        }
      }

      // 7) Fill plate number
      const plateInput = await waitForSelector('#licenseplate', 5000);
      if (!plateInput) throw new Error('Plate input (#licenseplate) not found');
      plateInput.click();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (400 - 100 + 1)) + 100)
      );
      plateInput.value = '';
      for (const c of plateNum) {
        plateInput.value += c;
        plateInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) =>
          setTimeout(r, Math.floor(Math.random() * (200 - 80 + 1)) + 80)
        );
      }
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (400 - 100 + 1)) + 100)
      );

      // 8) Check for plate‐input errors again
      for (const xpath of ticketInputErrorXpaths) {
        const iterator2 = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ANY_TYPE,
          null
        );
        let el2 = iterator2.iterateNext();
        while (el2) {
          if (
            el2.offsetParent !== null &&
            (!el2.dataset.fvResult || el2.dataset.fvResult === 'INVALID')
          ) {
            return { error: true, message: el2.textContent.trim() };
          }
          el2 = iterator2.iterateNext();
        }
      }

      // 9) Click submit
      const submitButton = await waitForSelector('#singlebutton', 5000);
      if (!submitButton) throw new Error('Submit button (#singlebutton) not found');
      submitButton.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true })
      );
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (800 - 200 + 1)) + 200)
      );
      submitButton.click();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (1500 - 800 + 1)) + 800)
      );

      // 10) Wait for results table (or no‐results message)
      const table = await waitForSelector('#parkingtickets', 10000);
      if (!table) {
        // Maybe a “no tickets found” message
        const noResults = await waitForSelector('p', 5000);
        if (noResults && noResults.innerText.includes('No tickets found')) {
          return { error: true, message: 'No tickets found for these values' };
        }
        throw new Error('No ticket table (#parkingtickets) found');
      }

      // 11) Extract data from the first matching row
      const row = table.querySelector('td.tixamount')?.closest('tr');
      if (!row) throw new Error('No ticket row found');
      const cells = row.querySelectorAll('td');
      if (cells.length < 6)
        throw new Error('Unexpected table format: fewer than 6 columns');

      const result = {
        error: false,
        number: cells[0].innerText.trim(),
        date: cells[1].innerText.trim(),
        plate: cells[2].innerText.trim(),
        status: cells[3].innerText.trim(),
        amount: cells[4].innerText.replace('$', '').trim(),
        action: cells[5].innerText.trim(),
      };
      return result;
    } catch (err) {
      console.error(`Attempt ${attempt + 1} failed:`, err.message);
      // If table‐related error, retry up to maxAttempts
      if (
        attempt < maxAttempts - 1 &&
        (err.message.includes('No ticket table') ||
          err.message.includes('Unexpected table format'))
      ) {
        continue;
      }
      return { error: true, message: err.message || 'Unknown error' };
    }
  }

  console.error('Max attempts reached');
  return { error: true, message: 'Max attempts reached' };
}

// Gracefully override :contains(...) so we can do a quick “no results” check
document.querySelectorAll = new Proxy(document.querySelectorAll, {
  apply(target, thisArg, args) {
    const [selector] = args;
    if (selector.includes(':contains(')) {
      const [, text] = selector.match(/:contains\("([^"]+)"\)/);
      return Array.from(target.call(thisArg, '*')).filter((el) =>
        el.textContent.includes(text)
      );
    }
    return target.apply(thisArg, args);
  },
});

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runLookup') {
    const { ticketNum, plateNum } = request;

    // Store params so that if we navigate, we can resume
    localStorage.setItem(
      'torontoParkingParams',
      JSON.stringify({ violationNum: ticketNum, plateNum })
    );
    localStorage.setItem(
      'torontoParkingNavigationAttempts',
      String(
        parseInt(
          localStorage.getItem('torontoParkingNavigationAttempts') || '0',
          10
        ) + 1
      )
    );

    torontoParkingGetTicketAmount(ticketNum, plateNum)
      .then((result) => {
        // If we are still on the same page and got a normal result, send it back:
        if (!result.error || window.location.href.startsWith(TARGET_URL_PREFIX)) {
          sendResponse(result);
        } else {
          // If we just navigated away, result.error=="Navigating to parking page…"
          // The actual lookup will happen on page load below, so we do not respond yet.
        }
      })
      .catch((err) => {
        sendResponse({ error: true, message: err.message });
      });
    return true; // Keep sendResponse open
  }
});

// On page load, check if we have pending params; if so, complete the lookup and notify background
window.addEventListener('load', () => {
  const stored = JSON.parse(localStorage.getItem('torontoParkingParams') || '{}');
  if (stored.violationNum && stored.plateNum) {
    torontoParkingGetTicketAmount(stored.violationNum, stored.plateNum)
      .then((result) => {
        // Send the result back to background
        chrome.runtime.sendMessage({ action: 'lookupResult', result });
        localStorage.removeItem('torontoParkingParams');
        localStorage.removeItem('torontoParkingNavigationAttempts');
      })
      .catch((err) => {
        chrome.runtime.sendMessage({
          action: 'lookupResult',
          result: { error: true, message: err.message },
        });
        localStorage.removeItem('torontoParkingParams');
        localStorage.removeItem('torontoParkingNavigationAttempts');
      });
  }
});
