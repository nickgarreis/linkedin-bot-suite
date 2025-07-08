"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initLinkedInContext = initLinkedInContext;
const puppeteer_1 = __importDefault(require("puppeteer"));
const puppeteer_extra_1 = require("puppeteer-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const browserHealth_1 = require("./utils/browserHealth");
async function initLinkedInContext(proxy) {
    const pptr = (0, puppeteer_extra_1.addExtra)(puppeteer_1.default);
    pptr.use((0, puppeteer_extra_plugin_stealth_1.default)());
    const userDataDir = `/tmp/chrome-user-data-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const launchOptions = {
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
        args: [
            // Core sandbox and security
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
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
    let browser = null;
    let page = null;
    try {
        console.log('Launching Chrome browser...');
        browser = await pptr.launch(launchOptions);
        console.log('Browser launched successfully');
        // Initial browser health check
        const browserHealthy = await (0, browserHealth_1.checkBrowserHealth)(browser);
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
        page.setDefaultTimeout(45000); // 45s operations timeout
        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });
        // Clear cache and storage before navigation to prevent redirect loops
        // Use data URL instead of about:blank for better security context
        await page.goto('data:text/html,<html><head><title>Initializing</title></head><body></body></html>');
        // Use safe storage clearing to handle SecurityError gracefully
        await (0, browserHealth_1.safeClearStorage)(page);
        // Set user agent BEFORE navigating - updated to latest Chrome
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
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
            delete window.webdriver;
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
            window.chrome = {
                runtime: {}
            };
            // Override the permissions property
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters));
        });
        // Parse and validate cookies
        let cookies;
        try {
            cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON);
        }
        catch (parseError) {
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
            const cookie = cookies.find((c) => c.name === cookieName);
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
        const failedCookies = [];
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
            }
            catch (err) {
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
        let lastError = null;
        for (const target of targets) {
            try {
                console.log(`Navigating to ${target}`);
                // Pre-navigation health check
                const preNavHealth = await (0, browserHealth_1.checkPageHealth)(page, { checkNavigation: false });
                if (!preNavHealth.isHealthy) {
                    console.warn(`Pre-navigation health check failed: ${preNavHealth.error}`);
                    continue;
                }
                const resp = await page.goto(target, {
                    waitUntil: 'domcontentloaded',
                    timeout: 45000
                });
                if (!resp) {
                    console.warn(`Navigation to ${target} returned no response`);
                    continue;
                }
                if (resp.status() >= 400) {
                    console.warn(`Navigation to ${target} failed with status ${resp.status()}`);
                    continue;
                }
                // Wait for redirects and content to settle
                await new Promise(resolve => setTimeout(resolve, 3000));
                // Check if page is still healthy after navigation
                const postNavHealth = await (0, browserHealth_1.checkPageHealth)(page, { checkNavigation: false });
                if (!postNavHealth.isHealthy) {
                    console.warn(`Post-navigation health check failed: ${postNavHealth.error}`);
                    continue;
                }
                currentUrl = page.url();
                console.log(`Landed on ${currentUrl}`);
                // More comprehensive URL validation
                if (!currentUrl.includes('/login') &&
                    !currentUrl.includes('/authwall') &&
                    !currentUrl.includes('/checkpoint') &&
                    !currentUrl.includes('/verify') &&
                    !currentUrl.includes('/challenge') &&
                    currentUrl !== 'about:blank' &&
                    currentUrl !== 'data:text/html') {
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
                            }
                            catch (cssError) {
                                // Continue to next selector
                                continue;
                            }
                        }
                        if (acceptButton) {
                            console.log('Cookie banner detected – clicking accept button');
                            await acceptButton.click();
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    }
                    catch (bannerError) {
                        // Ignore banner click errors
                        console.log('Cookie banner click failed, continuing:', bannerError.message);
                    }
                    break;
                }
            }
            catch (navError) {
                lastError = navError;
                console.warn(`Navigation to ${target} failed:`, lastError.message);
            }
        }
        if (!navOK) {
            const errorMessage = lastError ? ` Last error: ${lastError.message}` : '';
            throw new Error(`LinkedIn authentication failed – redirected to login/authwall on all targets.${errorMessage}`);
        }
        // Add health check after successful navigation
        const navigationHealth = await (0, browserHealth_1.checkPageHealth)(page);
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
        const loginCheckpoints = await (0, browserHealth_1.safeEvaluate)(page, () => {
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
            const verificationAnalysis = await (0, browserHealth_1.safeEvaluate)(page, () => {
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
        console.log('Successfully authenticated with LinkedIn. Checkpoints passed:', Object.entries(loginCheckpoints).filter(([_, passed]) => passed).map(([name]) => name).join(', '));
        // Final health check before returning
        const finalHealth = await (0, browserHealth_1.checkPageHealth)(page);
        if (!finalHealth.isHealthy) {
            throw new Error(`Final health check failed: ${finalHealth.error}`);
        }
        // Add browser disconnect handler
        browser.on('disconnected', () => {
            console.log('Browser disconnected, cleaning up user data directory');
            (0, browserHealth_1.cleanupUserDataDir)(userDataDir);
        });
        return { browser, page, userDataDir };
    }
    catch (error) {
        console.error('Failed to launch browser:', error);
        // Clean up resources on error with connection safety
        if (page) {
            try {
                if (!page.isClosed() && page.browser().isConnected()) {
                    await page.close();
                }
            }
            catch (e) {
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
            }
            catch (e) {
                console.error('Failed to close browser safely:', e);
                // Force kill if graceful close fails
                try {
                    const process = browser.process();
                    if (process) {
                        process.kill('SIGKILL');
                    }
                }
                catch (killError) {
                    console.error('Failed to force kill browser:', killError);
                }
            }
        }
        // Clean up user data directory
        (0, browserHealth_1.cleanupUserDataDir)(userDataDir);
        throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
