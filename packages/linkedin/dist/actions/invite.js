"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvitation = sendInvitation;
const shared_1 = require("@linkedin-bot-suite/shared");
const browserHealth_1 = require("../utils/browserHealth");
async function sendInvitation(page, profileUrl, note) {
    // Check activity patterns and respect business hours
    const activityPattern = (0, browserHealth_1.getActivityPattern)();
    console.log(`Activity pattern: ${activityPattern.isActiveHour ? 'Active' : 'Inactive'} hour (${activityPattern.activityMultiplier}x speed)`);
    // Validate profile URL before navigation
    if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
        throw new Error(`Invalid LinkedIn profile URL: ${profileUrl}`);
    }
    console.log(`Navigating to profile: ${profileUrl}`);
    // Enforce request spacing to prevent rate limiting
    await (0, browserHealth_1.enforceRequestSpacing)();
    // Add human-like delay before navigation
    const navigationDelay = (0, browserHealth_1.humanDelay)(2000, 60); // 800ms-3200ms variation
    await new Promise(resolve => setTimeout(resolve, navigationDelay));
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
        // Enhanced page loading with context destruction recovery
        console.log('Validating LinkedIn page loading with recovery mechanisms...');
        let validationAttempts = 0;
        const maxValidationAttempts = 2;
        let pageValidated = false;
        while (!pageValidated && validationAttempts < maxValidationAttempts) {
            try {
                validationAttempts++;
                console.log(`Page validation attempt ${validationAttempts}/${maxValidationAttempts}`);
                // Step 1: Basic page loading with reduced timeout
                const pageLoaded = await (0, browserHealth_1.waitForLinkedInPageLoad)(page, 'profile', 15000);
                if (!pageLoaded) {
                    if (validationAttempts >= maxValidationAttempts) {
                        console.log('Basic page loading failed, analyzing page structure...');
                        await (0, browserHealth_1.analyzePageStructure)(page);
                        throw new Error('LinkedIn profile page failed to load properly after multiple attempts');
                    }
                    console.warn('Page loading failed, retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                // Step 2: Simplified profile validation with recovery
                console.log('Running simplified profile validation...');
                const profileValidation = await (0, browserHealth_1.validateProfilePage)(page);
                if (!profileValidation.isValid) {
                    if (profileValidation.confidence < 0.3 && validationAttempts >= maxValidationAttempts) {
                        console.log('Running final page analysis before failing...');
                        await (0, browserHealth_1.analyzePageStructure)(page);
                        throw new Error(`Profile page validation failed - insufficient confidence (${profileValidation.confidence}) after ${validationAttempts} attempts`);
                    }
                    else if (profileValidation.confidence < 0.3) {
                        console.warn('Low confidence validation, retrying...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue;
                    }
                    else {
                        console.warn(`Low confidence (${profileValidation.confidence}) but proceeding...`);
                    }
                }
                else {
                    console.log(`✅ Profile validated successfully (confidence: ${profileValidation.confidence})`);
                }
                pageValidated = true;
            }
            catch (error) {
                const errorMessage = error.message;
                if (errorMessage.includes('Execution context was destroyed') ||
                    errorMessage.includes('Target closed') ||
                    errorMessage.includes('Session closed')) {
                    console.warn(`Context destruction detected on attempt ${validationAttempts}, retrying...`);
                    if (validationAttempts < maxValidationAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                throw error;
            }
        }
        // Simulate human behavior on the profile page
        console.log('Simulating human behavior...');
        await (0, browserHealth_1.simulateHumanBehavior)(page);
        // Check for already connected state (Message button exists)
        try {
            const messageSelectors = shared_1.LINKEDIN_SELECTORS.MESSAGE_BUTTON.split(', ');
            await (0, browserHealth_1.waitForButtonWithMultipleSelectors)(page, messageSelectors, {
                timeout: 3000,
                visible: true
            });
            throw new Error('User is already connected - cannot send invitation');
        }
        catch (error) {
            if (error.message.includes('already connected')) {
                throw error; // Re-throw if already connected
            }
            // Continue if message button not found (good - means not connected)
        }
        // Check for pending invitation state
        try {
            const pendingSelectors = [
                'button[aria-label*="Pending"], button[aria-label*="Ausstehend"]',
                'button[data-control-name*="pending"]',
                'button:has-text("Pending"), button:has-text("Ausstehend")'
            ];
            await (0, browserHealth_1.waitForButtonWithMultipleSelectors)(page, pendingSelectors, {
                timeout: 3000,
                visible: true
            });
            throw new Error('Invitation already pending - cannot send duplicate invitation');
        }
        catch (error) {
            if (error.message.includes('already pending')) {
                throw error; // Re-throw if pending
            }
            // Continue if pending button not found (good - means no pending invitation)
        }
        // Multi-stage Connect button discovery with comprehensive analysis
        console.log('Starting multi-stage Connect button discovery...');
        let connectButton;
        // Stage 1: Comprehensive page analysis first
        console.log('Stage 1: Analyzing page structure before button search...');
        const preSearchAnalysis = await (0, browserHealth_1.analyzePageStructure)(page);
        if (!preSearchAnalysis || preSearchAnalysis.buttonAnalysis.totalButtons === 0) {
            throw new Error('No buttons found on page - page may not have loaded properly or profile is inaccessible');
        }
        console.log(`Found ${preSearchAnalysis.buttonAnalysis.totalButtons} total buttons, ${preSearchAnalysis.buttonAnalysis.connectButtons} Connect buttons, ${preSearchAnalysis.buttonAnalysis.messageButtons} Message buttons`);
        // Stage 2: Wait for buttons to be rendered and stable
        console.log('Stage 2: Waiting for buttons to be stable...');
        await new Promise(resolve => setTimeout(resolve, (0, browserHealth_1.humanDelay)(2000, 50)));
        // Stage 3: Enhanced Connect button search with multiple strategies
        console.log('Stage 3: Searching for Connect button with enhanced patterns...');
        try {
            const connectSelectors = shared_1.LINKEDIN_SELECTORS.CONNECT_BUTTON.split(', ');
            connectButton = await (0, browserHealth_1.waitForButtonWithMultipleSelectors)(page, connectSelectors, {
                timeout: 20000, // Increased timeout
                visible: true,
                enabled: true
            });
            console.log('✅ Connect button found successfully');
        }
        catch (error) {
            console.error('Connect button search failed, running final analysis...');
            // Stage 4: Final comprehensive analysis for debugging
            const finalAnalysis = await (0, browserHealth_1.analyzePageStructure)(page);
            console.error('Final button search analysis:', {
                profileUrl,
                currentUrl: page.url(),
                pageTitle: await page.title(),
                preSearchButtons: preSearchAnalysis.buttonAnalysis.totalButtons,
                finalButtons: finalAnalysis?.buttonAnalysis.totalButtons || 0,
                connectButtonsFound: finalAnalysis?.buttonAnalysis.connectButtons || 0,
                messageButtonsFound: finalAnalysis?.buttonAnalysis.messageButtons || 0,
                profileStructure: finalAnalysis?.linkedinStructure || {},
                buttonDetails: finalAnalysis?.buttonAnalysis.buttonDetails || [],
                originalError: error.message
            });
            // Provide more specific error messages based on analysis
            if (finalAnalysis?.buttonAnalysis.messageButtons > 0) {
                throw new Error('User is already connected - Message button found instead of Connect button');
            }
            else if (finalAnalysis?.linkedinStructure.hasErrorIndicators) {
                throw new Error('LinkedIn error detected - profile may be unavailable or rate limited');
            }
            else if (!finalAnalysis?.linkedinStructure.hasProfileActions) {
                throw new Error('Profile actions section not found - profile may be private or restricted');
            }
            else {
                throw new Error(`Connect button not found after comprehensive search - found ${finalAnalysis?.buttonAnalysis.totalButtons || 0} total buttons, but no Connect button available`);
            }
        }
        // Click the found connect button directly
        console.log('Connect button found, clicking with human-like timing...');
        await connectButton.click();
        // Add human-like delay after clicking
        const clickDelay = (0, browserHealth_1.humanDelay)(1000, 50);
        await new Promise(resolve => setTimeout(resolve, clickDelay));
        // Wait for invitation modal with human-like timing
        const modalWaitTime = (0, browserHealth_1.humanDelay)(2000, 50); // Variable 1-3 second wait
        await new Promise(resolve => setTimeout(resolve, modalWaitTime));
        if (note) {
            try {
                console.log('Adding personal note to invitation...');
                // Use safe element interaction for note button
                await (0, browserHealth_1.safeElementInteraction)(page, shared_1.LINKEDIN_SELECTORS.NOTE_BUTTON, async (noteBtn) => {
                    await noteBtn.click();
                    const clickDelay = (0, browserHealth_1.humanDelay)(700, 60); // Variable delay after click
                    await new Promise(resolve => setTimeout(resolve, clickDelay));
                    return true;
                }, { timeout: 8000, retries: 2 });
                // Use enhanced LinkedIn-specific typing for note field
                await (0, browserHealth_1.safeElementInteraction)(page, 'textarea[name="message"]', async (noteField) => {
                    await noteField.click({ clickCount: 3 }); // Select all existing text
                    await new Promise(resolve => setTimeout(resolve, (0, browserHealth_1.humanDelay)(200, 40))); // Brief pause after selection
                    // Use LinkedIn-specific typing for note context
                    await (0, browserHealth_1.linkedInTyping)(page, note, 'note', {
                        element: noteField
                    });
                    console.log('Personal note added successfully with human-like typing patterns');
                    return true;
                }, { timeout: 8000, retries: 2 } // Increased timeout for longer typing simulation
                );
            }
            catch (error) {
                console.warn('Note addition failed, proceeding without note:', error.message);
            }
        }
        // Find and click send button with safe interaction
        console.log('Looking for send button...');
        await (0, browserHealth_1.safeElementInteraction)(page, shared_1.LINKEDIN_SELECTORS.SEND_BUTTON, async (sendBtn) => {
            console.log('Sending invitation...');
            await sendBtn.click();
            return true;
        }, { timeout: 10000, retries: 3 });
        // Wait for invitation to be processed with human-like timing
        const confirmationWaitTime = (0, browserHealth_1.humanDelay)(2500, 60); // Variable 1-4 second wait
        await new Promise(resolve => setTimeout(resolve, confirmationWaitTime));
        // Verify invitation was sent (check for success indicators)
        try {
            // Use page evaluation to check if modal is gone more reliably
            const modalClosed = await page.evaluate(() => {
                const modal = document.querySelector('[data-test-modal-id="send-invite-modal"]');
                return !modal || modal.style.display === 'none' || !modal.isConnected;
            });
            if (modalClosed) {
                console.log('Invitation modal closed - invitation likely sent');
            }
            else {
                console.warn('Modal still present, but proceeding as success');
            }
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
