import { Browser, BrowserContext } from 'puppeteer';
import Puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';

export async function initLinkedInContext(
  proxy?: string
): Promise<{ browser: Browser; context: BrowserContext }> {
  const pptr = addExtra(Puppeteer);
  pptr.use(StealthPlugin());

  const launchOptions: any = {
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images',
      '--disable-javascript',
      '--disable-css',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--single-process',
      '--user-data-dir=/tmp/chrome-user-data',
      '--data-path=/tmp/chrome-data',
      '--homedir=/tmp',
      '--disable-crash-reporter',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
      ...(proxy ? [`--proxy-server=${proxy}`] : [])
    ]
  };

  const browser = await pptr.launch(launchOptions);
  const context =
    (browser as any).createBrowserContext?.() ||
    (browser as any).createIncognitoBrowserContext?.();

  const page = await context.newPage();
  
  // Set user agent to look more like a real browser
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  // Set cookies from environment
  const cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON!);
  await page.setCookie(...cookies);

  // Navigate to LinkedIn and verify login
  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'networkidle0' });
  
  // Check if user is logged in
  const loggedIn = (await page.$(LINKEDIN_SELECTORS.PROFILE_PHOTO)) !== null;
  if (!loggedIn) {
    throw new Error('LinkedIn authentication failed - cookies may be invalid or expired');
  }

  return { browser, context };
}