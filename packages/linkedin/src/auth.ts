import { Browser, Page } from 'puppeteer';
import Puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { checkPageHealth, checkBrowserHealth, waitForPageHealth, cleanupUserDataDir } from './utils/browserHealth';

export async function initLinkedInContext(
  proxy?: string
): Promise<{ browser: Browser; page: Page; userDataDir: string }> {
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
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--data-path=/tmp/chrome-data',
      '--homedir=/tmp',
      '--disable-crash-reporter',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
      // Additional stability flags
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-plugins',
      '--js-flags=--max-old-space-size=512',
      ...(proxy ? [`--proxy-server=${proxy}`] : [])
    ]
  };

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log('Launching Chrome browser...');
    browser = await pptr.launch(launchOptions);
    console.log('Browser launched successfully');
    
    // Initial browser health check
    const browserHealthy = await checkBrowserHealth(browser);
    if (!browserHealthy) {
      throw new Error('Browser failed initial health check');
    }
    
    // Get existing pages and close extras
    const pages = await browser.pages();
    for (let i = 1; i < pages.length; i++) {
      await pages[i].close();
    }
    
    page = pages[0] || await browser.newPage();
    console.log('Page created successfully');
    
    // Set default timeouts
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent BEFORE navigating - updated to latest Chrome
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set additional headers to appear more legitimate
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Parse and set cookies
    const cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON!);
    console.log(`Setting ${cookies.length} cookies...`);
    
    // Validate essential cookies
    const essentialCookies = ['li_at', 'JSESSIONID'];
    for (const cookieName of essentialCookies) {
      if (!cookies.find((c: any) => c.name === cookieName)) {
        throw new Error(`Missing essential cookie: ${cookieName}`);
      }
    }
    
    // Set cookies one by one to handle errors
    for (const cookie of cookies) {
      try {
        // Remove expired cookies
        if (cookie.expires && cookie.expires < Date.now() / 1000) {
          delete cookie.expires;
        }
        await page.setCookie(cookie);
      } catch (err) {
        console.error(`Failed to set cookie ${cookie.name}:`, err);
      }
    }

  // Staged navigation flow - first go to main page to establish session
  let currentUrl = '';
  let redirectCount = 0;
  const maxRedirects = 5;
  
  try {
    console.log('Stage 1: Navigating to LinkedIn main page to establish session...');
    await page.goto('https://www.linkedin.com/', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Wait for session to establish
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    currentUrl = page.url();
    console.log('Stage 1 complete. Current URL:', currentUrl);
    
    // Check for immediate redirect to login
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      throw new Error('LinkedIn authentication failed - redirected to login page immediately. Cookies may be invalid or expired.');
    }
    
    // Stage 2: Navigate to feed
    console.log('Stage 2: Navigating to LinkedIn feed...');
    
    // Listen for navigation events to detect redirect loops
    page.on('response', (response) => {
      if (response.status() >= 300 && response.status() < 400) {
        redirectCount++;
        console.log(`Redirect ${redirectCount}: ${response.status()} to ${response.headers().location}`);
        
        if (redirectCount >= maxRedirects) {
          throw new Error(`Too many redirects detected (${redirectCount}). Possible redirect loop.`);
        }
      }
    });
    
    await page.goto('https://www.linkedin.com/feed', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Wait for any final redirects to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Add health check after navigation
    const navigationHealth = await checkPageHealth(page);
    if (!navigationHealth.isHealthy) {
      throw new Error(`Page health check failed after navigation: ${navigationHealth.error}`);
    }
    
  } catch (error) {
    currentUrl = page.url();
    console.log('Navigation error. Current URL:', currentUrl);
    
    // Take screenshot for debugging
    try {
      const screenshotPath = `/tmp/linkedin-auth-error-${Date.now()}.png` as const;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved to: ${screenshotPath}`);
    } catch (screenshotError) {
      console.error('Failed to take screenshot:', screenshotError);
    }
    
    // Enhanced error analysis
    const errorAnalysis = await page.evaluate(() => {
      return {
        title: document.title,
        hasLoginForm: !!document.querySelector('form[action*="login"]'),
        hasAuthWall: !!document.querySelector('.authwall'),
        hasChallenge: !!document.querySelector('.challenge'),
        hasError: !!document.querySelector('.error-message'),
        bodyClasses: document.body.className,
        currentPath: window.location.pathname,
        hasRedirectMeta: !!document.querySelector('meta[http-equiv="refresh"]'),
        pageText: document.body.innerText.substring(0, 500)
      };
    });
    
    console.log('Error analysis:', errorAnalysis);
    
    // Check if we ended up on login page
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall') || errorAnalysis.hasLoginForm || errorAnalysis.hasAuthWall) {
      throw new Error(`LinkedIn authentication failed - redirected to login page. Cookies may be invalid or expired. Page analysis: ${JSON.stringify(errorAnalysis)}`);
    }
    
    // If it's a redirect loop error, provide specific message
    if (error instanceof Error && error.message.includes('Too many redirects')) {
      throw new Error(`LinkedIn authentication failed - redirect loop detected. This usually indicates cookie issues. Page analysis: ${JSON.stringify(errorAnalysis)}`);
    }
    
    // Check for security challenges or verification
    if (errorAnalysis.hasChallenge || currentUrl.includes('/challenge')) {
      throw new Error(`LinkedIn security challenge detected. Manual verification may be required. Page analysis: ${JSON.stringify(errorAnalysis)}`);
    }
    
    // For other navigation errors, try emergency fallback
    console.log('Primary navigation failed, attempting emergency fallback...');
    try {
      await page.goto('https://www.linkedin.com/feed/?doFeedRefresh=true', { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (fallbackError) {
      // Take final screenshot before failing
      try {
        const finalScreenshotPath = `/tmp/linkedin-final-error-${Date.now()}.png` as const;
        await page.screenshot({ path: finalScreenshotPath, fullPage: true });
        console.log(`Final screenshot saved to: ${finalScreenshotPath}`);
      } catch (finalScreenshotError) {
        console.error('Failed to take final screenshot:', finalScreenshotError);
      }
      
      throw new Error(`Navigation failed completely. Original error: ${error instanceof Error ? error.message : 'Unknown error'}. Fallback error: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error'}. Page analysis: ${JSON.stringify(errorAnalysis)}`);
    }
  }

  // Final URL check
  currentUrl = page.url();
  console.log('Final URL after navigation:', currentUrl);

  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    throw new Error('LinkedIn authentication failed - redirected to login page. Cookies may be invalid or expired.');
  }

  // Enhanced login verification with multiple checkpoints
  const loginCheckpoints = await page.evaluate(() => {
    const checkpoints = {
      globalNav: !!document.querySelector('nav.global-nav'),
      testGlobalNav: !!document.querySelector('[data-test-global-nav]'),
      feedIdentity: !!document.querySelector('.feed-identity-module'),
      globalNavMe: !!document.querySelector('.global-nav__me'),
      profileNav: !!document.querySelector('.global-nav__me-content'),
      feedContainer: !!document.querySelector('.feed-container-theme'),
      hasLinkedInClass: document.body.classList.contains('linkedin')
    };
    
    console.log('Login checkpoints:', checkpoints);
    return checkpoints;
  });

  const loggedIn = Object.values(loginCheckpoints).some(checkpoint => checkpoint);
  
  if (!loggedIn) {
    console.log('Login verification failed. Checkpoints:', loginCheckpoints);
    
    // Take screenshot for debugging login verification failure
    try {
      const verificationScreenshotPath = `/tmp/linkedin-verification-failed-${Date.now()}.png` as const;
      await page.screenshot({ path: verificationScreenshotPath, fullPage: true });
      console.log(`Verification failure screenshot saved to: ${verificationScreenshotPath}`);
    } catch (screenshotError) {
      console.error('Failed to take verification screenshot:', screenshotError);
    }
    
    // Additional page analysis for verification failure
    const verificationAnalysis = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasLinkedInBranding: !!document.querySelector('.linkedin-logo'),
        hasHeader: !!document.querySelector('header'),
        hasMain: !!document.querySelector('main'),
        bodyClasses: document.body.className,
        pageText: document.body.innerText.substring(0, 300)
      };
    });
    
    console.log('Verification analysis:', verificationAnalysis);
    
    throw new Error(`LinkedIn authentication failed - unable to verify login status. No recognizable LinkedIn UI elements found. Checkpoints: ${JSON.stringify(loginCheckpoints)}. Page analysis: ${JSON.stringify(verificationAnalysis)}`);
  }

  console.log('Successfully authenticated with LinkedIn. Checkpoints passed:', 
    Object.entries(loginCheckpoints).filter(([_, passed]) => passed).map(([name]) => name).join(', '));

    // Final health check before returning
    const finalHealth = await checkPageHealth(page);
    if (!finalHealth.isHealthy) {
      throw new Error(`Final health check failed: ${finalHealth.error}`);
    }

    // Add browser disconnect handler
    browser.on('disconnected', () => {
      console.log('Browser disconnected, cleaning up user data directory');
      cleanupUserDataDir(userDataDir);
    });

    return { browser, page, userDataDir };
  } catch (error) {
    console.error('Failed to launch browser:', error);
    
    // Clean up resources on error
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (e) {
        console.error('Failed to close page:', e);
      }
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Failed to close browser:', e);
      }
    }
    
    // Clean up user data directory
    cleanupUserDataDir(userDataDir);
    
    throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}