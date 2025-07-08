import { Browser, Page } from 'puppeteer';
import Puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { checkPageHealth, checkBrowserHealth, waitForPageHealth, cleanupUserDataDir, safeEvaluate, safeClearStorage, enforceRequestSpacing } from './utils/browserHealth';

// Network connectivity pre-check
async function checkNetworkConnectivity(): Promise<void> {
  try {
    const https = await import('https');
    const options = {
      hostname: 'www.linkedin.com',
      port: 443,
      path: '/',
      method: 'HEAD',
      timeout: 10000,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          console.log('✅ Network connectivity to LinkedIn confirmed');
          resolve();
        } else {
          reject(new Error(`LinkedIn returned status ${res.statusCode}`));
        }
      });

      req.on('error', (err) => {
        reject(new Error(`Network connectivity check failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Network connectivity check timed out'));
      });

      req.end();
    });
  } catch (error) {
    throw new Error(`Network pre-check failed: ${error}`);
  }
}

export async function initLinkedInContext(
  proxy?: string
): Promise<{ browser: Browser; page: Page; userDataDir: string }> {
  // Perform network connectivity check first
  try {
    await checkNetworkConnectivity();
  } catch (connectivityError) {
    console.error('❌ Network connectivity check failed:', connectivityError);
    throw new Error(`Network connectivity issue detected: ${connectivityError}`);
  }

  const pptr = addExtra(Puppeteer);
  pptr.use(StealthPlugin());

  const userDataDir = `/tmp/chrome-user-data-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Updated user agent rotation with current Chrome versions (Jan 2025)
  const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36', // Your exact user agent
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
  ];
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  console.log('Using user agent:', randomUserAgent);
  
  // ULTRA-MINIMAL Chrome configuration to prevent protocol errors
  const launchOptions: any = {
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    protocolTimeout: 300000, // 5 minutes timeout
    args: [
      // ABSOLUTE MINIMAL Chrome args to prevent protocol errors
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu',
      
      // User data (required)
      `--user-data-dir=${userDataDir}`,
      
      // Minimal anti-detection (no complex emulation)
      '--no-first-run',
      '--disable-default-apps',
      
      ...(proxy ? [`--proxy-server=${proxy}`] : [])
    ]
  };

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log('Launching Chrome browser with minimal configuration...');
    browser = await pptr.launch(launchOptions);
    console.log('✅ Browser launched successfully');
    
    // Check browser health before proceeding
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
    
    // Set random user agent for anti-detection with error handling
    try {
      await page.setUserAgent(randomUserAgent);
      console.log('✅ User agent configured successfully');
    } catch (userAgentError) {
      console.warn('⚠️ User agent configuration failed, using browser default:', (userAgentError as Error).message);
    }
    
    // Set conservative timeouts for container stability
    page.setDefaultNavigationTimeout(60000); // Increased back to 60s for stability
    page.setDefaultTimeout(60000);           // Increased back to 60s for stability
    
    // REMOVED: Viewport configuration completely to prevent Chrome session closure
    // Chrome will use default viewport settings
    console.log('✅ Using default Chrome viewport (no custom configuration)');
    
    // Clear cache and storage before navigation to prevent redirect loops
    // Use data URL instead of about:blank for better security context
    try {
      await page.goto('data:text/html,<html><head><title>Initializing</title></head><body></body></html>', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    } catch (initError) {
      console.warn('Initial navigation failed, continuing without pre-navigation:', (initError as Error).message);
    }

    // Clear storage safely
    try {
      await safeClearStorage(page);
    } catch (storageError) {
      console.warn('Unexpected error during storage clearing:', (storageError as Error).message);
    }

    // Set extra HTTP headers with error handling
    try {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'no-cache',
        'DNT': '1'
      });
      console.log('✅ HTTP headers configured successfully');
    } catch (headersError) {
      console.warn('⚠️ HTTP headers configuration failed, using browser defaults:', (headersError as Error).message);
    }
    
    // REMOVED: Complex anti-detection script that causes Chrome session closure
    // Relying on puppeteer-extra-plugin-stealth for basic anti-detection
    console.log('✅ Using basic stealth plugin protection (complex script removed to prevent Chrome crashes)');
    
    // Parse and validate cookies
    let cookies;
    try {
      cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON!);
    } catch (parseError) {
      throw new Error(`Invalid LINKEDIN_COOKIES_JSON format: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
    
    if (!Array.isArray(cookies)) {
      throw new Error('LINKEDIN_COOKIES_JSON must be an array of cookie objects');
    }
    
    console.log(`Setting ${cookies.length} cookies...`);
    
    // Validate essential cookies with expiration check
    const essentialCookies = ['li_at', 'JSESSIONID'];
    const currentTime = Date.now() / 1000;
    
    for (const cookieName of essentialCookies) {
      const cookie = cookies.find((c: any) => c.name === cookieName);
      if (!cookie) {
        throw new Error(`Missing essential cookie: ${cookieName}`);
      }
      
      // Check if essential cookie is expired
      if (cookie.expires && cookie.expires < currentTime) {
        throw new Error(`Essential cookie ${cookieName} has expired (expires: ${new Date(cookie.expires * 1000).toISOString()})`);
      }
    }
    
    // Set cookies one by one to handle errors
    let successCount = 0;
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
        successCount++;
      } catch (cookieError) {
        console.warn(`Failed to set cookie ${cookie.name}:`, (cookieError as Error).message);
      }
    }
    
    console.log(`✅ Successfully set ${successCount}/${cookies.length} cookies`);
    
    if (successCount === 0) {
      throw new Error('Failed to set any cookies - authentication will not work');
    }
    
    return { browser, page, userDataDir };
    
  } catch (error) {
    console.error('Failed to launch browser:', error);
    
    // Enhanced cleanup with error handling
    if (page) {
      try {
        await page.close();
      } catch (pageCloseError) {
        console.warn('Failed to close page safely:', (pageCloseError as Error).message);
      }
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (browserCloseError) {
        console.warn('Failed to close browser safely:', (browserCloseError as Error).message);
      }
    }
    
    // Clean up user data directory
    await cleanupUserDataDir(userDataDir);
    
    throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}