// lookup_with_proxy.js
// ─────────────────────────────────────────────────────────────────────────────
// Playwright script to look up a Toronto parking ticket via a rotating proxy.
//  1) fetchProxy(): scrapes sslproxies.org for live proxies and tests them
//  2) getProxy(): caches the first good proxy
//  3) torontoParkingGetTicketAmount(): uses the proxy when launching Chromium
// ─────────────────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');

let _cachedProxy = null;

// 1) Fetch and test proxies from sslproxies.org
async function fetchProxy() {
  console.log('Fetching proxy list…');
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.goto('https://sslproxies.org/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Extract rows like "IP:Port"
  const proxies = await page.$$eval(
    'table#proxylisttable tbody tr',
    rows => rows.map(r => {
      const cols = r.querySelectorAll('td');
      return `http://${cols[0].innerText.trim()}:${cols[1].innerText.trim()}`;
    })
  );
  await browser.close();

  // Test each proxy in turn
  for (const proxy of proxies) {
    try {
      console.log(`Testing proxy ${proxy}…`);
      const testBrowser = await chromium.launch({
        headless: true,
        proxy: { server: proxy }
      });
      const testPage = await testBrowser.newPage();
      // Navigate to a simple page that mentions "Proxy"
      await testPage.goto('https://www.whatismyip.com/proxy-check/', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      const content = await testPage.textContent('body');
      await testBrowser.close();
      if (content.includes('Proxy Type')) {
        console.log(`✅ Working proxy found: ${proxy}`);
        return proxy;
      }
    } catch {
      // ignore and try next
    }
  }

  console.warn('⚠️ No working proxy found');
  return null;
}

// 2) Return the cached proxy (or fetch it once)
async function getProxy() {
  if (!_cachedProxy) {
    _cachedProxy = await fetchProxy();
  }
  return _cachedProxy;
}

// 3) Your main lookup function, now with proxy support
async function torontoParkingGetTicketAmount(violationNum, plateNum, maxAttempts = 3) {
  function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  let attempts = 0;
  while (attempts < maxAttempts) {
    let browser;
    try {
      const proxy = await getProxy();
      const locales = ['en-US', 'fr-CA', 'en-CA', 'fr-FR'];
      const locale  = locales[Math.floor(Math.random() * locales.length)];

      // Launch with or without proxy
      const launchOpts = {
        headless: false,
        args: ['--disable-dev-shm-usage']
      };
      if (proxy) {
        launchOpts.proxy = { server: proxy };
      }
      browser = await chromium.launch(launchOpts);
      const context = await browser.newContext({ locale });
      const page    = await context.newPage();

      // 1) Navigate
      await page.goto('https://secure.toronto.ca/webapps/parking/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 2) Human-like scroll & movement
      await page.mouse.move(100 + Math.random()*200, 200 + Math.random()*100);
      await page.waitForTimeout(randomDelay(300,900));
      await page.mouse.move(300 + Math.random()*100, 400 + Math.random()*100);
      await page.waitForTimeout(randomDelay(200,700));
      await page.evaluate(() => window.scrollBy(0, 200 + Math.random()*200));
      await page.waitForTimeout(randomDelay(200,700));

      // 3) Agree to terms
      await page.waitForSelector('#cot-terms-agree', { timeout: 5000 });
      await page.click('#cot-terms-agree');
      await page.waitForTimeout(randomDelay(400,900));

      // 4) Lookup tab
      await page.waitForSelector('#lookupvialp', { timeout: 5000 });
      await page.click('#lookupvialp');
      await page.waitForTimeout(randomDelay(400,900));

      // 5) Enter ticket number
      await page.waitForSelector('#ticketnumB', { timeout: 5000 });
      await page.fill('#ticketnumB', '');
      for (const ch of violationNum) {
        await page.type('#ticketnumB', ch, { delay: randomDelay(80,200) });
      }
      await page.waitForTimeout(randomDelay(100,400));

      // 6) Enter plate number
      await page.waitForSelector('#licenseplate', { timeout: 5000 });
      await page.fill('#licenseplate', '');
      for (const ch of plateNum) {
        await page.type('#licenseplate', ch, { delay: randomDelay(80,200) });
      }
      await page.waitForTimeout(randomDelay(100,400));

      // 7) Submit
      await page.waitForSelector('#singlebutton', { timeout: 5000 });
      await page.click('#singlebutton');
      await page.waitForTimeout(randomDelay(800,1500));

      // 8) Scrape the result row
      await page.waitForSelector('#parkingtickets tbody tr', { timeout: 8000 });
      const rowHandle = await page.$('table#parkingtickets tbody tr');
      const cells     = await rowHandle.$$('td');
      if (cells.length < 6) {
        throw new Error('Unexpected table format');
      }
      const result = {
        number:  (await cells[0].innerText()).trim(),
        date:    (await cells[1].innerText()).trim(),
        plate:   (await cells[2].innerText()).trim(),
        status:  (await cells[3].innerText()).trim(),
        amount:  (await cells[4].innerText()).replace('$','').trim(),
        action:  (await cells[5].innerText()).trim()
      };

      await browser.close();
      return result;

    } catch (err) {
      if (browser) await browser.close();
      attempts++;
      console.warn(`Attempt ${attempts} failed: ${err.message}`);
      if (attempts >= maxAttempts) {
        return { error: true, message: err.message || 'Max attempts reached' };
      }
    }
  }
}

// If run directly, test it:
if (require.main === module) {
  (async () => {
    const res = await torontoParkingGetTicketAmount('PM451052', 'czcl340');
    console.log('Final result:', res);
  })();
}

module.exports = { torontoParkingGetTicketAmount };
