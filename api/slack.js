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
app.command('/release', async (args) => {
  try {
    const { command, ack, respond, say } = args;
    
    // Acknowledge the command immediately
    if (typeof ack === 'function') {
      await ack();
    } else {
      console.error('ack is not a function:', typeof ack, ack);
      return;
    }

    const commandText = command?.text?.trim();
    if (!commandText) {
      await respond('Please provide a release number.');
      return;
    }

    // Extract release number from command text (handle cases like "/release 67" or just "67")
    const releaseMatch = commandText.match(/(?:\/release\s+)?(.+)/);
    const releaseNumber = releaseMatch ? releaseMatch[1].trim() : commandText;
    
    if (!releaseNumber) {
      await respond('Please provide a valid release number.');
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

      // --- 2. Process commits and extract JIRA references ---
      const releaseChanges = [];
      const processedCommits = new Set(); // To prevent duplicate commits
      
      // Regex to find JIRA ticket references (e.g., process.env.JIRA_PROJECT-12345, process.env.JIRA_PROJECT-123)
      const jiraRegex = new RegExp(`\\b${JIRA_PROJECT}-\\d+\\b`, 'gi');

      for (const commit of comparison.commits) {
        const commitSha = commit.sha.substring(0, 7);
        const commitTitle = commit.commit.message.split('\n')[0]; // First line is the title
        const commitMessage = commit.commit.message; // Full message
        
        // Skip if we've already processed this commit
        if (processedCommits.has(commitSha)) {
          continue;
        }
        processedCommits.add(commitSha);
        
        // Check both title and full message for JIRA references
        const allText = `${commitTitle} ${commitMessage}`;
        const matches = allText.match(jiraRegex);
        
        if (matches && matches.length > 0) {
          // Found JIRA references - link to first one found
          const firstJiraTicket = matches[0].toUpperCase();
          releaseChanges.push(
            `• [${firstJiraTicket}](${process.env.JIRA_SERVER}/browse/${firstJiraTicket}) - ${commitTitle}`
          );
        } else {
          // No JIRA reference found - just show the commit
          releaseChanges.push(
            `• ${commitTitle}`
          );
        }
      }

      // --- 3. Create confirmation message ---
      let previewMessage;
      if (releaseChanges.length > 0) {
        const changesText = releaseChanges.join('\n');
        previewMessage = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
      } else {
        previewMessage = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:* No commits found in this release.`;
      }

      // Send confirmation message with buttons
      await respond({
        text: "Release announcement preview:",
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
                  text: "✅ Send to Channel"
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
      
      // Provide more helpful error messages
      if (error.status === 404) {
        const previousRelease = getPreviousRelease(releaseNumber);
        await respond(`❌ Could not find release branches in GitHub.\n\nPlease check that these branches exist:\n• \`releases/${previousRelease}\` (previous release)\n• \`releases/${releaseNumber}\` (current release)\n\nRepository: \`${GITHUB_OWNER}/${GITHUB_REPO}\``);
      } else if (error.message.includes('Invalid release number format')) {
        await respond(`❌ Invalid release number format: \`${releaseNumber}\`\n\nPlease provide a valid release number (e.g., "67" or "2.1.0").`);
      } else if (error.message.includes('Cannot determine previous release')) {
        await respond(`❌ Cannot determine previous release for: \`${releaseNumber}\`\n\nRelease numbers must be greater than 1.`);
      } else {
        await respond(`❌ An error occurred: ${error.message}`);
      }
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

// --- Interactive Button Handlers ---
app.action('send_announcement', async ({ ack, body, say, respond }) => {
  try {
    await ack();
    
    // Parse the announcement data from the button value
    const buttonData = JSON.parse(body.actions[0].value);
    const { message, releaseNumber } = buttonData;
    
    // Send the announcement to the channel
    await say({
      text: message,
      response_type: 'in_channel'
    });
    
    // Update the original message to show it was sent
    await respond({
      text: `✅ Release announcement for \`${releaseNumber}\` has been sent to the channel.`,
      response_type: 'ephemeral',
      replace_original: true
    });
    
  } catch (error) {
    console.error('Send announcement error:', error);
    await respond({
      text: `❌ Failed to send announcement: ${error.message}`,
      response_type: 'ephemeral',
      replace_original: true
    });
  }
});

app.action('cancel_announcement', async ({ ack, respond, body }) => {
  try {
    await ack();
    
    const releaseNumber = body.message?.blocks?.[1]?.text?.text?.match(/releases\/(.+?)`/)?.[1] || 'unknown';
    
    // Update the original message to show it was cancelled
    await respond({
      text: `❌ Release announcement for \`${releaseNumber}\` was cancelled.`,
      response_type: 'ephemeral',
      replace_original: true
    });
    
  } catch (error) {
    console.error('Cancel announcement error:', error);
    await respond({
      text: `❌ Failed to cancel announcement: ${error.message}`,
      response_type: 'ephemeral',
      replace_original: true
    });
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