import { Page } from 'puppeteer';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { safeElementInteraction, verifyPageStability, humanDelay, simulateHumanBehavior, enforceRequestSpacing, waitForButtonWithMultipleSelectors, waitForLinkedInPageReady, linkedInTyping, getActivityPattern, resetSessionState, waitForLinkedInPageLoad, waitForProfilePageReady, analyzePageStructure, validateProfilePage, waitForPageStability, monitorPageStability, optimizeMemoryUsage, smartHumanDelay, recoverFromBigpipeStuck, safeEvaluate, withContextRecovery } from '../utils/browserHealth';
import { sendMessage } from './message';

export async function sendInvitation(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<{ success: boolean; message: string; profileUrl: string; actionTaken: 'invited' | 'messaged' }> {
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
  
  // Smart navigation delay with exponential bias toward speed
  const navigationDelay = smartHumanDelay(800, 'fast'); // Exponentially biased toward faster execution
  await new Promise(resolve => setTimeout(resolve, navigationDelay));
  
  // Single navigation attempt with best strategy
  try {
    console.log('Navigating to profile page...');
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000 // Reduced from 30s
    });
  } catch (navError) {
    console.warn('First navigation attempt failed, trying with networkidle...');
    // Try once more with networkidle
    await page.goto(profileUrl, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });
  }

  // Quick URL check
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    throw new Error(`Redirected to login: ${currentUrl}`);
  }

  try {
    // Simplified page validation - just wait a bit and check basics
    console.log('Validating LinkedIn page loading...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const pageReady = await waitForLinkedInPageLoad(page, 'profile', 6000);
    if (!pageReady) {
      // Don't retry, just proceed
      console.warn('Page validation failed but proceeding');
    }
    
    // Quick check for connection state
    console.log('Checking connection state...');
    let isConnected = false;
    try {
      await page.waitForSelector('button[aria-label*="Message"]', { timeout: 2000 });
      isConnected = true;
      console.log('✅ User is already connected');
    } catch {
      console.log('User not connected, proceeding with invitation');
    }

    if (isConnected && note) {
      // Already connected, send message
      console.log('🔄 Auto-fallback: Sending message to already connected user...');
      const messageResult = await sendMessage(page, profileUrl, note);
      return {
        success: messageResult.success,
        message: messageResult.message,
        profileUrl: messageResult.profileUrl,
        actionTaken: 'messaged' as const
      };
    }

    // Find and click connect button
    console.log('Looking for Connect button...');
    let connectButton;
    try {
      connectButton = await page.waitForSelector(
        'button[aria-label*="Connect"], button[aria-label*="Invite"]',
        { timeout: 5000, visible: true }
      );
      console.log('✅ Connect button found');
    } catch (error) {
      // Try fallback to message if connect not available
      try {
        await page.waitForSelector('button[aria-label*="Message"]', { timeout: 2000 });
        if (note) {
          console.log('🔄 Connect button not found, falling back to message...');
          const messageResult = await sendMessage(page, profileUrl, note);
          return {
            success: messageResult.success,
            message: messageResult.message,
            profileUrl: messageResult.profileUrl,
            actionTaken: 'messaged' as const
          };
        }
        throw new Error('User is already connected but no message provided');
      } catch {
        throw new Error('Neither Connect nor Message button found - profile may be private or restricted');
      }
    }
    
    // Click the connect button
    console.log('Clicking Connect button...');
    if (!connectButton) {
      throw new Error('Connect button is null');
    }
    await connectButton.click();
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Add note if provided
    if (note) {
      try {
        console.log('Adding personal note...');
        const noteButton = await page.waitForSelector('button[aria-label*="Add a note"]', { timeout: 3000 });
        if (!noteButton) {
          throw new Error('Note button not found');
        }
        await noteButton.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const textarea = await page.waitForSelector('textarea[name="message"]', { timeout: 3000 });
        if (!textarea) {
          throw new Error('Textarea not found');
        }
        await textarea.type(note, { delay: 50 });
        console.log('Note added successfully');
      } catch (noteError) {
        console.warn('Could not add note:', (noteError as Error).message);
      }
    }

    // Send invitation
    console.log('Sending invitation...');
    const sendButton = await page.waitForSelector('button[aria-label*="Send"]', { timeout: 5000 });
    if (!sendButton) {
      throw new Error('Send button not found');
    }
    await sendButton.click();
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`Invitation sent successfully to ${profileUrl}`);
    return {
      success: true,
      message: note ? 'Invitation with personal note sent successfully' : 'Invitation sent successfully',
      profileUrl,
      actionTaken: 'invited'
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