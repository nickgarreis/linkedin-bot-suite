import { Page } from 'playwright';
import { log } from '../bot-core/src/index';

/**
 * Sendet auf einer Profil-URL eine LinkedIn-Einladung.
 * @param page Geöffnete Playwright-Seite (eingeloggt!)
 * @param profileUrl Vollständige LinkedIn-Profil-URL
 * @param note Optionaler Einladungstext (≤ 300 Zeichen)
 */
export async function sendInvitation(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<void> {
  await page.goto(profileUrl, { waitUntil: 'networkidle' });

  const connectBtn = await page.$('button:has-text("Vernetzen")');
  if (!connectBtn) throw new Error('Vernetzen-Button nicht gefunden');

  await connectBtn.click();

  if (note) {
    const noteBtn = await page.waitForSelector('button:has-text("Notiz")');
    await noteBtn.click();
    await page.fill('textarea[name="message"]', note);
  }

  const sendBtn = await page.waitForSelector('button:has-text("Einladung senden")');
  await sendBtn.click();

  log.info({ profileUrl }, '✅ Einladung gesendet');
}
