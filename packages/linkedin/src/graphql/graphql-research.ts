import { Page } from 'puppeteer';

/**
 * LinkedIn GraphQL API Research Module
 * Intercepts and analyzes LinkedIn's GraphQL API calls to understand their structure
 */

interface GraphQLRequest {
  url: string;
  method: string;
  headers: { [key: string]: string };
  body: string;
  timestamp: number;
}

interface GraphQLResponse {
  status: number;
  headers: { [key: string]: string };
  body: string;
  timestamp: number;
}

interface InterceptedCall {
  request: GraphQLRequest;
  response?: GraphQLResponse;
  type: 'graphql' | 'voyager' | 'other';
  operation?: string;
  variables?: any;
}

export class LinkedInGraphQLResearcher {
  private interceptedCalls: InterceptedCall[] = [];
  private isIntercepting = false;
  private interceptionEnabled = false;
  private requestListener?: (req: any) => void;
  private responseListener?: (res: any) => void;

  /**
   * Start intercepting network requests to capture GraphQL API calls
   */
  async startInterception(page: Page): Promise<void> {
    if (this.isIntercepting) {
      return;
    }

    this.isIntercepting = true;
    this.interceptedCalls = [];

    // Enable request interception with safety checks
    try {
      await page.setRequestInterception(true);
      this.interceptionEnabled = true;
      console.log('🔬 Request interception enabled successfully');
    } catch (error) {
      console.warn('⚠️ Failed to enable request interception:', (error as Error).message);
      console.warn('⚠️ GraphQL research will proceed without network interception');
      this.interceptionEnabled = false;
      // Continue without interception - we can still perform actions and analyze results
    }

    // Store the request listener for proper cleanup
    this.requestListener = (request) => {
      if (!this.interceptionEnabled) {
        return;
      }

      const url = request.url();
      const method = request.method();
      const headers = request.headers();
      const body = request.postData() || '';

      // Check if this is a GraphQL request
      const isGraphQL = url.includes('/graphql') || 
                       url.includes('/voyager') || 
                       headers['content-type']?.includes('application/json') &&
                       body.includes('query') || body.includes('mutation');

      if (isGraphQL) {
        const interceptedCall: InterceptedCall = {
          request: {
            url,
            method,
            headers,
            body,
            timestamp: Date.now()
          },
          type: this.determineCallType(url, body)
        };

        // Parse GraphQL operation if possible
        try {
          if (body) {
            const parsed = JSON.parse(body);
            if (parsed.operationName) {
              interceptedCall.operation = parsed.operationName;
            }
            if (parsed.variables) {
              interceptedCall.variables = parsed.variables;
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }

        this.interceptedCalls.push(interceptedCall);
        console.log(`📡 Intercepted ${interceptedCall.type} call: ${interceptedCall.operation || 'unknown'}`);
      }

      // CRITICAL FIX: Always attach .catch() to prevent unhandled promise rejections
      if (this.interceptionEnabled && !request.isInterceptResolutionHandled()) {
        request
          .continue()
          .catch((err: Error) => console.warn('⚠️ request.continue() failed:', err.message));
      }
    };

    // Register the request listener
    page.on('request', this.requestListener);

    // Store the response listener for proper cleanup
    this.responseListener = async (response) => {
      if (!this.interceptionEnabled) {
        return;
      }

      const url = response.url();
      const isGraphQL = url.includes('/graphql') || url.includes('/voyager');

      if (isGraphQL) {
        try {
          const body = await response.text();
          const status = response.status();
          const headers = response.headers();

          // Find the corresponding request
          const correspondingCall = this.interceptedCalls.find(call => 
            call.request.url === url && !call.response
          );

          if (correspondingCall) {
            correspondingCall.response = {
              status,
              headers,
              body,
              timestamp: Date.now()
            };
            console.log(`📨 Received response for ${correspondingCall.operation || 'unknown'}: ${status}`);
          }
        } catch (error) {
          console.warn('Failed to capture response:', error);
        }
      }
    };

    // Register the response listener
    page.on('response', this.responseListener);

    console.log('🔬 GraphQL interception started');
  }

  /**
   * Stop intercepting network requests
   */
  async stopInterception(page: Page): Promise<void> {
    if (!this.isIntercepting) {
      return;
    }

    // Mark disabled BEFORE calling setRequestInterception(false) so request listeners will ignore late events
    this.interceptionEnabled = false;

    try {
      await page.setRequestInterception(false);
    } catch (error) {
      console.warn('⚠️ Failed to disable request interception:', (error as Error).message);
    }

    // Remove event listeners to prevent leaks and further continues
    if (this.requestListener) {
      page.off('request', this.requestListener);
      this.requestListener = undefined;
    }
    if (this.responseListener) {
      page.off('response', this.responseListener);
      this.responseListener = undefined;
    }

    console.log('🔬 GraphQL interception stopped');
    this.isIntercepting = false;
  }

  /**
   * Check if interception is enabled
   */
  isInterceptionEnabled(): boolean {
    return this.interceptionEnabled;
  }

  /**
   * Determine the type of GraphQL call based on URL and body
   */
  private determineCallType(url: string, body: string): 'graphql' | 'voyager' | 'other' {
    if (url.includes('/graphql')) {
      return 'graphql';
    }
    if (url.includes('/voyager')) {
      return 'voyager';
    }
    return 'other';
  }

  /**
   * Get all intercepted calls
   */
  getInterceptedCalls(): InterceptedCall[] {
    return [...this.interceptedCalls];
  }

  /**
   * Get calls related to invitations/connections
   */
  getInvitationCalls(): InterceptedCall[] {
    return this.interceptedCalls.filter(call => 
      call.operation?.toLowerCase().includes('invitation') ||
      call.operation?.toLowerCase().includes('connect') ||
      call.request.body.toLowerCase().includes('invitation') ||
      call.request.body.toLowerCase().includes('connect')
    );
  }

  /**
   * Get calls related to messaging
   */
  getMessageCalls(): InterceptedCall[] {
    return this.interceptedCalls.filter(call => 
      call.operation?.toLowerCase().includes('message') ||
      call.operation?.toLowerCase().includes('conversation') ||
      call.request.body.toLowerCase().includes('message') ||
      call.request.body.toLowerCase().includes('conversation')
    );
  }

  /**
   * Analyze authentication headers and tokens
   */
  getAuthenticationInfo(): { [key: string]: string } {
    const authHeaders: { [key: string]: string } = {};
    
    this.interceptedCalls.forEach(call => {
      const headers = call.request.headers;
      
      // Common authentication headers
      if (headers['authorization']) {
        authHeaders['authorization'] = headers['authorization'];
      }
      if (headers['x-li-lang']) {
        authHeaders['x-li-lang'] = headers['x-li-lang'];
      }
      if (headers['x-li-track']) {
        authHeaders['x-li-track'] = headers['x-li-track'];
      }
      if (headers['csrf-token']) {
        authHeaders['csrf-token'] = headers['csrf-token'];
      }
      if (headers['x-restli-protocol-version']) {
        authHeaders['x-restli-protocol-version'] = headers['x-restli-protocol-version'];
      }
    });

    return authHeaders;
  }

  /**
   * Generate a research report
   */
  generateResearchReport(): string {
    const report = [];
    report.push('=== LinkedIn GraphQL API Research Report ===\n');
    
    report.push(`Request interception enabled: ${this.interceptionEnabled ? 'Yes' : 'No'}`);
    report.push(`Total intercepted calls: ${this.interceptedCalls.length}`);
    report.push(`Invitation-related calls: ${this.getInvitationCalls().length}`);
    report.push(`Message-related calls: ${this.getMessageCalls().length}\n`);

    // Authentication info
    const authInfo = this.getAuthenticationInfo();
    report.push('Authentication Headers:');
    Object.entries(authInfo).forEach(([key, value]) => {
      report.push(`  ${key}: ${value.substring(0, 50)}...`);
    });
    report.push('');

    // Invitation calls
    const invitationCalls = this.getInvitationCalls();
    if (invitationCalls.length > 0) {
      report.push('Invitation-related API calls:');
      invitationCalls.forEach((call, index) => {
        report.push(`  ${index + 1}. ${call.operation || 'Unknown'}`);
        report.push(`     URL: ${call.request.url}`);
        report.push(`     Method: ${call.request.method}`);
        if (call.variables) {
          report.push(`     Variables: ${JSON.stringify(call.variables, null, 2)}`);
        }
        report.push('');
      });
    }

    // Message calls
    const messageCalls = this.getMessageCalls();
    if (messageCalls.length > 0) {
      report.push('Message-related API calls:');
      messageCalls.forEach((call, index) => {
        report.push(`  ${index + 1}. ${call.operation || 'Unknown'}`);
        report.push(`     URL: ${call.request.url}`);
        report.push(`     Method: ${call.request.method}`);
        if (call.variables) {
          report.push(`     Variables: ${JSON.stringify(call.variables, null, 2)}`);
        }
        report.push('');
      });
    }

    return report.join('\n');
  }

  /**
   * Save research data to file for analysis
   */
  saveResearchData(): { 
    calls: InterceptedCall[], 
    invitations: InterceptedCall[], 
    messages: InterceptedCall[], 
    auth: { [key: string]: string } 
  } {
    return {
      calls: this.getInterceptedCalls(),
      invitations: this.getInvitationCalls(),
      messages: this.getMessageCalls(),
      auth: this.getAuthenticationInfo()
    };
  }
}

/**
 * Research LinkedIn GraphQL APIs by performing real actions and intercepting calls
 */
export async function researchLinkedInGraphQL(
  page: Page,
  profileUrl: string,
  actions: ('invite' | 'message')[] = ['invite', 'message']
): Promise<{ 
  calls: InterceptedCall[], 
  invitations: InterceptedCall[], 
  messages: InterceptedCall[], 
  auth: { [key: string]: string },
  report: string 
}> {
  const researcher = new LinkedInGraphQLResearcher();
  
  try {
    // Start intercepting (with graceful failure handling)
    await researcher.startInterception(page);
    
    // Navigate to profile
    console.log('🔬 Navigating to profile for GraphQL research...');
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if interception is working
    if (!researcher.isInterceptionEnabled()) {
      console.log('⚠️ Network interception not available - research will analyze button interactions only');
      // Return minimal report when interception is disabled
      return {
        calls: [],
        invitations: [],
        messages: [],
        auth: {},
        report: 'GraphQL research disabled - network interception unavailable. This is normal and jobs will continue to work.'
      };
    }
    
    // Perform actions to trigger GraphQL calls
    for (const action of actions) {
      if (action === 'invite') {
        console.log('🔬 Attempting to trigger invitation GraphQL calls...');
        try {
          // Look for Connect button
          const connectButton = await page.$('button[aria-label*="Connect"], button[data-control-name="connect"]');
          if (connectButton) {
            console.log('🔬 Found Connect button, clicking to trigger API calls...');
            await connectButton.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Look for Send button
            const sendButton = await page.$('button[aria-label*="Send"], button[data-control-name="send"]');
            if (sendButton) {
              console.log('🔬 Found Send button, clicking to trigger API calls...');
              await sendButton.click();
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (error) {
          console.warn('🔬 Failed to trigger invitation calls:', error);
        }
      }
      
      if (action === 'message') {
        console.log('🔬 Attempting to trigger message GraphQL calls...');
        try {
          // Look for Message button
          const messageButton = await page.$('button[aria-label*="Message"], button[data-control-name="message"]');
          if (messageButton) {
            console.log('🔬 Found Message button, clicking to trigger API calls...');
            await messageButton.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Look for message textarea
            const textarea = await page.$('textarea[placeholder*="message"], div[contenteditable="true"]');
            if (textarea) {
              console.log('🔬 Found message textarea, typing to trigger API calls...');
              await textarea.type('Test message for GraphQL research');
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Look for Send button
              const sendButton = await page.$('button[aria-label*="Send"], button[data-control-name="send"]');
              if (sendButton) {
                console.log('🔬 Found Send button, clicking to trigger API calls...');
                await sendButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }
        } catch (error) {
          console.warn('🔬 Failed to trigger message calls:', error);
        }
      }
    }
    
    // Wait for final API calls to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Generate research data
    const researchData = researcher.saveResearchData();
    const report = researcher.generateResearchReport();
    
    console.log('🔬 GraphQL research completed');
    console.log(report);
    
    return {
      ...researchData,
      report
    };
    
  } finally {
    await researcher.stopInterception(page);
  }
}