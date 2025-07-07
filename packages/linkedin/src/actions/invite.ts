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
    const [connect] = await (page as any).$x(LINKEDIN_SELECTORS.CONNECT_BUTTON);
    if (!connect) {
      throw new Error('Connect button not found - user may already be connected or profile is private');
    }
    
    await connect.click();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for modal to appear

    if (note) {
      try {
        const noteBtn = await (page as any).waitForXPath(
          LINKEDIN_SELECTORS.NOTE_BUTTON,
          { timeout: 5000 }
        );
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
    const sendBtn = await (page as any).waitForXPath(
      LINKEDIN_SELECTORS.SEND_BUTTON,
      { timeout: 5000 }
    );
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