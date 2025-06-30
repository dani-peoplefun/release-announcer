#!/usr/bin/env node

/**
 * Local testing script for the Release Announcer bot
 * Run with: node scripts/test-local.js
 */

const http = require('http');
const url = require('url');

// Import the test handler
const testHandler = require('../api/test');

const PORT = 3001;

// Create a simple HTTP server to test the endpoint locally
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/api/test') {
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

    try {
      await testHandler(vercelReq, vercelRes);
    } catch (error) {
      console.error('Error running test:', error);
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
    <p>Click the links below to test different endpoints:</p>
    
    <div>
        <a href="/api/test" class="test-button">Health Check</a>
        <a href="/api/test?test=github" class="test-button">Test GitHub</a>
        <a href="/api/test?test=jira" class="test-button">Test Jira</a>
        <a href="/api/test?test=release&release=2.1.0" class="test-button">Test Release (2.1.0)</a>
        <a href="/api/test?test=all&release=2.1.0" class="test-button">Run All Tests</a>
    </div>
    
    <h2>Environment Variables Status</h2>
    <p>Make sure you have created a <code>.env.local</code> file with all required environment variables.</p>
    
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
  console.log('');
  console.log('💡 Tip: Open your browser to see a friendly testing interface');
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