#!/usr/bin/env node

/**
 * Local testing script for the Release Announcer bot
 * Run with: node scripts/test-local.js
 */

const http = require('http');
const url = require('url');

// Import the handlers
const testHandler = require('../api/test');
const announceHandler = require('../api/announce');
const debugChannelsHandler = require('../api/debug-channels');

const PORT = 3000;

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Helper function to parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Create a simple HTTP server to test the endpoint locally
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/api/test') {
    // Add API key to query if set in environment (for local testing)
    if (process.env.TEST_API_KEY && !parsedUrl.query.api_key) {
      parsedUrl.query.api_key = process.env.TEST_API_KEY;
    }
    
    // Convert Node.js request to Vercel-style request object
    const vercelReq = {
      method: req.method,
      query: parsedUrl.query,
      headers: {
        ...req.headers,
        // Add API key header if set in environment
        ...(process.env.TEST_API_KEY && { 'x-api-key': process.env.TEST_API_KEY })
      },
    };

    // Convert Node.js response to Vercel-style response object
    const vercelRes = {
      status: (code) => ({ json: (data) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
        return vercelRes;
      }}),
      setHeader: (name, value) => res.setHeader(name, value),
      end: () => res.end(),
    };

    try {
      await testHandler(vercelReq, vercelRes);
    } catch (error) {
      console.error('Error running test:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: error.message }, null, 2));
    }
  } else if (parsedUrl.pathname === '/api/announce') {
    // Handle the announce endpoint
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed', message: 'Only POST requests are supported' }, null, 2));
      return;
    }

    try {
      const body = await parseBody(req);
      
      // Convert Node.js request to Vercel-style request object
      const vercelReq = {
        method: req.method,
        body: body,
        headers: {
          ...req.headers,
          // Add API key header if set in environment
          ...(process.env.ANNOUNCE_API_KEY && { 'x-api-key': process.env.ANNOUNCE_API_KEY })
        },
      };

      // Convert Node.js response to Vercel-style response object
      const vercelRes = {
        status: (code) => ({ json: (data) => {
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data, null, 2));
          return vercelRes;
        }}),
        setHeader: (name, value) => res.setHeader(name, value),
        end: () => res.end(),
      };

      await announceHandler(vercelReq, vercelRes);
    } catch (error) {
      console.error('Error running announce:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: error.message }, null, 2));
    }
  } else if (parsedUrl.pathname === '/api/debug-channels') {
    // Handle the debug channels endpoint
    try {
      // Convert Node.js request to Vercel-style request object
      const vercelReq = {
        method: req.method,
        query: parsedUrl.query,
        headers: req.headers,
      };

      // Convert Node.js response to Vercel-style response object
      const vercelRes = {
        status: (code) => ({ json: (data) => {
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data, null, 2));
          return vercelRes;
        }}),
        setHeader: (name, value) => res.setHeader(name, value),
        end: () => res.end(),
      };

      await debugChannelsHandler(vercelReq, vercelRes);
    } catch (error) {
      console.error('Error running debug-channels:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: error.message }, null, 2));
    }
  } else {
    // Serve a simple test page
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Release Announcer - Local Testing</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .test-button { display: inline-block; margin: 10px; padding: 10px 20px; background: #007cba; color: white; text-decoration: none; border-radius: 5px; }
        .test-button:hover { background: #005a87; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>🚀 Release Announcer - Local Testing</h1>
    
    <h2>📊 Test Endpoints</h2>
    <p>Click the links below to test different endpoints:</p>
    
    <div>
        <a href="/api/test" class="test-button">Health Check</a>
        <a href="/api/test?test=github" class="test-button">Test GitHub</a>
        <a href="/api/test?test=jira" class="test-button">Test Jira</a>
        <a href="/api/test?test=release&release=2.1.0" class="test-button">Test Release (2.1.0)</a>
        <a href="/api/test?test=all&release=2.1.0" class="test-button">Run All Tests</a>
    </div>

    <h2>🔍 Debug Channels</h2>
    <p>Debug channel access issues (now with pagination support):</p>
    <div>
        <a href="/api/debug-channels" class="test-button">Channel Summary</a>
        <a href="/api/debug-channels?search=dani" class="test-button">Search "dani"</a>
        <a href="/api/debug-channels?full=true" class="test-button">Full Channel List</a>
        <a href="/api/debug-channels?search=notes&full=true" class="test-button">Search "notes" (full)</a>
    </div>

    <h2>🚀 Announce Endpoint</h2>
    <p>Test the release announcement endpoint (requires proper environment setup):</p>
    
    <form onsubmit="testAnnounce(event)" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <div style="margin-bottom: 15px;">
            <label for="announceReleaseNumber" style="display: block; margin-bottom: 5px; font-weight: bold;">Release Number:</label>
            <input type="text" id="announceReleaseNumber" placeholder="e.g., 2.1.0 or 67" style="padding: 8px; width: 200px;" required>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label for="channelName" style="display: block; margin-bottom: 5px; font-weight: bold;">Channel Name:</label>
            <input type="text" id="channelName" placeholder="e.g., general, releases" style="padding: 8px; width: 200px;" required>
            <small style="display: block; color: #666; margin-top: 5px;">Don't include # prefix. Bot must have access to this channel.</small>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label for="customMessage" style="display: block; margin-bottom: 5px; font-weight: bold;">Custom Message (optional):</label>
            <textarea id="customMessage" placeholder="🎉 Version {{releaseNumber}} deployed with {{changeCount}} changes!" style="padding: 8px; width: 400px; height: 60px;"></textarea>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Options:</label>
            <label style="display: block; margin-bottom: 5px;">
                <input type="checkbox" id="autoSend" checked> Auto-send announcement
            </label>
            <label style="display: block;">
                <input type="checkbox" id="filterEmptyCommits" checked> Filter commits without JIRA/GitHub references
            </label>
        </div>
        
        <button type="submit" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">🚀 Send Announcement</button>
    </form>
    
    <div id="announceResult" style="margin-top: 20px;"></div>
    
    <h2>Environment Variables Status</h2>
    <p>Make sure you have created a <code>.env.local</code> file with all required environment variables.</p>
    <div style="background: #f0f8ff; padding: 15px; border-radius: 5px; margin: 10px 0;">
        <h3>Security Status</h3>
        <ul>
            <li><strong>Test API Key:</strong> ${process.env.TEST_API_KEY ? '✅ Set (for /api/test endpoint)' : '❌ Not set'}</li>
            <li><strong>Announce API Key:</strong> ${process.env.ANNOUNCE_API_KEY ? '✅ Set (for /api/announce endpoint)' : '❌ Not set'}</li>
            <li><strong>Production Mode:</strong> ${process.env.NODE_ENV === 'production' ? '🔒 Production' : '🔧 Development'}</li>
            <li><strong>Test Endpoint:</strong> ${process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ENDPOINT !== 'true' ? '🚫 Disabled in production' : '✅ Enabled'}</li>
        </ul>
        ${process.env.ANNOUNCE_API_KEY ? '<p><em>Note: Announce API key is automatically included in all /api/announce requests from this interface.</em></p>' : ''}
    </div>
    
    <h2>Custom Release Test</h2>
    <form onsubmit="testRelease(event)">
        <input type="text" id="releaseNumber" placeholder="Enter release number (e.g., 2.1.0)" style="padding: 8px; width: 200px;">
        <button type="submit" style="padding: 8px 15px;">Test Release</button>
    </form>
    
    <div id="result" style="margin-top: 20px;"></div>
    
    <script>
        function testRelease(event) {
            event.preventDefault();
            const releaseNumber = document.getElementById('releaseNumber').value;
            if (!releaseNumber) {
                alert('Please enter a release number');
                return;
            }
            window.location.href = '/api/test?test=release&release=' + encodeURIComponent(releaseNumber);
        }

        async function testAnnounce(event) {
            event.preventDefault();
            
            const releaseNumber = document.getElementById('announceReleaseNumber').value;
            const channelName = document.getElementById('channelName').value;
            const customMessage = document.getElementById('customMessage').value;
            const autoSend = document.getElementById('autoSend').checked;
            const filterEmptyCommits = document.getElementById('filterEmptyCommits').checked;
            
            if (!releaseNumber || !channelName) {
                alert('Please enter both release number and channel name');
                return;
            }
            
            const payload = {
                releaseNumber: releaseNumber,
                channelName: channelName,
                autoSend: autoSend,
                filterEmptyCommits: filterEmptyCommits
            };
            
            if (customMessage.trim()) {
                payload.customMessage = customMessage.trim();
            }
            
            const resultDiv = document.getElementById('announceResult');
            resultDiv.innerHTML = '<p>🔄 Sending announcement...</p>';
            
            try {
                const response = await fetch('/api/announce', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.text();
                let parsedResult;
                try {
                    parsedResult = JSON.parse(result);
                } catch (e) {
                    parsedResult = { error: 'Invalid JSON response', raw: result };
                }
                
                const statusColor = response.ok ? '#28a745' : '#dc3545';
                const statusIcon = response.ok ? '✅' : '❌';
                
                resultDiv.innerHTML = \`
                    <div style="background: \${response.ok ? '#d4edda' : '#f8d7da'}; color: \${response.ok ? '#155724' : '#721c24'}; padding: 15px; border-radius: 5px; border: 1px solid \${response.ok ? '#c3e6cb' : '#f5c6cb'};">
                        <h4>\${statusIcon} Response (\${response.status})</h4>
                        <pre style="background: white; color: #333; padding: 10px; border-radius: 3px; overflow-x: auto; white-space: pre-wrap;">\${JSON.stringify(parsedResult, null, 2)}</pre>
                    </div>
                \`;
                
                if (response.ok && parsedResult.success) {
                    console.log('✅ Announcement sent successfully!', parsedResult);
                } else {
                    console.error('❌ Announcement failed:', parsedResult);
                }
                
            } catch (error) {
                resultDiv.innerHTML = \`
                    <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; border: 1px solid #f5c6cb;">
                        <h4>❌ Network Error</h4>
                        <p>Failed to send request: \${error.message}</p>
                        <p><strong>Possible causes:</strong></p>
                        <ul>
                            <li>Server is not running</li>
                            <li>Missing environment variables</li>
                            <li>Network connectivity issues</li>
                        </ul>
                    </div>
                \`;
                console.error('Network error:', error);
            }
        }
    </script>
</body>
</html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`🔧 Local testing server running at http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  📊 Health Check:      http://localhost:${PORT}/api/test`);
  console.log(`  🐙 GitHub Test:       http://localhost:${PORT}/api/test?test=github`);
  console.log(`  🎫 Jira Test:         http://localhost:${PORT}/api/test?test=jira`);
  console.log(`  🚀 Release Test:      http://localhost:${PORT}/api/test?test=release&release=2.1.0`);
  console.log(`  🧪 All Tests:         http://localhost:${PORT}/api/test?test=all&release=2.1.0`);
  console.log(`  📢 Announce:          http://localhost:${PORT}/api/announce (POST)`);
  console.log(`  🔍 Debug Channels:    http://localhost:${PORT}/api/debug-channels?search=dani`);
  console.log('');
  console.log('💡 Tip: Open your browser to see a friendly testing interface');
  console.log('');
  console.log('Environment status:');
  console.log(`  🔑 Test API Key:      ${process.env.TEST_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  🔐 Announce API Key:  ${process.env.ANNOUNCE_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  🤖 Slack Bot Token:   ${process.env.SLACK_BOT_TOKEN ? '✅ Set' : '❌ Not set'}`);
  console.log(`  🐙 GitHub Token:      ${process.env.GITHUB_TOKEN ? '✅ Set' : '❌ Not set'}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down local testing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down local testing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
}); 