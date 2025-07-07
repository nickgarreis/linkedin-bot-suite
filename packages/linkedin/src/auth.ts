import { Browser, Page } from 'puppeteer';
import Puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';

export async function initLinkedInContext(
  proxy?: string
): Promise<{ browser: Browser; page: Page }> {
  const pptr = addExtra(Puppeteer);
  pptr.use(StealthPlugin());

  const userDataDir = `/tmp/chrome-user-data-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const launchOptions: any = {
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1920,1080',
      '--start-maximized',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-first-run',
      '--no-default-browser-check',
      // Memory optimization
      '--max_old_space_size=512',
      '--memory-pressure-off',
      '--disable-features=VizDisplayCompositor',
      '--data-path=/tmp/chrome-data',
      '--homedir=/tmp',
      '--disable-crash-reporter',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
      ...(proxy ? [`--proxy-server=${proxy}`] : [])
    ]
  };

  try {
    console.log('Launching Chrome browser...');
    const browser = await pptr.launch(launchOptions);
    console.log('Browser launched successfully');
    
    const page = await browser.newPage();
    console.log('Page created successfully');
  
  // Set user agent to look more like a real browser
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  // Set cookies from environment
  const cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON!);
  await page.setCookie(...cookies);

  // Navigate to LinkedIn and verify login with redirect handling
  try {
    console.log('Navigating to LinkedIn feed...');
    await page.goto('https://www.linkedin.com/feed', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
  } catch (error) {
    // Try going to the home page instead
    console.log('Feed redirect failed, trying home page...');
    await page.goto('https://www.linkedin.com/', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
  }

  // Wait a bit for any redirects to settle
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check current URL to see if we were redirected to login
  const currentUrl = page.url();
  console.log('Current URL after navigation:', currentUrl);

  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    throw new Error('LinkedIn authentication failed - redirected to login page. Cookies may be invalid or expired.');
  }

  // Alternative login check - look for navigation elements
  const loggedIn = await page.evaluate(() => {
    return !!(
      document.querySelector('nav.global-nav') || 
      document.querySelector('[data-test-global-nav]') ||
      document.querySelector('.feed-identity-module') ||
      document.querySelector('.global-nav__me')
    );
  });

  if (!loggedIn) {
    throw new Error('LinkedIn authentication failed - unable to verify login status');
  }

  console.log('Successfully authenticated with LinkedIn');

    return { browser, page };
  } catch (error) {
    console.error('Failed to launch browser:', error);
    throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}