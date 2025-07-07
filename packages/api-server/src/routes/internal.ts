import express from 'express';
import fetch from 'node-fetch';

const router: express.Router = express.Router();

// Internal API key authentication middleware
function validateInternalKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const internalKey = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_API_KEY not configured'
    });
  }

  if (!internalKey || internalKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: 'Invalid internal API key'
    });
  }

  next();
}

// Cookie validation function
async function validateCookies(cookies: any[]): Promise<boolean> {
  try {
    // Using the imported fetch function
    const liAt = cookies.find((c: any) => c.name === 'li_at')?.value;
    if (!liAt) return false;

    const resp = await fetch('https://www.linkedin.com/feed', {
      headers: { cookie: `li_at=${liAt}` },
      redirect: 'manual'
    });
    return resp.status === 200;
  } catch {
    return false;
  }
}

// Update cookies endpoint
router.post('/update-cookies', validateInternalKey, async (req, res) => {
  try {
    const { cookies } = req.body;

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid cookies array'
      });
    }

    // Validate essential cookies
    const essentialCookies = ['li_at', 'JSESSIONID'];
    for (const cookieName of essentialCookies) {
      if (!cookies.find((c: any) => c.name === cookieName)) {
        return res.status(400).json({
          success: false,
          error: `Missing essential cookie: ${cookieName}`
        });
      }
    }

    // Filter to only LinkedIn cookies
    const linkedinCookies = cookies.filter((c: any) => 
      c.domain && c.domain.includes('linkedin.com')
    );

    // Validate cookies before updating
    const isValid = await validateCookies(linkedinCookies);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Cookies failed validation test'
      });
    }

    // Update environment variable via Render API
    const renderApiKey = process.env.RENDER_API_KEY;
    const renderServiceId = process.env.RENDER_SERVICE_ID;

    if (renderApiKey && renderServiceId) {
      try {
        // Using the imported fetch function
        
        // Update environment variable
        const updateResponse = await fetch(`https://api.render.com/v1/services/${renderServiceId}/env-vars`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${renderApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([
            {
              key: 'LINKEDIN_COOKIES_JSON',
              value: JSON.stringify(linkedinCookies)
            }
          ])
        });

        if (updateResponse.ok) {
          // Trigger deployment to restart worker with new cookies
          const deployResponse = await fetch(`https://api.render.com/v1/services/${renderServiceId}/deploys`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${renderApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clearCache: 'clear'
            })
          });

          if (deployResponse.ok) {
            console.log('✅ Cookies updated and worker redeployment triggered');
            return res.json({
              success: true,
              message: 'Cookies updated and worker redeployment triggered',
              cookieCount: linkedinCookies.length
            });
          } else {
            console.error('Failed to trigger worker redeployment:', await deployResponse.text());
            return res.status(500).json({
              success: false,
              error: 'Failed to trigger worker redeployment'
            });
          }
        } else {
          console.error('Failed to update environment variables:', await updateResponse.text());
          return res.status(500).json({
            success: false,
            error: 'Failed to update environment variables'
          });
        }
      } catch (renderError) {
        console.error('Render API error:', renderError);
        return res.status(500).json({
          success: false,
          error: 'Failed to update via Render API'
        });
      }
    } else {
      // Development mode - just log the cookies
      console.log('📝 Development mode: Would update cookies:', {
        count: linkedinCookies.length,
        hasLiAt: !!linkedinCookies.find(c => c.name === 'li_at')
      });
      
      return res.json({
        success: true,
        message: 'Cookies validated (development mode)',
        cookieCount: linkedinCookies.length
      });
    }

  } catch (error) {
    console.error('Error updating cookies:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Health check for internal endpoints
router.get('/health', validateInternalKey, (req, res) => {
  res.json({
    success: true,
    message: 'Internal API healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;