import { Page } from 'puppeteer';
export declare function sendInvitation(page: Page, profileUrl: string, note?: string): Promise<{
    success: boolean;
    message: string;
    profileUrl: string;
    actionTaken: 'invited' | 'messaged';
}>;
