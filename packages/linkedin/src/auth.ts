import { Browser, Page } from 'puppeteer';
import Puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { checkPageHealth, checkBrowserHealth, waitForPageHealth, cleanupUserDataDir, safeEvaluate, safeClearStorage } from './utils/browserHealth';

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
      // Storage and security fixes for localStorage access
      '--allow-file-access-from-files',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--disable-background-mode',
      '--allow-running-insecure-content',
      // Additional stability flags for containers
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-plugins',
      '--js-flags=--max-old-space-size=512',
      // Memory and resource management
      '--max_old_space_size=512',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--disable-translate',
      '--disable-logging',
      '--disable-notifications',
      '--disable-desktop-notifications',
      // Container-specific stability
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--shm-size=1gb',
      '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess',
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
    
    // Set default timeouts - extended for stability
    page.setDefaultNavigationTimeout(60000); // 60s navigation timeout
    page.setDefaultTimeout(45000);           // 45s operations timeout
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Clear cache and storage before navigation to prevent redirect loops
    // Use data URL instead of about:blank for better security context
    await page.goto('data:text/html,<html><head><title>Initializing</title></head><body></body></html>');
    
    // Use safe storage clearing to handle SecurityError gracefully
    await safeClearStorage(page);
    
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

  // Robust navigation with retry targets
  const targets = [
    'https://www.linkedin.com/feed/',
    'https://www.linkedin.com/'
  ];

  let navOK = false;
  let currentUrl = '';
  
  for (const target of targets) {
    try {
      console.log(`Navigating to ${target}`);
      const resp = await page.goto(target, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      
      await new Promise(resolve => setTimeout(resolve, 2500)); // Let redirects finish
      currentUrl = page.url();
      console.log(`Landed on ${currentUrl}`);

      if (!currentUrl.includes('/login') &&
          !currentUrl.includes('/authwall') &&
          !currentUrl.includes('/checkpoint') &&
          currentUrl !== 'about:blank') {
        navOK = true;
        
        // Try to click GDPR/cookie banner if present
        try {
          // Use proper XPath method and add CSS fallback
          let acceptButtons: any[] = [];
          
          try {
            // Try XPath first
            acceptButtons = await (page as any).$x("//button[contains(.,'Akzeptieren') or contains(.,'Accept all') or contains(.,'Alle akzeptieren')]");
          } catch (xpathError) {
            console.log('XPath selector failed, trying CSS selectors:', (xpathError as Error).message);
            // Fallback to CSS selectors for common cookie banner buttons
            const cssSelectors = [
              'button[data-test-id*="accept"]',
              'button[aria-label*="Accept"]',
              'button[id*="accept"]',
              'button[class*="accept"]',
              '[data-test="accept-all-cookies"]',
              '.artdeco-global-alert button'
            ];
            
            for (const selector of cssSelectors) {
              try {
                const element = await page.$(selector);
                if (element) {
                  const text = await element.evaluate(el => el.textContent?.toLowerCase() || '');
                  if (text.includes('accept') || text.includes('akzeptieren')) {
                    acceptButtons = [element];
                    break;
                  }
                }
              } catch (cssError) {
                // Continue to next selector
                continue;
              }
            }
          }
          
          if (acceptButtons.length > 0) {
            console.log('Cookie banner detected – clicking accept button');
            await acceptButtons[0].click();
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (bannerError) {
          // Ignore banner click errors
          console.log('Cookie banner click failed, continuing:', (bannerError as Error).message);
        }
        
        break;
      }
    } catch (navError) {
      console.warn(`Navigation to ${target} failed:`, (navError as Error).message);
    }
  }
  
  if (!navOK) {
    throw new Error('LinkedIn authentication failed – redirected to login/authwall on all targets');
  }
  
  // Add health check after successful navigation
  const navigationHealth = await checkPageHealth(page);
  if (!navigationHealth.isHealthy) {
    throw new Error(`Page health check failed after navigation: ${navigationHealth.error}`);
  }

  // Final URL check
  currentUrl = page.url();
  console.log('Final URL after navigation:', currentUrl);

  // Accept /hp as valid authenticated state, but prefer /feed
  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    throw new Error('LinkedIn authentication failed - redirected to login page. Cookies may be invalid or expired.');
  }

  // Enhanced login verification with multiple checkpoints including /hp page using safe evaluation
  const loginCheckpoints = await safeEvaluate(page, () => {
    const checkpoints = {
      globalNav: !!document.querySelector('nav.global-nav'),
      testGlobalNav: !!document.querySelector('[data-test-global-nav]'),
      feedIdentity: !!document.querySelector('.feed-identity-module'),
      globalNavMe: !!document.querySelector('.global-nav__me'),
      profileNav: !!document.querySelector('.global-nav__me-content'),
      feedContainer: !!document.querySelector('.feed-container-theme'),
      hasLinkedInClass: document.body?.classList.contains('linkedin') || false,
      // Additional checks for /hp homepage
      isHomepage: window.location.pathname === '/hp',
      hasLinkedInLogo: !!document.querySelector('.linkedin-logo'),
      hasMainContent: !!document.querySelector('main'),
      noLoginForm: !document.querySelector('form[action*="login"]'),
      noAuthWall: !document.querySelector('.authwall')
    };
    
    console.log('Login checkpoints:', checkpoints);
    return checkpoints;
  }) || {};

  const loggedIn = Object.values(loginCheckpoints).some(checkpoint => checkpoint);
  
  if (!loggedIn) {
    console.log('Login verification failed. Checkpoints:', loginCheckpoints);
    
    // Skip verification screenshot to prevent crashes
    console.log('Login verification failed, skipping screenshot to prevent session close');
    
    // Additional page analysis for verification failure using safe evaluation
    const verificationAnalysis = await safeEvaluate(page, () => {
      return {
        title: document.title,
        url: window.location.href,
        hasLinkedInBranding: !!document.querySelector('.linkedin-logo'),
        hasHeader: !!document.querySelector('header'),
        hasMain: !!document.querySelector('main'),
        bodyClasses: document.body?.className || '',
        pageText: document.body?.innerText?.substring(0, 300) || ''
      };
    }) || {};
    
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
    
    // Clean up resources on error with connection safety
    if (page) {
      try {
        if (!page.isClosed() && page.browser().isConnected()) {
          await page.close();
        }
      } catch (e) {
        console.error('Failed to close page safely:', e);
      }
    }
    
    if (browser) {
      try {
        if (browser.isConnected()) {
          await Promise.race([
            browser.close(),
            new Promise(resolve => setTimeout(resolve, 3000)) // 3s timeout
          ]);
        }
      } catch (e) {
        console.error('Failed to close browser safely:', e);
        // Force kill if graceful close fails
        try {
          const process = browser.process();
          if (process) {
            process.kill('SIGKILL');
          }
        } catch (killError) {
          console.error('Failed to force kill browser:', killError);
        }
      }
    }
    
    // Clean up user data directory
    cleanupUserDataDir(userDataDir);
    
    throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}