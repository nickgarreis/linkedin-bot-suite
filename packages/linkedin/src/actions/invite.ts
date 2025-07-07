import { Page } from 'puppeteer';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';

export async function sendInvitation(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<{ success: boolean; message: string; profileUrl: string }> {
  await page.goto(profileUrl, { waitUntil: 'networkidle0' });

  try {
    // Wait for page to load and find connect button
    let connect;
    try {
      // Try XPath first with proper type assertion
      const connectButtons = await (page as any).$x(LINKEDIN_SELECTORS.CONNECT_BUTTON);
      connect = connectButtons[0];
    } catch (xpathError) {
      console.log('XPath selector failed for connect button, trying CSS selectors:', (xpathError as Error).message);
      // Fallback to CSS selectors
      const cssSelectors = [
        'button[aria-label*="Connect"]',
        'button[aria-label*="Vernetzen"]',
        'button[data-control-name="connect"]',
        'button:has-text("Connect")',
        'button:has-text("Vernetzen")'
      ];
      
      for (const selector of cssSelectors) {
        try {
          connect = await page.$(selector);
          if (connect) {
            const text = await connect.evaluate(el => el.textContent?.toLowerCase() || '');
            if (text.includes('connect') || text.includes('vernetzen')) {
              break;
            }
          }
        } catch (cssError) {
          continue;
        }
      }
    }
    
    if (!connect) {
      throw new Error('Connect button not found - user may already be connected or profile is private');
    }
    
    await connect.click();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for modal to appear

    if (note) {
      try {
        let noteBtn;
        try {
          // Try XPath first with proper type assertion
          noteBtn = await (page as any).waitForXPath(
            LINKEDIN_SELECTORS.NOTE_BUTTON,
            { timeout: 5000 }
          );
        } catch (xpathError) {
          console.log('XPath selector failed for note button, trying CSS selectors:', (xpathError as Error).message);
          // Fallback to CSS selectors
          const cssSelectors = [
            'button[aria-label*="Add a note"]',
            'button[aria-label*="Notiz"]',
            'button:has-text("Add a note")',
            'button:has-text("Notiz")'
          ];
          
          for (const selector of cssSelectors) {
            try {
              noteBtn = await page.waitForSelector(selector, { timeout: 2000 });
              if (noteBtn) break;
            } catch (cssError) {
              continue;
            }
          }
        }
        
        if (noteBtn) {
          await noteBtn.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Clear existing text and type new note
          await page.type('textarea[name="message"]', note);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.warn('Note button not found, sending invitation without note');
      }
    }

    // Find and click send button
    let sendBtn;
    try {
      // Try XPath first with proper type assertion
      sendBtn = await (page as any).waitForXPath(
        LINKEDIN_SELECTORS.SEND_BUTTON,
        { timeout: 5000 }
      );
    } catch (xpathError) {
      console.log('XPath selector failed for send button, trying CSS selectors:', (xpathError as Error).message);
      // Fallback to CSS selectors
      const cssSelectors = [
        'button[aria-label*="Send invite"]',
        'button[aria-label*="Einladung senden"]',
        'button[data-control-name="send.invite"]',
        'button:has-text("Send invite")',
        'button:has-text("Einladung senden")'
      ];
      
      for (const selector of cssSelectors) {
        try {
          sendBtn = await page.waitForSelector(selector, { timeout: 2000 });
          if (sendBtn) {
            const text = await sendBtn.evaluate(el => el.textContent?.toLowerCase() || '');
            if (text.includes('send') || text.includes('senden')) {
              break;
            }
          }
        } catch (cssError) {
          continue;
        }
      }
    }
    
    if (!sendBtn) {
      throw new Error('Send button not found');
    }
    
    await sendBtn.click();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for invitation to be sent

    return {
      success: true,
      message: 'Invitation sent successfully',
      profileUrl,
    };
  } catch (error) {
    throw new Error(`Failed to send invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}