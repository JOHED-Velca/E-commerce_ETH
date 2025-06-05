// content.js
// ─────────────────────────────────────────────────────────────────────────────
// “runLookup” listener that simulates human behavior, performs a single pass,
// and returns structured data. No retries, no localStorage logic, no multi-step resume.
// Ensures it only initializes one time per page load via a simple guard.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // ======== Run-once guard ========
  if (window.__tp_content_initialized) {
    return;
  }
  window.__tp_content_initialized = true;

  // ======== Helper: wait for selector ========
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

  // ======== Main lookup routine (single-pass, no retries) ========
  async function torontoParkingGetTicketAmount(violationNum, plateNum) {
    // Ensure we are already on the lookup page
    const currentUrl = window.location.href
      .split('?')[0]
      .split('#')[0]
      .replace(/\/$/, '');
    const targetUrl = 'https://secure.toronto.ca/webapps/parking'.replace(/\/$/, '');
    if (currentUrl !== targetUrl) {
      return { error: true, message: 'Not on the Toronto parking lookup page.' };
    }

    try {
      // 1) Wait for page load
      if (document.readyState !== 'complete') {
        await new Promise((resolve) =>
          window.addEventListener('load', resolve, { once: true })
        );
      }

      // 2) Simulate minimal human-like movement/scroll
      const moveMouse = (x, y) => {
        const evt = new MouseEvent('mousemove', {
          clientX: x,
          clientY: y,
          bubbles: true,
        });
        document.dispatchEvent(evt);
      };
      moveMouse(150 + Math.random() * 100, 250 + Math.random() * 50);
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (700 - 300 + 1)) + 300)
      );
      window.scrollBy(0, 150 + Math.random() * 150);
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (700 - 200 + 1)) + 200)
      );

      // 3) Agree to terms if present
      const termsButton = await waitForSelector('#cot-terms-agree', 5000);
      if (termsButton) {
        termsButton.click();
        await new Promise((r) =>
          setTimeout(r, Math.floor(Math.random() * (900 - 400 + 1)) + 400)
        );
      }

      // 4) Click “Lookup by License Plate”
      const lookupButton = await waitForSelector('#lookupvialp', 5000);
      if (!lookupButton) {
        return { error: true, message: 'Lookup button (#lookupvialp) not found' };
      }
      lookupButton.click();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (900 - 400 + 1)) + 400)
      );

      // 5) Fill ticket number
      const ticketInput = await waitForSelector('#ticketnumB', 5000);
      if (!ticketInput) {
        return { error: true, message: 'Ticket input (#ticketnumB) not found' };
      }
      ticketInput.focus();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (400 - 100 + 1)) + 100)
      );
      // Clear any existing value before typing the new ticket number
      if (ticketInput.value) {
        ticketInput.value = '';
        ticketInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 50));
      }
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

      // 6) Check for ticket-input errors
      const ticketErrorXpath =
        "//*[contains(text(), 'tag number') or contains(text(), 'valid tag/ticket')]";
      const ticketIter = document.evaluate(
        ticketErrorXpath,
        document,
        null,
        XPathResult.ANY_TYPE,
        null
      );
      let ticketErrEl = ticketIter.iterateNext();
      if (ticketErrEl && ticketErrEl.offsetParent !== null) {
        return { error: true, message: ticketErrEl.textContent.trim() };
      }

      // 7) Fill plate number
      const plateInput = await waitForSelector('#licenseplate', 5000);
      if (!plateInput) {
        return { error: true, message: 'Plate input (#licenseplate) not found' };
      }
      plateInput.focus();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (400 - 100 + 1)) + 100)
      );
      // Clear any existing value before typing the new plate number
      if (plateInput.value) {
        plateInput.value = '';
        plateInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 50));
      }
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

      // 8) Check for plate-input errors
      const plateErrorXpath =
        "//small[contains(text(),'tag number') or contains(text(),'valid tag/ticket')]";
      const plateIter = document.evaluate(
        plateErrorXpath,
        document,
        null,
        XPathResult.ANY_TYPE,
        null
      );
      let plateErrEl = plateIter.iterateNext();
      if (plateErrEl && plateErrEl.offsetParent !== null) {
        return { error: true, message: plateErrEl.textContent.trim() };
      }

      // 9) Click submit
      const submitButton = await waitForSelector('#singlebutton', 5000);
      if (!submitButton) {
        return { error: true, message: 'Submit button (#singlebutton) not found' };
      }
      submitButton.click();
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (1500 - 800 + 1)) + 800)
      );

      // 10) Wait for results table (or no-results message)
      const table = await waitForSelector('#parkingtickets', 10000);
      if (!table) {
        const noResults = await waitForSelector('p', 5000);
        if (noResults && noResults.innerText.includes('No tickets found')) {
          return { error: true, message: 'No tickets found for these values' };
        }
        return { error: true, message: 'No ticket table (#parkingtickets) found' };
      }

      // 11) Extract data from the first matching row
      const row = table.querySelector('td.tixamount')?.closest('tr');
      if (!row) {
        return { error: true, message: 'No ticket row found' };
      }
      const cells = row.querySelectorAll('td');
      if (cells.length < 6) {
        return { error: true, message: 'Unexpected table format: fewer than 6 columns' };
      }

      return {
        error: false,
        number: cells[0].innerText.trim(),
        date: cells[1].innerText.trim(),
        plate: cells[2].innerText.trim(),
        status: cells[3].innerText.trim(),
        amount: cells[4].innerText.replace('$', '').trim(),
        action: cells[5].innerText.trim(),
      };
    } catch (err) {
      return { error: true, message: err.message || 'Unknown error' };
    }
  }

  // ======== Override :contains(...) for quick “no results” checks ========
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

  // ======== Message listener (single registration) ========
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'runLookup') {
      const { ticketNum, plateNum } = request;
      torontoParkingGetTicketAmount(ticketNum, plateNum)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: true, message: err.message }));
      return true; // Keep sendResponse open
    }
  });
})();
