// Import necessary libraries
const { App } = require('@slack/bolt');
const { Octokit } = require('@octokit/rest');
const JiraApi = require('jira-client');
require('dotenv').config();

// --- Initialize clients ---
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const jira = new JiraApi({
  protocol: 'https',
  host: 'process.env.GITHUB_OWNER.atlassian.net',
  username: process.env.JIRA_USERNAME,
  password: process.env.JIRA_API_TOKEN, // Use API Token as password
  apiVersion: '2',
  strictSSL: true,
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
    const releaseCommitShas = new Set(comparison.commits.map(commit => commit.sha));

    // --- 2. Get recently closed Jira tickets ---
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    const jqlDate = twoMonthsAgo.toISOString().split('T')[0];
    
    // Note: The JQL for board/sprint is often complex. A simpler, effective query is by project and status.
    const jqlQuery = `project = ${JIRA_PROJECT} AND status = Closed AND updated >= "${jqlDate}"`;
    const searchResult = await jira.searchJira(jqlQuery, { fields: ["summary", "comment"] });

    // --- 3. Cross-reference Jira tickets with commits ---
    const releaseChanges = [];
    const addedIssues = new Set(); // To prevent duplicate entries

    for (const issue of searchResult.issues) {
      const allText = [
        issue.fields.description,
        ...(issue.fields.comment?.comments.map(c => c.body) || [])
      ].join(' ');

      const commitRegex = /github\.com\/.*?\/.*?\/commit\/([a-f0-9]{40})/g;
      let match;
      while ((match = commitRegex.exec(allText)) !== null) {
        const commitSha = match[1];
        if (releaseCommitShas.has(commitSha) && !addedIssues.has(issue.key)) {
          releaseChanges.push(
            `https://process.env.GITHUB_OWNER.atlassian.net/browse/${issue.key}\n${issue.key} ${issue.fields.summary}`
          );
          addedIssues.add(issue.key);
          break; // Move to the next issue once a match is found
        }
      }
    }

    // --- 4. Format and send the Slack message ---
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