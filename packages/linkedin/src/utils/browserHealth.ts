import { Page, Browser } from 'puppeteer';

// Global session timing to prevent rate limiting
let lastLinkedInRequest = 0;
const MIN_REQUEST_SPACING = 15000; // Minimum 15 seconds between LinkedIn requests (increased from 8s)

/**
 * Enforces minimum spacing between LinkedIn requests to avoid rate limiting
 */
export async function enforceRequestSpacing(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastLinkedInRequest;
  
  if (timeSinceLastRequest < MIN_REQUEST_SPACING) {
    const waitTime = MIN_REQUEST_SPACING - timeSinceLastRequest;
    const jitteredWait = waitTime + (Math.random() * 5000); // Add 0-5s jitter (increased from 2s)
    console.log(`Enforcing request spacing: waiting ${Math.round(jitteredWait/1000)}s to avoid rate limiting...`);
    await new Promise(resolve => setTimeout(resolve, jitteredWait));
  }
  
  lastLinkedInRequest = Date.now();
}

/**
 * Safe page evaluation that handles frame detachment
 */
export async function safeEvaluate<T>(
  page: Page, 
  pageFunction: () => T, 
  timeoutMs: number = 5000
): Promise<T | {}> {
  try {
    // Check if page is closed first
    if (page.isClosed()) {
      console.error('Cannot evaluate: page is closed');
      return {} as T;
    }

    // Check browser connection
    if (!page.browser().isConnected()) {
      console.error('Cannot evaluate: browser disconnected');
      return {} as T;
    }

    return await Promise.race([
      page.evaluate(pageFunction),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Safe evaluation timeout')), timeoutMs)
      )
    ]);
  } catch (error: any) {
    if (error.message.includes('detached Frame') || 
        error.message.includes('Session closed') ||
        error.message.includes('Connection closed') ||
        error.message.includes('Target closed')) {
      console.error('Safe evaluation failed due to detached frame:', error.message);
      return {} as T;
    }
    throw error;
  }
}

/**
 * Safe storage clearing that handles SecurityError gracefully
 */
export async function safeClearStorage(page: Page): Promise<boolean> {
  try {
    // Check if page is closed first
    if (page.isClosed()) {
      console.warn('Cannot clear storage: page is closed');
      return false;
    }

    // Check browser connection
    if (!page.browser().isConnected()) {
      console.warn('Cannot clear storage: browser disconnected');
      return false;
    }

    await safeEvaluate(page, () => {
      try {
        // Clear localStorage if available
        if (typeof localStorage !== 'undefined') {
          localStorage.clear();
        }
        // Clear sessionStorage if available  
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
        }
      } catch (error: any) {
        // Log but don't throw - storage clearing is not critical
        console.warn('Storage clearing failed:', error.message);
      }
    }, 3000);

    console.log('Storage cleared successfully');
    return true;
  } catch (error: any) {
    // Handle SecurityError and other storage-related errors gracefully
    if (error.message.includes('SecurityError') || 
        error.message.includes('localStorage') ||
        error.message.includes('sessionStorage')) {
      console.warn('Storage clearing blocked by browser security policy:', error.message);
      return false;
    }
    
    // Re-throw other unexpected errors
    console.error('Unexpected error during storage clearing:', error.message);
    return false;
  }
}

export interface BrowserHealthCheck {
  isHealthy: boolean;
  url: string;
  title: string;
  isPageClosed: boolean;
  isBrowserConnected: boolean;
  error?: string;
}

export interface BrowserHealthOptions {
  timeoutMs?: number;
  checkNavigation?: boolean;
}

/**
 * Comprehensive health check for browser page
 */
export async function checkPageHealth(
  page: Page, 
  options: BrowserHealthOptions = {}
): Promise<BrowserHealthCheck> {
  const { timeoutMs = 5000, checkNavigation = true } = options;
  
  const result: BrowserHealthCheck = {
    isHealthy: false,
    url: 'unknown',
    title: 'unknown',
    isPageClosed: false,
    isBrowserConnected: false
  };

  try {
    // First check if page is closed
    result.isPageClosed = page.isClosed();
    if (result.isPageClosed) {
      result.error = 'Page is closed';
      return result;
    }

    // Check if browser is connected
    result.isBrowserConnected = page.browser().isConnected();
    if (!result.isBrowserConnected) {
      result.error = 'Browser is not connected';
      return result;
    }

    // Try to evaluate simple JavaScript with timeout and frame detachment protection
    let pageInfo;
    try {
      pageInfo = await Promise.race([
        page.evaluate(() => ({
          url: window.location.href,
          title: document.title,
          readyState: document.readyState,
          hasBody: !!document.body
        })),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Page evaluation timeout')), timeoutMs)
        )
      ]);
    } catch (evalError: any) {
      // Handle common frame detachment and context destruction errors
      if (evalError.message.includes('detached Frame') || 
          evalError.message.includes('Session closed') ||
          evalError.message.includes('Connection closed') ||
          evalError.message.includes('Target closed') ||
          evalError.message.includes('Execution context was destroyed') ||
          evalError.message.includes('Protocol error')) {
        result.error = `Context/Frame issue during evaluation: ${evalError.message}`;
        return result;
      }
      throw evalError;
    }

    if (!pageInfo) {
      result.error = 'Page evaluation failed';
      return result;
    }

    result.url = pageInfo.url;
    result.title = pageInfo.title;

    // Check for problematic states
    if (pageInfo.url === 'about:blank') {
      result.error = 'Page is showing about:blank';
      return result;
    }

    if (checkNavigation) {
      // Check for LinkedIn-specific issues
      if (pageInfo.url.includes('/login') || pageInfo.url.includes('/authwall')) {
        result.error = 'Page redirected to login/authwall';
        return result;
      }

      // Check for error pages
      if (pageInfo.title.toLowerCase().includes('error') || 
          pageInfo.title.toLowerCase().includes('not found')) {
        result.error = `Page shows error: ${pageInfo.title}`;
        return result;
      }
    }

    // Check document state - be more lenient about loading state
    if (pageInfo.readyState === 'loading') {
      // Wait a bit and check again if page is still loading
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retryInfo = await page.evaluate(() => ({
          readyState: document.readyState,
          hasBody: !!document.body
        }));
        
        if (retryInfo.readyState === 'loading' && !retryInfo.hasBody) {
          result.error = `Page not ready after retry: ${retryInfo.readyState}`;
          return result;
        }
        
        // Update pageInfo with retry results
        pageInfo.readyState = retryInfo.readyState;
        pageInfo.hasBody = retryInfo.hasBody;
        console.log(`Page state improved after retry: ${retryInfo.readyState}`);
      } catch (retryError) {
        // If retry fails, continue with original state but log warning
        console.warn('Page readyState retry failed, continuing with loading state:', (retryError as Error).message);
      }
    }

    if (!pageInfo.hasBody) {
      result.error = 'Page has no body element';
      return result;
    }

    result.isHealthy = true;
    return result;

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

/**
 * Check browser health
 */
export async function checkBrowserHealth(browser: Browser): Promise<boolean> {
  try {
    if (!browser.isConnected()) {
      return false;
    }

    const pages = await browser.pages();
    return pages.length > 0;
  } catch (error) {
    console.error('Browser health check failed:', error);
    return false;
  }
}

/**
 * Wait for page to become healthy with retries
 */
export async function waitForPageHealth(
  page: Page, 
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const health = await checkPageHealth(page);
    
    if (health.isHealthy) {
      return true;
    }

    console.log(`Page health check ${i + 1}/${maxRetries} failed: ${health.error}`);
    
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return false;
}

/**
 * Safe navigation with health checks
 */
export async function safeNavigate(
  page: Page, 
  url: string, 
  options: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2', timeout?: number } = {}
): Promise<boolean> {
  const { waitUntil = 'domcontentloaded', timeout = 30000 } = options;
  
  try {
    // Pre-navigation health check
    const preHealth = await checkPageHealth(page, { checkNavigation: false });
    if (!preHealth.isHealthy) {
      console.error('Pre-navigation health check failed:', preHealth.error);
      return false;
    }

    // Navigate
    const response = await page.goto(url, { waitUntil, timeout });
    
    if (!response) {
      console.error('Navigation returned no response');
      return false;
    }

    if (response.status() >= 400) {
      console.error(`Navigation failed with status ${response.status()}`);
      return false;
    }

    // Post-navigation health check
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief settle time
    const postHealth = await checkPageHealth(page);
    
    if (!postHealth.isHealthy) {
      console.error('Post-navigation health check failed:', postHealth.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Safe navigation failed:', error);
    return false;
  }
}

/**
 * Error categorization for better recovery strategies
 */
export interface ErrorCategory {
  type: 'browser_crash' | 'frame_detached' | 'connection_lost' | 'navigation_failed' | 'authentication_failed' | 'dom_protocol_error' | 'unknown';
  recoverable: boolean;
  retryable: boolean;
  description: string;
}

export function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  
  // Browser process crashes
  if (message.includes('session closed') || 
      message.includes('connection closed') ||
      message.includes('target closed') ||
      message.includes('protocol error')) {
    return {
      type: 'browser_crash',
      recoverable: true,
      retryable: true,
      description: 'Browser process crashed or connection lost'
    };
  }
  
  // DOM Protocol errors (new category for LinkedIn interaction issues)
  if (message.includes('protocol error') && 
      (message.includes('dom.describenode') || 
       message.includes('dom.resolvenode') ||
       message.includes('cannot find context with specified id') ||
       message.includes('node with given id does not belong to the document'))) {
    return {
      type: 'dom_protocol_error',
      recoverable: true,
      retryable: true,
      description: 'DOM element became detached during interaction - likely due to dynamic page updates'
    };
  }
  
  // Frame detachment and context destruction issues
  if (message.includes('detached frame') || 
      message.includes('frame') && message.includes('detached') ||
      message.includes('execution context was destroyed') ||
      message.includes('context was destroyed')) {
    return {
      type: 'frame_detached',
      recoverable: true,
      retryable: true,
      description: 'Page frame or execution context was destroyed during operation'
    };
  }
  
  // Connection and network issues (including LinkedIn blocking)
  if (message.includes('connection') || 
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('net::err_aborted') ||
      message.includes('err_aborted') ||
      message.includes('aborted') ||
      message.includes('net::err_blocked') ||
      message.includes('net::err_failed') ||
      message.includes('net::err_network_changed') ||
      message.includes('net::err_internet_disconnected')) {
    return {
      type: 'connection_lost',
      recoverable: true,
      retryable: true,
      description: 'Network or connection issues (possible LinkedIn blocking or rate limiting)'
    };
  }
  
  // Navigation failures
  if (message.includes('navigation') || 
      message.includes('about:blank') ||
      message.includes('redirect')) {
    return {
      type: 'navigation_failed',
      recoverable: true,
      retryable: false,
      description: 'Page navigation or redirect issues'
    };
  }
  
  // Authentication failures
  if (message.includes('authentication') || 
      message.includes('login') ||
      message.includes('cookies') ||
      message.includes('authwall')) {
    return {
      type: 'authentication_failed',
      recoverable: false,
      retryable: false,
      description: 'LinkedIn authentication or session issues'
    };
  }
  
  // Unknown errors
  return {
    type: 'unknown',
    recoverable: false,
    retryable: false,
    description: 'Unknown error type'
  };
}

/**
 * Safe element interaction with retry logic for DOM protocol errors
 */
export async function safeElementInteraction<T>(
  page: Page,
  selector: string,
  action: (element: any) => Promise<T>,
  options: { timeout?: number; retries?: number } = {}
): Promise<T> {
  const { timeout = 10000, retries = 3 } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Wait for element to be present
      const element = await page.waitForSelector(selector, { timeout });
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      
      // Verify element is still attached before interaction
      const isAttached = await element.evaluate(el => !!el.isConnected);
      if (!isAttached) {
        throw new Error(`Element is not attached to document: ${selector}`);
      }
      
      // Perform the action
      const result = await action(element);
      
      console.log(`Safe element interaction succeeded for ${selector} (attempt ${attempt})`);
      return result;
      
    } catch (error: any) {
      const isLastAttempt = attempt === retries;
      const isDOMProtocolError = error.message.toLowerCase().includes('protocol error') && 
                                (error.message.includes('DOM.') || 
                                 error.message.includes('cannot find context') ||
                                 error.message.includes('does not belong to the document'));
      
      if (isDOMProtocolError && !isLastAttempt) {
        console.warn(`DOM protocol error on attempt ${attempt}/${retries} for ${selector}, retrying...`);
        // Wait before retry to let page stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      if (isLastAttempt) {
        console.error(`Safe element interaction failed after ${retries} attempts for ${selector}:`, error.message);
        throw error;
      }
      
      // For other errors, wait a bit and retry
      console.warn(`Element interaction failed on attempt ${attempt}/${retries}:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Safe element interaction failed after all retries for ${selector}`);
}

/**
 * Verify page and element stability before interactions
 */
export async function verifyPageStability(
  page: Page,
  stabilityTimeMs: number = 2000
): Promise<boolean> {
  try {
    if (page.isClosed() || !page.browser().isConnected()) {
      return false;
    }
    
    // Check that URL is stable
    const initialUrl = page.url();
    await new Promise(resolve => setTimeout(resolve, stabilityTimeMs));
    const finalUrl = page.url();
    
    if (initialUrl !== finalUrl) {
      console.warn('Page URL changed during stability check:', { initialUrl, finalUrl });
      return false;
    }
    
    // Verify basic page structure is intact
    const pageStructure = await safeEvaluate(page, () => ({
      hasBody: !!document.body,
      readyState: document.readyState,
      title: document.title
    }));
    
    return (pageStructure as any).hasBody && (pageStructure as any).readyState === 'complete';
    
  } catch (error) {
    console.warn('Page stability check failed:', error);
    return false;
  }
}

/**
 * Generate human-like delay with natural variation
 */
// Activity patterns based on time of day and session state
export function getActivityPattern(): { isActiveHour: boolean; activityMultiplier: number } {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  
  // Avoid weekends (reduced activity)
  if (day === 0 || day === 6) {
    return { isActiveHour: false, activityMultiplier: 0.3 };
  }
  
  // Business hours (9 AM - 6 PM in user's timezone)
  if (hour >= 9 && hour <= 18) {
    return { isActiveHour: true, activityMultiplier: 1.0 };
  }
  
  // Early morning/evening (reduced activity)
  if ((hour >= 7 && hour < 9) || (hour > 18 && hour <= 20)) {
    return { isActiveHour: true, activityMultiplier: 0.6 };
  }
  
  // Night time (minimal activity)
  return { isActiveHour: false, activityMultiplier: 0.1 };
}

// Session state tracking for fatigue simulation
let sessionStartTime = Date.now();
let sessionActionCount = 0;

export function getSessionFatigue(): number {
  const sessionDuration = Date.now() - sessionStartTime;
  sessionActionCount++;
  
  // Increase delays as session progresses (fatigue effect)
  const durationHours = sessionDuration / (1000 * 60 * 60);
  const actionFatigue = Math.min(sessionActionCount / 20, 0.5); // Max 50% slowdown from actions
  const timeFatigue = Math.min(durationHours / 2, 0.3); // Max 30% slowdown from time
  
  return 1 + actionFatigue + timeFatigue; // 1.0 to 1.8x multiplier
}

export function resetSessionState(): void {
  sessionStartTime = Date.now();
  sessionActionCount = 0;
}

export function humanDelay(baseMs: number, variationPercent: number = 50): number {
  // Get activity pattern for current time
  const activityPattern = getActivityPattern();
  
  // Get session fatigue multiplier
  const fatigueMultiplier = getSessionFatigue();
  
  // Apply time-based and fatigue adjustments
  let adjustedBase = baseMs * activityPattern.activityMultiplier * fatigueMultiplier;
  
  // Add more variation during off-hours (less predictable)
  const variationAdjustment = activityPattern.isActiveHour ? variationPercent : variationPercent * 1.5;
  
  const variation = adjustedBase * (variationAdjustment / 100);
  const randomOffset = (Math.random() - 0.5) * 2 * variation;
  
  // Ensure minimum delay but allow longer delays during off-hours
  const minDelay = activityPattern.isActiveHour ? 100 : 200;
  const result = Math.max(minDelay, Math.floor(adjustedBase + randomOffset));
  
  return result;
}

/**
 * Simulate reading by scrolling and pausing like a human
 */
export async function simulateReading(page: Page): Promise<void> {
  try {
    // Get content length to adjust reading time
    const contentInfo = await page.evaluate(() => {
      const textContent = document.body?.textContent || '';
      const hasImages = document.querySelectorAll('img').length;
      const hasVideos = document.querySelectorAll('video').length;
      return {
        textLength: textContent.length,
        hasImages: hasImages > 0,
        hasVideos: hasVideos > 0,
        scrollHeight: document.documentElement.scrollHeight,
        viewHeight: window.innerHeight
      };
    });

    if (contentInfo.scrollHeight <= contentInfo.viewHeight) {
      // Page is short, just pause to "read"
      const readingTime = Math.max(2000, Math.min(contentInfo.textLength / 10, 8000));
      await new Promise(resolve => setTimeout(resolve, humanDelay(readingTime, 40)));
      return;
    }

    // Simulate reading by scrolling and pausing
    const scrollSteps = Math.floor(Math.random() * 3) + 2; // 2-4 scrolls
    let currentScroll = 0;
    
    for (let i = 0; i < scrollSteps; i++) {
      const scrollAmount = Math.floor(Math.random() * 400) + 200; // 200-600px
      currentScroll += scrollAmount;
      
      await page.evaluate((scrollPos) => {
        window.scrollTo({
          top: scrollPos,
          behavior: 'smooth'
        });
      }, currentScroll);
      
      // Content-aware reading pause
      let readingTime = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds base
      
      // Adjust based on content type
      if (contentInfo.hasImages || contentInfo.hasVideos) {
        readingTime *= 1.5; // Longer for visual content
      }
      
      // Apply activity pattern multiplier
      const activityPattern = getActivityPattern();
      readingTime *= activityPattern.activityMultiplier;
      
      await new Promise(resolve => setTimeout(resolve, readingTime));
    }
    
    // Occasional scroll back up (re-reading behavior)
    if (Math.random() < 0.3) {
      const backScroll = Math.floor(currentScroll * 0.3);
      await page.evaluate((scrollPos) => {
        window.scrollTo({
          top: scrollPos,
          behavior: 'smooth'
        });
      }, backScroll);
      
      await new Promise(resolve => setTimeout(resolve, humanDelay(1500, 50)));
    }
    
  } catch (error) {
    console.warn('Reading simulation failed:', error);
  }
}

/**
 * Enhanced human-like behavior simulation with reading and content awareness
 */
export async function simulateHumanBehavior(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      // Simulate focus events
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('focus'));
      
      // Advanced mouse movement patterns
      const mouseMove = (targetX?: number, targetY?: number) => {
        const x = targetX || Math.random() * window.innerWidth;
        const y = targetY || Math.random() * window.innerHeight;
        
        // Create more realistic mouse movement with slight curves
        const currentX = Math.random() * window.innerWidth;
        const currentY = Math.random() * window.innerHeight;
        
        // Simulate curved movement with intermediate points
        const steps = 3 + Math.floor(Math.random() * 3); // 3-5 steps
        for (let i = 0; i <= steps; i++) {
          setTimeout(() => {
            const progress = i / steps;
            const curveX = currentX + (x - currentX) * progress + (Math.random() - 0.5) * 20;
            const curveY = currentY + (y - currentY) * progress + (Math.random() - 0.5) * 20;
            
            const event = new MouseEvent('mousemove', {
              clientX: curveX,
              clientY: curveY,
              bubbles: true
            });
            document.dispatchEvent(event);
          }, i * (50 + Math.random() * 30));
        }
      };
      
      // Multiple realistic mouse movements
      setTimeout(() => mouseMove(), Math.random() * 300);
      setTimeout(() => mouseMove(), Math.random() * 800 + 500);
      setTimeout(() => mouseMove(), Math.random() * 1200 + 1000);
      
      // Simulate occasional hover over clickable elements
      setTimeout(() => {
        const clickableElements = document.querySelectorAll('button, a, [role="button"]');
        if (clickableElements.length > 0) {
          const element = clickableElements[Math.floor(Math.random() * clickableElements.length)];
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            mouseMove(rect.left + rect.width / 2, rect.top + rect.height / 2);
          }
        }
      }, Math.random() * 1500 + 500);
      
      // Simulate occasional window interactions
      const windowInteraction = () => {
        // Brief focus loss/regain (checking other tabs/windows)
        window.dispatchEvent(new Event('blur'));
        setTimeout(() => {
          window.dispatchEvent(new Event('focus'));
        }, Math.random() * 200 + 100);
      };
      
      // Occasional window interaction (10% chance)
      if (Math.random() < 0.1) {
        setTimeout(windowInteraction, Math.random() * 2000 + 1000);
      }
    });
    
    // Include reading simulation as part of human behavior
    await simulateReading(page);
    
  } catch (error) {
    console.warn('Human behavior simulation failed:', error);
  }
}

/**
 * Human-like typing simulation with mistakes, corrections, and natural patterns
 */
export async function humanTyping(page: Page, text: string, options: {
  element?: any;
  selector?: string;
  clearFirst?: boolean;
  careful?: boolean;
  burstMode?: boolean;
} = {}): Promise<void> {
  const { element, selector, clearFirst = false, careful = false, burstMode = false } = options;
  
  try {
    let targetElement = element;
    
    // Get the target element if not provided
    if (!targetElement && selector) {
      targetElement = await page.$(selector);
      if (!targetElement) {
        throw new Error(`Element not found: ${selector}`);
      }
    }
    
    // Focus the element if provided
    if (targetElement) {
      await targetElement.click();
      await new Promise(resolve => setTimeout(resolve, humanDelay(200, 30)));
      
      if (clearFirst) {
        await targetElement.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => {
          el.select();
        });
        await new Promise(resolve => setTimeout(resolve, humanDelay(100, 20)));
      }
    }
    
    // Typing patterns based on mode
    let baseTypingSpeed: number;
    let mistakeChance: number;
    let pauseChance: number;
    
    if (burstMode) {
      // Fast, confident typing
      baseTypingSpeed = 80;
      mistakeChance = 0.02; // 2% chance
      pauseChance = 0.05; // 5% chance of pauses
    } else if (careful) {
      // Slow, deliberate typing
      baseTypingSpeed = 150;
      mistakeChance = 0.01; // 1% chance
      pauseChance = 0.15; // 15% chance of pauses
    } else {
      // Normal typing
      baseTypingSpeed = 120;
      mistakeChance = 0.03; // 3% chance
      pauseChance = 0.08; // 8% chance of pauses
    }
    
    // Apply activity pattern to typing speed
    const activityPattern = getActivityPattern();
    baseTypingSpeed *= (2 - activityPattern.activityMultiplier); // Slower when tired
    
    // Type character by character with natural variations
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Thinking pause before certain characters (punctuation, start of words)
      if (char === ' ' || char === '.' || char === ',' || char === '!' || char === '?') {
        if (Math.random() < pauseChance) {
          const thinkingTime = humanDelay(300, 80); // 120-480ms thinking
          await new Promise(resolve => setTimeout(resolve, thinkingTime));
        }
      }
      
      // Typing mistake simulation
      if (Math.random() < mistakeChance && i > 0) {
        // Make a mistake - type wrong character
        const wrongChars = 'abcdefghijklmnopqrstuvwxyz';
        const wrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];
        
        if (targetElement) {
          await targetElement.type(wrongChar);
        } else {
          await page.keyboard.type(wrongChar);
        }
        
        // Pause as user notices mistake
        await new Promise(resolve => setTimeout(resolve, humanDelay(150, 50)));
        
        // Correct the mistake
        await page.keyboard.press('Backspace');
        await new Promise(resolve => setTimeout(resolve, humanDelay(80, 30)));
      }
      
      // Type the actual character
      if (targetElement) {
        await targetElement.type(char);
      } else {
        await page.keyboard.type(char);
      }
      
      // Variable typing speed with realistic patterns
      let typingDelay = baseTypingSpeed;
      
      // Faster for common letter combinations
      if (i > 0) {
        const combo = text.slice(i-1, i+1).toLowerCase();
        const fastCombos = ['th', 'he', 'in', 'er', 'an', 're', 'ed', 'nd', 'ou', 'ea'];
        if (fastCombos.includes(combo)) {
          typingDelay *= 0.7; // 30% faster
        }
      }
      
      // Slower for capital letters and numbers
      if (char >= 'A' && char <= 'Z' || char >= '0' && char <= '9') {
        typingDelay *= 1.3; // 30% slower
      }
      
      // Burst typing occasionally (2-5 characters quickly)
      if (burstMode && Math.random() < 0.1 && i < text.length - 3) {
        const burstLength = Math.floor(Math.random() * 3) + 2; // 2-4 chars
        for (let j = 1; j < burstLength && i + j < text.length; j++) {
          const nextChar = text[i + j];
          if (targetElement) {
            await targetElement.type(nextChar);
          } else {
            await page.keyboard.type(nextChar);
          }
          await new Promise(resolve => setTimeout(resolve, typingDelay * 0.4)); // Much faster
        }
        i += burstLength - 1; // Skip the chars we just typed
        continue;
      }
      
      // Apply humanized delay
      const finalDelay = humanDelay(typingDelay, 40);
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
    
    // Final pause after typing (user reviewing what they typed)
    const reviewTime = humanDelay(500, 60);
    await new Promise(resolve => setTimeout(resolve, reviewTime));
    
  } catch (error) {
    console.warn('Human typing simulation failed:', error);
    // Fallback to simple typing
    if (element) {
      await element.type(text, { delay: humanDelay(100, 50) });
    } else {
      await page.keyboard.type(text, { delay: humanDelay(100, 50) });
    }
  }
}

/**
 * LinkedIn-specific typing patterns for different contexts
 */
export async function linkedInTyping(page: Page, text: string, context: 'message' | 'note' | 'search' | 'comment', options: {
  element?: any;
  selector?: string;
} = {}): Promise<void> {
  let typingOptions: any = { ...options };
  
  switch (context) {
    case 'message':
      // Messages are usually more casual and faster
      typingOptions.burstMode = Math.random() < 0.3; // 30% chance of burst mode
      typingOptions.careful = false;
      break;
      
    case 'note':
      // Notes are more formal and careful
      typingOptions.careful = true;
      typingOptions.burstMode = false;
      break;
      
    case 'search':
      // Search is quick and efficient
      typingOptions.burstMode = Math.random() < 0.6; // 60% chance of burst mode
      typingOptions.careful = false;
      break;
      
    case 'comment':
      // Comments vary between careful and casual
      typingOptions.careful = Math.random() < 0.4; // 40% chance of careful mode
      typingOptions.burstMode = Math.random() < 0.2; // 20% chance of burst mode
      break;
  }
  
  await humanTyping(page, text, typingOptions);
}

/**
 * Wait for page DOM to stabilize using MutationObserver
 */
export async function waitForPageStability(page: Page, stabilityPeriod: number = 2000, timeout: number = 20000): Promise<boolean> {
  console.log(`Waiting for page to be stable for ${stabilityPeriod}ms...`);
  
  try {
    const result = await page.evaluate((stabilityMs, timeoutMs) => {
      return new Promise<boolean>((resolve) => {
        let lastChangeTime = Date.now();
        let timeoutId: NodeJS.Timeout;
        let observer: MutationObserver;
        let stabilityCheckId: NodeJS.Timeout;
        
        const cleanup = () => {
          if (observer) observer.disconnect();
          if (timeoutId) clearTimeout(timeoutId);
          if (stabilityCheckId) clearTimeout(stabilityCheckId);
        };
        
        const checkStability = () => {
          const now = Date.now();
          const timeSinceLastChange = now - lastChangeTime;
          
          if (timeSinceLastChange >= stabilityMs) {
            cleanup();
            resolve(true);
          } else {
            // Check again after remaining time
            const remainingTime = stabilityMs - timeSinceLastChange;
            stabilityCheckId = setTimeout(checkStability, remainingTime);
          }
        };
        
        // Set overall timeout
        timeoutId = setTimeout(() => {
          cleanup();
          resolve(false);
        }, timeoutMs);
        
        // Watch for DOM changes
        observer = new MutationObserver((mutations) => {
          // Filter out trivial changes (class changes, style changes)
          const significantChanges = mutations.filter(mutation => {
            if (mutation.type === 'childList') {
              return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
            }
            if (mutation.type === 'attributes') {
              // Only count certain attribute changes as significant
              const significantAttrs = ['data-control-name', 'aria-label', 'href', 'src'];
              return significantAttrs.includes(mutation.attributeName || '');
            }
            return false;
          });
          
          if (significantChanges.length > 0) {
            lastChangeTime = Date.now();
            
            // Reset stability check
            if (stabilityCheckId) clearTimeout(stabilityCheckId);
            stabilityCheckId = setTimeout(checkStability, stabilityMs);
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-control-name', 'aria-label', 'href', 'src']
        });
        
        // Start initial stability check
        stabilityCheckId = setTimeout(checkStability, stabilityMs);
      });
    }, stabilityPeriod, timeout);
    
    if (result) {
      console.log('✅ Page DOM is stable');
    } else {
      console.warn('⚠️ Page stability timeout - DOM may still be changing');
    }
    
    return result;
    
  } catch (error) {
    console.warn('Page stability check failed:', (error as Error).message);
    return false;
  }
}

/**
 * Enhanced LinkedIn page loading validation with comprehensive content detection
 */
export async function waitForLinkedInPageLoad(page: Page, expectedPageType: 'profile' | 'feed' | 'search' = 'profile', timeout: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  console.log(`Waiting for LinkedIn ${expectedPageType} page to load completely...`);
  
  // First wait for basic page readiness
  try {
    await page.waitForSelector('body', { timeout: 10000 });
  } catch (error) {
    console.warn('Body element timeout, continuing...');
  }
  
  // Then wait for page stability to prevent race conditions
  console.log('Checking for page stability...');
  const isStable = await waitForPageStability(page, 3000, 15000); // 3 second stability period
  if (!isStable) {
    console.warn('Page not fully stable, but proceeding with validation...');
  }
  
  while (Date.now() - startTime < timeout) {
    try {
      const pageState = await page.evaluate((pageType) => {
        // Check basic page structure
        const hasGlobalNav = !!document.querySelector('.global-nav');
        const hasMainContent = !!document.querySelector('main');
        const bodyClasses = document.body?.className || '';
        
        // Check for LinkedIn error states
        const hasErrorPage = !!document.querySelector('.error-page, .not-found-page');
        const hasLoginWall = !!document.querySelector('.auth-wall, .login-form');
        const hasRateLimitError = document.body.textContent?.includes('rate limit') || 
                                 document.body.textContent?.includes('too many requests');
        
        // Page-specific validations
        let pageSpecificCheck = false;
        let profileData = null;
        
        if (pageType === 'profile') {
          // Enhanced profile page detection with 2024/2025 LinkedIn DOM structure
          const profileHeaderSelectors = [
            // Current LinkedIn selectors (2024/2025)
            '.profile-topcard', '.profile-topcard-person-entity', 
            '.pv-top-card', '.pv-top-card-v2', '.pvs-header',
            // Modern layout selectors
            '.scaffold-layout-toolbar', '.profile-header',
            '[data-view-name="profile-topcard"]', '[data-view-name="profile-header"]',
            // Content-based fallbacks
            '.artdeco-card .profile', '.profile-photo-edit',
            // Generic profile containers
            'section[data-section="topcard"]', 'section[data-section="summary"]'
          ];
          
          const profileActionsSelectors = [
            // Current action button containers
            '.pv-s-profile-actions', '.pvs-profile-actions', '.profile-actions',
            '.profile-topcard-actions', '.profile-topcard__actions',
            // Modern layout actions
            '.scaffold-layout-toolbar__actions', '.profile-header-actions',
            '[data-view-name="profile-actions"]', '[data-control-name="hero_cta_container"]',
            // Button containers
            '.artdeco-card .profile-actions', '.profile-topcard .actions',
            // Generic containers with buttons
            'div:has(button[aria-label*="Connect"])', 'div:has(button[aria-label*="Message"])',
            'div:has(button[aria-label*="Vernetzen"])', 'div:has(button[aria-label*="Nachricht"])'
          ];
          
          const profileNameSelectors = [
            // Current name selectors
            '.text-heading-xlarge', '.pv-text-details__left-panel h1', '.top-card-layout__title',
            // Modern selectors
            '.profile-topcard__title', '.profile-topcard-person-entity__name',
            '.scaffold-layout-toolbar h1', '.profile-header h1',
            // Fallback patterns
            '[data-view-name="profile-topcard"] h1', 'h1.profile-name',
            // Content-based patterns
            'h1[class*="heading"]', 'h1[class*="title"]', 'h1[class*="name"]'
          ];
          
          // Try multiple selectors for better detection
          let profileHeader = null;
          let profileActions = null;
          let profileName = '';
          
          // Find profile header with multiple strategies
          for (const selector of profileHeaderSelectors) {
            profileHeader = document.querySelector(selector);
            if (profileHeader) break;
          }
          
          // Find profile actions with multiple strategies  
          for (const selector of profileActionsSelectors) {
            profileActions = document.querySelector(selector);
            if (profileActions) break;
          }
          
          // Find profile name with multiple strategies
          for (const selector of profileNameSelectors) {
            const nameElement = document.querySelector(selector);
            if (nameElement?.textContent?.trim()) {
              profileName = nameElement.textContent.trim();
              break;
            }
          }
          
          // Additional content-based validation
          const hasConnectButton = !!document.querySelector('button[aria-label*="Connect"], button[aria-label*="Vernetzen"]');
          const hasMessageButton = !!document.querySelector('button[aria-label*="Message"], button[aria-label*="Nachricht"]');
          const hasProfileContent = !!document.querySelector('[data-section], .profile-section, .pvs-list');
          
          // More flexible page validation - if we have profile content OR action buttons, consider it valid
          const hasProfileStructure = !!(profileHeader || profileActions || hasConnectButton || hasMessageButton);
          const hasProfileData = !!(profileName || hasProfileContent);
          
          pageSpecificCheck = hasProfileStructure && hasProfileData;
          profileData = {
            hasProfileHeader: !!profileHeader,
            hasProfileActions: !!profileActions,
            profileName: profileName || '',
            buttonsFound: document.querySelectorAll('button').length,
            hasConnectButton,
            hasMessageButton,
            hasProfileContent,
            detectionStrategy: profileHeader ? 'header' : profileActions ? 'actions' : hasConnectButton ? 'connect-button' : 'fallback'
          };
        } else if (pageType === 'feed') {
          // Feed page specific checks
          pageSpecificCheck = !!document.querySelector('.feed-container, .scaffold-layout__content');
        }
        
        // JavaScript execution check
        const jsWorking = typeof window.navigator !== 'undefined' && 
                         typeof document.querySelector !== 'undefined';
        
        // Network connectivity check
        const hasNetworkContent = document.querySelectorAll('img[src*="media.licdn"], img[src*="static.licdn"]').length > 0;
        
        return {
          hasGlobalNav,
          hasMainContent,
          hasErrorPage,
          hasLoginWall,
          hasRateLimitError,
          pageSpecificCheck,
          profileData,
          jsWorking,
          hasNetworkContent,
          bodyClasses,
          totalElements: document.querySelectorAll('*').length,
          totalButtons: document.querySelectorAll('button').length,
          readyState: document.readyState,
          currentUrl: window.location.href,
          timestamp: Date.now()
        };
      }, expectedPageType);
      
      // Log detailed page state for debugging
      console.log('LinkedIn page state:', {
        readyState: pageState.readyState,
        totalElements: pageState.totalElements,
        totalButtons: pageState.totalButtons,
        hasGlobalNav: pageState.hasGlobalNav,
        hasMainContent: pageState.hasMainContent,
        pageSpecificCheck: pageState.pageSpecificCheck,
        jsWorking: pageState.jsWorking,
        hasNetworkContent: pageState.hasNetworkContent
      });
      
      if (pageState.profileData) {
        console.log('Profile page data:', pageState.profileData);
      }
      
      // Check for error conditions first
      if (pageState.hasErrorPage) {
        throw new Error('LinkedIn error page detected');
      }
      
      if (pageState.hasLoginWall) {
        throw new Error('LinkedIn login wall detected - authentication failed');
      }
      
      if (pageState.hasRateLimitError) {
        throw new Error('LinkedIn rate limit detected');
      }
      
      // Check for successful page load
      const isLoaded = pageState.hasGlobalNav && 
                      pageState.hasMainContent && 
                      pageState.pageSpecificCheck && 
                      pageState.jsWorking &&
                      pageState.totalElements > 100 && // Minimum DOM complexity
                      pageState.totalButtons > 0; // At least some buttons
      
      if (isLoaded) {
        console.log(`✅ LinkedIn ${expectedPageType} page loaded successfully`);
        return true;
      }
      
      // If not loaded yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.warn('Page loading check failed:', (error as Error).message);
      throw error;
    }
  }
  
  console.warn(`⚠️ LinkedIn ${expectedPageType} page loading timeout after ${timeout}ms`);
  return false;
}

/**
 * Multi-strategy profile validation with comprehensive fallback approaches
 */
export async function validateProfilePage(page: Page): Promise<{ isValid: boolean; strategy: string; confidence: number; details: any }> {
  console.log('Running multi-strategy profile validation...');
  
  try {
    const validation = await page.evaluate(() => {
      const strategies = [];
      
      // Strategy 1: CSS Selector Based Detection
      const cssValidation = () => {
        const profileSelectors = [
          '.profile-topcard', '.pv-top-card', '.pvs-header',
          '.scaffold-layout-toolbar', '.profile-header'
        ];
        const actionSelectors = [
          '.pv-s-profile-actions', '.pvs-profile-actions',
          '.profile-topcard-actions', '.scaffold-layout-toolbar__actions'
        ];
        
        let profileSection = null;
        let actionSection = null;
        
        for (const selector of profileSelectors) {
          profileSection = document.querySelector(selector);
          if (profileSection) break;
        }
        
        for (const selector of actionSelectors) {
          actionSection = document.querySelector(selector);
          if (actionSection) break;
        }
        
        return {
          strategy: 'css-selectors',
          valid: !!(profileSection && actionSection),
          confidence: profileSection && actionSection ? 0.9 : profileSection ? 0.6 : 0.1,
          details: { hasProfile: !!profileSection, hasActions: !!actionSection }
        };
      };
      
      // Strategy 2: Content-Based Detection
      const contentValidation = () => {
        const nameSelectors = [
          'h1', '[class*="heading"]', '[class*="title"]', '[class*="name"]'
        ];
        const headlineSelectors = [
          '[class*="headline"]', '[class*="subtitle"]', '.pv-shared-text-with-see-more'
        ];
        
        let profileName = '';
        let headline = '';
        
        for (const selector of nameSelectors) {
          const element = document.querySelector(selector);
          const text = element?.textContent?.trim() || '';
          if (text && text.length > 2 && text.length < 100) {
            profileName = text;
            break;
          }
        }
        
        for (const selector of headlineSelectors) {
          const element = document.querySelector(selector);
          const text = element?.textContent?.trim() || '';
          if (text && text.length > 10) {
            headline = text;
            break;
          }
        }
        
        return {
          strategy: 'content-based',
          valid: !!(profileName && headline),
          confidence: profileName && headline ? 0.8 : profileName ? 0.5 : 0.1,
          details: { profileName, headline }
        };
      };
      
      // Strategy 3: Button-Based Detection
      const buttonValidation = () => {
        const connectButtons = document.querySelectorAll('button[aria-label*="Connect"], button[aria-label*="Vernetzen"]');
        const messageButtons = document.querySelectorAll('button[aria-label*="Message"], button[aria-label*="Nachricht"]');
        const pendingButtons = document.querySelectorAll('button[aria-label*="Pending"], button[aria-label*="Ausstehend"]');
        
        const totalActionButtons = connectButtons.length + messageButtons.length + pendingButtons.length;
        const hasProfileActions = totalActionButtons > 0;
        
        return {
          strategy: 'button-based',
          valid: hasProfileActions,
          confidence: hasProfileActions ? 0.7 : 0.1,
          details: { 
            connectButtons: connectButtons.length, 
            messageButtons: messageButtons.length,
            pendingButtons: pendingButtons.length
          }
        };
      };
      
      // Strategy 4: URL Pattern + Basic Structure
      const urlValidation = () => {
        const isProfileURL = window.location.pathname.includes('/in/');
        const hasBasicStructure = !!document.querySelector('main') && document.querySelectorAll('button').length > 5;
        const hasLinkedInAssets = document.querySelectorAll('[src*="licdn"], [href*="licdn"]').length > 10;
        
        return {
          strategy: 'url-structure',
          valid: isProfileURL && hasBasicStructure && hasLinkedInAssets,
          confidence: isProfileURL && hasBasicStructure ? 0.6 : 0.2,
          details: { isProfileURL, hasBasicStructure, hasLinkedInAssets }
        };
      };
      
      // Run all strategies
      strategies.push(cssValidation());
      strategies.push(contentValidation());
      strategies.push(buttonValidation());
      strategies.push(urlValidation());
      
      // Find best strategy
      const validStrategies = strategies.filter(s => s.valid);
      const bestStrategy = strategies.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
      return {
        strategies,
        bestStrategy,
        overallValid: validStrategies.length >= 2 || bestStrategy.confidence >= 0.7,
        confidence: Math.max(...strategies.map(s => s.confidence)),
        validCount: validStrategies.length
      };
    });
    
    console.log('Profile validation results:', {
      isValid: validation.overallValid,
      strategy: validation.bestStrategy.strategy,
      confidence: validation.confidence,
      validStrategies: validation.validCount
    });
    
    return {
      isValid: validation.overallValid,
      strategy: validation.bestStrategy.strategy,
      confidence: validation.confidence,
      details: validation
    };
    
  } catch (error) {
    console.error('Profile validation failed:', (error as Error).message);
    return {
      isValid: false,
      strategy: 'error',
      confidence: 0,
      details: { error: (error as Error).message }
    };
  }
}

/**
 * Enhanced profile page readiness detection with German language support
 */
export async function waitForProfilePageReady(page: Page, timeout: number = 25000): Promise<boolean> {
  console.log('Waiting for LinkedIn profile page to be fully ready...');
  
  try {
    // First ensure basic page loading
    const pageLoaded = await waitForLinkedInPageLoad(page, 'profile', timeout);
    if (!pageLoaded) {
      return false;
    }
    
    // Additional profile-specific readiness checks
    const isReady = await page.evaluate(() => {
      // Wait for profile actions to be fully loaded
      const profileActions = document.querySelector('.pv-s-profile-actions, .pvs-profile-actions, .profile-actions');
      if (!profileActions) return false;
      
      // Check for Connect/Message buttons (English and German)
      const connectButton = document.querySelector('button[aria-label*="Connect"], button[aria-label*="Vernetzen"]');
      const messageButton = document.querySelector('button[aria-label*="Message"], button[aria-label*="Nachricht"]');
      const pendingButton = document.querySelector('button[aria-label*="Pending"], button[aria-label*="Ausstehend"]');
      
      const hasActionButton = !!(connectButton || messageButton || pendingButton);
      
      // Check for profile content loading
      const profileContent = document.querySelector('.pv-profile-section, .pvs-list, .profile-section');
      
      // Check for any LinkedIn loading indicators
      const hasLoadingIndicator = !!document.querySelector('.loader, .loading, [aria-label*="Loading"]');
      
      return hasActionButton && !!profileContent && !hasLoadingIndicator;
    });
    
    if (isReady) {
      console.log('✅ Profile page is fully ready for interaction');
      return true;
    } else {
      console.warn('⚠️ Profile page loaded but not fully ready for interaction');
      return false;
    }
    
  } catch (error) {
    console.error('Profile page readiness check failed:', (error as Error).message);
    return false;
  }
}

/**
 * Enhanced page analysis with comprehensive DOM structure logging
 */
export async function analyzePageStructure(page: Page): Promise<any> {
  try {
    const analysis = await page.evaluate(() => {
      // Basic page info
      const pageInfo = {
        url: window.location.href,
        title: document.title,
        readyState: document.readyState,
        totalElements: document.querySelectorAll('*').length,
        bodyClasses: document.body?.className || ''
      };
      
      // Button analysis with more detail
      const allButtons = Array.from(document.querySelectorAll('button'));
      const buttonAnalysis = {
        totalButtons: allButtons.length,
        buttonDetails: allButtons.slice(0, 15).map(btn => ({
          text: btn.textContent?.trim().substring(0, 100) || '',
          ariaLabel: btn.getAttribute('aria-label') || '',
          className: btn.className,
          dataControlName: btn.getAttribute('data-control-name') || '',
          dataTestId: btn.getAttribute('data-test-id') || '',
          disabled: btn.disabled,
          visible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
          id: btn.id || ''
        })),
        connectButtons: allButtons.filter(btn => 
          btn.textContent?.toLowerCase().includes('connect') ||
          btn.textContent?.toLowerCase().includes('vernetzen') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('connect') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('vernetzen')
        ).length,
        messageButtons: allButtons.filter(btn => 
          btn.textContent?.toLowerCase().includes('message') ||
          btn.textContent?.toLowerCase().includes('nachricht') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('message') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('nachricht')
        ).length
      };
      
      // LinkedIn-specific structure analysis
      const linkedinStructure = {
        hasGlobalNav: !!document.querySelector('.global-nav'),
        hasProfileHeader: !!document.querySelector('.pv-top-card, .pvs-header, .profile-topcard'),
        hasProfileActions: !!document.querySelector('.pv-s-profile-actions, .pvs-profile-actions, .profile-actions'),
        hasMainContent: !!document.querySelector('main'),
        profileName: document.querySelector('.text-heading-xlarge, .pv-text-details__left-panel h1, .top-card-layout__title')?.textContent?.trim() || '',
        hasErrorIndicators: !!(
          document.querySelector('.error-page, .not-found-page') ||
          document.body.textContent?.includes('rate limit') ||
          document.body.textContent?.includes('too many requests') ||
          document.querySelector('.auth-wall, .login-form')
        )
      };
      
      // JavaScript and network status
      const technicalStatus = {
        jsErrors: (window as any).jsErrors || [],
        hasImages: document.querySelectorAll('img').length,
        hasLinkedInAssets: document.querySelectorAll('img[src*="licdn"], script[src*="licdn"], link[href*="licdn"]').length,
        networkTimestamp: Date.now()
      };
      
      return {
        pageInfo,
        buttonAnalysis,
        linkedinStructure,
        technicalStatus,
        timestamp: Date.now()
      };
    });
    
    console.log('📊 Page structure analysis:', JSON.stringify(analysis, null, 2));
    return analysis;
    
  } catch (error) {
    console.error('Page analysis failed:', (error as Error).message);
    return null;
  }
}

/**
 * Cleanup user data directory with modern fs.rm and retry logic
 */
export async function cleanupUserDataDir(userDataDir: string): Promise<void> {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { rm } = await import('fs/promises');
      await rm(userDataDir, { 
        recursive: true, 
        force: true,
        maxRetries: 3,
        retryDelay: 100
      });
      console.log(`Cleaned up user data directory: ${userDataDir}`);
      return;
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, consider it cleaned
        console.log(`User data directory already cleaned: ${userDataDir}`);
        return;
      }
      
      if (error.code === 'ENOTEMPTY' || error.code === 'EBUSY') {
        if (isLastAttempt) {
          console.error(`Failed to cleanup user data directory ${userDataDir} after ${maxRetries} attempts:`, error);
          
          // Try force cleanup as last resort
          try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            console.log(`Attempting force cleanup of ${userDataDir}`);
            await execAsync(`rm -rf "${userDataDir}"`, { timeout: 5000 });
            console.log(`Force cleanup successful: ${userDataDir}`);
            return;
          } catch (forceError) {
            console.error(`Force cleanup also failed:`, forceError);
          }
        } else {
          console.warn(`Cleanup attempt ${attempt} failed (${error.code}), retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } else {
        // Other errors, log and exit
        console.error(`Failed to cleanup user data directory ${userDataDir}:`, error);
        return;
      }
    }
  }
}

/**
 * Enhanced button discovery with dynamic content waiting
 */
export async function waitForButtonWithMultipleSelectors(
  page: Page,
  selectors: string | string[],
  options: {
    timeout?: number;
    pollInterval?: number;
    visible?: boolean;
    enabled?: boolean;
  } = {}
): Promise<any> {
  const {
    timeout = 15000,
    pollInterval = 500,
    visible = true,
    enabled = true
  } = options;

  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
  const startTime = Date.now();

  console.log(`Waiting for button with ${selectorArray.length} selector patterns...`);

  while (Date.now() - startTime < timeout) {
    try {
      // Check page health before each attempt
      if (page.isClosed() || !page.browser().isConnected()) {
        throw new Error('Page or browser disconnected during button search');
      }

      // Try each selector pattern
      for (const selector of selectorArray) {
        try {
          // Skip XPath selectors for now (Puppeteer limitation)
          if (selector.startsWith('//')) {
            continue;
          }

          const elements = await page.$$(selector);
          
          for (const element of elements) {
            // Check if element is visible (if required)
            if (visible) {
              const isVisible = await element.evaluate((el: Element) => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.visibility !== 'hidden' &&
                  style.display !== 'none' &&
                  style.opacity !== '0'
                );
              });
              
              if (!isVisible) continue;
            }

            // Check if element is enabled (if required)
            if (enabled) {
              const isEnabled = await element.evaluate((el: Element) => {
                return !(el as HTMLButtonElement).disabled;
              });
              
              if (!isEnabled) continue;
            }

            // Get element text for debugging
            const elementText = await element.evaluate((el: Element) => el.textContent?.trim() || '');
            const elementTag = await element.evaluate((el: Element) => el.tagName);
            const elementClasses = await element.evaluate((el: Element) => el.className);

            console.log(`Found button: ${elementTag}.${elementClasses} - "${elementText}" with selector: ${selector}`);
            return element;
          }
        } catch (selectorError: any) {
          // Continue to next selector if this one fails
          continue;
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error: any) {
      if (error.message.includes('detached') || error.message.includes('closed')) {
        throw error;
      }
      // Continue polling for other errors
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Button not found after ${timeout}ms with any of ${selectorArray.length} selectors`);
}

/**
 * Enhanced page readiness check for LinkedIn pages
 */
export async function waitForLinkedInPageReady(
  page: Page,
  pageType: 'profile' | 'feed' | 'general' = 'general',
  timeout: number = 20000
): Promise<boolean> {
  console.log(`Waiting for LinkedIn ${pageType} page to be ready...`);
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const readiness = await safeEvaluate(page, () => {
        // Basic readiness checks
        const basicChecks = {
          documentReady: document.readyState === 'complete',
          hasLinkedInClass: document.body?.classList.contains('linkedin') || 
                           document.documentElement?.classList.contains('linkedin'),
          hasGlobalNav: !!document.querySelector('nav.global-nav, [data-test-global-nav]'),
          hasMainContent: !!document.querySelector('main'),
          noLoadingSpinners: !document.querySelector('.loader, .loading, [data-test-loader]')
        };

        // Page-specific checks
        let specificChecks = {};
        
        if (window.location.pathname.includes('/in/')) {
          // Profile page specific checks
          specificChecks = {
            hasProfileSection: !!document.querySelector('.pv-top-card, .pvs-header, .profile-photo-edit'),
            hasActionsSection: !!document.querySelector('.pv-s-profile-actions, .pvs-profile-actions, .profile-actions')
          };
        } else if (window.location.pathname.includes('/feed')) {
          // Feed page specific checks  
          specificChecks = {
            hasFeedContainer: !!document.querySelector('.feed-container-theme, .scaffold-finite-scroll')
          };
        }

        return { ...basicChecks, ...specificChecks };
      }) || {};

      // Check if most readiness criteria are met
      const readinessValues = Object.values(readiness);
      const readyCount = readinessValues.filter(Boolean).length;
      const totalChecks = readinessValues.length;
      
      if (readyCount >= Math.ceil(totalChecks * 0.7)) { // 70% of checks pass
        console.log(`LinkedIn page ready: ${readyCount}/${totalChecks} checks passed`);
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      if (error.message.includes('detached') || error.message.includes('closed')) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.warn(`LinkedIn page readiness timeout after ${timeout}ms`);
  return false;
}