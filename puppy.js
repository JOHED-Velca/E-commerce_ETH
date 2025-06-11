// puppy.js
// ─────────────────────────────────────────────────────────────────────────────
// Puppeteer‐extra script (with stealth) to look up a single parking ticket.
// Hard‐coded plate and ticket values, using waitForSelector everywhere.
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
      '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage();

  // 1) Navigate
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

  // 2) Click “Agree to Terms” if present
  try {
    const agreeBtn = await page.waitForSelector('#cot-terms-agree', { timeout: 6000 });
    console.log('Clicking “Agree to Terms”');
    await agreeBtn.click();
    await page.waitFor(500);
  } catch (err) {
    // ignore if not found
  }

  // 3) Switch to lookup form
  const lookupTab = await page.waitForSelector('#lookupvialp', { timeout: 10000 });
  console.log('Switching to lookup form');
  await lookupTab.click();
  await page.waitFor(500);

  // 4) Fill in ticket number
  const ticketInput = await page.waitForSelector('#ticketnumB', { timeout: 10000 });
  await ticketInput.focus();
  await page.waitFor(200);
  await ticketInput.click({ clickCount: 3 });
  await ticketInput.type(ticketNum, { delay: 100 });

  // 5) Fill in plate number
  const plateInput = await page.waitForSelector('#licenseplate', { timeout: 10000 });
  await plateInput.focus();
  await page.waitFor(200);
  await plateInput.click({ clickCount: 3 });
  await plateInput.type(plateNum, { delay: 100 });

  // 6) Submit
  const submitBtn = await page.waitForSelector('#singlebutton', { timeout: 10000 });
  await submitBtn.click();

  // 7) Wait for results row
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
        action: tds[5]?.innerText.trim(),
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
