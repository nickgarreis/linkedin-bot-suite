import { Page } from 'puppeteer';

/**
 * LinkedIn GraphQL API Client
 * Handles direct API calls to LinkedIn's GraphQL endpoints
 */

interface GraphQLOperation {
  operationName: string;
  variables: any;
  query: string;
}

interface GraphQLResponse {
  data?: any;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: string[];
  }>;
}

interface LinkedInAuthContext {
  csrfToken: string;
  jsessionid: string;
  liAt: string;
  liap: string;
  userAgent: string;
  cookies: string;
  headers: { [key: string]: string };
}

export class LinkedInGraphQLClient {
  private authContext: LinkedInAuthContext | null = null;
  private baseUrl = 'https://www.linkedin.com';

  /**
   * Extract authentication context from current page
   */
  async extractAuthContext(page: Page): Promise<LinkedInAuthContext> {
    console.log('🔑 Extracting LinkedIn authentication context...');
    
    // Get cookies
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Extract key cookies
    const liAt = cookies.find(c => c.name === 'li_at')?.value;
    const liap = cookies.find(c => c.name === 'liap')?.value;
    const jsessionid = cookies.find(c => c.name === 'JSESSIONID')?.value;
    
    if (!liAt) {
      throw new Error('LinkedIn session cookie (li_at) not found');
    }
    
    // Extract CSRF token from page
    const csrfToken = await page.evaluate(() => {
      // Look for CSRF token in meta tags
      const metaCsrf = document.querySelector('meta[name="csrf-token"]');
      if (metaCsrf) {
        return metaCsrf.getAttribute('content');
      }
      
      // Look for CSRF token in global variables
      if ((window as any).PerformanceGlobalState && (window as any).PerformanceGlobalState.csrfToken) {
        return (window as any).PerformanceGlobalState.csrfToken;
      }
      
      // Look for CSRF token in scripts
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        const csrfMatch = content.match(/['""]csrf['""]:\s*['""]([^'"\"]+)['"\"]/i);
        if (csrfMatch) {
          return csrfMatch[1];
        }
      }
      
      return null;
    });
    
    if (!csrfToken) {
      throw new Error('CSRF token not found');
    }
    
    // Get user agent
    const userAgent = await page.evaluate(() => navigator.userAgent);
    
    // Common headers for LinkedIn API calls
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'application/vnd.linkedin.normalized+json+2.1',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'X-Li-Lang': 'en_US',
      'X-Li-Track': JSON.stringify({
        'clientVersion': '1.0.0',
        'osName': 'web',
        'timezoneOffset': new Date().getTimezoneOffset(),
        'deviceFormFactor': 'DESKTOP'
      }),
      'Csrf-Token': csrfToken,
      'Cookie': cookieString,
      'Referer': 'https://www.linkedin.com/',
      'Origin': 'https://www.linkedin.com'
    };
    
    this.authContext = {
      csrfToken,
      jsessionid: jsessionid || '',
      liAt,
      liap: liap || '',
      userAgent,
      cookies: cookieString,
      headers
    };
    
    console.log('✅ Authentication context extracted successfully');
    return this.authContext;
  }

  /**
   * Make a GraphQL API call
   */
  async makeGraphQLCall(operation: GraphQLOperation): Promise<GraphQLResponse> {
    if (!this.authContext) {
      throw new Error('Authentication context not initialized. Call extractAuthContext first.');
    }
    
    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers: this.authContext.headers,
      body: JSON.stringify(operation)
    });
    
    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.errors && result.errors.length > 0) {
      console.warn('GraphQL errors:', result.errors);
    }
    
    return result;
  }

  /**
   * Send a connection invitation using GraphQL
   */
  async sendInvitation(profileUrn: string, message?: string): Promise<{ success: boolean; message: string }> {
    if (!this.authContext) {
      throw new Error('Authentication context not initialized');
    }
    
    console.log('🔗 Sending invitation via GraphQL API...');
    
    // GraphQL mutation for sending invitation
    const operation: GraphQLOperation = {
      operationName: 'sendInvitation',
      variables: {
        invitationRequest: {
          invitee: {
            'com.linkedin.voyager.growth.invitation.InviteeProfile': {
              profileUrn: profileUrn
            }
          },
          message: message || '',
          customMessage: Boolean(message)
        }
      },
      query: `
        mutation sendInvitation($invitationRequest: InvitationRequestInput!) {
          sendInvitation(invitationRequest: $invitationRequest) {
            success
            message
          }
        }
      `
    };
    
    try {
      const result = await this.makeGraphQLCall(operation);
      
      if (result.data && result.data.sendInvitation) {
        return {
          success: result.data.sendInvitation.success,
          message: result.data.sendInvitation.message || 'Invitation sent successfully'
        };
      }
      
      return {
        success: false,
        message: 'Unknown error occurred'
      };
      
    } catch (error) {
      console.error('GraphQL invitation failed:', error);
      return {
        success: false,
        message: `GraphQL API call failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Send a message using GraphQL
   */
  async sendMessage(conversationUrn: string, message: string): Promise<{ success: boolean; message: string }> {
    if (!this.authContext) {
      throw new Error('Authentication context not initialized');
    }
    
    console.log('💬 Sending message via GraphQL API...');
    
    // GraphQL mutation for sending message
    const operation: GraphQLOperation = {
      operationName: 'sendMessage',
      variables: {
        conversationUrn: conversationUrn,
        messageRequest: {
          body: message,
          recipients: []
        }
      },
      query: `
        mutation sendMessage($conversationUrn: String!, $messageRequest: MessageRequestInput!) {
          sendMessage(conversationUrn: $conversationUrn, messageRequest: $messageRequest) {
            success
            message
          }
        }
      `
    };
    
    try {
      const result = await this.makeGraphQLCall(operation);
      
      if (result.data && result.data.sendMessage) {
        return {
          success: result.data.sendMessage.success,
          message: result.data.sendMessage.message || 'Message sent successfully'
        };
      }
      
      return {
        success: false,
        message: 'Unknown error occurred'
      };
      
    } catch (error) {
      console.error('GraphQL message failed:', error);
      return {
        success: false,
        message: `GraphQL API call failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get profile information using GraphQL
   */
  async getProfile(profileUrn: string): Promise<any> {
    if (!this.authContext) {
      throw new Error('Authentication context not initialized');
    }
    
    console.log('👤 Getting profile via GraphQL API...');
    
    const operation: GraphQLOperation = {
      operationName: 'getProfile',
      variables: {
        profileUrn: profileUrn
      },
      query: `
        query getProfile($profileUrn: String!) {
          profile(profileUrn: $profileUrn) {
            firstName
            lastName
            headline
            publicIdentifier
            connectionStatus
            distance
            urn
          }
        }
      `
    };
    
    try {
      const result = await this.makeGraphQLCall(operation);
      return result.data?.profile || null;
    } catch (error) {
      console.error('GraphQL profile fetch failed:', error);
      return null;
    }
  }

  /**
   * Extract profile URN from LinkedIn profile URL
   */
  extractProfileUrn(profileUrl: string): string {
    // Extract public identifier from URL
    const match = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/);
    if (!match) {
      throw new Error('Invalid LinkedIn profile URL');
    }
    
    const publicIdentifier = match[1];
    
    // Convert to URN format (this is a simplified approach)
    // In reality, we'd need to resolve the public identifier to the actual URN
    return `urn:li:fsd_profile:${publicIdentifier}`;
  }

  /**
   * Test the GraphQL connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.authContext) {
      return {
        success: false,
        message: 'Authentication context not initialized'
      };
    }
    
    try {
      // Simple test query
      const operation: GraphQLOperation = {
        operationName: 'testConnection',
        variables: {},
        query: `
          query testConnection {
            me {
              firstName
              lastName
            }
          }
        `
      };
      
      const result = await this.makeGraphQLCall(operation);
      
      if (result.data && result.data.me) {
        return {
          success: true,
          message: `Connected as ${result.data.me.firstName} ${result.data.me.lastName}`
        };
      }
      
      return {
        success: false,
        message: 'Test query failed'
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${(error as Error).message}`
      };
    }
  }
}

/**
 * Factory function to create and initialize GraphQL client
 */
export async function createLinkedInGraphQLClient(page: Page): Promise<LinkedInGraphQLClient> {
  const client = new LinkedInGraphQLClient();
  await client.extractAuthContext(page);
  return client;
}