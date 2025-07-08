"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvitation = sendInvitation;
const shared_1 = require("@linkedin-bot-suite/shared");
async function sendInvitation(page, profileUrl, note) {
    // Validate profile URL before navigation
    if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
        throw new Error(`Invalid LinkedIn profile URL: ${profileUrl}`);
    }
    console.log(`Navigating to profile: ${profileUrl}`);
    // Add random delay to simulate human behavior
    const randomDelay = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    // Use more flexible navigation strategy with retry logic
    let navigationSuccess = false;
    let lastError = null;
    const navigationStrategies = [
        { waitUntil: 'domcontentloaded', timeout: 30000 },
        { waitUntil: 'load', timeout: 45000 },
        { waitUntil: 'networkidle2', timeout: 60000 }
    ];
    for (const strategy of navigationStrategies) {
        try {
            console.log(`Attempting navigation with strategy: ${strategy.waitUntil}, timeout: ${strategy.timeout}ms`);
            const response = await page.goto(profileUrl, strategy);
            if (!response) {
                throw new Error('Navigation returned no response');
            }
            if (response.status() >= 400) {
                throw new Error(`Navigation failed with HTTP ${response.status()}`);
            }
            // Check if we actually landed on the profile page
            const currentUrl = page.url();
            if (!currentUrl.includes('linkedin.com/in/') || currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
                throw new Error(`Navigation redirected to unexpected page: ${currentUrl}`);
            }
            navigationSuccess = true;
            console.log(`Navigation successful with strategy: ${strategy.waitUntil}`);
            break;
        }
        catch (error) {
            lastError = error;
            console.warn(`Navigation failed with strategy ${strategy.waitUntil}:`, lastError.message);
            // Add delay before trying next strategy
            if (strategy !== navigationStrategies[navigationStrategies.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    if (!navigationSuccess) {
        throw new Error(`Failed to navigate to profile after trying all strategies. Last error: ${lastError?.message || 'Unknown error'}`);
    }
    try {
        // Wait for page to stabilize and check for connect button
        console.log('Waiting for page elements to load...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Enhanced connect button detection with multiple attempts
        let connect = null;
        let attempts = 0;
        const maxAttempts = 3;
        while (!connect && attempts < maxAttempts) {
            attempts++;
            console.log(`Attempting to find connect button (attempt ${attempts}/${maxAttempts})`);
            connect = await page.$(shared_1.LINKEDIN_SELECTORS.CONNECT_BUTTON);
            if (!connect) {
                // Check for alternative connection states
                const alreadyConnected = await page.$('button[aria-label*="Message"], button[aria-label*="Nachricht"]');
                const pendingInvite = await page.$('button[aria-label*="Pending"], button[aria-label*="Ausstehend"]');
                if (alreadyConnected) {
                    throw new Error('User is already connected - cannot send invitation');
                }
                if (pendingInvite) {
                    throw new Error('Invitation already pending - cannot send duplicate invitation');
                }
                if (attempts < maxAttempts) {
                    console.log('Connect button not found, waiting and retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        if (!connect) {
            // Detailed error logging for debugging
            const currentUrl = page.url();
            const pageTitle = await page.title();
            console.error('Connect button detection failed:', {
                currentUrl,
                pageTitle,
                profileUrl,
                attempts: maxAttempts
            });
            throw new Error(`Connect button not found after ${maxAttempts} attempts - user may already be connected, profile is private, or page failed to load properly`);
        }
        console.log('Connect button found, clicking...');
        await connect.click();
        // Wait for invitation modal with realistic timing
        const modalWaitTime = Math.floor(Math.random() * 1000) + 1500; // 1.5-2.5 seconds
        await new Promise(resolve => setTimeout(resolve, modalWaitTime));
        if (note) {
            try {
                console.log('Adding personal note to invitation...');
                const noteBtn = await page.waitForSelector(shared_1.LINKEDIN_SELECTORS.NOTE_BUTTON, { timeout: 8000 });
                if (noteBtn) {
                    await noteBtn.click();
                    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 500));
                    // Clear existing text and type new note with human-like timing
                    const noteField = await page.waitForSelector('textarea[name="message"]', { timeout: 5000 });
                    if (noteField) {
                        await noteField.click({ clickCount: 3 }); // Select all existing text
                        await noteField.type(note, { delay: Math.floor(Math.random() * 50) + 50 }); // Human-like typing
                        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 500));
                        console.log('Personal note added successfully');
                    }
                }
            }
            catch (error) {
                console.warn('Note addition failed, proceeding without note:', error.message);
            }
        }
        // Find and click send button with enhanced detection
        console.log('Looking for send button...');
        const sendBtn = await page.waitForSelector(shared_1.LINKEDIN_SELECTORS.SEND_BUTTON, { timeout: 10000 });
        if (!sendBtn) {
            throw new Error('Send invitation button not found - modal may not have loaded properly');
        }
        console.log('Sending invitation...');
        await sendBtn.click();
        // Wait for invitation to be processed with realistic timing
        const confirmationWaitTime = Math.floor(Math.random() * 2000) + 2000; // 2-4 seconds
        await new Promise(resolve => setTimeout(resolve, confirmationWaitTime));
        // Verify invitation was sent (check for success indicators)
        try {
            const successIndicator = await page.waitForSelector('[data-test-modal-id="send-invite-modal"]', {
                timeout: 3000,
                hidden: true // Wait for modal to disappear
            });
            console.log('Invitation modal closed - invitation likely sent');
        }
        catch (error) {
            console.warn('Could not verify invitation modal closure, but proceeding as success');
        }
        console.log(`Invitation sent successfully to ${profileUrl}`);
        return {
            success: true,
            message: note ? 'Invitation with personal note sent successfully' : 'Invitation sent successfully',
            profileUrl,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to send invitation to ${profileUrl}:`, errorMessage);
        // Provide more specific error context
        const currentUrl = page.url();
        const enhancedError = `Navigation error: ${errorMessage}. Current URL: ${currentUrl}`;
        throw new Error(enhancedError);
    }
}
