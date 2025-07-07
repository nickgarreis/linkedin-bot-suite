import { Browser, BrowserContext } from 'puppeteer';
import puppeteerCore from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';

export async function initLinkedInContext(
  cookiesPath: string,
  proxy?: string
): Promise<{ browser: Browser; context: BrowserContext }> {
  const puppeteer = addExtra(puppeteerCore);
  puppeteer.use(StealthPlugin());

  const launch: any = { headless: false };
  if (proxy) launch.args = [`--proxy-server=${proxy}`];

  const browser = await puppeteer.launch(launch);
  const context =
    (await (browser as any).createBrowserContext?.()) ||
    (await (browser as any).createIncognitoBrowserContext?.());

  const page = await context.newPage();

  // Cookies laden
  const cookiesJSON = await fs.readFile(cookiesPath, 'utf-8');
  const cookies = JSON.parse(cookiesJSON);
  await page.setCookie(...cookies);

  // Login-Prüfung
  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'networkidle0' });
  const loggedIn = (await page.$('img.global-nav__me-photo')) !== null;
  if (!loggedIn) throw new Error('LinkedIn-Cookie ungültig oder abgelaufen');

  return { browser, context };
}
