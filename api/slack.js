// Import necessary libraries
const { App, AwsLambdaReceiver } = require('@slack/bolt');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// --- Initialize clients ---
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
  // Handle different release numbering schemes
  
  // Check if it's a semantic version (e.g., "2.1.0")
  if (releaseNumber.includes('.')) {
    const parts = releaseNumber.split('.');
    if (parts.length > 1) {
      const minorVersion = parseInt(parts[1], 10);
      if (minorVersion > 0) {
        return `${parts[0]}.${minorVersion - 1}`;
      }
    }
    const majorVersion = parseInt(parts[0], 10);
    return (majorVersion - 1).toString();
  } else {
    // Handle simple numeric releases (e.g., "67" -> "66")
    const currentNumber = parseInt(releaseNumber, 10);
    if (isNaN(currentNumber)) {
      throw new Error(`Invalid release number format: ${releaseNumber}`);
    }
    if (currentNumber <= 1) {
      throw new Error(`Cannot determine previous release for release number: ${releaseNumber}`);
    }
    return (currentNumber - 1).toString();
  }
}

// --- Slash Command Handler ---
app.command('/release', async ({ command, ack, respond, say }) => {
  try {
    await ack();

    const commandText = command?.text?.trim();
    if (!commandText) {
      await respond('Please provide a release number.');
      return;
    }

    // Extract release number
    const releaseMatch = commandText.match(/(?:\/release\s+)?(.+)/);
    const releaseNumber = releaseMatch ? releaseMatch[1].trim() : commandText;
    
    if (!releaseNumber) {
      await respond('Please provide a valid release number.');
      return;
    }

    try {
      // Get commits from GitHub
      const previousRelease = getPreviousRelease(releaseNumber);
      
      const { data: comparison } = await octokit.repos.compareCommits({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        base: `releases/${previousRelease}`,
        head: `releases/${releaseNumber}`,
      });

      // Process commits and extract JIRA references
      const releaseChanges = [];
      const processedCommits = new Set();
      const jiraRegex = new RegExp(`\\b${JIRA_PROJECT}-\\d+\\b`, 'gi');

      for (const commit of comparison.commits) {
        const commitSha = commit.sha.substring(0, 7);
        const commitTitle = commit.commit.message.split('\n')[0];
        const commitMessage = commit.commit.message;
        
        if (processedCommits.has(commitSha)) {
          continue;
        }
        processedCommits.add(commitSha);
        
        const allText = `${commitTitle} ${commitMessage}`;
        const jiraMatches = allText.match(jiraRegex);
        const githubRegex = /#(\d+)/g;
        const githubMatches = allText.match(githubRegex);
        
        if (jiraMatches && jiraMatches.length > 0) {
          // Found JIRA references - link to first one found
          const firstJiraTicket = jiraMatches[0].toUpperCase();
          // Remove GitHub reference from title for clean JIRA link
          const cleanTitle = commitTitle.replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*#\d+\s*$/, '');
          let changeText = `• <${process.env.JIRA_SERVER}/browse/${firstJiraTicket}|${cleanTitle}>`;
          
          // Append GitHub link if GitHub reference found
          if (githubMatches && githubMatches.length > 0) {
            const firstGithubRef = githubMatches[0].replace('#', '');
            const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/pull/${firstGithubRef}`;
            changeText += ` <${githubUrl}|(#${firstGithubRef})>`;
          }
          
          releaseChanges.push(changeText);
        } else if (githubMatches && githubMatches.length > 0) {
          // No JIRA but found GitHub reference
          const firstGithubRef = githubMatches[0].replace('#', '');
          const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/pull/${firstGithubRef}`;
          // Remove the GitHub reference from the title since it's already in the link
          const cleanTitle = commitTitle.replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*#\d+\s*$/, '');
          releaseChanges.push(
            `• ${cleanTitle} <${githubUrl}|(#${firstGithubRef})>`
          );
        }
        // Skip commits with no references (don't add to releaseChanges)
      }

      // Create confirmation message
      let previewMessage;
      if (releaseChanges.length > 0) {
        const changesText = releaseChanges.join('\n');
        previewMessage = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
      } else {
        previewMessage = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:* No commits found in this release.`;
      }

      // Send confirmation message with buttons (ephemeral - only visible to user)
      await respond({
        text: "Release announcement preview:",
        response_type: 'ephemeral',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Preview of release announcement:*"
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: previewMessage
            }
          },
          {
            type: "actions",
            elements: [
                              {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "✅ Send Announcement"
                  },
                  style: "primary",
                  action_id: "send_announcement",
                  value: JSON.stringify({
                    message: previewMessage,
                    releaseNumber: releaseNumber
                  })
                },
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "❌ Cancel"
                },
                style: "danger",
                action_id: "cancel_announcement"
              }
            ]
          }
        ]
      });

    } catch (error) {
      console.error('Release announcement error:', error);
      
      let errorMessage;
      if (error.status === 404) {
        const previousRelease = getPreviousRelease(releaseNumber);
        errorMessage = `❌ Could not find release branches in GitHub.\n\nPlease check that these branches exist:\n• \`releases/${previousRelease}\` (previous release)\n• \`releases/${releaseNumber}\` (current release)\n\nRepository: \`${GITHUB_OWNER}/${GITHUB_REPO}\``;
      } else if (error.message.includes('Invalid release number format')) {
        errorMessage = `❌ Invalid release number format: \`${releaseNumber}\`\n\nPlease provide a valid release number (e.g., "67" or "2.1.0").`;
      } else if (error.message.includes('Cannot determine previous release')) {
        errorMessage = `❌ Cannot determine previous release for: \`${releaseNumber}\`\n\nRelease numbers must be greater than 1.`;
      } else {
        errorMessage = `❌ An error occurred: ${error.message}`;
      }
      
      await respond(errorMessage);
    }
  } catch (outerError) {
    console.error('Command handler error:', outerError);
    if (typeof respond === 'function') {
      try {
        await respond('An unexpected error occurred. Please try again.');
      } catch (respondError) {
        console.error('Failed to send error response:', respondError);
      }
    }
  }
});

// Note: Interactive button handlers moved to /api/slack-interactions.js

// --- Error handling for unhandled errors ---
app.error(async (error) => {
  console.error('Slack app error:', error);
});

// --- Vercel Export ---
module.exports = async (req, res) => {
  try {
    // Handle the request body properly for AWS Lambda receiver
    let body;
    
    if (typeof req.body === 'string') {
      body = req.body;
    } else if (req.body && typeof req.body === 'object') {
      // Convert object back to URL-encoded string for signature verification
      body = new URLSearchParams(req.body).toString();
    } else {
      body = '';
    }

    // Convert Vercel request to AWS Lambda event format
    const event = {
      body: body,
      headers: req.headers,
      httpMethod: req.method,
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      path: req.url,
      pathParameters: null,
      queryStringParameters: req.query || null,
      requestContext: {
        accountId: '',
        apiId: '',
        httpMethod: req.method,
        requestId: '',
        resourceId: '',
        resourcePath: req.url,
        stage: '',
      },
      resource: '',
      stageVariables: null,
    };

    // AWS Lambda context
    const context = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'slack-handler',
      functionVersion: '$LATEST',
      invokedFunctionArn: '',
      memoryLimitInMB: '1024',
      awsRequestId: 'vercel-' + Date.now(),
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    // Get the Lambda handler and process the request
    const handler = await awsLambdaReceiver.toHandler();
    const response = await handler(event, context);

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
      body: typeof req.body === 'string' ? req.body.substring(0, 200) : req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}; 