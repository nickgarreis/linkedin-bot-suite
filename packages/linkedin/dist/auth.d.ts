import { Browser, Page } from 'puppeteer';
export declare function initLinkedInContext(proxy?: string): Promise<{
    browser: Browser;
    page: Page;
    userDataDir: string;
}>;
