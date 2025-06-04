const { chromium } = require('playwright');

async function torontoParkingGetTicketAmount(violationNum, plateNum, maxAttempts = 3) {
    function randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    let attempts = 0;
    while (attempts < maxAttempts) {
        let browser;
        try {
            const locales = ['en-US', 'fr-CA', 'en-CA', 'fr-FR'];
            const locale = locales[Math.floor(Math.random() * locales.length)];

            browser = await chromium.launch({ headless: false });
            const context = await browser.newContext({
                locale
            });
            const page = await context.newPage();
            await page.goto('https://secure.toronto.ca/webapps/parking/', { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Simulate human scroll and mouse movement
            await page.mouse.move(100 + Math.random() * 200, 200 + Math.random() * 100);
            await page.waitForTimeout(randomDelay(300, 900));
            await page.mouse.move(300 + Math.random() * 100, 400 + Math.random() * 100);
            await page.waitForTimeout(randomDelay(200, 700));
            await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 200));
            await page.waitForTimeout(randomDelay(200, 700));

            // Agree to terms by button text
            await page.waitForSelector('#cot-terms-agree', { timeout: 5000 });
            await page.hover('#cot-terms-agree');
            await page.waitForTimeout(randomDelay(200, 800));
            await page.click('#cot-terms-agree');
            await page.waitForTimeout(randomDelay(400, 900));

            // Click "Lookup by License Plate"
            await page.waitForSelector('#lookupvialp', { timeout: 5000 });
            await page.hover('#lookupvialp');
            await page.waitForTimeout(randomDelay(200, 800));
            await page.click('#lookupvialp');
            await page.waitForTimeout(randomDelay(400, 900));

            // Fill ticket number
            await page.waitForSelector('#ticketnumB', { timeout: 5000 });
            await page.click('#ticketnumB');
            await page.waitForTimeout(randomDelay(100, 400));
            await page.fill('#ticketnumB', '');
            for (const char of violationNum) {
                await page.type('#ticketnumB', char, { delay: randomDelay(80, 200) });
            }
            await page.waitForTimeout(randomDelay(100, 400));

            // Check for known input errors after entering ticket number
            const ticketInputErrorXpaths = [
                "//*[contains(text(), 'The tag number must be in the format XXXXXXXX')]",
                "//small[contains(text(), 'format XXXXXXXX.')]",
                "//p[contains(text(), 'You must provide a valid tag/ticket number.')]",
                "//div[contains(@class, 'form-group') and contains(@class, 'has-error')]/small[contains(text(), 'tag number must be.')]"
            ];
            for (const xpath of ticketInputErrorXpaths) {
                const locator = page.locator(`xpath=${xpath}`);
                const count = await locator.count();
                for (let i = 0; i < count; i++) {
                    const el = locator.nth(i);
                    // Only treat as error if actually shown to user (visible and/or data-fv-result="INVALID")
                    const isVisible = await el.isVisible();
                    const fvResult = await el.getAttribute('data-fv-result');
                    if (isVisible && (fvResult === 'INVALID' || fvResult === null)) {
                        const msg = (await el.textContent()) || '';
                        await browser.close();
                        return { error: true, message: msg.trim() };
                    }
                }
            }

            // Fill plate number
            await page.waitForSelector('#licenseplate', { timeout: 5000 });
            await page.click('#licenseplate');
            await page.waitForTimeout(randomDelay(100, 400));
            await page.fill('#licenseplate', '');
            for (const char of plateNum) {
                await page.type('#licenseplate', char, { delay: randomDelay(80, 200) });
            }
            await page.waitForTimeout(randomDelay(100, 400));

            // Check for known input errors after entering plate number
            for (const xpath of ticketInputErrorXpaths) {
                const locator = page.locator(`xpath=${xpath}`);
                const count = await locator.count();
                for (let i = 0; i < count; i++) {
                    const el = locator.nth(i);
                    const isVisible = await el.isVisible();
                    const fvResult = await el.getAttribute('data-fv-result');
                    if (isVisible && (fvResult === 'INVALID' || fvResult === null)) {
                        const msg = (await el.textContent()) || '';
                        await browser.close();
                        return { error: true, message: msg.trim() };
                    }
                }
            }

            // Submit
            await page.waitForSelector('#singlebutton', { timeout: 5000 });
            await page.hover('#singlebutton');
            await page.waitForTimeout(randomDelay(200, 800));
            await page.click('#singlebutton');
            await page.waitForTimeout(randomDelay(800, 1500));

            // Wait for table
            await page.waitForSelector('#parkingtickets', { timeout: 8000 });
            const rowHandle = await page.$('//table[@id="parkingtickets"]//td[contains(@class, "tixamount")]/parent::tr');
            if (!rowHandle) throw new Error('No ticket row found');
            const tds = await rowHandle.$$('td');
            if (tds.length < 6) throw new Error('Not enough columns in ticket row');

            // Extract info
            const outer = {
                number: (await tds[0].innerText()).trim(),
                date: (await tds[1].innerText()).trim(),
                plate: (await tds[2].innerText()).trim(),
                status: (await tds[3].innerText()).trim(),
                amount: (await tds[4].innerText()).replace('$', '').trim(),
                action: (await tds[5].innerText()).trim()
            };

            await browser.close();
            return outer;
        } catch (e) {
            if (browser) await browser.close();

            // Detect specific input error message on the page
            if (e.message && (e.message.includes('No ticket row found') || e.message.includes('Not enough columns'))) {
                // Check for the error message in the page content
                try {
                    const context = await chromium.launch({ headless: true }).then(b => b.newContext());
                    const page = await context.newPage();
                    await page.goto('https://secure.toronto.ca/webapps/parking/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                    // ...simulate steps up to submit as before...
                    // After submit, check for error message
                    const errorElem = await page.$x("//*[contains(text(), 'The tag number must be in the format XXXXXXXX')]");
                    if (errorElem.length > 0) {
                        await context.browser().close();
                        return { error: true, message: "The tag number must be in the format XXXXXXXX" };
                    }
                    await context.browser().close();
                } catch {
                    // ignore
                }
            }

            // Return error as JSON object
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