"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initLinkedInContext = initLinkedInContext;
const puppeteer_1 = __importDefault(require("puppeteer"));
const puppeteer_extra_1 = require("puppeteer-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const shared_1 = require("@linkedin-bot-suite/shared");
async function initLinkedInContext(proxy) {
    const pptr = (0, puppeteer_extra_1.addExtra)(puppeteer_1.default);
    pptr.use((0, puppeteer_extra_plugin_stealth_1.default)());
    const launchOptions = {
        headless: 'new',
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
            ...(proxy ? [`--proxy-server=${proxy}`] : [])
        ]
    };
    const browser = await pptr.launch(launchOptions);
    const context = browser.createBrowserContext?.() ||
        browser.createIncognitoBrowserContext?.();
    const page = await context.newPage();
    // Set user agent to look more like a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    // Set cookies from environment
    const cookies = JSON.parse(process.env.LINKEDIN_COOKIES_JSON);
    await page.setCookie(...cookies);
    // Navigate to LinkedIn and verify login
    await page.goto('https://www.linkedin.com/feed', { waitUntil: 'networkidle0' });
    // Check if user is logged in
    const loggedIn = (await page.$(shared_1.LINKEDIN_SELECTORS.PROFILE_PHOTO)) !== null;
    if (!loggedIn) {
        throw new Error('LinkedIn authentication failed - cookies may be invalid or expired');
    }
    return { browser, context };
}
