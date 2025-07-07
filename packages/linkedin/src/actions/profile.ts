import { Page } from 'puppeteer';

export async function viewProfile(
  page: Page,
  profileUrl: string
): Promise<{ success: boolean; message: string; profileUrl: string; profileData?: any }> {
  await page.goto(profileUrl, { waitUntil: 'networkidle0' });

  try {
    // Wait for the profile to load
    await page.waitForTimeout(2000);

    // Extract basic profile information
    const profileData = await page.evaluate(() => {
      const getName = () => {
        const nameElement = document.querySelector('h1.text-heading-xlarge, h1.break-words');
        return nameElement?.textContent?.trim() || '';
      };

      const getHeadline = () => {
        const headlineElement = document.querySelector('.text-body-medium.break-words');
        return headlineElement?.textContent?.trim() || '';
      };

      const getLocation = () => {
        const locationElement = document.querySelector('.text-body-small.inline.t-black--light.break-words');
        return locationElement?.textContent?.trim() || '';
      };

      const getConnectionCount = () => {
        const connectionElement = document.querySelector('.t-black--light.t-normal');
        return connectionElement?.textContent?.trim() || '';
      };

      const getAbout = () => {
        const aboutElement = document.querySelector('.display-flex.ph5.pv3 .full-width .break-words');
        return aboutElement?.textContent?.trim() || '';
      };

      return {
        name: getName(),
        headline: getHeadline(),
        location: getLocation(),
        connectionCount: getConnectionCount(),
        about: getAbout(),
        url: window.location.href,
        viewedAt: new Date().toISOString(),
      };
    });

    // Scroll down to simulate viewing the profile
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);

    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);

    return {
      success: true,
      message: 'Profile viewed successfully',
      profileUrl,
      profileData,
    };
  } catch (error) {
    throw new Error(`Failed to view profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}