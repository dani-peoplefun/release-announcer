// Import necessary libraries
const { App } = require('@slack/bolt');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// --- Initialize clients ---
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
app.command('/release-announce', async ({ command, ack, respond }) => {
  // Acknowledge the command immediately
  await ack();

  const releaseNumber = command.text;
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
    console.error(error);
    await respond(`An error occurred: ${error.message}`);
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
    const handler = await app.start();
    handler(req, res);
  } catch (error) {
    console.error('Failed to start app:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 