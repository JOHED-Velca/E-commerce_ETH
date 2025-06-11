// puppy.js
// ─────────────────────────────────────────────────────────────────────────────
// Puppeteer‐extra script (with stealth) to look up a single parking ticket.
// Hard‐coded plate and ticket values, with guarded clicks and robust waits.
// ─────────────────────────────────────────────────────────────────────────────

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://secure.toronto.ca/webapps/parking/';
const TICKET_NUM = 'PM451052';
const PLATE_NUM  = 'czcl340';

async function lookupTicket(ticketNum, plateNum) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  const page = await browser.newPage();

  // Navigate and wait until the network is quiet
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

  try {
  // If there's a “terms” button, click it
  const agreeBtn = await page.waitForSelector('#cot-terms-agree', { timeout: 6000 });
  if (agreeBtn) {
    console.log('Clicking “Agree to Terms”');
    await agreeBtn.click();
    // wait a moment for the form to show
    await page.waitForTimeout(500);
  }
  } catch (err) {}

  // If there's a “lookup” tab/button, click it
  const lookupTab = await page.$('#lookupvialp');
  if (lookupTab) {
    console.log('Switching to lookup form');
    await lookupTab.click();
    await page.waitFor(500);
  }

  // Now fill out and submit
  await page.waitForSelector('#ticketnumB', { timeout: 10000 });
  await page.type('#ticketnumB', ticketNum);
  await page.type('#licenseplate', plateNum);
  await page.click('#singlebutton');

  // Wait for the results table to appear
  await page.waitForSelector('#parkingtickets tbody tr', { timeout: 15000 });
  const row = await page.$('#parkingtickets tbody tr');

  let result = null;
  if (row) {
    result = await page.evaluate(r => {
      const tds = Array.from(r.querySelectorAll('td'));
      return {
        number: tds[0]?.innerText.trim(),
        date:   tds[1]?.innerText.trim(),
        plate:  tds[2]?.innerText.trim(),
        status: tds[3]?.innerText.trim(),
        amount: tds[4]?.innerText.replace('$','').trim(),
        action: tds[5]?.innerText.trim()
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
