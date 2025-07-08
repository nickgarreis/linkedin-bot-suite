"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initLinkedInContext = initLinkedInContext;
const puppeteer_1 = __importDefault(require("puppeteer"));
const puppeteer_extra_1 = require("puppeteer-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const browserHealth_1 = require("./utils/browserHealth");
// Network connectivity pre-check
async function checkNetworkConnectivity() {
    try {
        const https = await Promise.resolve().then(() => __importStar(require('https')));
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
                }
                else {
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
    }
    catch (error) {
        throw new Error(`Network pre-check failed: ${error}`);
    }
}
async function initLinkedInContext(proxy) {
    // Perform network connectivity check first
    try {
        await checkNetworkConnectivity();
    }
    catch (connectivityError) {
        console.error('❌ Network connectivity check failed:', connectivityError);
        throw new Error(`Network connectivity issue detected: ${connectivityError}`);
    }
    const pptr = (0, puppeteer_extra_1.addExtra)(puppeteer_1.default);
    pptr.use((0, puppeteer_extra_plugin_stealth_1.default)());
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
    // Enhanced Chrome configuration optimized for LinkedIn compatibility and bot detection evasion
    const launchOptions = {
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
        protocolTimeout: 300000, // 5 minutes timeout
        args: [
            // Essential container security
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-gpu-sandbox',
            // User data (required)
            `--user-data-dir=${userDataDir}`,
            // JavaScript and automation detection evasion
            '--enable-javascript',
            '--disable-blink-features=AutomationControlled', // Critical: Hide automation markers
            '--disable-web-security', // Required for LinkedIn cross-origin resources
            '--allow-running-insecure-content',
            // Network configuration for containers (CRITICAL for LinkedIn)
            '--disable-features=NetworkService',
            '--enable-features=NetworkServiceInProcess',
            '--ignore-certificate-errors-spki-list',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors',
            '--disable-site-isolation-trials',
            '--disable-features=BlockInsecurePrivateNetworkRequests',
            '--aggressive-cache-discard',
            '--disable-background-networking',
            // Rendering and performance optimization
            '--disable-features=VizDisplayCompositor,TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection',
            '--memory-pressure-off',
            '--no-default-browser-check',
            '--no-first-run',
            '--disable-default-apps',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            // Bot detection evasion - more human-like browser
            '--window-size=1920,1080', // Increased for more human-like resolution
            '--start-maximized',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-features=IsolateOrigins,site-per-process', // Stability for dynamic content
            ...(proxy ? [`--proxy-server=${proxy}`] : [])
        ]
    };
    let browser = null;
    let page = null;
    try {
        console.log('Launching Chrome browser with minimal configuration...');
        browser = await pptr.launch(launchOptions);
        console.log('✅ Browser launched successfully');
        // Check browser health before proceeding
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
        // Set random user agent for anti-detection with error handling
        try {
            await page.setUserAgent(randomUserAgent);
            console.log('✅ User agent configured successfully');
        }
        catch (userAgentError) {
            console.warn('⚠️ User agent configuration failed, using browser default:', userAgentError.message);
        }
        // Set conservative timeouts for container stability
        page.setDefaultNavigationTimeout(60000); // Increased back to 60s for stability
        page.setDefaultTimeout(60000); // Increased back to 60s for stability
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
        }
        catch (initError) {
            console.warn('Initial navigation failed, continuing without pre-navigation:', initError.message);
        }
        // Clear storage safely
        try {
            await (0, browserHealth_1.safeClearStorage)(page);
        }
        catch (storageError) {
            console.warn('Unexpected error during storage clearing:', storageError.message);
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
        }
        catch (headersError) {
            console.warn('⚠️ HTTP headers configuration failed, using browser defaults:', headersError.message);
        }
        // REMOVED: Complex anti-detection script that causes Chrome session closure
        // Relying on puppeteer-extra-plugin-stealth for basic anti-detection
        console.log('✅ Using basic stealth plugin protection (complex script removed to prevent Chrome crashes)');
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
        for (const cookie of cookies) {
            try {
                await page.setCookie(cookie);
                successCount++;
            }
            catch (cookieError) {
                console.warn(`Failed to set cookie ${cookie.name}:`, cookieError.message);
            }
        }
        console.log(`✅ Successfully set ${successCount}/${cookies.length} cookies`);
        if (successCount === 0) {
            throw new Error('Failed to set any cookies - authentication will not work');
        }
        return { browser, page, userDataDir };
    }
    catch (error) {
        console.error('Failed to launch browser:', error);
        // Enhanced cleanup with error handling
        if (page) {
            try {
                await page.close();
            }
            catch (pageCloseError) {
                console.warn('Failed to close page safely:', pageCloseError.message);
            }
        }
        if (browser) {
            try {
                await browser.close();
            }
            catch (browserCloseError) {
                console.warn('Failed to close browser safely:', browserCloseError.message);
            }
        }
        // Clean up user data directory
        await (0, browserHealth_1.cleanupUserDataDir)(userDataDir);
        throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
