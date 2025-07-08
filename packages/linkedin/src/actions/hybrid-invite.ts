import { Page } from 'puppeteer';
import { createLinkedInGraphQLClient } from '../graphql/graphql-client';
import { researchLinkedInGraphQL } from '../graphql/graphql-research';
import { sendInvitation as domSendInvitation } from './invite';
import { enforceRequestSpacing } from '../utils/browserHealth';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Hybrid invitation system that tries GraphQL API first, falls back to DOM manipulation
 */
export async function sendHybridInvitation(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<{ success: boolean; message: string; profileUrl: string; actionTaken: 'invited' | 'messaged'; method: 'graphql' | 'dom' }> {
  
  console.log('🚀 Starting hybrid invitation system...');
  
  // Enforce request spacing
  await enforceRequestSpacing();
  
  // Phase 1: Try GraphQL API approach
  try {
    console.log('📡 Phase 1: Attempting GraphQL API approach...');
    
    // First, navigate to the profile to establish session
    console.log('🔗 Navigating to profile for GraphQL setup...');
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if we need to research the GraphQL APIs first
    const shouldResearch = process.env.LINKEDIN_GRAPHQL_RESEARCH === 'true';
    
    if (shouldResearch) {
      console.log('🔬 Research mode: Intercepting GraphQL calls...');
      
      // Research GraphQL APIs by performing real actions
      const researchData = await researchLinkedInGraphQL(page, profileUrl, ['invite']);
      
      // Log research results
      console.log('📊 GraphQL Research Results:');
      console.log(researchData.report);
      
      // Save research data for analysis
      const researchFile = path.join(__dirname, '../../research-data', `graphql-research-${Date.now()}.json`);
      
      try {
        // Create directory if it doesn't exist
        const dir = path.dirname(researchFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(researchFile, JSON.stringify(researchData, null, 2));
        console.log(`📁 Research data saved to: ${researchFile}`);
      } catch (saveError) {
        console.warn('⚠️ Could not save research data:', saveError);
      }
      
      // For now, fall back to DOM approach after research
      console.log('🔄 Research complete, falling back to DOM approach...');
      
    } else {
      console.log('🔗 Attempting direct GraphQL API calls...');
      
      try {
        // Create GraphQL client
        const graphqlClient = await createLinkedInGraphQLClient(page);
        
        // Test connection
        const connectionTest = await graphqlClient.testConnection();
        console.log(`🔍 GraphQL connection test: ${connectionTest.message}`);
        
        if (connectionTest.success) {
          // Extract profile URN from URL
          const profileUrn = graphqlClient.extractProfileUrn(profileUrl);
          console.log(`📝 Profile URN: ${profileUrn}`);
          
          // Send invitation via GraphQL
          const result = await graphqlClient.sendInvitation(profileUrn, note);
          
          if (result.success) {
            console.log('✅ GraphQL invitation sent successfully!');
            return {
              success: true,
              message: result.message,
              profileUrl,
              actionTaken: 'invited',
              method: 'graphql'
            };
          } else {
            console.warn('⚠️ GraphQL invitation failed:', result.message);
          }
        } else {
          console.warn('⚠️ GraphQL connection test failed:', connectionTest.message);
        }
        
      } catch (graphqlError) {
        console.warn('⚠️ GraphQL approach failed:', (graphqlError as Error).message);
      }
    }
    
  } catch (error) {
    console.warn('⚠️ Phase 1 (GraphQL) failed:', (error as Error).message);
  }
  
  // Phase 2: Fall back to DOM manipulation
  console.log('🔄 Phase 2: Falling back to DOM manipulation...');
  
  try {
    // Use the existing DOM-based invitation system
    const domResult = await domSendInvitation(page, profileUrl, note);
    
    return {
      success: domResult.success,
      message: domResult.message,
      profileUrl: domResult.profileUrl,
      actionTaken: domResult.actionTaken,
      method: 'dom'
    };
    
  } catch (domError) {
    console.error('❌ Phase 2 (DOM) also failed:', (domError as Error).message);
    
    // Ultimate fallback: return detailed error
    return {
      success: false,
      message: `Both GraphQL and DOM approaches failed. GraphQL: Authentication/API issues. DOM: ${(domError as Error).message}`,
      profileUrl,
      actionTaken: 'invited',
      method: 'dom'
    };
  }
}

/**
 * Research mode function to gather GraphQL API information
 */
export async function researchLinkedInAPIs(
  page: Page,
  profileUrl: string
): Promise<{ success: boolean; message: string; researchData: any }> {
  
  console.log('🔬 Starting LinkedIn API research mode...');
  
  try {
    // Research GraphQL APIs
    const researchData = await researchLinkedInGraphQL(page, profileUrl, ['invite', 'message']);
    
    // Save research data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const researchFile = path.join(__dirname, '../../research-data', `api-research-${timestamp}.json`);
    
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(researchFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(researchFile, JSON.stringify(researchData, null, 2));
      console.log(`📁 Research data saved to: ${researchFile}`);
    } catch (saveError) {
      console.warn('⚠️ Could not save research data:', saveError);
    }
    
    return {
      success: true,
      message: 'API research completed successfully',
      researchData
    };
    
  } catch (error) {
    console.error('❌ API research failed:', (error as Error).message);
    
    return {
      success: false,
      message: `API research failed: ${(error as Error).message}`,
      researchData: null
    };
  }
}

/**
 * Enhanced invitation with comprehensive error handling and logging
 */
export async function sendInvitationWithAdvancedDiagnostics(
  page: Page,
  profileUrl: string,
  note?: string
): Promise<{ success: boolean; message: string; profileUrl: string; actionTaken: 'invited' | 'messaged'; diagnostics: any }> {
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    profileUrl,
    method: 'unknown',
    phases: [] as string[],
    errors: [] as string[],
    graphqlData: null as any,
    domData: null as any
  };
  
  try {
    // Phase 1: GraphQL research and attempt
    console.log('🔬 Phase 1: GraphQL research and direct API...');
    diagnostics.phases.push('graphql_research');
    
    try {
      // Research GraphQL APIs
      const researchData = await researchLinkedInGraphQL(page, profileUrl, ['invite']);
      diagnostics.graphqlData = researchData;
      
      console.log('📊 GraphQL Research Summary:');
      console.log(`- Total calls intercepted: ${researchData.calls.length}`);
      console.log(`- Invitation calls: ${researchData.invitations.length}`);
      console.log(`- Authentication headers: ${Object.keys(researchData.auth).length}`);
      
      // If we found invitation-related calls, try to use them
      if (researchData.invitations.length > 0) {
        console.log('🔗 Found invitation-related GraphQL calls, attempting direct API...');
        diagnostics.phases.push('graphql_attempt');
        
        try {
          const graphqlClient = await createLinkedInGraphQLClient(page);
          const profileUrn = graphqlClient.extractProfileUrn(profileUrl);
          const result = await graphqlClient.sendInvitation(profileUrn, note);
          
          if (result.success) {
            diagnostics.method = 'graphql';
            console.log('✅ GraphQL invitation successful!');
            
            return {
              success: true,
              message: result.message,
              profileUrl,
              actionTaken: 'invited',
              diagnostics
            };
          }
        } catch (graphqlError) {
          diagnostics.errors.push(`GraphQL attempt failed: ${(graphqlError as Error).message}`);
          console.warn('⚠️ GraphQL attempt failed:', (graphqlError as Error).message);
        }
      }
      
    } catch (researchError) {
      diagnostics.errors.push(`GraphQL research failed: ${(researchError as Error).message}`);
      console.warn('⚠️ GraphQL research failed:', (researchError as Error).message);
    }
    
    // Phase 2: DOM manipulation with enhanced diagnostics
    console.log('🔄 Phase 2: DOM manipulation with diagnostics...');
    diagnostics.phases.push('dom_attempt');
    
    try {
      const domResult = await domSendInvitation(page, profileUrl, note);
      diagnostics.method = 'dom';
      diagnostics.domData = {
        success: domResult.success,
        message: domResult.message,
        actionTaken: domResult.actionTaken
      };
      
      return {
        success: domResult.success,
        message: domResult.message,
        profileUrl: domResult.profileUrl,
        actionTaken: domResult.actionTaken,
        diagnostics
      };
      
    } catch (domError) {
      diagnostics.errors.push(`DOM attempt failed: ${(domError as Error).message}`);
      console.error('❌ DOM attempt failed:', (domError as Error).message);
      
      return {
        success: false,
        message: `All methods failed. Errors: ${diagnostics.errors.join('; ')}`,
        profileUrl,
        actionTaken: 'invited',
        diagnostics
      };
    }
    
  } catch (error) {
    diagnostics.errors.push(`Unexpected error: ${(error as Error).message}`);
    console.error('❌ Unexpected error in hybrid invitation:', (error as Error).message);
    
    return {
      success: false,
      message: `Unexpected error: ${(error as Error).message}`,
      profileUrl,
      actionTaken: 'invited',
      diagnostics
    };
  }
}