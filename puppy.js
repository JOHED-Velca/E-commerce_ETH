// lookup_ticket.js
// ─────────────────────────────────────────────────────────────────────────────
// Puppeteer‐extra script (with stealth) to look up a single parking ticket.
// Hard‐coded plate and ticket values for testing.
// ─────────────────────────────────────────────────────────────────────────────

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://secure.toronto.ca/webapps/parking/';
const TICKET_NUM = 'PM451052';
const PLATE_NUM  = 'czcl340';

async function lookupTicket(ticketNum, plateNum) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

  // accept terms & switch to lookup form
  await page.click('#cot-terms-agree', { timeout: 15000 });
  await page.click('#lookupvialp', { timeout: 15000 });

  // fill in hard‐coded credentials
  await page.type('#ticketnumB', ticketNum, { timeout: 15000 });
  await page.type('#licenseplate', plateNum, { timeout: 15000 });
  await page.click('#singlebutton', { timeout: 15000 });

  // wait for results table
  await page.waitForSelector('#parkingtickets', { timeout: 15000 });
  const row = await page.$('#parkingtickets tbody tr', { timeout: 15000 });

  let result = null;
  if (row) {
    result = await page.evaluate(r => {
      const tds = Array.from(r.querySelectorAll('td'));
      return {
        number: tds[0].innerText.trim(),
        date:   tds[1].innerText.trim(),
        plate:  tds[2].innerText.trim(),
        status: tds[3].innerText.trim(),
        amount: tds[4].innerText.replace('$','').trim(),
        action: tds[5].innerText.trim()
      };
    }, row);
  } else {
    console.warn('No ticket row found—perhaps no matching ticket.');
  }

  await browser.close();
  return result;
}

(async () => {
  try {
    console.log(`Looking up ticket ${TICKET_NUM} for plate ${PLATE_NUM}…`);
    const data = await lookupTicket(TICKET_NUM, PLATE_NUM);
    console.log('Lookup result:', data);
  } catch (err) {
    console.error('Lookup failed:', err);
    process.exit(1);
  }
})();
