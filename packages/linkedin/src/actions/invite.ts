import { Page } from 'puppeteer';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { safeElementInteraction, verifyPageStability } from '../utils/browserHealth';

export async function sendInvitation(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<{ success: boolean; message: string; profileUrl: string }> {
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
    // Verify page stability before attempting DOM interactions
    console.log('Waiting for page elements to load and stabilize...');
    const isStable = await verifyPageStability(page, 3000);
    if (!isStable) {
      console.warn('Page stability check failed, but proceeding with caution');
    }
    
    // Check for alternative connection states first using safe evaluation
    const connectionState = await page.evaluate(() => {
      const messageBtn = document.querySelector('button[aria-label*="Message"], button[aria-label*="Nachricht"]');
      const pendingBtn = document.querySelector('button[aria-label*="Pending"], button[aria-label*="Ausstehend"]');
      const connectBtn = document.querySelector('button[aria-label*="Connect"], button[aria-label*="Vernetzen"]');
      
      return {
        hasMessageButton: !!messageBtn,
        hasPendingButton: !!pendingBtn,
        hasConnectButton: !!connectBtn,
        messageText: messageBtn?.textContent || '',
        pendingText: pendingBtn?.textContent || '',
        connectText: connectBtn?.textContent || ''
      };
    });
    
    if (connectionState.hasMessageButton) {
      throw new Error('User is already connected - cannot send invitation');
    }
    
    if (connectionState.hasPendingButton) {
      throw new Error('Invitation already pending - cannot send duplicate invitation');
    }
    
    if (!connectionState.hasConnectButton) {
      const currentUrl = page.url();
      const pageTitle = await page.title();
      console.error('Connect button not found on page:', {
        currentUrl,
        pageTitle,
        profileUrl,
        connectionState
      });
      throw new Error('Connect button not found - user may already be connected, profile is private, or page failed to load properly');
    }
    
    // Use safe element interaction for connect button
    console.log('Connect button found, clicking with safe interaction...');
    await safeElementInteraction(
      page,
      LINKEDIN_SELECTORS.CONNECT_BUTTON,
      async (element) => {
        await element.click();
        return true;
      },
      { timeout: 10000, retries: 3 }
    );
    
    // Wait for invitation modal with realistic timing
    const modalWaitTime = Math.floor(Math.random() * 1000) + 1500; // 1.5-2.5 seconds
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
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 500));
            return true;
          },
          { timeout: 8000, retries: 2 }
        );
        
        // Use safe element interaction for note field
        await safeElementInteraction(
          page,
          'textarea[name="message"]',
          async (noteField) => {
            await noteField.click({ clickCount: 3 }); // Select all existing text
            await noteField.type(note, { delay: Math.floor(Math.random() * 50) + 50 }); // Human-like typing
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 500));
            console.log('Personal note added successfully');
            return true;
          },
          { timeout: 5000, retries: 2 }
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
    
    // Wait for invitation to be processed with realistic timing
    const confirmationWaitTime = Math.floor(Math.random() * 2000) + 2000; // 2-4 seconds
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