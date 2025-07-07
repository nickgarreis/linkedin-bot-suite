import { Browser, BrowserContext } from 'puppeteer';
import Puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

export async function initLinkedInContext(
  proxy?: string
): Promise<{ browser: Browser; context: BrowserContext }> {
  const pptr = addExtra(Puppeteer);
  pptr.use(StealthPlugin());

  const launchOptions: any = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      ...(proxy ? [`--proxy-server=${proxy}`] : [])
    ]
  };

  const browser = await pptr.launch(launchOptions);
  const context =
    (browser as any).createBrowserContext?.() ||
    (browser as any).createIncognitoBrowserContext?.();

  const page = await context.newPage();
  const cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON!);
  await page.setCookie(...cookies);

  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'networkidle0' });
  const loggedIn = (await page.$('img.global-nav__me-photo')) !== null;
  if (!loggedIn) throw new Error('LinkedIn-Cookie ungültig oder abgelaufen');

  return { browser, context };
}
