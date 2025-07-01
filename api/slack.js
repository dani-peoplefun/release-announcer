// Import necessary libraries
const { App, AwsLambdaReceiver } = require('@slack/bolt');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// --- Initialize clients ---
// Use AwsLambdaReceiver for serverless environments (works with Vercel too)
const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  processBeforeResponse: true,
});

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const GITHUB_OWNER = 'process.env.GITHUB_OWNER';
const GITHUB_REPO = 'process.env.GITHUB_REPO';
const JIRA_PROJECT = 'process.env.JIRA_PROJECT';

// --- Helper function to determine previous release ---
function getPreviousRelease(releaseNumber) {
  // This is a simplified example. You may need more complex logic.
  const parts = releaseNumber.split('.');
  if (parts.length > 1) {
    const minorVersion = parseInt(parts[1], 10);
    if (minorVersion > 0) {
      return `${parts[0]}.${minorVersion - 1}`;
    }
  }
  const majorVersion = parseInt(parts[0], 10);
  return (majorVersion - 1).toString();
}

// --- Slash Command Handler ---
app.command('/release-announce', async (args) => {
  try {
    // Debug: Log what we're receiving
    console.log('Command handler args:', Object.keys(args));
    console.log('ack type:', typeof args.ack);
    console.log('command:', args.command);
    
    const { command, ack, respond, say } = args;
    
    // Acknowledge the command immediately
    if (typeof ack === 'function') {
      await ack();
    } else {
      console.error('ack is not a function:', typeof ack, ack);
      return;
    }

    const releaseNumber = command?.text?.trim();
    if (!releaseNumber) {
      await respond('Please provide a release number.');
      return;
    }

    try {
      // --- 1. Get commits from GitHub ---
      const previousRelease = getPreviousRelease(releaseNumber);
      const { data: comparison } = await octokit.repos.compareCommits({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        base: `releases/${previousRelease}`,
        head: `releases/${releaseNumber}`,
      });

      // --- 2. Extract JIRA references from commit messages ---
      const releaseChanges = [];
      const addedIssues = new Set(); // To prevent duplicate entries
      
      // Regex to find JIRA ticket references (e.g., process.env.JIRA_PROJECT-12345, process.env.JIRA_PROJECT-123)
      const jiraRegex = new RegExp(`\\b${JIRA_PROJECT}-\\d+\\b`, 'gi');

      for (const commit of comparison.commits) {
        const commitTitle = commit.commit.message.split('\n')[0]; // First line is the title
        const commitMessage = commit.commit.message; // Full message
        
        // Check both title and full message for JIRA references
        const allText = `${commitTitle} ${commitMessage}`;
        const matches = allText.match(jiraRegex);
        
        if (matches) {
          // Process each unique JIRA reference found in this commit
          for (const match of matches) {
            const issueKey = match.toUpperCase(); // Normalize to uppercase
            if (!addedIssues.has(issueKey)) {
              releaseChanges.push(
                `${process.env.JIRA_SERVER}/browse/${issueKey}\n${issueKey} ${commitTitle}`
              );
              addedIssues.add(issueKey);
            }
          }
        }
      }

      // --- 3. Format and send the Slack message ---
      let message;
      if (releaseChanges.length > 0) {
        const changesText = releaseChanges.join('\n');
        message = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
      } else {
        message = `No new changes found for release ${releaseNumber}.`;
      }

      await respond({ text: message, response_type: 'in_channel' });

    } catch (error) {
      console.error('Release announcement error:', error);
      await respond(`An error occurred: ${error.message}`);
    }
  } catch (outerError) {
    console.error('Command handler error:', outerError);
    // If respond is not available, we can't send a message back
    if (typeof respond === 'function') {
      try {
        await respond('An unexpected error occurred. Please try again.');
      } catch (respondError) {
        console.error('Failed to send error response:', respondError);
      }
    }
  }
});

// --- Error handling for unhandled errors ---
app.error(async (error) => {
  console.error('Slack app error:', error);
});

// --- Vercel Export ---
// This exports the app handler for Vercel's serverless environment
module.exports = async (req, res) => {
  try {
    // Get request body - Slack sends form-encoded data
    let body = '';
    if (req.body) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else {
        // If it's already parsed as an object, convert back to form data
        body = new URLSearchParams(req.body).toString();
      }
    }

    // Convert Vercel request to AWS Lambda event format
    const lambdaEvent = {
      body: body,
      headers: req.headers,
      httpMethod: req.method,
      isBase64Encoded: false,
      queryStringParameters: req.query || {},
    };

    // Create AWS Lambda context
    const lambdaContext = {
      callbackWaitsForEmptyEventLoop: false,
    };

    // Call the AWS Lambda receiver
    const result = await awsLambdaReceiver.start();
    const response = await result(lambdaEvent, lambdaContext);

    // Send response back to Vercel
    res.status(response.statusCode || 200);
    
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    
    res.send(response.body || '');

  } catch (error) {
    console.error('Failed to process request:', error);
    console.error('Request details:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}; 