import { Page, Browser } from 'puppeteer';

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