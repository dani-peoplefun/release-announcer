// Import necessary libraries
const { App } = require('@slack/bolt');
const { createHmac } = require('crypto');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// --- Initialize clients ---
// Initialize app without receiver - we'll handle requests manually
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
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

// Note: Command and action handlers removed - now handled manually in handleSlackRequest function

// --- Manual Signature Verification ---
function verifySlackSignature(signingSecret, requestSignature, timestamp, body) {
  // Slack signatures expire after 5 minutes
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
  if (parseInt(timestamp) < fiveMinutesAgo) {
    throw new Error('Request timestamp too old');
  }

  // Create the signature base string
  const sigBaseString = `v0:${timestamp}:${body}`;
  
  // Create the expected signature
  const expectedSignature = `v0=${createHmac('sha256', signingSecret)
    .update(sigBaseString, 'utf8')
    .digest('hex')}`;

  // Compare signatures
  if (requestSignature !== expectedSignature) {
    throw new Error('Invalid signature');
  }
}

// --- Request Handler ---
async function handleSlackRequest(requestBody, headers) {
  const signature = headers['x-slack-signature'];
  const timestamp = headers['x-slack-request-timestamp'];
  
  // Verify signature
  verifySlackSignature(process.env.SLACK_SIGNING_SECRET, signature, timestamp, requestBody);
  
  // Parse the request
  const params = new URLSearchParams(requestBody);
  const payload = Object.fromEntries(params);
  
  // Check if it's an interactive component (button click)
  if (payload.payload) {
    // Interactive component - parse JSON payload
    const interactivePayload = JSON.parse(payload.payload);
    
    if (interactivePayload.actions && interactivePayload.actions[0]) {
      const action = interactivePayload.actions[0];
      
      if (action.action_id === 'send_announcement') {
        // Handle send announcement
        const buttonData = JSON.parse(action.value);
        const { message, releaseNumber } = buttonData;
        
        // Send the announcement to the channel
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: interactivePayload.channel.id,
          text: message,
        });
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            text: `✅ Release announcement for \`${releaseNumber}\` has been sent to the channel.`,
            response_type: 'ephemeral',
            replace_original: true
          }),
          headers: { 'Content-Type': 'application/json' }
        };
        
      } else if (action.action_id === 'cancel_announcement') {
        // Handle cancel announcement
        const releaseNumber = interactivePayload.message?.blocks?.[1]?.text?.text?.match(/releases\/(.+?)`/)?.[1] || 'unknown';
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            text: `❌ Release announcement for \`${releaseNumber}\` was cancelled.`,
            response_type: 'ephemeral',
            replace_original: true
          }),
          headers: { 'Content-Type': 'application/json' }
        };
      }
    }
  } else if (payload.command === '/release') {
    // Slash command - handle via the app
    const commandText = payload.text?.trim();
    if (!commandText) {
      return {
        statusCode: 200,
        body: JSON.stringify({ text: 'Please provide a release number.' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Extract release number
    const releaseMatch = commandText.match(/(?:\/release\s+)?(.+)/);
    const releaseNumber = releaseMatch ? releaseMatch[1].trim() : commandText;
    
    if (!releaseNumber) {
      return {
        statusCode: 200,
        body: JSON.stringify({ text: 'Please provide a valid release number.' }),
        headers: { 'Content-Type': 'application/json' }
      };
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
        const matches = allText.match(jiraRegex);
        
        if (matches && matches.length > 0) {
          const firstJiraTicket = matches[0].toUpperCase();
          releaseChanges.push(
            `• [${commitTitle}](${process.env.JIRA_SERVER}/browse/${firstJiraTicket})`
          );
        } else {
          releaseChanges.push(`• ${commitTitle}`);
        }
      }

      // Create confirmation message
      let previewMessage;
      if (releaseChanges.length > 0) {
        const changesText = releaseChanges.join('\n');
        previewMessage = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
      } else {
        previewMessage = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:* No commits found in this release.`;
      }

      // Return response with buttons
      return {
        statusCode: 200,
        body: JSON.stringify({
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
        }),
        headers: { 'Content-Type': 'application/json' }
      };

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
      
      return {
        statusCode: 200,
        body: JSON.stringify({ text: errorMessage }),
        headers: { 'Content-Type': 'application/json' }
      };
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ text: 'Unknown request type' }),
    headers: { 'Content-Type': 'application/json' }
  };
}

// --- Vercel Export ---
module.exports = async (req, res) => {
  try {
    // Get raw body for signature verification
    let rawBody;
    
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (req.body && typeof req.body === 'object') {
      rawBody = new URLSearchParams(req.body).toString();
    } else {
      rawBody = '';
    }

    // Handle the Slack request
    const response = await handleSlackRequest(rawBody, req.headers);
    
    res.status(response.statusCode);
    
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    
    res.send(response.body);

  } catch (error) {
    console.error('Failed to process request:', error);
    console.error('Request details:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: typeof req.body === 'string' ? req.body.substring(0, 200) : req.body
    });
    
    if (error.message.includes('Invalid signature') || error.message.includes('Request timestamp too old')) {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}; 