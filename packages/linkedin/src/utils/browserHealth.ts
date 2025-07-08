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
 * Recovery function for stuck BIGPIPE rendering with scroll triggers and reload
 */
export async function recoverFromBigpipeStuck(page: Page, maxWaitTime: number = 10000): Promise<boolean> {
  console.log('Attempting to recover from stuck BIGPIPE rendering...');
  
  const startTime = Date.now();
  
  try {
    // Try scrolling to trigger lazy loading
    console.log('Triggering scroll to activate lazy loading...');
    await page.evaluate(() => {
      window.scrollTo(0, 100);
      setTimeout(() => window.scrollTo(0, 200), 500);
      setTimeout(() => window.scrollTo(0, 0), 1000);
    });
    
    // Wait for scroll effects
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if BIGPIPE completed after scroll
    const state = await safeEvaluate(page, () => ({
      hasBigpipe: document.body?.className?.includes('render-mode-BIGPIPE') || false,
      readyState: document.readyState,
      elementCount: document.querySelectorAll('*').length,
      buttonCount: document.querySelectorAll('button').length
    }), 3000);
    
    if (state && typeof state === 'object' && 'hasBigpipe' in state && !state.hasBigpipe) {
      console.log('✅ BIGPIPE completed after scroll trigger');
      return true;
    }
    
    if (state && typeof state === 'object' && 'elementCount' in state && 'buttonCount' in state && 
        typeof state.elementCount === 'number' && typeof state.buttonCount === 'number' &&
        state.elementCount > 400 && state.buttonCount > 5) {
      console.log('✅ Page has sufficient content despite BIGPIPE - proceeding');
      return true;
    }
    
    // Try page reload as last resort if we have time
    if (Date.now() - startTime < maxWaitTime - 5000) {
      console.warn('Attempting page reload to recover from BIGPIPE stuck...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if reload helped
      const postReloadState = await safeEvaluate(page, () => ({
        hasBigpipe: document.body?.className?.includes('render-mode-BIGPIPE') || false,
        elementCount: document.querySelectorAll('*').length
      }), 2000);
      
      if (postReloadState && typeof postReloadState === 'object' && 
          ('hasBigpipe' in postReloadState && !postReloadState.hasBigpipe || 
           ('elementCount' in postReloadState && typeof postReloadState.elementCount === 'number' && postReloadState.elementCount > 300))) {
        console.log('✅ Page reload resolved BIGPIPE issue');
        return true;
      }
    }
    
  } catch (error) {
    console.error('BIGPIPE recovery failed:', (error as Error).message);
  }
  
  return false;
}

/**
 * Monitor page stability and detect degradation (BIGPIPE stuck, element loss)
 * DEPRECATED: Use lightweight checks instead to prevent context destruction
 */
export async function monitorPageStability(
  page: Page, 
  options: { 
    maxDegradationChecks?: number, 
    degradationThreshold?: number,
    checkInterval?: number 
  } = {}
): Promise<{ isStable: boolean, degradationDetected: boolean, elementCount: number }> {
  const { maxDegradationChecks = 3, degradationThreshold = 0.5, checkInterval = 2000 } = options;
  
  let initialElementCount = 0;
  let lastElementCount = 0;
  
  try {
    // Get baseline element count
    const baseline = await safeEvaluate(page, () => ({
      totalElements: document.querySelectorAll('*').length,
      totalButtons: document.querySelectorAll('button').length,
      isBigpipeStuck: document.body?.classList.contains('render-mode-BIGPIPE') && 
                     document.readyState === 'loading'
    }));
    
    if (!baseline || typeof baseline !== 'object') {
      return { isStable: false, degradationDetected: true, elementCount: 0 };
    }
    
    initialElementCount = (baseline as any).totalElements || 0;
    lastElementCount = initialElementCount;
    
    console.log(`📊 Page stability baseline: ${initialElementCount} elements, BIGPIPE stuck: ${(baseline as any).isBigpipeStuck}`);
    
    // Monitor for degradation over time
    for (let check = 0; check < maxDegradationChecks; check++) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      const current = await safeEvaluate(page, () => ({
        totalElements: document.querySelectorAll('*').length,
        totalButtons: document.querySelectorAll('button').length,
        readyState: document.readyState,
        isBigpipeStuck: document.body?.classList.contains('render-mode-BIGPIPE') && 
                       document.readyState === 'loading',
        hasGlobalNav: !!document.querySelector('.global-nav'),
        hasMainContent: !!document.querySelector('main, #main')
      }));
      
      if (!current || typeof current !== 'object') {
        console.warn(`⚠️ Page stability check ${check + 1} failed - page may be degrading`);
        return { isStable: false, degradationDetected: true, elementCount: lastElementCount };
      }
      
      const currentCount = (current as any).totalElements || 0;
      const degradationRatio = currentCount / initialElementCount;
      
      console.log(`📊 Stability check ${check + 1}: ${currentCount} elements (${Math.round(degradationRatio * 100)}% of baseline)`);
      
      // Detect significant degradation
      if (degradationRatio < degradationThreshold) {
        console.error(`❌ Page degradation detected: ${currentCount}/${initialElementCount} elements (${Math.round(degradationRatio * 100)}%)`);
        return { isStable: false, degradationDetected: true, elementCount: currentCount };
      }
      
      // Detect BIGPIPE stuck state
      if ((current as any).isBigpipeStuck) {
        console.warn(`⚠️ BIGPIPE stuck detected on check ${check + 1}`);
      }
      
      lastElementCount = currentCount;
    }
    
    console.log(`✅ Page stability confirmed: ${lastElementCount} elements maintained`);
    return { isStable: true, degradationDetected: false, elementCount: lastElementCount };
    
  } catch (error) {
    console.error('Page stability monitoring failed:', error);
    return { isStable: false, degradationDetected: true, elementCount: lastElementCount };
  }
}

/**
 * Context recovery wrapper for critical operations
 */
export async function withContextRecovery<T>(
  page: Page,
  operation: () => Promise<T>,
  fallback?: T
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (error.message.includes('Execution context was destroyed') ||
        error.message.includes('Target closed') ||
        error.message.includes('Session closed') ||
        error.message.includes('Connection closed') ||
        error.message.includes('detached Frame')) {
      console.warn('Context destroyed, returning fallback:', error.message);
      if (fallback !== undefined) return fallback;
      throw new Error('Page context lost - navigation required');
    }
    throw error;
  }
}

/**
 * Safe page evaluation that handles frame detachment
 */
export async function safeEvaluate<T>(
  page: Page, 
  pageFunction: () => T, 
  timeoutMs: number = 10000
): Promise<T | {}> {
  return await withContextRecovery(page, async () => {
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
  }, {} as T);
}

/**
 * Aggressive memory cleanup for faster execution and reduced footprint
 */
export async function optimizeMemoryUsage(page: Page): Promise<void> {
  try {
    // Clear all caches and storage
    await safeClearStorage(page);
    
    // Aggressive JavaScript garbage collection
    await safeEvaluate(page, () => {
      // Force garbage collection if available
      if ((window as any).gc) {
        (window as any).gc();
      }
      
      // Clear DOM caches
      const clearableElements = document.querySelectorAll('[style*="background-image"], img[src^="data:"]');
      clearableElements.forEach(el => {
        if (el instanceof HTMLElement) {
          el.style.backgroundImage = '';
        }
        if (el instanceof HTMLImageElement && el.src.startsWith('data:')) {
          el.src = '';
        }
      });
      
      // Clear any event listeners that might be holding references
      return true;
    });
    
    console.log('✅ Memory optimization completed');
  } catch (error) {
    console.warn('Memory optimization failed:', error);
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
  
  // Reduced minimum delays for faster execution
  const minDelay = activityPattern.isActiveHour ? 50 : 100; // Reduced from 100/200 to 50/100
  const result = Math.max(minDelay, Math.floor(adjustedBase + randomOffset));
  
  return result;
}

/**
 * Enhanced human delay with exponential variation for bot detection evasion
 */
export function smartHumanDelay(baseMs: number, context: 'fast' | 'normal' | 'careful' = 'normal'): number {
  const contextMultipliers = {
    fast: 0.3,    // 30% of base time for degraded pages
    normal: 1.0,  // Normal timing
    careful: 1.8  // 180% for sensitive operations
  };
  
  const multiplier = contextMultipliers[context];
  const exponentialVariation = Math.random() ** 2; // Bias toward faster times
  const adjustedBase = baseMs * multiplier;
  const finalDelay = Math.round(adjustedBase * (0.5 + exponentialVariation));
  
  return Math.max(25, finalDelay); // Ultra-fast minimum for speed
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
 * Wait for page DOM to stabilize using safer polling approach
 */
export async function waitForPageStability(page: Page, stabilityPeriod: number = 1000, timeout: number = 10000): Promise<boolean> {
  console.log(`Checking page stability with ${stabilityPeriod}ms checks over ${timeout}ms...`);
  
  const startTime = Date.now();
  let lastElementCount = 0;
  let lastButtonCount = 0;
  let stableChecksPassed = 0;
  const checksNeeded = Math.max(2, Math.floor(stabilityPeriod / 500)); // At least 2 checks
  
  try {
    while (Date.now() - startTime < timeout) {
      // Quick, safe evaluation with timeout protection
      const currentState = await Promise.race([
        safeEvaluate(page, () => {
          const elements = document.querySelectorAll('*').length;
          const buttons = document.querySelectorAll('button').length;
          const readyState = document.readyState;
          const hasErrors = !!document.querySelector('.error-page, .not-found-page');
          
          return {
            elementCount: elements,
            buttonCount: buttons,
            readyState,
            hasErrors,
            bodyClasses: document.body?.className || ''
          };
        }, 2000), // 2 second max evaluation time
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Stability check timeout')), 3000)
        )
      ]);
      
      if (!currentState || typeof currentState !== 'object') {
        console.warn('⚠️ Page state evaluation failed, considering unstable');
        return false;
      }
      
      // Check for errors first
      if (currentState.hasErrors) {
        console.warn('⚠️ Error page detected during stability check');
        return false;
      }
      
      // Check for BIGPIPE completion (LinkedIn-specific)
      const isBigpipeComplete = !currentState.bodyClasses.includes('render-mode-BIGPIPE');
      
      // Compare with previous state
      const isStableNow = (
        currentState.readyState === 'complete' && 
        currentState.elementCount > 100 && // Minimum content threshold
        currentState.buttonCount > 0 && // Must have buttons
        Math.abs(currentState.elementCount - lastElementCount) <= 5 && // Small changes ok
        Math.abs(currentState.buttonCount - lastButtonCount) <= 2 && // Button changes minimal
        isBigpipeComplete // LinkedIn BIGPIPE done
      );
      
      if (isStableNow) {
        stableChecksPassed++;
        console.log(`✓ Stability check ${stableChecksPassed}/${checksNeeded} passed (${currentState.elementCount} elements, ${currentState.buttonCount} buttons)`);
        
        if (stableChecksPassed >= checksNeeded) {
          console.log('✅ Page is stable - multiple consecutive checks passed');
          return true;
        }
      } else {
        // Reset stability counter if page changed significantly
        if (stableChecksPassed > 0) {
          console.log(`⚠️ Page changed - resetting stability (elements: ${lastElementCount}→${currentState.elementCount}, buttons: ${lastButtonCount}→${currentState.buttonCount})`);
        }
        stableChecksPassed = 0;
      }
      
      lastElementCount = currentState.elementCount;
      lastButtonCount = currentState.buttonCount;
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.warn('⚠️ Page stability timeout - DOM may still be changing');
    return false;
    
  } catch (error) {
    console.warn('Page stability check failed:', (error as Error).message);
    return false;
  }
}

/**
 * Simplified LinkedIn page loading validation - faster and more reliable
 */
export async function waitForLinkedInPageLoad(page: Page, expectedPageType: 'profile' | 'feed' | 'search' = 'profile', timeout: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  console.log(`Waiting for LinkedIn ${expectedPageType} page to load...`);
  
  // Quick cookie check
  try {
    const cookies = await page.cookies();
    if (!cookies.some(c => c.name === 'li_at')) {
      console.error('❌ li_at cookie not found');
      return false;
    }
    console.log('✅ LinkedIn authentication cookie found');
  } catch (error) {
    console.warn('Cookie check failed:', (error as Error).message);
  }

  // Enhanced wait strategy with proper LinkedIn readiness detection
  try {
    // Wait for body element
    await page.waitForSelector('body', { timeout: 5000 });
    
    // Wait for initial page structure
    await page.waitForFunction(() => {
      return document.readyState === 'complete' && 
             document.querySelectorAll('*').length > 100;
    }, { timeout: 5000 });
    
    // Wait for LinkedIn-specific elements to be ready
    await page.waitForFunction(() => {
      // Check for LinkedIn global navigation
      const hasGlobalNav = !!document.querySelector('.global-nav, .navigation-wrapper, [data-view-name="global-nav"]');
      
      // Check for main content area
      const hasMainContent = !!document.querySelector('main, .main-content, [role="main"]');
      
      // Check for basic button elements
      const hasButtons = document.querySelectorAll('button').length > 0;
      
      // Check that BIGPIPE rendering is complete (if present)
      const bigpipeComplete = !document.body?.className?.includes('render-mode-BIGPIPE');
      
      return hasGlobalNav && hasMainContent && hasButtons && bigpipeComplete;
    }, { timeout: 8000 });
    
    // Profile-specific readiness checks
    if (expectedPageType === 'profile') {
      await page.waitForFunction(() => {
        // Wait for profile-specific elements
        const hasProfileActions = !!document.querySelector('.pv-s-profile-actions, .pvs-profile-actions, .profile-actions');
        const hasProfileContent = !!document.querySelector('.pv-profile-section, .pvs-list, .profile-section');
        
        // Check for profile header/photo area
        const hasProfileHeader = !!document.querySelector('.pv-top-card, .pvs-header, .profile-header');
        
        return hasProfileActions || hasProfileContent || hasProfileHeader;
      }, { timeout: 5000 });
    }
    
    // Quick validation of current URL
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      console.error('❌ Redirected to login/authwall');
      return false;
    }
    
    // Check for error pages
    const hasErrorPage = await safeEvaluate(page, () => {
      return !!(document.querySelector('.error-page, .not-found-page') ||
                document.body?.textContent?.includes('This LinkedIn profile doesn\'t exist') ||
                document.body?.textContent?.includes('Page not found'));
    }, 2000);
    
    if (hasErrorPage) {
      console.error('❌ LinkedIn error page detected');
      return false;
    }
    
    console.log('✅ LinkedIn page loaded successfully');
    return true;
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.warn(`Page load timeout after ${elapsed}ms - checking if page is usable`);
    
    // Final check - can we at least detect basic page structure?
    const basicCheck = await safeEvaluate(page, () => {
      return {
        elementCount: document.querySelectorAll('*').length,
        buttonCount: document.querySelectorAll('button').length,
        hasLinkedInContent: !!document.querySelector('.global-nav, .navigation-wrapper, [data-view-name]'),
        readyState: document.readyState
      };
    }, 3000);
    
    if (basicCheck && typeof basicCheck === 'object' && 
        'elementCount' in basicCheck && typeof basicCheck.elementCount === 'number' &&
        'buttonCount' in basicCheck && typeof basicCheck.buttonCount === 'number' &&
        'hasLinkedInContent' in basicCheck) {
      
      const isUsable = basicCheck.elementCount > 200 && basicCheck.buttonCount > 0 && basicCheck.hasLinkedInContent;
      console.log(`Page usability check: ${isUsable ? 'PASS' : 'FAIL'} (${basicCheck.elementCount} elements, ${basicCheck.buttonCount} buttons)`);
      return isUsable;
    }
    
    console.warn('Page load validation failed - proceeding with degraded expectations');
    return true; // Proceed but with lower expectations
  }
}

/**
 * Lightweight profile validation - no complex DOM queries
 */
export async function validateProfilePage(page: Page): Promise<{ isValid: boolean; strategy: string; confidence: number; details: any }> {
  console.log('Running lightweight profile validation...');
  
  try {
    // Single, fast evaluation
    const result = await Promise.race([
      page.evaluate(() => {
        const url = window.location.href;
        const hasButtons = document.querySelectorAll('button').length > 0;
        const elementCount = document.querySelectorAll('*').length;
        
        return {
          isProfileUrl: url.includes('/in/'),
          hasButtons,
          elementCount,
          hasError: !!document.querySelector('.error-page, .not-found-page')
        };
      }),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Validation timeout')), 2000)
      )
    ]);
    
    if (!result || result.hasError) {
      return { isValid: false, strategy: 'quick', confidence: 0, details: result };
    }
    
    const confidence = result.isProfileUrl && result.hasButtons ? 0.8 : 0.3;
    
    return {
      isValid: result.isProfileUrl && result.hasButtons && result.elementCount > 100,
      strategy: 'simplified',
      confidence,
      details: result
    };
    
  } catch (error) {
    console.warn('Profile validation failed:', (error as Error).message);
    return { isValid: true, strategy: 'fallback', confidence: 0.5, details: {} };
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
      
      // Enhanced LinkedIn-specific structure analysis (2025)
      const profileHeaderSelectors = [
        '.pv-top-card', '.pvs-header', '.profile-topcard', // Legacy
        '[data-view-name="profile-topcard"]', '.artdeco-card.pv-top-card',
        '.profile-photo-edit__edit-btn', '.pv-text-details__left-panel',
        '.mt2.relative', '[data-test-id="profile-top-card"]',
        'section[aria-label*="profile"]', '.profile-topcard-basic-info__name'
      ];
      
      const profileActionsSelectors = [
        '.pv-s-profile-actions', '.pvs-profile-actions', '.profile-actions', // Legacy
        '[data-view-name="profile-actions"]', '.pv-top-card__member-action-bar',
        '.artdeco-button-group', '.pv-profile-section__actions',
        '[data-test-id="profile-actions"]', '.profile-topcard__connections'
      ];
      
      // Test each selector and track which ones work
      let foundHeaderSelector = '';
      let foundActionsSelector = '';
      
      for (const selector of profileHeaderSelectors) {
        if (document.querySelector(selector)) {
          foundHeaderSelector = selector;
          break;
        }
      }
      
      for (const selector of profileActionsSelectors) {
        if (document.querySelector(selector)) {
          foundActionsSelector = selector;
          break;
        }
      }
      
      const linkedinStructure = {
        hasGlobalNav: !!document.querySelector('.global-nav'),
        hasProfileHeader: !!foundHeaderSelector,
        hasProfileActions: !!foundActionsSelector,
        hasMainContent: !!document.querySelector('main'),
        profileName: document.querySelector('.text-heading-xlarge, .pv-text-details__left-panel h1, .top-card-layout__title')?.textContent?.trim() || '',
        hasErrorIndicators: !!(
          document.querySelector('.error-page, .not-found-page') ||
          document.body.textContent?.includes('rate limit') ||
          document.body.textContent?.includes('too many requests') ||
          document.querySelector('.auth-wall, .login-form')
        ),
        
        // Enhanced bot detection monitoring
        hasRateLimitError: !!(
          document.querySelector('[data-test-id="rate-limit-error"]') ||
          document.body?.textContent?.includes('You\'ve reached the weekly invitation limit') ||
          document.body?.textContent?.includes('too many requests') ||
          document.body?.textContent?.includes('rate limit')
        ),
        hasCaptcha: !!document.querySelector('iframe[src*="captcha"]'),
        isMinimalPage: document.querySelectorAll('*').length < 200, // LinkedIn serves minimal pages to bots
        isBigpipeStuck: document.body?.className?.includes('render-mode-BIGPIPE') || false,
        hasEmberApp: document.body?.classList.contains('ember-application') || false,
        
        // Page quality assessment
        pageQuality: (() => {
          const elementCount = document.querySelectorAll('*').length;
          if (elementCount < 200) return 'minimal';
          if (elementCount < 500) return 'degraded';
          if (elementCount > 800) return 'full';
          return 'partial';
        })(),
        
        // Enhanced debugging info
        foundHeaderSelector,
        foundActionsSelector,
        hasProfilePhoto: !!document.querySelector('.profile-photo-edit, .pv-top-card-profile-picture'),
        hasProfileUrn: !!document.querySelector('[data-urn*="profile"]'),
        pageType: window.location.pathname.includes('/in/') ? 'profile' : 'other',
        hasArtdecoButtons: document.querySelectorAll('.artdeco-button').length,
        hasDataViewElements: document.querySelectorAll('[data-view-name]').length,
        
        // Authentication and redirect monitoring
        isAuthWall: window.location.href.includes('/authwall') || window.location.href.includes('/login'),
        currentUrl: window.location.href,
        pageTitle: document.title
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

/**
 * Analyzes DOM structure to find button patterns and create debugging info
 */
export async function analyzeLinkedInButtonStructure(page: Page): Promise<{
  buttons: Array<{
    text: string;
    ariaLabel: string;
    className: string;
    dataAttributes: Record<string, string>;
    selector: string;
    isVisible: boolean;
  }>;
  suggestions: string[];
  screenshot?: string;
}> {
  try {
    console.log('🔍 Analyzing LinkedIn button structure...');
    
    // First, get basic page state using safeEvaluate with timeout
    const pageState = await safeEvaluate(page, () => {
      return {
        buttonCount: document.querySelectorAll('button').length,
        isLinkedIn: window.location.hostname.includes('linkedin.com'),
        readyState: document.readyState,
        hasProfileActions: !!document.querySelector('.pv-s-profile-actions, .pvs-profile-actions, .profile-actions')
      };
    }, 3000);
    
    if (!pageState || typeof pageState !== 'object') {
      console.warn('Failed to get page state, skipping DOM analysis');
      return {
        buttons: [],
        suggestions: ['Failed to get page state - execution context may be unstable'],
        screenshot: undefined
      };
    }
    
    console.log(`📊 Page state: ${(pageState as any).buttonCount} buttons, ready: ${(pageState as any).readyState}`);
    
    // Get button analysis in smaller chunks to prevent context destruction
    const buttonAnalysis = await safeEvaluate(page, () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      
      // Process buttons in smaller batches to avoid large evaluation
      return buttons.slice(0, 20).map(button => { // Limit to first 20 buttons
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        const isVisible = rect.width > 0 && rect.height > 0 && 
                          style.display !== 'none' && 
                          style.visibility !== 'hidden' &&
                          style.opacity !== '0';
        
        const text = button.textContent?.trim() || '';
        const ariaLabel = button.getAttribute('aria-label') || '';
        const className = button.className || '';
        
        // Get only essential data attributes to reduce payload
        const dataAttributes: Record<string, string> = {};
        const essentialAttrs = ['data-control-name', 'data-view-name', 'data-test-id'];
        for (const attrName of essentialAttrs) {
          const value = button.getAttribute(attrName);
          if (value) dataAttributes[attrName] = value;
        }
        
        // Generate a simple selector
        let selector = 'button';
        if (button.id) selector += `#${button.id}`;
        if (ariaLabel) selector += `[aria-label*="${ariaLabel.slice(0, 50)}"]`;
        
        return {
          text: text.slice(0, 100), // Limit text length
          ariaLabel: ariaLabel.slice(0, 100), // Limit aria-label length
          className: className.slice(0, 200), // Limit class length
          dataAttributes,
          selector: selector.slice(0, 200), // Limit selector length
          isVisible
        };
      });
    }, 5000);
    
    if (!buttonAnalysis || !Array.isArray(buttonAnalysis)) {
      console.warn('Button analysis failed, using fallback');
      return {
        buttons: [],
        suggestions: ['Button analysis failed - DOM may be unstable'],
        screenshot: undefined
      };
    }
    
    // Generate selector suggestions based on found buttons
    const suggestions = [];
    
    // Look for Connect-like buttons
    const connectButtons = buttonAnalysis.filter(btn => 
      btn.isVisible && (
        btn.text.toLowerCase().includes('connect') || 
        btn.text.toLowerCase().includes('vernetzen') ||
        btn.ariaLabel.toLowerCase().includes('connect') ||
        btn.ariaLabel.toLowerCase().includes('vernetzen')
      )
    );
    
    if (connectButtons.length > 0) {
      suggestions.push(`✅ Found ${connectButtons.length} Connect-like buttons`);
      connectButtons.forEach(btn => {
        suggestions.push(`   Connect: "${btn.text}" | aria-label: "${btn.ariaLabel}"`);
      });
    } else {
      suggestions.push(`❌ No Connect buttons found`);
    }
    
    // Look for Message-like buttons
    const messageButtons = buttonAnalysis.filter(btn => 
      btn.isVisible && (
        btn.text.toLowerCase().includes('message') || 
        btn.text.toLowerCase().includes('nachricht') ||
        btn.ariaLabel.toLowerCase().includes('message') ||
        btn.ariaLabel.toLowerCase().includes('nachricht')
      )
    );
    
    if (messageButtons.length > 0) {
      suggestions.push(`✅ Found ${messageButtons.length} Message-like buttons`);
      messageButtons.forEach(btn => {
        suggestions.push(`   Message: "${btn.text}" | aria-label: "${btn.ariaLabel}"`);
      });
    } else {
      suggestions.push(`❌ No Message buttons found`);
    }
    
    // Look for other profile action buttons
    const profileButtons = buttonAnalysis.filter(btn => 
      btn.isVisible && (
        btn.text.toLowerCase().includes('follow') || 
        btn.text.toLowerCase().includes('more') ||
        btn.ariaLabel.toLowerCase().includes('follow') ||
        btn.ariaLabel.toLowerCase().includes('more')
      )
    );
    
    if (profileButtons.length > 0) {
      suggestions.push(`✅ Found ${profileButtons.length} other profile action buttons`);
      profileButtons.forEach(btn => {
        suggestions.push(`   Other: "${btn.text}" | aria-label: "${btn.ariaLabel}"`);
      });
    }
    
    // Add summary statistics
    const visibleButtons = buttonAnalysis.filter(btn => btn.isVisible);
    suggestions.unshift(`📊 Total buttons: ${buttonAnalysis.length} (${visibleButtons.length} visible)`);
    
    console.log(`📊 Button analysis complete: ${buttonAnalysis.length} buttons found (${visibleButtons.length} visible)`);
    
    // Optional small screenshot for debugging (only if needed)
    let screenshot: string | undefined;
    try {
      if (buttonAnalysis.length > 0) {
        screenshot = await page.screenshot({ 
          encoding: 'base64',
          clip: { x: 0, y: 0, width: 800, height: 600 }, // Smaller screenshot
          quality: 50 // Lower quality to reduce memory
        });
      }
    } catch (screenshotError) {
      console.warn('Screenshot capture failed:', screenshotError);
      screenshot = undefined;
    }
    
    return {
      buttons: buttonAnalysis,
      suggestions,
      screenshot
    };
    
  } catch (error) {
    console.error('Failed to analyze button structure:', error);
    return {
      buttons: [],
      suggestions: ['Failed to analyze DOM structure'],
      screenshot: undefined
    };
  }
}

/**
 * Progressive button detection with comprehensive fallback strategies
 */
export async function findLinkedInButton(
  page: Page, 
  buttonType: 'connect' | 'message' | 'send' | 'note',
  timeout: number = 15000
): Promise<{
  element: any;
  strategy: string;
  confidence: number;
  selector: string;
} | null> {
  const startTime = Date.now();
  
  console.log(`🔍 Progressive search for ${buttonType} button (timeout: ${timeout}ms)`);
  
  // First, check DOM stability before button detection
  const domStable = await checkDOMStability(page);
  if (!domStable) {
    console.warn('⚠️ DOM appears unstable, proceeding with caution');
  }
  
  // Phase 2: Better page loading wait - LinkedIn needs more time to fully load
  console.log('⏳ Waiting for LinkedIn page to fully load...');
  try {
    let retryCount = 0;
    const maxRetries = 10;
    
    while (retryCount < maxRetries) {
      const loadingState = await safeEvaluate(page, () => {
        const elementCount = document.querySelectorAll('*').length;
        const buttonCount = document.querySelectorAll('button, [role="button"]').length;
        const hasLinkedInStructure = !!document.querySelector('.global-nav, .navigation-wrapper, [data-view-name]');
        const bigpipeComplete = !document.body?.className?.includes('render-mode-BIGPIPE');
        const hasProfileArea = !!document.querySelector('.pv-top-card, .pvs-header, .profile-header, .pv-s-profile-actions');
        
        return {
          elementCount,
          buttonCount,
          hasLinkedInStructure,
          bigpipeComplete,
          hasProfileArea,
          readyState: document.readyState
        };
      }, 3000);
      
      if (loadingState && typeof loadingState === 'object' && 
          'elementCount' in loadingState && typeof loadingState.elementCount === 'number' &&
          'buttonCount' in loadingState && typeof loadingState.buttonCount === 'number' &&
          loadingState.elementCount > 200 && loadingState.buttonCount > 0) {
        console.log(`✅ LinkedIn page loaded: ${loadingState.elementCount} elements, ${loadingState.buttonCount} buttons`);
        break;
      }
      
      console.log(`⏳ Page still loading (attempt ${retryCount + 1}/${maxRetries}), waiting 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      retryCount++;
    }
    
    if (retryCount >= maxRetries) {
      console.warn('⚠️ LinkedIn page load timeout, proceeding anyway');
    }
  } catch (loadError) {
    console.warn('⚠️ Page load check failed:', loadError);
  }
  
  // Scroll profile card into view to ensure buttons are visible
  console.log('📍 Scrolling profile card into view...');
  try {
    await safeEvaluate(page, () => {
      // Find profile card or main content area
      const profileCard = document.querySelector('.pv-top-card, .pvs-profile-actions, .profile-actions, .pv-s-profile-actions, .pv-top-card-v2-ctas');
      if (profileCard) {
        profileCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('✅ Profile card scrolled into view');
      } else {
        // Fallback: scroll to top of page
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log('✅ Scrolled to top of page as fallback');
      }
    }, 3000);
    
    // Wait for scroll to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (scrollError) {
    console.warn('⚠️ Scroll into view failed:', scrollError);
  }
  
  const strategies = [
    {
      name: 'modern-2025-selectors',
      confidence: 0.9,
      selectors: getModernSelectors(buttonType)
    },
    {
      name: 'legacy-2024-selectors', 
      confidence: 0.8,
      selectors: getLegacySelectors(buttonType)
    },
    {
      name: 'text-based-detection',
      confidence: 0.7,
      selectors: getTextBasedSelectors(buttonType)
    },
    {
      name: 'fuzzy-matching',
      confidence: 0.6,
      selectors: getFuzzySelectors(buttonType)
    }
  ];
  
  for (const strategy of strategies) {
    if (Date.now() - startTime > timeout) {
      console.log(`⏰ Timeout reached for ${buttonType} button search`);
      break;
    }
    
    console.log(`🔍 Trying strategy: ${strategy.name}`);
    
    // Check page state before each strategy
    const pageState = await safeEvaluate(page, () => {
      return {
        isLinkedIn: window.location.hostname.includes('linkedin.com'),
        hasButtons: document.querySelectorAll('button').length > 0,
        isAuthWall: window.location.href.includes('/authwall') || window.location.href.includes('/login'),
        hasProfileActions: !!document.querySelector('.pv-s-profile-actions, .pvs-profile-actions, .profile-actions'),
        readyState: document.readyState
      };
    }, 2000);
    
    if (!pageState || typeof pageState !== 'object') {
      console.warn(`⚠️ Page state check failed for strategy ${strategy.name}`);
      continue;
    }
    
    if ('isAuthWall' in pageState && pageState.isAuthWall) {
      console.error('❌ Detected auth wall, stopping button search');
      break;
    }
    
    if ('hasButtons' in pageState && !pageState.hasButtons) {
      console.warn('⚠️ No buttons found on page, continuing to next strategy');
      continue;
    }
    
    try {
      for (const selector of strategy.selectors) {
        try {
          let element = null;
          
          // Handle XPath selectors (start with //)
          if (selector.startsWith('//')) {
            const elements = await (page as any).$x(selector);
            if (elements.length > 0) {
              element = elements[0];
            }
          } else {
            // Handle CSS selectors
            element = await page.waitForSelector(selector, { 
              timeout: 1500, // Increased slightly for stability
              visible: true 
            });
          }
          
          if (element) {
            // Enhanced element validation
            const elementValidation = await validateElement(element, page);
            if (elementValidation.isValid) {
              console.log(`✅ Found ${buttonType} button using ${strategy.name}: ${selector}`);
              console.log(`   Element validation: ${elementValidation.reason}`);
              return {
                element,
                strategy: strategy.name,
                confidence: strategy.confidence,
                selector
              };
            } else {
              console.warn(`⚠️ Element found but validation failed: ${elementValidation.reason}`);
            }
          }
        } catch (selectorError) {
          // Continue to next selector silently
          continue;
        }
      }
      
      // Add small delay between strategies with DOM stability check
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.warn(`Strategy ${strategy.name} failed:`, error);
      continue;
    }
  }
  
  // Phase 2: Text-based fallback - iterate over all elements for text matching
  console.log(`🔍 Trying text-based fallback for ${buttonType} button...`);
  try {
    const textBasedResult = await findButtonByTextContent(page, buttonType);
    if (textBasedResult) {
      console.log(`✅ Found ${buttonType} button using text-based fallback`);
      return {
        element: textBasedResult.element,
        strategy: 'text-based-fallback',
        confidence: 0.5,
        selector: textBasedResult.selector
      };
    }
  } catch (textError) {
    console.warn(`⚠️ Text-based fallback failed:`, textError);
  }
  
  // Phase 2: LinkedIn overflow menu detection - click "More" actions
  console.log(`🔍 Trying LinkedIn overflow menu for ${buttonType} button...`);
  try {
    const overflowResult = await findButtonInOverflowMenu(page, buttonType);
    if (overflowResult) {
      console.log(`✅ Found ${buttonType} button in overflow menu`);
      return {
        element: overflowResult.element,
        strategy: 'overflow-menu',
        confidence: 0.4,
        selector: overflowResult.selector
      };
    }
  } catch (overflowError) {
    console.warn(`⚠️ Overflow menu detection failed:`, overflowError);
  }
  
  // Phase 2: Screenshot persistence for debugging
  console.log(`📸 Capturing screenshot for debugging...`);
  try {
    await captureFailureScreenshot(page, buttonType);
  } catch (screenshotError) {
    console.warn(`⚠️ Screenshot capture failed:`, screenshotError);
  }
  
  console.log(`❌ No ${buttonType} button found after ${Date.now() - startTime}ms`);
  return null;
}

/**
 * Check DOM stability before button detection
 */
async function checkDOMStability(page: Page): Promise<boolean> {
  try {
    const stabilityCheck = await safeEvaluate(page, () => {
      const elementCount = document.querySelectorAll('*').length;
      const buttonCount = document.querySelectorAll('button').length;
      const hasLinkedInStructure = !!document.querySelector('.global-nav, .navigation-wrapper, [data-view-name]');
      const bigpipeComplete = !document.body?.className?.includes('render-mode-BIGPIPE');
      const hasProfileArea = !!document.querySelector('.pv-top-card, .pvs-header, .profile-header, .pv-s-profile-actions');
      
      return {
        elementCount,
        buttonCount,
        hasLinkedInStructure,
        bigpipeComplete,
        hasProfileArea,
        readyState: document.readyState
      };
    }, 3000);
    
    if (!stabilityCheck || typeof stabilityCheck !== 'object') {
      return false;
    }
    
    const {
      elementCount,
      buttonCount,
      hasLinkedInStructure,
      bigpipeComplete,
      hasProfileArea,
      readyState
    } = stabilityCheck as any;
    
    const isStable = elementCount > 200 && 
                     buttonCount > 0 && 
                     hasLinkedInStructure &&
                     bigpipeComplete &&
                     readyState === 'complete';
    
    console.log(`🔍 DOM stability: ${isStable ? 'STABLE' : 'UNSTABLE'} (${elementCount} elements, ${buttonCount} buttons)`);
    return isStable;
    
  } catch (error) {
    console.warn('DOM stability check failed:', error);
    return false;
  }
}

/**
 * Validate element before clicking
 */
async function validateElement(element: any, page: Page): Promise<{ isValid: boolean; reason: string }> {
  try {
    // Check if element is still attached to DOM
    const isAttached = await element.isIntersectingViewport();
    if (!isAttached) {
      return { isValid: false, reason: 'Element not in viewport' };
    }
    
    // Check element properties
    const elementInfo = await element.evaluate((el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      return {
        isVisible: rect.width > 0 && rect.height > 0 && 
                   style.display !== 'none' && 
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0',
        isClickable: !(el as HTMLButtonElement).disabled && style.pointerEvents !== 'none',
        tagName: el.tagName.toLowerCase(),
        ariaLabel: el.getAttribute('aria-label') || '',
        textContent: el.textContent?.trim() || ''
      };
    });
    
    if (!elementInfo.isVisible) {
      return { isValid: false, reason: 'Element not visible' };
    }
    
    if (!elementInfo.isClickable) {
      return { isValid: false, reason: 'Element not clickable' };
    }
    
    if (elementInfo.tagName !== 'button') {
      return { isValid: false, reason: 'Element is not a button' };
    }
    
    return { isValid: true, reason: `Valid button: "${elementInfo.ariaLabel || elementInfo.textContent}"` };
    
  } catch (error) {
    return { isValid: false, reason: `Validation error: ${error}` };
  }
}

function getModernSelectors(buttonType: string): string[] {
  switch (buttonType) {
    case 'connect':
      return [
        'button[aria-label*="Connect"]',
        'button[aria-label*="Vernetzen"]',
        'button[data-view-name*="connect"]',
        'button[data-control-name="connect"]',
        'button[data-control-name="contact_see_more"]',
        '.artdeco-button--primary[aria-label*="Connect"]',
        '.pvs-profile-actions button[aria-label*="Connect"]',
        '[data-view-name="profile-actions"] button[aria-label*="Connect"]',
        '.pv-s-profile-actions button[aria-label*="Connect"]',
        '.profile-actions button[aria-label*="Connect"]',
        'div[role="button"][aria-label*="Connect"]',
        'div[role="button"][aria-label*="Vernetzen"]',
        'span[role="button"][aria-label*="Connect"]',
        'span[role="button"][aria-label*="Vernetzen"]'
      ];
    case 'message':
      return [
        'button[aria-label*="Message"]',
        'button[aria-label*="Nachricht"]',
        'button[data-control-name="message"]',
        '.pvs-profile-actions button[aria-label*="Message"]',
        '[data-view-name="profile-actions"] button[aria-label*="Message"]',
        '.pv-s-profile-actions button[aria-label*="Message"]',
        '.profile-actions button[aria-label*="Message"]',
        'div[role="button"][aria-label*="Message"]',
        'div[role="button"][aria-label*="Nachricht"]',
        'span[role="button"][aria-label*="Message"]',
        'span[role="button"][aria-label*="Nachricht"]'
      ];
    case 'send':
      return [
        'button[aria-label*="Send invite"]',
        'button[aria-label*="Einladung senden"]',
        'button[data-control-name="send.invite"]',
        'button[data-control-name="send"]',
        '.send-invite__actions button[aria-label*="Send"]',
        '.artdeco-modal__actionbar button[aria-label*="Send"]',
        'div[role="button"][aria-label*="Send invite"]',
        'div[role="button"][aria-label*="Einladung senden"]',
        'span[role="button"][aria-label*="Send invite"]',
        'span[role="button"][aria-label*="Einladung senden"]'
      ];
    case 'note':
      return [
        'button[aria-label*="Add a note"]',
        'button[aria-label*="Notiz"]',
        'button[data-control-name="add-note"]',
        '.send-invite__add-note-button',
        '.artdeco-modal button[aria-label*="Add a note"]',
        'div[role="button"][aria-label*="Add a note"]',
        'div[role="button"][aria-label*="Notiz"]',
        'span[role="button"][aria-label*="Add a note"]',
        'span[role="button"][aria-label*="Notiz"]'
      ];
    default:
      return [];
  }
}

function getLegacySelectors(buttonType: string): string[] {
  switch (buttonType) {
    case 'connect':
      return [
        'button[aria-label="Connect"]',
        'button[aria-label="Vernetzen"]',
        '.pv-s-profile-actions button[aria-label*="Connect"]',
        '.profile-actions button[aria-label*="Connect"]',
        '.pv-top-card__member-action-bar button[aria-label*="Connect"]',
        '.pv-top-card-v2-ctas button[aria-label*="Connect"]',
        'div[role="button"][aria-label="Connect"]',
        'div[role="button"][aria-label="Vernetzen"]',
        'span[role="button"][aria-label="Connect"]',
        'span[role="button"][aria-label="Vernetzen"]'
      ];
    case 'message':
      return [
        'button[aria-label="Message"]',
        'button[aria-label="Nachricht"]',
        '.pv-s-profile-actions button[aria-label*="Message"]',
        '.profile-actions button[aria-label*="Message"]',
        '.pv-top-card__member-action-bar button[aria-label*="Message"]',
        'div[role="button"][aria-label="Message"]',
        'div[role="button"][aria-label="Nachricht"]',
        'span[role="button"][aria-label="Message"]',
        'span[role="button"][aria-label="Nachricht"]'
      ];
    case 'send':
      return [
        'button[aria-label="Send invite"]',
        'button[aria-label="Einladung senden"]',
        '.send-invite__actions button[aria-label*="Send"]',
        '.artdeco-modal__actionbar button',
        'div[role="button"][aria-label="Send invite"]',
        'div[role="button"][aria-label="Einladung senden"]',
        'span[role="button"][aria-label="Send invite"]',
        'span[role="button"][aria-label="Einladung senden"]'
      ];
    case 'note':
      return [
        'button[aria-label="Add a note"]',
        'button[aria-label="Notiz"]',
        '.send-invite__add-note-button',
        '.artdeco-modal button[aria-label*="note"]',
        'div[role="button"][aria-label="Add a note"]',
        'div[role="button"][aria-label="Notiz"]',
        'span[role="button"][aria-label="Add a note"]',
        'span[role="button"][aria-label="Notiz"]'
      ];
    default:
      return [];
  }
}

function getTextBasedSelectors(buttonType: string): string[] {
  // Return XPath selectors that work in Puppeteer for text-based button detection
  switch (buttonType) {
    case 'connect':
      return [
        '//button[contains(text(), "Connect")]',
        '//button[contains(text(), "Vernetzen")]',
        '//button[.//span[contains(text(), "Connect")]]',
        '//button[.//span[contains(text(), "Vernetzen")]]',
        '//button[@type="button" and contains(text(), "Connect")]',
        '//button[@type="button" and contains(text(), "Vernetzen")]',
        '//div[@role="button" and contains(text(), "Connect")]',
        '//div[@role="button" and contains(text(), "Vernetzen")]',
        '//span[@role="button" and contains(text(), "Connect")]',
        '//span[@role="button" and contains(text(), "Vernetzen")]'
      ];
    case 'message':
      return [
        '//button[contains(text(), "Message")]',
        '//button[contains(text(), "Nachricht")]',
        '//button[.//span[contains(text(), "Message")]]',
        '//button[.//span[contains(text(), "Nachricht")]]',
        '//button[@type="button" and contains(text(), "Message")]',
        '//button[@type="button" and contains(text(), "Nachricht")]',
        '//div[@role="button" and contains(text(), "Message")]',
        '//div[@role="button" and contains(text(), "Nachricht")]',
        '//span[@role="button" and contains(text(), "Message")]',
        '//span[@role="button" and contains(text(), "Nachricht")]'
      ];
    case 'send':
      return [
        '//button[contains(text(), "Send")]',
        '//button[contains(text(), "Senden")]',
        '//button[.//span[contains(text(), "Send")]]',
        '//button[.//span[contains(text(), "Senden")]]',
        '//button[@type="button" and contains(text(), "Send")]',
        '//button[@type="button" and contains(text(), "Senden")]',
        '//div[@role="button" and contains(text(), "Send")]',
        '//div[@role="button" and contains(text(), "Senden")]',
        '//span[@role="button" and contains(text(), "Send")]',
        '//span[@role="button" and contains(text(), "Senden")]'
      ];
    case 'note':
      return [
        '//button[contains(text(), "Add a note")]',
        '//button[contains(text(), "Notiz")]',
        '//button[.//span[contains(text(), "Add a note")]]',
        '//button[.//span[contains(text(), "Notiz")]]',
        '//button[@type="button" and contains(text(), "note")]',
        '//button[@type="button" and contains(text(), "Notiz")]',
        '//div[@role="button" and contains(text(), "Add a note")]',
        '//div[@role="button" and contains(text(), "Notiz")]',
        '//span[@role="button" and contains(text(), "Add a note")]',
        '//span[@role="button" and contains(text(), "Notiz")]'
      ];
    default:
      return [];
  }
}

function getFuzzySelectors(buttonType: string): string[] {
  switch (buttonType) {
    case 'connect':
      return [
        'button[aria-label*="connect" i]',
        'button[aria-label*="vernetzen" i]',
        'button[title*="connect" i]',
        'button[title*="vernetzen" i]',
        'button[data-control-name*="connect" i]',
        'button[class*="connect" i]',
        'div[role="button"][aria-label*="connect" i]',
        'div[role="button"][aria-label*="vernetzen" i]',
        'div[role="button"][title*="connect" i]',
        'div[role="button"][title*="vernetzen" i]',
        'span[role="button"][aria-label*="connect" i]',
        'span[role="button"][aria-label*="vernetzen" i]'
      ];
    case 'message':
      return [
        'button[aria-label*="message" i]',
        'button[aria-label*="nachricht" i]',
        'button[title*="message" i]',
        'button[title*="nachricht" i]',
        'button[data-control-name*="message" i]',
        'button[class*="message" i]',
        'div[role="button"][aria-label*="message" i]',
        'div[role="button"][aria-label*="nachricht" i]',
        'div[role="button"][title*="message" i]',
        'div[role="button"][title*="nachricht" i]',
        'span[role="button"][aria-label*="message" i]',
        'span[role="button"][aria-label*="nachricht" i]'
      ];
    case 'send':
      return [
        'button[aria-label*="send" i]',
        'button[aria-label*="senden" i]',
        'button[title*="send" i]',
        'button[title*="senden" i]',
        'button[data-control-name*="send" i]',
        'button[class*="send" i]',
        'div[role="button"][aria-label*="send" i]',
        'div[role="button"][aria-label*="senden" i]',
        'div[role="button"][title*="send" i]',
        'div[role="button"][title*="senden" i]',
        'span[role="button"][aria-label*="send" i]',
        'span[role="button"][aria-label*="senden" i]'
      ];
    case 'note':
      return [
        'button[aria-label*="note" i]',
        'button[aria-label*="notiz" i]',
        'button[title*="note" i]',
        'button[title*="notiz" i]',
        'button[data-control-name*="note" i]',
        'button[class*="note" i]',
        'div[role="button"][aria-label*="note" i]',
        'div[role="button"][aria-label*="notiz" i]',
        'div[role="button"][title*="note" i]',
        'div[role="button"][title*="notiz" i]',
        'span[role="button"][aria-label*="note" i]',
        'span[role="button"][aria-label*="notiz" i]'
      ];
    default:
      return [];
  }
}

/**
 * Phase 2: Text-based fallback - iterate over all elements for text matching
 */
async function findButtonByTextContent(page: Page, buttonType: string): Promise<{element: any, selector: string} | null> {
  console.log(`🔍 Text-based fallback: searching for ${buttonType} button by text content...`);
  
  const buttonTexts = getButtonTexts(buttonType);
  
  try {
    // Set button texts in page context before evaluation
    await page.evaluate((texts) => {
      (window as any).buttonTexts = texts;
    }, buttonTexts);
    
    const result = await safeEvaluate(page, () => {
      // Get button texts from the outer scope
      const texts = (window as any).buttonTexts;
      
      // Search through all clickable elements
      const clickableElements = document.querySelectorAll('button, [role="button"], a, [onclick], [tabindex]');
      
      for (const element of clickableElements) {
        if (!(element instanceof HTMLElement)) continue;
        
        // Check if element is visible
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        
        // Check text content
        const textContent = element.textContent?.trim() || '';
        const innerText = element.innerText?.trim() || '';
        
        for (const text of texts) {
          if (textContent.toLowerCase().includes(text.toLowerCase()) || 
              innerText.toLowerCase().includes(text.toLowerCase())) {
            
            // Return element info that can be used to find it again
            return {
              tagName: element.tagName.toLowerCase(),
              className: element.className,
              id: element.id,
              textContent: textContent,
              ariaLabel: element.getAttribute('aria-label'),
              dataControlName: element.getAttribute('data-control-name'),
              xpath: getXPathTo(element)
            };
          }
        }
      }
      
      return null;
      
      // Helper function to get XPath to element
      function getXPathTo(element: Element): string {
        if (element.id !== '') {
          return `//*[@id="${element.id}"]`;
        }
        if (element === document.body) {
          return '/html/body';
        }
        
        let ix = 0;
        const siblings = element.parentNode?.childNodes || [];
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling === element) {
            const tagName = element.tagName.toLowerCase();
            return getXPathTo(element.parentElement!) + '/' + tagName + '[' + (ix + 1) + ']';
          }
          if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) {
            ix++;
          }
        }
        return '';
      }
    }, 8000);
    
    if (result && typeof result === 'object' && 'xpath' in result) {
      // Try to find the element using the XPath
      const elements = await (page as any).$x(result.xpath);
      if (elements.length > 0) {
        console.log(`✅ Text-based fallback found button: "${result.textContent}" at ${result.xpath}`);
        return {
          element: elements[0],
          selector: result.xpath
        };
      }
    }
    
    return null;
  } catch (error) {
    console.warn('Text-based fallback failed:', error);
    return null;
  }
}

/**
 * Phase 2: LinkedIn overflow menu detection - click "More" actions
 */
async function findButtonInOverflowMenu(page: Page, buttonType: string): Promise<{element: any, selector: string} | null> {
  console.log(`🔍 Overflow menu: searching for ${buttonType} button in More actions...`);
  
  try {
    // Look for "More" or "..." buttons
    const moreSelectors = [
      'button[aria-label*="more" i]',
      'button[aria-label*="mehr" i]',
      'button[title*="more" i]',
      'button[title*="mehr" i]',
      '[data-control-name*="more" i]',
      'div[role="button"][aria-label*="more" i]',
      'span[role="button"][aria-label*="more" i]'
    ];
    
    // Also try XPath for text-based "More" detection
    const moreXPaths = [
      '//button[contains(text(), "...")]',
      '//button[contains(text(), "More")]',
      '//button[contains(text(), "Mehr")]',
      '//div[@role="button" and contains(text(), "...")]',
      '//span[@role="button" and contains(text(), "...")]'
    ];
    
    let moreButton = null;
    
    // Try CSS selectors first
    for (const selector of moreSelectors) {
      try {
        moreButton = await page.waitForSelector(selector, { timeout: 2000, visible: true });
        if (moreButton) break;
      } catch (e) {
        continue;
      }
    }
    
    // Try XPath selectors if CSS failed
    if (!moreButton) {
      for (const xpath of moreXPaths) {
        try {
          const elements = await (page as any).$x(xpath);
          if (elements.length > 0) {
            moreButton = elements[0];
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!moreButton) {
      console.log('No "More" button found in overflow menu detection');
      return null;
    }
    
    console.log('🔍 Clicking "More" button to reveal overflow menu...');
    await moreButton.click();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for menu to open
    
    // Now search for the target button in the revealed menu
    const result = await findButtonByTextContent(page, buttonType);
    
    if (result) {
      console.log(`✅ Found ${buttonType} button in overflow menu`);
      return result;
    }
    
    return null;
  } catch (error) {
    console.warn('Overflow menu detection failed:', error);
    return null;
  }
}

/**
 * Phase 2: Screenshot persistence for debugging
 */
async function captureFailureScreenshot(page: Page, buttonType: string): Promise<void> {
  console.log(`📸 Capturing failure screenshot for ${buttonType} button...`);
  
  try {
    const screenshot = await page.screenshot({
      type: 'png',
      encoding: 'base64',
      fullPage: false, // Just visible area for smaller size
      quality: 60 // Reduced quality for smaller file size
    });
    
    // Store screenshot reference for webhook notification
    // This will be picked up by the webhook service for debugging
    console.log(`📸 Screenshot captured for ${buttonType} button failure (${screenshot.length} bytes)`);
    
    // In a real implementation, you might want to:
    // 1. Store in temporary storage
    // 2. Upload to cloud storage
    // 3. Include in webhook payload
    // For now, we'll just log the availability
    
    return;
  } catch (error) {
    console.warn('Screenshot capture failed:', error);
    return;
  }
}

/**
 * Get button texts for different button types
 */
function getButtonTexts(buttonType: string): string[] {
  switch (buttonType) {
    case 'connect':
      return ['Connect', 'Vernetzen', 'Verbinden'];
    case 'message':
      return ['Message', 'Nachricht', 'Nachrichten'];
    case 'send':
      return ['Send', 'Senden', 'Send invite', 'Einladung senden'];
    case 'note':
      return ['Add a note', 'Notiz', 'Add note', 'Notiz hinzufügen'];
    default:
      return [];
  }
}