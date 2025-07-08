import { Browser, Page } from 'puppeteer';
import Puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { LINKEDIN_SELECTORS } from '@linkedin-bot-suite/shared';
import { checkPageHealth, checkBrowserHealth, waitForPageHealth, cleanupUserDataDir, safeEvaluate, safeClearStorage } from './utils/browserHealth';

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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  ];
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  console.log('Using user agent:', randomUserAgent);
  
  const launchOptions: any = {
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: [
      // Core sandbox and security
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // Network and DNS configuration for containers (Critical for Chrome 137)
      '--disable-features=NetworkService',
      '--enable-features=NetworkServiceInProcess',
      '--ignore-certificate-errors-spki-list',
      '--ignore-ssl-errors',
      '--ignore-certificate-errors',
      '--disable-site-isolation-trials',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--aggressive-cache-discard',
      '--disable-background-networking',
      
      // Anti-detection measures
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-extensions-except=',
      '--disable-plugins-except=',
      '--disable-infobars',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-ipc-flooding-protection',
      
      // User data and profile
      `--user-data-dir=${userDataDir}`,
      '--profile-directory=Default',
      
      // Window and display
      '--window-size=1920,1080',
      '--start-maximized',
      '--disable-gpu',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
      
      // Navigation and loading
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-mode',
      
      // Storage and permissions
      '--allow-file-access-from-files',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--allow-running-insecure-content',
      '--disable-features=IsolateOrigins,site-per-process',
      
      // Memory and performance
      '--disable-crash-reporter',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--disable-translate',
      '--disable-logging',
      '--disable-notifications',
      '--disable-desktop-notifications',
      '--js-flags=--max-old-space-size=512',
      '--max_old_space_size=512',
      
      // Container-specific stability
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-plugins',
      '--shm-size=1gb',
      '--disable-features=AudioServiceOutOfProcess',
      '--data-path=/tmp/chrome-data',
      '--homedir=/tmp',
      
      // Additional anti-detection
      '--disable-automation',
      '--disable-save-password-bubble',
      '--disable-single-click-autofill',
      '--disable-autofill-keyboard-accessory-view',
      '--disable-full-form-autofill-ios',
      '--disable-password-generation',
      '--disable-password-manager-reauthentication',
      
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
    
    // Set random user agent for anti-detection
    await page.setUserAgent(randomUserAgent);
    
    // Set default timeouts - reduced for faster failure detection
    page.setDefaultNavigationTimeout(30000); // Reduced from 60s to 30s
    page.setDefaultTimeout(30000);           // Reduced from 45s to 30s
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Clear cache and storage before navigation to prevent redirect loops
    // Use data URL instead of about:blank for better security context
    await page.goto('data:text/html,<html><head><title>Initializing</title></head><body></body></html>');
    
    // Use safe storage clearing to handle SecurityError gracefully
    await safeClearStorage(page);
    
    // Set user agent BEFORE navigating - updated to current Chrome 137
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36');
    
    // Set additional headers to appear more legitimate
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    });
    
    // Additional anti-detection measures
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      delete (window as any).webdriver;
      
      // Override the plugins length
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override the languages property
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
      
      // Override the webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });
      
      // Override the platform property
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });
      
      // Override the hardwareConcurrency property
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4
      });
      
      // Override the deviceMemory property
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
      });
      
      // Override the chrome property
      (window as any).chrome = {
        runtime: {}
      };
      
      // Override the permissions property
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission } as PermissionStatus) :
          originalQuery(parameters)
      );
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
      
      const resp = await page.goto(target, {
        waitUntil: 'domcontentloaded',
        timeout: 30000  // Reduced from 45000ms to 30000ms for faster failure detection
      });
      
      if (!resp) {
        console.warn(`Navigation to ${target} returned no response`);
        continue;
      }
      
      if (resp.status() >= 400) {
        console.warn(`Navigation to ${target} failed with status ${resp.status()}`);
        continue;
      }
      
      // Monitor for redirects with URL stability checking
      console.log('Monitoring page stability for 3 seconds...');
      const startTime = Date.now();
      let monitoringError: Error | null = null;
      
      while (Date.now() - startTime < 3000) {
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
          
          // Small delay between checks
          await new Promise(resolve => setTimeout(resolve, 500));
          
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