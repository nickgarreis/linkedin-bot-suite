import { Browser, BrowserContext, chromium } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { addExtra } from 'puppeteer-extra';

/**
 * Erstellt einen eingeloggten LinkedIn-Browser-Context.
 */
export async function initLinkedInContext(
  cookiesPath: string,
  proxy?: string
): Promise<{ browser: Browser; context: BrowserContext }> {
  const puppeteer = addExtra(chromium);
  puppeteer.use(StealthPlugin());

  const launch: any = { headless: false };
  if (proxy) launch.proxy = { server: proxy };

  const browser = await puppeteer.launch(launch);
  const context = await browser.newContext();

  // Cookies importieren
  const { readFile } = await import('fs/promises');
  const cookiesJSON = await readFile(cookiesPath, 'utf-8');
  await context.addCookies(JSON.parse(cookiesJSON));

  // Login prüfen
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'networkidle' });
  const loggedIn = (await page.$('img.global-nav__me-photo')) !== null;
  if (!loggedIn) throw new Error('LinkedIn-Cookie ungültig oder abgelaufen');

  return { browser, context };
}
