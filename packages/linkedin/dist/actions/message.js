"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
const shared_1 = require("@linkedin-bot-suite/shared");
async function sendMessage(page, profileUrl, message) {
    await page.goto(profileUrl, { waitUntil: 'networkidle0' });
    try {
        // Wait for page to load and find message button
        const [messageButton] = await page.$x(shared_1.LINKEDIN_SELECTORS.MESSAGE_BUTTON);
        if (!messageButton) {
            throw new Error('Message button not found - user may not be connected or messaging is disabled');
        }
        await messageButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for message window to open
        // Find the message input area
        const messageInput = await page.waitForSelector(shared_1.LINKEDIN_SELECTORS.MESSAGE_TEXTAREA, { timeout: 10000 });
        if (!messageInput) {
            throw new Error('Message input area not found');
        }
        // Clear any existing text and type the message
        await messageInput.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.press('Delete');
        await new Promise(resolve => setTimeout(resolve, 500));
        await messageInput.type(message);
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Find and click send button
        const sendBtn = await page.waitForXPath(shared_1.LINKEDIN_SELECTORS.SEND_MESSAGE_BUTTON, { timeout: 5000 });
        if (!sendBtn) {
            throw new Error('Send message button not found');
        }
        await sendBtn.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for message to be sent
        return {
            success: true,
            message: 'Message sent successfully',
            profileUrl,
        };
    }
    catch (error) {
        throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
