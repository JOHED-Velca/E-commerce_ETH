const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://secure.toronto.ca/webapps/parking/';

const tickets = new Map(); // key => { status, response }

const app = express();
app.use(express.json());

// ------------------------- Proxy helpers -------------------------
async function fetchProxy() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://sslproxies.org/', { waitUntil: 'domcontentloaded' });
  console.log('Fetching proxies from sslproxies.org...');
  console.log(page);
  const proxies = await page.$$eval(
    "table.table tbody tr",
    rows => rows.map(r => `${r.children[0].textContent.trim()}:${r.children[1].textContent.trim()}`)
  );
  console.log(`Found ${proxies} proxies`);
  await browser.close();

  for (const proxy of proxies) {
    try {
      const b = await puppeteer.launch({ headless: false, args: [`--proxy-server=${proxy}`] });
      const p = await b.newPage();
      await p.goto('https://www.whatismyip.com/proxy-check/?iref=home', { timeout: 10000, waitUntil: 'domcontentloaded' });
      const body = await p.content();
      await b.close();
      console.log(`Testing proxy: ${proxy}`);
      if (body.includes('Proxy Type')) {
        console.log(`Using proxy: ${proxy}`);
        return proxy;
      }
    } catch (err) {
      // ignore and try next proxy
    }
  }
  console.warn('No working proxy found');
  return null;
}

let currentProxy = null;
async function getProxy() {
  if (!currentProxy) {
    currentProxy = await fetchProxy();
  }
  return currentProxy;
}

// ------------------------- Puppeteer worker -------------------------
async function lookupTicket(ticketNum, plateNum) {
  const proxy = await getProxy();
  const args = proxy ? [`--proxy-server=${proxy}`] : [];
  const browser = await puppeteer.launch({ headless: false, args });
  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

  await page.click('#cot-terms-agree');
  await page.click('#lookupvialp');

  await page.type('#ticketnumB', ticketNum);
  await page.type('#licenseplate', plateNum);
  await page.click('#singlebutton');

  await page.waitForSelector('#parkingtickets', { timeout: 15000 });
  const row = await page.$('#parkingtickets tbody tr');
  let result = null;
  if (row) {
    result = await page.evaluate(r => {
      const tds = Array.from(r.querySelectorAll('td'));
      return {
        number: tds[0].innerText.trim(),
        date: tds[1].innerText.trim(),
        plate: tds[2].innerText.trim(),
        status: tds[3].innerText.trim(),
        amount: tds[4].innerText.replace('$','').trim(),
        action: tds[5].innerText.trim()
      };
    }, row);
  }
  await browser.close();
  return result;
}

async function workerLoop() {
  while (true) {
    const pending = Array.from(tickets.entries()).find(([,info]) => info.status === 'pending');
    if (!pending) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    const [key, info] = pending;
    info.status = 'processing';
    tickets.set(key, info);
    const [ticketNum, plateNum] = key.split('|');
    try {
      const res = await lookupTicket(ticketNum, plateNum);
      info.status = 'completed';
      info.response = res;
    } catch (err) {
      info.status = 'error';
      info.response = { error: err.message };
    }
    tickets.set(key, info);
  }
}

workerLoop();

// ------------------------- Express endpoints -------------------------
app.post('/enqueue', (req, res) => {
  const { ticketNum, plateNum } = req.body;
  if (!ticketNum || !plateNum) return res.status(400).json({ error: 'ticketNum and plateNum required' });
  const key = `${ticketNum}|${plateNum}`;
  if (!tickets.has(key) || tickets.get(key).status === 'completed') {
    tickets.set(key, { status: 'pending' });
  }
  res.json({ queued: true });
});

app.get('/ticket/:ticketNum/:plateNum', (req, res) => {
  const { ticketNum, plateNum } = req.params;
  const key = `${ticketNum}|${plateNum}`;
  if (!tickets.has(key)) return res.status(404).json({ error: 'Ticket not found' });
  const info = tickets.get(key);
  res.json({ status: info.status, response: info.response });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stealth server listening on ${PORT}`));
