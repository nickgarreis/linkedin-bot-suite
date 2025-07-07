import { Page } from 'puppeteer';
export declare function viewProfile(page: Page, profileUrl: string): Promise<{
    success: boolean;
    message: string;
    profileUrl: string;
    profileData?: any;
}>;
