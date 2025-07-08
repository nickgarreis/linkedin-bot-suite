"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
const shared_1 = require("@linkedin-bot-suite/shared");
async function sendMessage(page, profileUrl, message) {
    // Validate inputs
    if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
        throw new Error(`Invalid LinkedIn profile URL: ${profileUrl}`);
    }
    if (!message || message.trim().length === 0) {
        throw new Error('Message content cannot be empty');
    }
    console.log(`Navigating to profile for messaging: ${profileUrl}`);
    // Add random delay and use flexible navigation
    const randomDelay = Math.floor(Math.random() * 2000) + 1000;
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    try {
        const response = await page.goto(profileUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        if (!response || response.status() >= 400) {
            throw new Error(`Navigation failed with status: ${response?.status() || 'No response'}`);
        }
        // Verify we're on the correct page
        const currentUrl = page.url();
        if (!currentUrl.includes('linkedin.com/in/') || currentUrl.includes('/login')) {
            throw new Error(`Navigation redirected to unexpected page: ${currentUrl}`);
        }
    }
    catch (error) {
        throw new Error(`Failed to navigate to profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    try {
        // Wait for page to load and find message button using CSS selectors
        const messageButton = await page.$(shared_1.LINKEDIN_SELECTORS.MESSAGE_BUTTON);
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
        // Find and click send button using CSS selectors
        const sendBtn = await page.waitForSelector(shared_1.LINKEDIN_SELECTORS.SEND_MESSAGE_BUTTON, { timeout: 5000 });
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
