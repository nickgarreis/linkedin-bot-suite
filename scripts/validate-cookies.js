#!/usr/bin/env node
/**
 * LinkedIn Cookie Validation Script
 * Validates LinkedIn cookies and tests authentication without affecting the main bot
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Required LinkedIn cookies
const REQUIRED_COOKIES = ['li_at', 'JSESSIONID', 'li_gc', 'bcookie', 'bscookie'];

async function validateCookies() {
  console.log('🔍 LinkedIn Cookie Validation Starting...\n');
  
  // Check environment variables
  const cookiesJson = process.env.LINKEDIN_COOKIES_JSON;
  if (!cookiesJson) {
    console.error('❌ LINKEDIN_COOKIES_JSON environment variable not set');
    process.exit(1);
  }
  
  let cookies;
  try {
    cookies = JSON.parse(cookiesJson);
  } catch (error) {
    console.error('❌ Invalid JSON in LINKEDIN_COOKIES_JSON:', error.message);
    process.exit(1);
  }
  
  console.log(`📊 Found ${cookies.length} cookies in environment`);
  
  // Validate cookie structure
  console.log('\n🔍 Validating cookie structure...');
  const cookieNames = cookies.map(cookie => cookie.name);
  const missingCookies = REQUIRED_COOKIES.filter(name => !cookieNames.includes(name));
  
  if (missingCookies.length > 0) {
    console.error(`❌ Missing required cookies: ${missingCookies.join(', ')}`);
    console.log(`   Required cookies: ${REQUIRED_COOKIES.join(', ')}`);
    console.log(`   Found cookies: ${cookieNames.join(', ')}`);
    process.exit(1);
  }
  
  console.log('✅ All required cookies present');
  
  // Validate cookie properties
  for (const cookie of cookies) {
    if (!cookie.name || !cookie.value) {
      console.error(`❌ Cookie ${cookie.name || 'unnamed'} missing name or value`);
      process.exit(1);
    }
    
    if (!cookie.domain || !cookie.domain.includes('linkedin.com')) {
      console.error(`❌ Cookie ${cookie.name} has invalid domain: ${cookie.domain}`);
      process.exit(1);
    }
  }
  
  console.log('✅ Cookie structure validation passed');
  
  // Test authentication with browser
  console.log('\n🌐 Testing authentication with browser...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set cookies
    console.log('🍪 Setting cookies...');
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
        console.log(`  ✅ Set cookie: ${cookie.name}`);
      } catch (error) {
        console.error(`  ❌ Failed to set cookie ${cookie.name}:`, error.message);
      }
    }
    
    // Navigate to LinkedIn
    console.log('🚀 Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com/', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Check for authentication
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      console.error('❌ Authentication failed - redirected to login page');
      
      // Take screenshot
      const screenshotPath = `/tmp/cookie-validation-failed-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot saved to: ${screenshotPath}`);
      
      process.exit(1);
    }
    
    // Test login verification
    const loginCheckpoints = await page.evaluate(() => {
      return {
        globalNav: !!document.querySelector('nav.global-nav'),
        testGlobalNav: !!document.querySelector('[data-test-global-nav]'),
        feedIdentity: !!document.querySelector('.feed-identity-module'),
        globalNavMe: !!document.querySelector('.global-nav__me'),
        profileNav: !!document.querySelector('.global-nav__me-content'),
        feedContainer: !!document.querySelector('.feed-container-theme'),
        hasLinkedInClass: document.body.classList.contains('linkedin')
      };
    });
    
    const loggedIn = Object.values(loginCheckpoints).some(checkpoint => checkpoint);
    
    if (!loggedIn) {
      console.error('❌ Authentication verification failed - no LinkedIn UI elements found');
      console.log('🔍 Checkpoints:', loginCheckpoints);
      
      // Take screenshot
      const screenshotPath = `/tmp/cookie-validation-no-ui-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot saved to: ${screenshotPath}`);
      
      process.exit(1);
    }
    
    console.log('✅ Authentication successful!');
    console.log('🎯 Checkpoints passed:', 
      Object.entries(loginCheckpoints).filter(([_, passed]) => passed).map(([name]) => name).join(', '));
    
    // Test navigation to feed
    console.log('\n🔄 Testing navigation to feed...');
    await page.goto('https://www.linkedin.com/feed', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const feedUrl = page.url();
    console.log(`📍 Feed URL: ${feedUrl}`);
    
    if (feedUrl.includes('/login') || feedUrl.includes('/authwall')) {
      console.error('❌ Feed navigation failed - redirected to login');
      process.exit(1);
    }
    
    console.log('✅ Feed navigation successful!');
    
    // Cookie expiration analysis
    console.log('\n⏰ Analyzing cookie expiration...');
    const cookieAnalysis = cookies.map(cookie => {
      const expiresAt = cookie.expires ? new Date(cookie.expires * 1000) : null;
      const isExpired = expiresAt && expiresAt < new Date();
      const timeToExpiry = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
      
      return {
        name: cookie.name,
        expires: expiresAt ? expiresAt.toISOString() : 'Never',
        isExpired,
        daysToExpiry: timeToExpiry
      };
    });
    
    console.log('📊 Cookie expiration analysis:');
    cookieAnalysis.forEach(analysis => {
      const status = analysis.isExpired ? '❌ EXPIRED' : 
                    analysis.daysToExpiry !== null && analysis.daysToExpiry < 7 ? '⚠️  EXPIRING SOON' : '✅ VALID';
      console.log(`  ${analysis.name}: ${status} (expires: ${analysis.expires})`);
    });
    
    const expiredCookies = cookieAnalysis.filter(a => a.isExpired);
    const expiringSoon = cookieAnalysis.filter(a => a.daysToExpiry !== null && a.daysToExpiry < 7 && !a.isExpired);
    
    if (expiredCookies.length > 0) {
      console.warn(`⚠️  ${expiredCookies.length} expired cookies found`);
    }
    
    if (expiringSoon.length > 0) {
      console.warn(`⚠️  ${expiringSoon.length} cookies expiring within 7 days`);
    }
    
    console.log('\n✅ Cookie validation completed successfully!');
    
  } catch (error) {
    console.error('❌ Browser test failed:', error.message);
    
    if (browser) {
      try {
        const page = await browser.newPage();
        const screenshotPath = `/tmp/cookie-validation-error-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Error screenshot saved to: ${screenshotPath}`);
      } catch (screenshotError) {
        console.error('Failed to take error screenshot:', screenshotError.message);
      }
    }
    
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Export cookie format template
function generateCookieTemplate() {
  return `
// LinkedIn Cookie Format Template
// Copy this format and replace with your actual cookie values
[
  {
    "name": "li_at",
    "value": "YOUR_LI_AT_VALUE",
    "domain": ".linkedin.com",
    "path": "/",
    "httpOnly": false,
    "secure": true,
    "expires": 1234567890
  },
  {
    "name": "JSESSIONID",
    "value": "YOUR_JSESSIONID_VALUE",
    "domain": ".linkedin.com",
    "path": "/",
    "httpOnly": true,
    "secure": true
  },
  {
    "name": "li_gc",
    "value": "YOUR_LI_GC_VALUE",
    "domain": ".linkedin.com",
    "path": "/",
    "httpOnly": false,
    "secure": true,
    "expires": 1234567890
  },
  {
    "name": "bcookie",
    "value": "YOUR_BCOOKIE_VALUE",
    "domain": ".linkedin.com",
    "path": "/",
    "httpOnly": false,
    "secure": true,
    "expires": 1234567890
  },
  {
    "name": "bscookie",
    "value": "YOUR_BSCOOKIE_VALUE",
    "domain": ".linkedin.com",
    "path": "/",
    "httpOnly": true,
    "secure": true
  }
]
`;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
LinkedIn Cookie Validation Script

Usage:
  node validate-cookies.js              - Validate current cookies
  node validate-cookies.js --template   - Show cookie format template
  node validate-cookies.js --help       - Show this help

Environment Variables:
  LINKEDIN_COOKIES_JSON                 - JSON array of LinkedIn cookies

Examples:
  LINKEDIN_COOKIES_JSON='[{"name":"li_at","value":"..."}]' node validate-cookies.js
    `);
    process.exit(0);
  }
  
  if (args.includes('--template')) {
    console.log(generateCookieTemplate());
    process.exit(0);
  }
  
  validateCookies().catch(error => {
    console.error('Validation script error:', error);
    process.exit(1);
  });
}

module.exports = { validateCookies, generateCookieTemplate };