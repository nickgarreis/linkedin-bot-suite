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

  // Enhanced session variation with more randomness
  const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 12)}-${Math.floor(Math.random() * 10000)}`;
  const userDataDir = `/tmp/chrome-user-data-${sessionId}`;
  
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
  
  // Progressive fallback launch configurations
  const launchConfigs = [
    {
      name: 'conservative',
      headless: 'new' as any,
      protocolTimeout: 180000, // 3 minutes
      args: [
        // Essential container security
        '--no-sandbox',
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-gpu-sandbox',
        
        // User data (required)
        `--user-data-dir=${userDataDir}`,
        
        // Memory optimization
        '--memory-pressure-off',
        
        // Network configuration for containers
        '--disable-features=NetworkService',
        '--enable-features=NetworkServiceInProcess', 
        '--ignore-certificate-errors-spki-list',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors',
        '--disable-site-isolation-trials',
        '--disable-features=BlockInsecurePrivateNetworkRequests',
        '--aggressive-cache-discard',
        '--disable-background-networking',
        
        // Fixed window size (no randomization for stability)
        '--window-size=1920,1080',
        '--start-maximized',
        
        // Bot detection evasion
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        
        // Performance optimization
        '--disable-features=VizDisplayCompositor,TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-extensions',
        '--disable-plugins',
        
        ...(proxy ? [`--proxy-server=${proxy}`] : [])
      ]
    },
    {
      name: 'ultra-conservative',
      headless: 'new' as any,
      protocolTimeout: 300000, // 5 minutes
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--user-data-dir=${userDataDir}`,
        '--disable-features=VizDisplayCompositor',
        '--memory-pressure-off',
        '--disable-background-networking',
        '--window-size=1920,1080',
        ...(proxy ? [`--proxy-server=${proxy}`] : [])
      ]
    },
    {
      name: 'minimal',
      headless: true, // Old headless mode
      protocolTimeout: 600000, // 10 minutes
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--user-data-dir=${userDataDir}`,
        ...(proxy ? [`--proxy-server=${proxy}`] : [])
      ]
    }
  ];
  
  console.log('🎲 Using progressive fallback Chrome launch strategy');

  let browser: Browser | null = null;
  let page: Page | null = null;

  // Verify Chrome binary exists and is executable
  try {
    const fs = await import('fs');
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Chrome binary not found at ${executablePath}`);
    }
    console.log(`✅ Chrome binary verified at ${executablePath}`);
  } catch (binaryError) {
    throw new Error(`Chrome binary verification failed: ${binaryError}`);
  }

  // Progressive fallback launch strategy
  for (let attempt = 0; attempt < launchConfigs.length; attempt++) {
    const config = launchConfigs[attempt];
    const launchOptions = {
      headless: config.headless,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      protocolTimeout: config.protocolTimeout,
      args: config.args
    };
    
    try {
      console.log(`Attempt ${attempt + 1}: Launching Chrome with ${config.name} configuration...`);
      console.log(`Protocol timeout: ${config.protocolTimeout}ms, Args: ${config.args.length}`);
      
      browser = await pptr.launch(launchOptions);
      console.log(`✅ Browser launched successfully with ${config.name} configuration`);
      
      // Verify browser process is healthy
      const browserProcess = browser.process();
      if (browserProcess) {
        console.log(`✅ Browser process PID: ${browserProcess.pid}`);
      }
      
      break; // Success - exit loop
      
    } catch (launchError) {
      console.error(`❌ Launch attempt ${attempt + 1} (${config.name}) failed:`, launchError instanceof Error ? launchError.message : launchError);
      
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.warn('Failed to close browser after launch failure:', closeError);
        }
        browser = null;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === launchConfigs.length - 1) {
        throw launchError;
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!browser) {
    throw new Error('All Chrome launch attempts failed');
  }
    
  try {
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
    
    // Set aggressive timeouts for fast execution
    page.setDefaultNavigationTimeout(20000); // Reduced from 25s to 20s for speed
    page.setDefaultTimeout(20000);           // Reduced from 25s to 20s for speed
    
    // REMOVED: Viewport configuration completely to prevent Chrome session closure
    // Chrome will use default viewport settings
    console.log('✅ Using default Chrome viewport (no custom configuration)');
    
    // Clear cache and storage before navigation to prevent redirect loops
    // Use data URL instead of about:blank for better security context
    try {
      await page.goto('data:text/html,<html><head><title>Initializing</title></head><body></body></html>', {
        waitUntil: 'domcontentloaded',
        timeout: 15000 // Reduced from 30s to 15s
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