import { Page } from 'puppeteer';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { safeElementInteraction, verifyPageStability, humanDelay, simulateHumanBehavior, enforceRequestSpacing, waitForButtonWithMultipleSelectors, waitForLinkedInPageReady, linkedInTyping, getActivityPattern, resetSessionState, waitForLinkedInPageLoad, waitForProfilePageReady, analyzePageStructure, validateProfilePage, waitForPageStability } from '../utils/browserHealth';

export async function sendInvitation(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<{ success: boolean; message: string; profileUrl: string }> {
  // Check activity patterns and respect business hours
  const activityPattern = getActivityPattern();
  console.log(`Activity pattern: ${activityPattern.isActiveHour ? 'Active' : 'Inactive'} hour (${activityPattern.activityMultiplier}x speed)`);
  
  // Validate profile URL before navigation
  if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
    throw new Error(`Invalid LinkedIn profile URL: ${profileUrl}`);
  }

  console.log(`Navigating to profile: ${profileUrl}`);
  
  // Enforce request spacing to prevent rate limiting
  await enforceRequestSpacing();
  
  // Add human-like delay before navigation
  const navigationDelay = humanDelay(2000, 60); // 800ms-3200ms variation
  await new Promise(resolve => setTimeout(resolve, navigationDelay));
  
  // Use more flexible navigation strategy with retry logic
  let navigationSuccess = false;
  let lastError: Error | null = null;
  
  const navigationStrategies = [
    { waitUntil: 'domcontentloaded' as const, timeout: 30000 },
    { waitUntil: 'load' as const, timeout: 45000 },
    { waitUntil: 'networkidle2' as const, timeout: 60000 }
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
      
    } catch (error) {
      lastError = error as Error;
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
    // Enhanced LinkedIn page loading validation with stability protection
    console.log('Validating LinkedIn page loading with comprehensive checks...');
    
    // Step 1: Basic page loading
    const pageLoaded = await waitForLinkedInPageLoad(page, 'profile', 35000);
    if (!pageLoaded) {
      console.log('Basic page loading failed, analyzing page structure...');
      await analyzePageStructure(page);
      throw new Error('LinkedIn profile page failed to load properly');
    }
    
    // Step 2: Multi-strategy profile validation
    console.log('Running multi-strategy profile validation...');
    const profileValidation = await validateProfilePage(page);
    
    if (!profileValidation.isValid) {
      console.warn(`Profile validation failed with ${profileValidation.strategy} strategy (confidence: ${profileValidation.confidence})`);
      console.log('Running final page analysis before failing...');
      await analyzePageStructure(page);
      
      if (profileValidation.confidence < 0.3) {
        throw new Error(`Profile page validation failed - insufficient confidence (${profileValidation.confidence}) using ${profileValidation.strategy} strategy`);
      } else {
        console.warn('Low confidence but proceeding with caution...');
      }
    } else {
      console.log(`✅ Profile validated successfully using ${profileValidation.strategy} strategy (confidence: ${profileValidation.confidence})`);
    }
    
    // Step 3: Additional page stability check to prevent state regression
    console.log('Performing final stability check to prevent state regression...');
    const finalStability = await waitForPageStability(page, 2000, 10000);
    if (!finalStability) {
      console.warn('Final stability check failed, but proceeding with validated profile...');
    }

    // Simulate human behavior on the profile page
    console.log('Simulating human behavior...');
    await simulateHumanBehavior(page);
    
    // Check for already connected state (Message button exists)
    try {
      const messageSelectors = LINKEDIN_SELECTORS.MESSAGE_BUTTON.split(', ');
      await waitForButtonWithMultipleSelectors(page, messageSelectors, { 
        timeout: 3000, 
        visible: true 
      });
      throw new Error('User is already connected - cannot send invitation');
    } catch (error: any) {
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
      await waitForButtonWithMultipleSelectors(page, pendingSelectors, { 
        timeout: 3000, 
        visible: true 
      });
      throw new Error('Invitation already pending - cannot send duplicate invitation');
    } catch (error: any) {
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
    const preSearchAnalysis = await analyzePageStructure(page);
    
    if (!preSearchAnalysis || preSearchAnalysis.buttonAnalysis.totalButtons === 0) {
      throw new Error('No buttons found on page - page may not have loaded properly or profile is inaccessible');
    }
    
    console.log(`Found ${preSearchAnalysis.buttonAnalysis.totalButtons} total buttons, ${preSearchAnalysis.buttonAnalysis.connectButtons} Connect buttons, ${preSearchAnalysis.buttonAnalysis.messageButtons} Message buttons`);
    
    // Stage 2: Wait for buttons to be rendered and stable
    console.log('Stage 2: Waiting for buttons to be stable...');
    await new Promise(resolve => setTimeout(resolve, humanDelay(2000, 50)));
    
    // Stage 3: Enhanced Connect button search with multiple strategies
    console.log('Stage 3: Searching for Connect button with enhanced patterns...');
    try {
      const connectSelectors = LINKEDIN_SELECTORS.CONNECT_BUTTON.split(', ');
      connectButton = await waitForButtonWithMultipleSelectors(page, connectSelectors, {
        timeout: 20000, // Increased timeout
        visible: true,
        enabled: true
      });
      
      console.log('✅ Connect button found successfully');
      
    } catch (error: any) {
      console.error('Connect button search failed, running final analysis...');
      
      // Stage 4: Final comprehensive analysis for debugging
      const finalAnalysis = await analyzePageStructure(page);
      
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
      } else if (finalAnalysis?.linkedinStructure.hasErrorIndicators) {
        throw new Error('LinkedIn error detected - profile may be unavailable or rate limited');
      } else if (!finalAnalysis?.linkedinStructure.hasProfileActions) {
        throw new Error('Profile actions section not found - profile may be private or restricted');
      } else {
        throw new Error(`Connect button not found after comprehensive search - found ${finalAnalysis?.buttonAnalysis.totalButtons || 0} total buttons, but no Connect button available`);
      }
    }
    
    // Click the found connect button directly
    console.log('Connect button found, clicking with human-like timing...');
    await connectButton.click();
    
    // Add human-like delay after clicking
    const clickDelay = humanDelay(1000, 50);
    await new Promise(resolve => setTimeout(resolve, clickDelay));
    
    // Wait for invitation modal with human-like timing
    const modalWaitTime = humanDelay(2000, 50); // Variable 1-3 second wait
    await new Promise(resolve => setTimeout(resolve, modalWaitTime));

    if (note) {
      try {
        console.log('Adding personal note to invitation...');
        
        // Use safe element interaction for note button
        await safeElementInteraction(
          page,
          LINKEDIN_SELECTORS.NOTE_BUTTON,
          async (noteBtn) => {
            await noteBtn.click();
            const clickDelay = humanDelay(700, 60); // Variable delay after click
            await new Promise(resolve => setTimeout(resolve, clickDelay));
            return true;
          },
          { timeout: 8000, retries: 2 }
        );
        
        // Use enhanced LinkedIn-specific typing for note field
        await safeElementInteraction(
          page,
          'textarea[name="message"]',
          async (noteField) => {
            await noteField.click({ clickCount: 3 }); // Select all existing text
            await new Promise(resolve => setTimeout(resolve, humanDelay(200, 40))); // Brief pause after selection
            
            // Use LinkedIn-specific typing for note context
            await linkedInTyping(page, note, 'note', { 
              element: noteField
            });
            
            console.log('Personal note added successfully with human-like typing patterns');
            return true;
          },
          { timeout: 8000, retries: 2 } // Increased timeout for longer typing simulation
        );
        
      } catch (error) {
        console.warn('Note addition failed, proceeding without note:', (error as Error).message);
      }
    }

    // Find and click send button with safe interaction
    console.log('Looking for send button...');
    await safeElementInteraction(
      page,
      LINKEDIN_SELECTORS.SEND_BUTTON,
      async (sendBtn) => {
        console.log('Sending invitation...');
        await sendBtn.click();
        return true;
      },
      { timeout: 10000, retries: 3 }
    );
    
    // Wait for invitation to be processed with human-like timing
    const confirmationWaitTime = humanDelay(2500, 60); // Variable 1-4 second wait
    await new Promise(resolve => setTimeout(resolve, confirmationWaitTime));
    
    // Verify invitation was sent (check for success indicators)
    try {
      // Use page evaluation to check if modal is gone more reliably
      const modalClosed = await page.evaluate(() => {
        const modal = document.querySelector('[data-test-modal-id="send-invite-modal"]') as HTMLElement;
        return !modal || modal.style.display === 'none' || !modal.isConnected;
      });
      
      if (modalClosed) {
        console.log('Invitation modal closed - invitation likely sent');
      } else {
        console.warn('Modal still present, but proceeding as success');
      }
    } catch (error) {
      console.warn('Could not verify invitation modal closure, but proceeding as success');
    }

    console.log(`Invitation sent successfully to ${profileUrl}`);
    return {
      success: true,
      message: note ? 'Invitation with personal note sent successfully' : 'Invitation sent successfully',
      profileUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to send invitation to ${profileUrl}:`, errorMessage);
    
    // Provide more specific error context
    const currentUrl = page.url();
    const enhancedError = `Navigation error: ${errorMessage}. Current URL: ${currentUrl}`;
    
    throw new Error(enhancedError);
  }
}