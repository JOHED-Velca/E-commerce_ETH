// Puppeteer version of the Toronto parking bot

const puppeteer = require('puppeteer');
const UserAgent = require('user-agents');

async function randomDelay(min, max) {
    return new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function torontoParkingGetTicketAmount(violationNum, plateNum, maxAttempts = 3) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        let browser;
        try {
            // Randomize user agent and language
            const userAgent = new UserAgent({
                deviceCategory: 'desktop',
                userAgent: /(Windows NT|Macintosh;.*Mac OS X)/
            }).toString();
            const locales = ['en-US', 'fr-CA', 'en-CA', 'fr-FR'];
            const locale = locales[Math.floor(Math.random() * locales.length)];

            browser = await puppeteer.launch({
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    `--lang=${locale}`
                ]
            });
            const [page] = await browser.pages();
            await page.setUserAgent(userAgent);

            // Simulate human scroll and mouse movement
            await page.goto('https://secure.toronto.ca/webapps/parking/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.mouse.move(100 + Math.random() * 200, 200 + Math.random() * 100);
            await randomDelay(300, 900);
            await page.mouse.move(300 + Math.random() * 100, 400 + Math.random() * 100);
            await randomDelay(200, 700);
            await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 200));
            await randomDelay(200, 700);

            // Accept terms
            await page.waitForSelector('#cot-terms-agree', { timeout: 5000 });
            await page.hover('#cot-terms-agree');
            await randomDelay(200, 800);
            await page.click('#cot-terms-agree');
            await randomDelay(400, 900);

            // Click "Lookup by License Plate"
            await page.waitForSelector('#lookupvialp', { timeout: 5000 });
            await page.hover('#lookupvialp');
            await randomDelay(200, 800);
            await page.click('#lookupvialp');
            await randomDelay(400, 900);

            // Fill ticket number
            await page.waitForSelector('#ticketnumB', { timeout: 5000 });
            await page.click('#ticketnumB');
            await randomDelay(100, 400);
            await page.evaluate(() => document.querySelector('#ticketnumB').value = '');
            for (const char of violationNum) {
                await page.type('#ticketnumB', char, { delay: randomDelay(80, 200) });
            }
            await randomDelay(100, 400);

            // Check for known input errors after entering ticket number
            const ticketInputErrorXpaths = [
                "//*[contains(text(), 'The tag number must be in the format XXXXXXXX')]",
                "//small[contains(text(), 'format XXXXXXXX.')]",
                "//p[contains(text(), 'You must provide a valid tag/ticket number.')]",
                "//div[contains(@class, 'form-group') and contains(@class, 'has-error')]/small[contains(text(), 'tag number must be.')]"
            ];
            for (const xpath of ticketInputErrorXpaths) {
                const elements = await page.$x(xpath);
                for (const el of elements) {
                    const isVisible = await el.boundingBox() !== null;
                    const fvResult = await page.evaluate(el => el.getAttribute('data-fv-result'), el);
                    if (isVisible && (fvResult === 'INVALID' || fvResult === null)) {
                        const msg = await page.evaluate(el => el.textContent, el);
                        await browser.close();
                        return { error: true, message: msg.trim() };
                    }
                }
            }

            // Fill plate number
            await page.waitForSelector('#licenseplate', { timeout: 5000 });
            await page.click('#licenseplate');
            await randomDelay(100, 400);
            await page.evaluate(() => document.querySelector('#licenseplate').value = '');
            for (const char of plateNum) {
                await page.type('#licenseplate', char, { delay: randomDelay(80, 200) });
            }
            await randomDelay(100, 400);

            // Check for known input errors after entering plate number
            for (const xpath of ticketInputErrorXpaths) {
                const elements = await page.$x(xpath);
                for (const el of elements) {
                    const isVisible = await el.boundingBox() !== null;
                    const fvResult = await page.evaluate(el => el.getAttribute('data-fv-result'), el);
                    if (isVisible && (fvResult === 'INVALID' || fvResult === null)) {
                        const msg = await page.evaluate(el => el.textContent, el);
                        await browser.close();
                        return { error: true, message: msg.trim() };
                    }
                }
            }

            // Submit
            await page.waitForSelector('#singlebutton', { timeout: 5000 });
            await page.hover('#singlebutton');
            await randomDelay(200, 800);
            await page.click('#singlebutton');
            await randomDelay(800, 1500);

            // Wait for table
            await page.waitForSelector('#parkingtickets', { timeout: 8000 });
            const [rowHandle] = await page.$x('//table[@id="parkingtickets"]//td[contains(@class, "tixamount")]/parent::tr');
            if (!rowHandle) throw new Error('No ticket row found');
            const tds = await rowHandle.$$('td');
            if (tds.length < 6) throw new Error('Not enough columns in ticket row');

            // Extract info
            const outer = {
                number: (await (await tds[0].getProperty('innerText')).jsonValue()).trim(),
                date: (await (await tds[1].getProperty('innerText')).jsonValue()).trim(),
                plate: (await (await tds[2].getProperty('innerText')).jsonValue()).trim(),
                status: (await (await tds[3].getProperty('innerText')).jsonValue()).trim(),
                amount: (await (await tds[4].getProperty('innerText')).jsonValue()).replace('$', '').trim(),
                action: (await (await tds[5].getProperty('innerText')).jsonValue()).trim()
            };

            await browser.close();
            return outer;
        } catch (e) {
            if (browser) await browser.close();
            return { error: true, message: e.message || String(e) };
        }
    }
    return { error: true, message: "Max attempts reached or unknown error" };
}

// Example usage for testing
if (require.main === module) {
    (async () => {
        const result = await torontoParkingGetTicketAmount("PM451052", "czcl340");
        console.log("Test result:", result);
    })();
}

module.exports = { torontoParkingGetTicketAmount };
