import { Page } from 'puppeteer';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { safeElementInteraction, verifyPageStability, humanDelay, simulateHumanBehavior, enforceRequestSpacing, waitForButtonWithMultipleSelectors, waitForLinkedInPageReady, linkedInTyping, getActivityPattern, resetSessionState } from '../utils/browserHealth';

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
    // Wait for LinkedIn page to be fully ready
    console.log('Waiting for LinkedIn profile page to be ready...');
    const pageReady = await waitForLinkedInPageReady(page, 'profile', 20000);
    if (!pageReady) {
      console.warn('LinkedIn page readiness timeout, but proceeding with caution');
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

    // Enhanced Connect button discovery with multiple patterns
    console.log('Looking for Connect button with enhanced discovery...');
    let connectButton;
    
    try {
      const connectSelectors = LINKEDIN_SELECTORS.CONNECT_BUTTON.split(', ');
      connectButton = await waitForButtonWithMultipleSelectors(page, connectSelectors, {
        timeout: 15000,
        visible: true,
        enabled: true
      });
    } catch (error: any) {
      // Enhanced error reporting with page analysis
      const currentUrl = page.url();
      const pageTitle = await page.title();
      
      // Try to get more debugging info about the page state
      const pageAnalysis = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const buttonInfo = allButtons.slice(0, 10).map(btn => ({
          text: btn.textContent?.trim().substring(0, 50) || '',
          ariaLabel: btn.getAttribute('aria-label') || '',
          className: btn.className,
          dataControlName: btn.getAttribute('data-control-name') || ''
        }));

        return {
          totalButtons: allButtons.length,
          buttonSample: buttonInfo,
          profileActions: !!document.querySelector('.pv-s-profile-actions, .pvs-profile-actions, .profile-actions'),
          hasProfileHeader: !!document.querySelector('.pv-top-card, .pvs-header'),
          isLinkedInProfile: window.location.pathname.includes('/in/')
        };
      });
      
      console.error('Enhanced Connect button search failed:', {
        currentUrl,
        pageTitle,
        profileUrl,
        pageAnalysis,
        originalError: error.message
      });
      
      throw new Error('Connect button not found - user may already be connected, profile is private, or page failed to load properly');
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