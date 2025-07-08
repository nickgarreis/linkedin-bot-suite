"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
const shared_1 = require("@linkedin-bot-suite/shared");
const browserHealth_1 = require("../utils/browserHealth");
async function sendMessage(page, profileUrl, message) {
    // Check activity patterns and respect business hours
    const activityPattern = (0, browserHealth_1.getActivityPattern)();
    console.log(`Activity pattern: ${activityPattern.isActiveHour ? 'Active' : 'Inactive'} hour (${activityPattern.activityMultiplier}x speed)`);
    // Validate inputs
    if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
        throw new Error(`Invalid LinkedIn profile URL: ${profileUrl}`);
    }
    if (!message || message.trim().length === 0) {
        throw new Error('Message content cannot be empty');
    }
    console.log(`Navigating to profile for messaging: ${profileUrl}`);
    // Enforce request spacing to prevent rate limiting
    await (0, browserHealth_1.enforceRequestSpacing)();
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
        // Verify page stability before attempting DOM interactions
        console.log('Waiting for page elements to stabilize...');
        const isStable = await (0, browserHealth_1.verifyPageStability)(page, 2000);
        if (!isStable) {
            console.warn('Page stability check failed, but proceeding with caution');
        }
        // Check for message button availability using safe evaluation
        const buttonState = await page.evaluate(() => {
            const messageBtn = document.querySelector('button[aria-label*="Message"], button[aria-label*="Nachricht"]');
            const connectBtn = document.querySelector('button[aria-label*="Connect"], button[aria-label*="Vernetzen"]');
            return {
                hasMessageButton: !!messageBtn,
                hasConnectButton: !!connectBtn,
                messageText: messageBtn?.textContent || '',
                isMessageEnabled: messageBtn ? !messageBtn.disabled : false
            };
        });
        if (!buttonState.hasMessageButton) {
            if (buttonState.hasConnectButton) {
                throw new Error('User is not connected - connect first before messaging');
            }
            throw new Error('Message button not found - user may not be connected or messaging is disabled');
        }
        if (!buttonState.isMessageEnabled) {
            throw new Error('Message button is disabled - messaging may not be available');
        }
        // Use safe element interaction for message button
        console.log('Message button found, clicking with safe interaction...');
        await (0, browserHealth_1.safeElementInteraction)(page, shared_1.LINKEDIN_SELECTORS.MESSAGE_BUTTON, async (messageButton) => {
            await messageButton.click();
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for message window to open
            return true;
        }, { timeout: 10000, retries: 3 });
        // Use enhanced LinkedIn-specific typing for message input
        await (0, browserHealth_1.safeElementInteraction)(page, shared_1.LINKEDIN_SELECTORS.MESSAGE_TEXTAREA, async (messageInput) => {
            // Clear any existing text with human-like behavior
            await messageInput.click();
            await new Promise(resolve => setTimeout(resolve, (0, browserHealth_1.humanDelay)(150, 30)));
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await new Promise(resolve => setTimeout(resolve, (0, browserHealth_1.humanDelay)(100, 40)));
            await page.keyboard.press('Delete');
            await new Promise(resolve => setTimeout(resolve, (0, browserHealth_1.humanDelay)(300, 50)));
            // Use LinkedIn-specific typing for message context
            await (0, browserHealth_1.linkedInTyping)(page, message, 'message', {
                element: messageInput
            });
            console.log('Message typed with human-like patterns');
            return true;
        }, { timeout: 15000, retries: 3 } // Increased timeout for longer typing simulation
        );
        // Use safe element interaction for send button
        await (0, browserHealth_1.safeElementInteraction)(page, shared_1.LINKEDIN_SELECTORS.SEND_MESSAGE_BUTTON, async (sendBtn) => {
            await sendBtn.click();
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for message to be sent
            return true;
        }, { timeout: 5000, retries: 3 });
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
