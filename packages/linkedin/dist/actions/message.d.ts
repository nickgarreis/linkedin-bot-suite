import { Page } from 'puppeteer';
export declare function sendMessage(page: Page, profileUrl: string, message: string): Promise<{
    success: boolean;
    message: string;
    profileUrl: string;
}>;
