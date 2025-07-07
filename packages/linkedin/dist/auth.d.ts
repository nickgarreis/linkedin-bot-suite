import { Browser, BrowserContext } from 'puppeteer';
export declare function initLinkedInContext(proxy?: string): Promise<{
    browser: Browser;
    context: BrowserContext;
}>;
