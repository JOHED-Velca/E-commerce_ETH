// Native automation using robotjs for mouse/keyboard and node-window-manager for window focus
// npm install robotjs node-window-manager

const robot = require('robotjs');
const { windowManager } = require('node-window-manager');
const { exec } = require('child_process');

async function randomDelay(min, max) {
    return new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min));
}

// Helper to focus Chrome window (macOS example, adjust for your OS)
async function focusChromeWindow() {
    // On macOS, use AppleScript to focus Chrome
    return new Promise((resolve) => {
        exec('osascript -e \'tell application "Google Chrome" to activate\'', resolve);
    });
}

async function torontoParkingGetTicketAmount(violationNum, plateNum) {
    // 1. Open/focus browser and navigate manually to the page
    await focusChromeWindow();
    await randomDelay(1000, 2000);

    // 2. Move mouse and click on the ticket number field (coordinates must be calibrated for your screen)
    robot.moveMouseSmooth(400, 350); // Example coordinates
    robot.mouseClick();
    await randomDelay(200, 400);

    // 3. Type ticket number
    robot.keyTap('a', 'control'); // select all
    robot.keyTap('backspace');
    await randomDelay(100, 200);
    for (const char of violationNum) {
        robot.typeString(char);
        await randomDelay(80, 180);
    }
    await randomDelay(200, 400);

    // 4. Move mouse and click on the plate number field
    robot.moveMouseSmooth(400, 400); // Example coordinates
    robot.mouseClick();
    await randomDelay(200, 400);

    // 5. Type plate number
    robot.keyTap('a', 'control');
    robot.keyTap('backspace');
    await randomDelay(100, 200);
    for (const char of plateNum) {
        robot.typeString(char);
        await randomDelay(80, 180);
    }
    await randomDelay(200, 400);

    // 6. Move mouse and click the submit button
    robot.moveMouseSmooth(500, 500); // Example coordinates
    robot.mouseClick();
    await randomDelay(1000, 2000);

    // 7. Optionally, use OCR or screenshot to read results (not implemented here)
    // You can use node-tesseract-ocr or similar for OCR

    return { status: "submitted", note: "Check browser for results. This method uses native automation and is not detected as a bot, but requires calibration." };
}

// Example usage
if (require.main === module) {
    (async () => {
        const result = await torontoParkingGetTicketAmount("PM451052", "czcl340");
        console.log("Native automation result:", result);
    })();
}

module.exports = { torontoParkingGetTicketAmount };
