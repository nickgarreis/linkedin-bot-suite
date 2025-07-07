import { Page } from 'puppeteer';

export async function sendInvitation(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<void> {
  await page.goto(profileUrl, { waitUntil: 'networkidle0' });

  const [connect] = await (page as any).$x(
    '//button[normalize-space(text())="Vernetzen" or normalize-space(text())="Connect"]'
  );
  if (!connect) throw new Error('Connect button not found');
  await connect.click();

  if (note) {
    const noteBtn = await (page as any).waitForXPath(
      '//button[contains(text(),"Notiz") or contains(text(),"Add a note")]',
      { timeout: 5000 }
    );
    if (!noteBtn) throw new Error('Note button not found');
    await noteBtn!.click();
    await page.type('textarea[name="message"]', note);
  }

  const sendBtn = await (page as any).waitForXPath(
    '//button[contains(text(),"Einladung senden") or contains(text(),"Send invite")]',
    { timeout: 5000 }
  );
  if (!sendBtn) throw new Error('Send button not found');
  await sendBtn!.click();
}
