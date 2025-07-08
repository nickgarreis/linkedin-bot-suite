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
  
  const launchOptions: any = {
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    // Critical: Disable CDP features that cause Target.setAutoAttach errors
    protocolTimeout: 180000, // 3 minutes timeout for protocol operations
    args: [
      // Essential container stability (minimal set to avoid Target protocol issues)
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-gpu-sandbox',
      
      // Critical: Remove single-process and zygote flags that cause Target errors
      // REMOVED: '--single-process', 
      // REMOVED: '--no-zygote',
      
      // Essential user data management
      `--user-data-dir=${userDataDir}`,
      '--profile-directory=Default',
      
      // Basic display (minimal to avoid conflicts)
      '--window-size=1366,768',
      '--virtual-time-budget=5000',
      
      // Critical: Disable features that interfere with CDP stability
      '--disable-features=VizDisplayCompositor,TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
      
      // Memory optimization (essential for containers)
      '--memory-pressure-off',
      '--max_old_space_size=512',
      
      // Minimal automation detection removal
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-prompt-on-repost',
      '--disable-component-update',
      
      // Network stability
      '--aggressive-cache-discard',
      '--disable-background-networking',
      
      ...(proxy ? [`--proxy-server=${proxy}`] : [])
    ]
  };

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Browser launch with enhanced retry logic and fallback strategies
    console.log('Launching Chrome browser...');
    let browserLaunched = false;
    let lastLaunchError: Error | null = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Use different launch strategies for each attempt
        let currentLaunchOptions = { ...launchOptions };
        
        if (attempt === 2) {
          // Second attempt: Even more conservative approach
          console.log('Attempt 2: Using ultra-conservative Chrome configuration...');
          currentLaunchOptions.args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            `--user-data-dir=${userDataDir}`,
            '--window-size=1366,768',
            '--disable-features=VizDisplayCompositor',
            '--no-first-run'
          ];
          currentLaunchOptions.protocolTimeout = 300000; // 5 minutes
        } else if (attempt === 3) {
          // Third attempt: Absolute minimal configuration
          console.log('Attempt 3: Using minimal Chrome configuration as last resort...');
          currentLaunchOptions.args = [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            `--user-data-dir=${userDataDir}`,
            '--headless'
          ];
          currentLaunchOptions.protocolTimeout = 600000; // 10 minutes
          currentLaunchOptions.headless = true; // Force old headless mode
        }
        
        browser = await pptr.launch(currentLaunchOptions);
        browserLaunched = true;
        console.log(`✅ Browser launched successfully on attempt ${attempt}`);
        break;
        
      } catch (launchError: any) {
        lastLaunchError = launchError;
        console.warn(`❌ Browser launch attempt ${attempt}/3 failed: ${launchError.message}`);
        
        // Log specific error details for Target protocol issues
        if (launchError.message.includes('Target.') || launchError.message.includes('Protocol error')) {
          console.error(`Target/Protocol error details:`, {
            attempt,
            errorType: 'CDP_TARGET_ERROR',
            message: launchError.message,
            stack: launchError.stack?.substring(0, 200)
          });
        }
        
        if (attempt < 3) {
          const waitTime = attempt * 3000; // Progressive delay: 3s, 6s
          console.log(`Waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    if (!browserLaunched || !browser) {
      throw new Error(`Failed to launch browser after 3 attempts. Last error: ${lastLaunchError?.message}`);
    }
    
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
    
    // Set random user agent for anti-detection
    await page.setUserAgent(randomUserAgent);
    
    // Set conservative timeouts for container stability
    page.setDefaultNavigationTimeout(60000); // Increased back to 60s for stability
    page.setDefaultTimeout(60000);           // Increased back to 60s for stability
    
    // Set realistic viewport (match window size)
    await page.setViewport({ width: 1366, height: 768 });
    
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
    
    // Use safe storage clearing to handle SecurityError gracefully
    await safeClearStorage(page);
    
    // Set user agent BEFORE navigating - updated to current Chrome 137
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36');
    
    // Enhanced realistic headers with variation
    const headerVariations = [
      {
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="137", "Google Chrome";v="137"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"'
      },
      {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="137", "Google Chrome";v="137"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Linux"'
      }
    ];
    
    const selectedHeaders = headerVariations[Math.floor(Math.random() * headerVariations.length)];
    
    await page.setExtraHTTPHeaders({
      ...selectedHeaders,
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'no-cache',
      'DNT': '1'
    });
    
    // Enhanced anti-detection measures with realistic browser fingerprinting
    await page.evaluateOnNewDocument(() => {
      // Remove all webdriver traces
      delete (window as any).webdriver;
      delete (window as any).__webdriver_evaluate;
      delete (window as any).__selenium_evaluate;
      delete (window as any).__webdriver_script_function;
      delete (window as any).__webdriver_script_func;
      delete (window as any).__webdriver_script_fn;
      delete (window as any).__fxdriver_evaluate;
      delete (window as any).__driver_unwrapped;
      delete (window as any).__webdriver_unwrapped;
      delete (window as any).__driver_evaluate;
      delete (window as any).__selenium_unwrapped;
      delete (window as any).__fxdriver_unwrapped;
      
      // Create realistic plugins array
      const createPlugin = (name: string, filename: string, description: string) => ({
        name,
        filename,
        description,
        length: 1,
        item: () => null,
        namedItem: () => null,
        refresh: () => {}
      });
      
      const realisticPlugins = [
        createPlugin('Chrome PDF Plugin', 'internal-pdf-viewer', 'Portable Document Format'),
        createPlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
        createPlugin('Native Client', 'internal-nacl-plugin', ''),
        createPlugin('Chromium PDF Plugin', 'chromium-pdf-plugin', 'Portable Document Format'),
        createPlugin('Microsoft Edge PDF Plugin', 'edge-pdf-plugin', 'Portable Document Format')
      ];
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => realisticPlugins
      });
      
      // Realistic languages with proper Accept-Language format
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'de']
      });
      
      // Override webdriver property consistently
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true
      });
      
      // Realistic platform detection
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });
      
      // Realistic hardware specs
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8  // More realistic for modern systems
      });
      
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
      });
      
      // Enhanced vendor properties
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.'
      });
      
      Object.defineProperty(navigator, 'vendorSub', {
        get: () => ''
      });
      
      // Realistic app properties
      Object.defineProperty(navigator, 'appName', {
        get: () => 'Netscape'
      });
      
      Object.defineProperty(navigator, 'appCodeName', {
        get: () => 'Mozilla'
      });
      
      Object.defineProperty(navigator, 'product', {
        get: () => 'Gecko'
      });
      
      Object.defineProperty(navigator, 'productSub', {
        get: () => '20030107'
      });
      
      // Chrome runtime with more realistic properties
      (window as any).chrome = {
        runtime: {
          onConnect: undefined,
          onMessage: undefined,
          sendMessage: undefined,
          connect: undefined
        },
        app: {
          isInstalled: false,
          InstallState: {
            DISABLED: 'disabled',
            INSTALLED: 'installed',
            NOT_INSTALLED: 'not_installed'
          },
          RunningState: {
            CANNOT_RUN: 'cannot_run',
            READY_TO_RUN: 'ready_to_run',
            RUNNING: 'running'
          }
        }
      };
      
      // Enhanced permissions handling
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission } as PermissionStatus);
        }
        if (parameters.name === 'geolocation') {
          return Promise.resolve({ state: 'prompt' } as PermissionStatus);
        }
        return originalQuery(parameters);
      };
      
      // Add realistic screen properties
      Object.defineProperty(screen, 'colorDepth', {
        get: () => 24
      });
      
      Object.defineProperty(screen, 'pixelDepth', {
        get: () => 24
      });
      
      // Canvas fingerprinting protection
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      
      HTMLCanvasElement.prototype.toDataURL = function(this: HTMLCanvasElement, ...args) {
        // Add subtle noise to canvas data
        const ctx = this.getContext('2d');
        if (ctx) {
          const originalData = originalToDataURL.apply(this, args);
          // Return consistent but slightly modified data
          return originalData.replace(/data:image\/png;base64,/, 'data:image/png;base64,iVBORw0KGgo=').slice(0, -20) + 'AAAAAABJRU5ErkJggg==';
        }
        return originalToDataURL.apply(this, args);
      };
      
      // WebGL fingerprinting protection
      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(this: WebGLRenderingContext, parameter: GLenum) {
        if (parameter === this.VENDOR) {
          return 'Intel Inc.';
        }
        if (parameter === this.RENDERER) {
          return 'Intel(R) HD Graphics 630';
        }
        return originalGetParameter.apply(this, [parameter]);
      };
      
      // Remove automation indicators from Error stack traces
      const originalError = window.Error;
      const CustomError = class extends originalError {
        constructor(message?: string) {
          super(message);
          if (this.stack) {
            this.stack = this.stack.replace(/\s+at.*puppeteer.*$/gm, '');
            this.stack = this.stack.replace(/\s+at.*chrome-extension.*$/gm, '');
            this.stack = this.stack.replace(/\s+at.*automation.*$/gm, '');
          }
        }
      };
      (window as any).Error = CustomError;
      
      // Add realistic date/time behavior
      const originalDate = Date;
      const timezoneOffset = -new originalDate().getTimezoneOffset();
      Object.defineProperty(originalDate.prototype, 'getTimezoneOffset', {
        value: () => timezoneOffset
      });
    });
    
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
    const failedCookies: string[] = [];
    
    for (const cookie of cookies) {
      try {
        // Remove expired cookies (keep unexpired ones)
        if (cookie.expires && cookie.expires < currentTime) {
          console.log(`Skipping expired cookie: ${cookie.name}`);
          continue;
        }
        
        // Ensure required fields are present
        if (!cookie.name || !cookie.value) {
          console.warn(`Skipping invalid cookie (missing name or value): ${JSON.stringify(cookie)}`);
          continue;
        }
        
        // Set domain if missing (default to LinkedIn)
        if (!cookie.domain) {
          cookie.domain = '.linkedin.com';
        }
        
        await page.setCookie(cookie);
        successCount++;
      } catch (err) {
        console.error(`Failed to set cookie ${cookie.name}:`, err);
        failedCookies.push(cookie.name);
      }
    }
    
    console.log(`Successfully set ${successCount}/${cookies.length} cookies`);
    if (failedCookies.length > 0) {
      console.warn(`Failed to set cookies: ${failedCookies.join(', ')}`);
    }

  // Enforce request spacing to prevent rate limiting
  await enforceRequestSpacing();

  // Robust navigation with retry targets and better error handling
  const targets = [
    'https://www.linkedin.com/feed/',
    'https://www.linkedin.com/',
    'https://www.linkedin.com/hp'
  ];

  let navOK = false;
  let currentUrl = '';
  let lastError: Error | null = null;
  
  for (const target of targets) {
    try {
      console.log(`Navigating to ${target}`);
      
      // Pre-navigation health check
      const preNavHealth = await checkPageHealth(page, { checkNavigation: false });
      if (!preNavHealth.isHealthy) {
        console.warn(`Pre-navigation health check failed: ${preNavHealth.error}`);
        continue;
      }
      
      // Enhanced navigation with rate limiting handling
      let resp = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          resp = await page.goto(target, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          if (!resp) {
            throw new Error('Navigation returned no response');
          }
          
          // Handle LinkedIn rate limiting (HTTP 429)
          if (resp.status() === 429) {
            const retryAfter = resp.headers()['retry-after'];
            const baseDelay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
            const exponentialDelay = baseDelay * Math.pow(2, retryCount);
            const jitteredDelay = exponentialDelay + (Math.random() * 2000); // Add 0-2s jitter
            
            console.warn(`Rate limited (429) on attempt ${retryCount + 1}/${maxRetries + 1}. Waiting ${Math.round(jitteredDelay/1000)}s before retry...`);
            
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, jitteredDelay));
              retryCount++;
              continue;
            } else {
              throw new Error(`Rate limiting persisted after ${maxRetries + 1} attempts`);
            }
          }
          
          if (resp.status() >= 400) {
            throw new Error(`HTTP ${resp.status()} error`);
          }
          
          break; // Success, exit retry loop
          
        } catch (error: any) {
          retryCount++;
          if (retryCount > maxRetries) {
            throw error;
          }
          
          const retryDelay = 2000 * retryCount + (Math.random() * 1000); // Progressive delay with jitter
          console.warn(`Navigation attempt ${retryCount}/${maxRetries + 1} failed: ${error.message}. Retrying in ${Math.round(retryDelay/1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      if (!resp || resp.status() >= 400) {
        console.warn(`Navigation to ${target} failed with status ${resp?.status() || 'No response'}`);
        continue;
      }
      
      // Human-like page interaction and monitoring with variable timing
      const monitoringDuration = Math.floor(Math.random() * 4000) + 2000; // 2-6 seconds instead of fixed 3
      console.log(`Monitoring page stability for ${monitoringDuration}ms with human-like behavior...`);
      const startTime = Date.now();
      let monitoringError: Error | null = null;
      
      // Add subtle mouse movement to simulate human presence
      await page.evaluate(() => {
        const addMouseMovement = () => {
          const event = new MouseEvent('mousemove', {
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight,
            bubbles: true
          });
          document.dispatchEvent(event);
        };
        
        // Random mouse movements during monitoring
        setTimeout(addMouseMovement, Math.random() * 1000);
        setTimeout(addMouseMovement, Math.random() * 2000 + 1000);
        setTimeout(addMouseMovement, Math.random() * 3000 + 2000);
      });
      
      // Add realistic scroll behavior
      await page.evaluate(() => {
        const scrollAmount = Math.floor(Math.random() * 200) + 50;
        window.scrollTo({
          top: scrollAmount,
          behavior: 'smooth'
        });
        
        // Scroll back after a delay
        setTimeout(() => {
          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }, Math.random() * 1500 + 500);
      });
      
      while (Date.now() - startTime < monitoringDuration) {
        try {
          const currentPageUrl = page.url();
          
          // Check for Chrome error pages during monitoring
          if (currentPageUrl.startsWith('chrome-error://') || 
              currentPageUrl.includes('chromewebdata') || 
              currentPageUrl.startsWith('chrome://')) {
            monitoringError = new Error(`Page redirected to Chrome error during monitoring: ${currentPageUrl}`);
            break;
          }
          
          // Check for LinkedIn login redirects during monitoring  
          if (currentPageUrl.includes('/login') || currentPageUrl.includes('/authwall')) {
            monitoringError = new Error(`Page redirected to login/authwall during monitoring: ${currentPageUrl}`);
            break;
          }
          
          // Variable delay between checks (more human-like)
          const checkDelay = Math.floor(Math.random() * 800) + 300; // 300-1100ms
          await new Promise(resolve => setTimeout(resolve, checkDelay));
          
        } catch (monitorError) {
          console.warn('Error during page monitoring:', monitorError);
          break;
        }
      }
      
      // If monitoring detected an error, throw it to trigger retry logic
      if (monitoringError) {
        throw monitoringError;
      }
      
      console.log('Page monitoring completed successfully');
      
      // Check if page is still healthy after navigation with retry logic
      let postNavHealthy = false;
      for (let retryCount = 0; retryCount < 3; retryCount++) {
        try {
          const postNavHealth = await checkPageHealth(page, { checkNavigation: false });
          if (postNavHealth.isHealthy) {
            postNavHealthy = true;
            break;
          } else {
            console.warn(`Post-navigation health check failed (attempt ${retryCount + 1}/3): ${postNavHealth.error}`);
            if (retryCount < 2) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
            }
          }
        } catch (healthError) {
          console.warn(`Health check error (attempt ${retryCount + 1}/3):`, healthError);
          if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      if (!postNavHealthy) {
        console.warn('Post-navigation health checks failed after 3 attempts, trying next target');
        continue;
      }
      
      currentUrl = page.url();
      console.log(`Landed on ${currentUrl}`);

      // Explicit Chrome error page detection
      if (currentUrl.startsWith('chrome-error://') || 
          currentUrl.includes('chromewebdata') || 
          currentUrl.startsWith('chrome://')) {
        console.error(`❌ CRITICAL: Browser landed on Chrome error page: ${currentUrl}`);
        console.error('This indicates network connectivity issues or LinkedIn blocking');
        lastError = new Error(`Chrome error page detected: ${currentUrl}`);
        continue;
      }

      // Check if we're not on LinkedIn at all
      if (!currentUrl.includes('linkedin.com')) {
        console.error(`❌ CRITICAL: Not on LinkedIn domain. Current URL: ${currentUrl}`);
        lastError = new Error(`Navigation failed - not on LinkedIn: ${currentUrl}`);
        continue;
      }

      // Comprehensive URL validation with Chrome error page detection
      if (!currentUrl.includes('/login') &&
          !currentUrl.includes('/authwall') &&
          !currentUrl.includes('/checkpoint') &&
          !currentUrl.includes('/verify') &&
          !currentUrl.includes('/challenge') &&
          currentUrl !== 'about:blank' &&
          currentUrl !== 'data:text/html' &&
          !currentUrl.startsWith('chrome-error://') &&
          !currentUrl.startsWith('chrome://') &&
          !currentUrl.includes('chromewebdata') &&
          !currentUrl.includes('error') &&
          currentUrl.includes('linkedin.com')) {
        navOK = true;
        
        // Try to click GDPR/cookie banner if present
        try {
          // Use CSS selectors for common cookie banner buttons
          const cssSelectors = [
            'button[data-test-id*="accept"]',
            'button[aria-label*="Accept"]',
            'button[id*="accept"]',
            'button[class*="accept"]',
            '[data-test="accept-all-cookies"]',
            '.artdeco-global-alert button'
          ];
          
          let acceptButton = null;
          
          for (const selector of cssSelectors) {
            try {
              const element = await page.$(selector);
              if (element) {
                const text = await element.evaluate(el => el.textContent?.toLowerCase() || '');
                if (text.includes('accept') || text.includes('akzeptieren')) {
                  acceptButton = element;
                  break;
                }
              }
            } catch (cssError) {
              // Continue to next selector
              continue;
            }
          }
          
          if (acceptButton) {
            console.log('Cookie banner detected – clicking accept button');
            await acceptButton.click();
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (bannerError) {
          // Ignore banner click errors
          console.log('Cookie banner click failed, continuing:', (bannerError as Error).message);
        }
        
        break;
      }
    } catch (navError) {
      lastError = navError as Error;
      console.warn(`Navigation to ${target} failed:`, lastError.message);
    }
  }
  
  if (!navOK) {
    const errorMessage = lastError ? ` Last error: ${lastError.message}` : '';
    throw new Error(`LinkedIn authentication failed – redirected to login/authwall on all targets.${errorMessage}`);
  }
  
  // Add health check after successful navigation
  const navigationHealth = await checkPageHealth(page);
  if (!navigationHealth.isHealthy) {
    throw new Error(`Page health check failed after navigation: ${navigationHealth.error}`);
  }

  // Final URL check with enhanced error detection
  currentUrl = page.url();
  console.log('Final URL after navigation:', currentUrl);

  // CRITICAL: Check for Chrome error pages first
  if (currentUrl.startsWith('chrome-error://') || 
      currentUrl.includes('chromewebdata') || 
      currentUrl.startsWith('chrome://')) {
    throw new Error(`CRITICAL: Browser on Chrome error page - network connectivity issue: ${currentUrl}`);
  }

  // Check if we're actually on LinkedIn
  if (!currentUrl.includes('linkedin.com')) {
    throw new Error(`CRITICAL: Not on LinkedIn domain after navigation: ${currentUrl}`);
  }

  // Accept /hp as valid authenticated state, but prefer /feed
  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    throw new Error('LinkedIn authentication failed - redirected to login page. Cookies may be invalid or expired.');
  }

  // Enhanced login verification with comprehensive LinkedIn page structure checks
  const loginCheckpoints = await safeEvaluate(page, () => {
    const checkpoints = {
      // Core LinkedIn navigation elements
      globalNav: !!document.querySelector('nav.global-nav'),
      testGlobalNav: !!document.querySelector('[data-test-global-nav]'),
      feedIdentity: !!document.querySelector('.feed-identity-module'),
      globalNavMe: !!document.querySelector('.global-nav__me'),
      profileNav: !!document.querySelector('.global-nav__me-content'),
      feedContainer: !!document.querySelector('.feed-container-theme'),
      
      // LinkedIn domain and branding validation
      hasLinkedInClass: document.body?.classList.contains('linkedin') || false,
      hasLinkedInLogo: !!document.querySelector('.linkedin-logo'),
      isLinkedInDomain: window.location.hostname.includes('linkedin.com'),
      
      // Page structure validation
      hasMainContent: !!document.querySelector('main'),
      hasHeader: !!document.querySelector('header'),
      hasValidDocumentTitle: document.title.toLowerCase().includes('linkedin'),
      
      // Specific page type checks
      isHomepage: window.location.pathname === '/hp',
      isFeedPage: window.location.pathname.includes('/feed'),
      
      // Error state detection
      noLoginForm: !document.querySelector('form[action*="login"]'),
      noAuthWall: !document.querySelector('.authwall'),
      noChromeError: !window.location.href.includes('chrome-error'),
      noErrorPage: !document.body?.innerText?.toLowerCase().includes('error'),
      
      // LinkedIn-specific elements that indicate successful authentication
      hasLinkedInSearch: !!document.querySelector('[data-test-search-input]'),
      hasNotificationIcon: !!document.querySelector('[data-test-notification-icon]'),
      hasMessagingIcon: !!document.querySelector('[data-test-messaging-icon]')
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