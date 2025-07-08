import { Page } from 'puppeteer';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { safeElementInteraction, verifyPageStability, humanDelay, simulateHumanBehavior, enforceRequestSpacing, waitForButtonWithMultipleSelectors, waitForLinkedInPageReady, linkedInTyping, getActivityPattern, resetSessionState, waitForLinkedInPageLoad, waitForProfilePageReady, analyzePageStructure, validateProfilePage, waitForPageStability, monitorPageStability, optimizeMemoryUsage, smartHumanDelay, recoverFromBigpipeStuck, safeEvaluate, withContextRecovery, analyzeLinkedInButtonStructure, findLinkedInButton } from '../utils/browserHealth';
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
    
    // Analyze button structure for debugging with error recovery
    console.log('🔍 Analyzing current button structure...');
    let buttonAnalysis;
    try {
      buttonAnalysis = await analyzeLinkedInButtonStructure(page);
      console.log('📊 Button analysis results:');
      buttonAnalysis.suggestions.forEach(suggestion => console.log(`   ${suggestion}`));
    } catch (analysisError) {
      console.warn('⚠️ Button analysis failed, proceeding without detailed analysis:', analysisError);
      buttonAnalysis = {
        buttons: [],
        suggestions: ['Button analysis failed due to execution context error'],
        screenshot: undefined
      };
    }

    // Quick check for connection state using progressive detection
    console.log('Checking connection state...');
    const messageButton = await findLinkedInButton(page, 'message', 3000);
    const isConnected = messageButton !== null;
    
    if (isConnected) {
      console.log('✅ User is already connected');
      if (note) {
        console.log('🔄 Auto-fallback: Sending message to already connected user...');
        const messageResult = await sendMessage(page, profileUrl, note);
        return {
          success: messageResult.success,
          message: messageResult.message,
          profileUrl: messageResult.profileUrl,
          actionTaken: 'messaged' as const
        };
      }
    } else {
      console.log('User not connected, proceeding with invitation');
    }

    // Progressive button detection for Connect button with enhanced stability
    console.log('🔍 Looking for Connect button with progressive detection...');
    const connectButtonResult = await findLinkedInButton(page, 'connect', 20000); // Increased from 15s to 20s for stability
    
    if (!connectButtonResult) {
      // Try fallback to message if connect not available
      console.log('❌ Connect button not found, trying message fallback...');
      const messageButtonFallback = await findLinkedInButton(page, 'message', 8000); // Increased from 5s to 8s for stability
      
      if (messageButtonFallback && note) {
        console.log('🔄 Connect button not found, falling back to message...');
        const messageResult = await sendMessage(page, profileUrl, note);
        return {
          success: messageResult.success,
          message: messageResult.message,
          profileUrl: messageResult.profileUrl,
          actionTaken: 'messaged' as const
        };
      }
      
      if (messageButtonFallback && !note) {
        throw new Error('User is already connected but no message provided');
      }
      
      // Enhanced error with debugging info and recovery attempt
      const debugInfo = buttonAnalysis ? buttonAnalysis.suggestions.join(', ') : 'Analysis unavailable';
      
      // Final recovery attempt: try page reload and retry
      console.log('🔄 Attempting page reload as last resort...');
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Quick retry for connect button after reload
        console.log('🔍 Retrying Connect button detection after reload...');
        const retryConnectButton = await findLinkedInButton(page, 'connect', 10000);
        
        if (retryConnectButton) {
          console.log('✅ Found Connect button after page reload!');
          // Continue with the found button
          const connectButton = retryConnectButton.element;
          await connectButton.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Skip note addition on retry for simplicity
          console.log('🔍 Looking for Send button after reload...');
          const retrySendButton = await findLinkedInButton(page, 'send', 8000);
          
          if (retrySendButton) {
            await retrySendButton.element.click();
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log(`Invitation sent successfully after page reload to ${profileUrl}`);
            return {
              success: true,
              message: 'Invitation sent successfully after page reload recovery',
              profileUrl,
              actionTaken: 'invited'
            };
          }
        }
      } catch (recoveryError) {
        console.warn('⚠️ Page reload recovery failed:', recoveryError);
      }
      
      const errorMsg = `Neither Connect nor Message button found - profile may be private or restricted. 
        Button analysis: ${debugInfo}`;
      throw new Error(errorMsg);
    }

    console.log(`✅ Connect button found using ${connectButtonResult.strategy} (confidence: ${connectButtonResult.confidence})`);
    console.log(`   Selector: ${connectButtonResult.selector}`);
    const connectButton = connectButtonResult.element;
    
    // Click the connect button with error recovery
    console.log('Clicking Connect button...');
    if (!connectButton) {
      throw new Error('Connect button is null');
    }
    
    try {
      await connectButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (clickError) {
      console.warn('⚠️ Connect button click failed, attempting recovery:', clickError);
      
      // Recovery: Try to find and click the button again
      const retryConnectButton = await findLinkedInButton(page, 'connect', 5000);
      if (retryConnectButton) {
        console.log('🔄 Retrying Connect button click...');
        await retryConnectButton.element.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw new Error(`Connect button click failed and retry failed: ${clickError}`);
      }
    }

    // Add note if provided using progressive detection
    if (note) {
      try {
        console.log('🔍 Looking for Add Note button with progressive detection...');
        const noteButtonResult = await findLinkedInButton(page, 'note', 8000); // Increased from 5s to 8s for stability
        
        if (!noteButtonResult) {
          console.warn('Note button not found, sending invitation without note');
        } else {
          console.log(`✅ Note button found using ${noteButtonResult.strategy} (confidence: ${noteButtonResult.confidence})`);
          await noteButtonResult.element.click();
          await new Promise(resolve => setTimeout(resolve, 1500)); // Increased from 1s to 1.5s for stability
          
          // Enhanced textarea detection with multiple selectors
          const textareaSelectors = [
            'textarea[name="message"]',
            'textarea[placeholder*="Add a note"]',
            'textarea[aria-label*="Add a note"]',
            'textarea[data-control-name="add_note_text"]',
            '.send-invite__custom-message textarea',
            'div[contenteditable="true"]'
          ];
          
          let textarea = null;
          for (const selector of textareaSelectors) {
            try {
              textarea = await page.waitForSelector(selector, { timeout: 3000 }); // Increased from 2s to 3s for stability
              if (textarea) {
                console.log(`✅ Textarea found with selector: ${selector}`);
                break;
              }
            } catch (selectorError) {
              continue;
            }
          }
          
          if (!textarea) {
            throw new Error('Textarea not found with any selector');
          }
          
          await textarea.type(note, { delay: 50 });
          console.log('✅ Note added successfully');
        }
      } catch (noteError) {
        console.warn('Could not add note:', (noteError as Error).message);
      }
    }

    // Send invitation using progressive detection
    console.log('🔍 Looking for Send button with progressive detection...');
    const sendButtonResult = await findLinkedInButton(page, 'send', 10000); // Increased from 8s to 10s for stability
    
    if (!sendButtonResult) {
      // Enhanced error with debugging context
      console.log('🔍 Analyzing send button structure for debugging...');
      const sendButtonAnalysis = await analyzeLinkedInButtonStructure(page);
      const sendSuggestions = sendButtonAnalysis.suggestions.filter(s => s.toLowerCase().includes('send'));
      
      throw new Error(`Send button not found. Send button analysis: ${sendSuggestions.join(', ') || 'No send button suggestions available'}`);
    }
    
    console.log(`✅ Send button found using ${sendButtonResult.strategy} (confidence: ${sendButtonResult.confidence})`);
    console.log(`   Selector: ${sendButtonResult.selector}`);
    
    await sendButtonResult.element.click();
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // Increased from 2s to 3s for stability
    
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