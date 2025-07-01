// Import necessary libraries
const { WebClient } = require('@slack/web-api');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// --- Initialize clients ---
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

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

// --- Helper function to ensure JIRA URL has proper protocol ---
function formatJiraServerUrl(jiraServer) {
  if (!jiraServer) return '';
  
  // If it already has a protocol, use as-is
  if (jiraServer.startsWith('http://') || jiraServer.startsWith('https://')) {
    return jiraServer;
  }
  
  // Otherwise, add https://
  return `https://${jiraServer}`;
}

// --- Main function to generate and send announcement ---
async function generateAndSendAnnouncement(releaseNumber, channelId, options = {}) {
  const {
    autoSend = false,
    filterEmptyCommits = true,
    includeCommitDetails = false,
    customMessage = null
  } = options;

  try {
    // --- 1. Get GitHub comparison data ---
    const previousRelease = getPreviousRelease(releaseNumber);
    const { data: comparison } = await octokit.repos.compareCommits({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      base: `releases/${previousRelease}`,
      head: `releases/${releaseNumber}`,
    });
    
    // --- 2. Process commits and extract JIRA/GitHub references ---
    const releaseChanges = [];
    const processedCommits = new Set();
    const jiraRegex = new RegExp(`\\b${process.env.JIRA_PROJECT}-\\d+\\b`, 'gi');
    let totalJiraReferences = 0;
    let commitsWithJira = 0;

    for (const commit of comparison.commits) {
      const commitSha = commit.sha.substring(0, 7);
      const commitTitle = commit.commit.message.split('\n')[0];
      const commitMessage = commit.commit.message;
      
      // Skip if we've already processed this commit
      if (processedCommits.has(commitSha)) {
        continue;
      }
      processedCommits.add(commitSha);
      
      // Check both title and full message for JIRA references
      const allText = `${commitTitle} ${commitMessage}`;
      const jiraMatches = allText.match(jiraRegex);
      const githubRegex = /#(\d+)/g;
      const githubMatches = allText.match(githubRegex);
      
      if (jiraMatches && jiraMatches.length > 0) {
        totalJiraReferences += jiraMatches.length;
        commitsWithJira++;
        
        // Found JIRA references - link to first one found
        const firstJiraTicket = jiraMatches[0].toUpperCase();
        // Remove GitHub reference from title for clean JIRA link
        const cleanTitle = commitTitle.replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*#\d+\s*$/, '');
        
        const changeEntry = {
          type: 'jira',
          key: firstJiraTicket,
          summary: cleanTitle,
          url: `${formatJiraServerUrl(process.env.JIRA_SERVER)}/browse/${firstJiraTicket}`,
          commitSha: commitSha,
          commitAuthor: commit.commit.author.name,
          allJiraRefs: jiraMatches.map(m => m.toUpperCase()),
        };
        
        // Add GitHub info if GitHub reference found
        if (githubMatches && githubMatches.length > 0) {
          const firstGithubRef = githubMatches[0].replace('#', '');
          const githubUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/pull/${firstGithubRef}`;
          changeEntry.githubKey = firstGithubRef;
          changeEntry.githubUrl = githubUrl;
          changeEntry.allGithubRefs = githubMatches;
        }
        
        releaseChanges.push(changeEntry);
      } else if (githubMatches && githubMatches.length > 0) {
        // No JIRA but found GitHub reference
        const firstGithubRef = githubMatches[0].replace('#', '');
        const githubUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/pull/${firstGithubRef}`;
        // Remove the GitHub reference from the title since it's already in the link
        const cleanTitle = commitTitle.replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*#\d+\s*$/, '');
        releaseChanges.push({
          type: 'github',
          key: firstGithubRef,
          summary: cleanTitle,
          url: githubUrl,
          commitSha: commitSha,
          commitAuthor: commit.commit.author.name,
          allGithubRefs: githubMatches,
        });
      } else if (!filterEmptyCommits) {
        // Include commits without references if filtering is disabled
        releaseChanges.push({
          type: 'plain',
          key: commitSha,
          summary: commitTitle,
          commitSha: commitSha,
          commitAuthor: commit.commit.author.name,
        });
      }
    }

    // --- 3. Generate announcement message ---
    let message;
    if (customMessage) {
      message = customMessage
        .replace('{{releaseNumber}}', releaseNumber)
        .replace('{{changeCount}}', releaseChanges.length);
    } else if (releaseChanges.length > 0) {
      const changesText = releaseChanges
        .map(change => {
          if (change.type === 'jira') {
            let changeText = `• <${change.url}|${change.summary}>`;
            // Append GitHub link if present
            if (change.githubUrl) {
              changeText += ` <${change.githubUrl}|(#${change.githubKey})>`;
            }
            return changeText;
          } else if (change.type === 'github') {
            return `• ${change.summary} <${change.url}|(#${change.key})>`;
          } else {
            return `• ${change.summary}`;
          }
        })
        .join('\n');
      
      message = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
    } else {
      message = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:* No commits found in this release.`;
    }

    // --- 4. Send to Slack ---
    const result = await slack.chat.postMessage({
      channel: channelId,
      text: message,
      mrkdwn: true
    });

    return {
      success: true,
      data: {
        releaseNumber,
        previousRelease,
        message,
        slackResponse: result,
        commits: {
          total: comparison.commits.length,
          processed: releaseChanges.length,
          withJira: commitsWithJira,
          withGithub: releaseChanges.filter(c => c.type === 'github').length,
          totalJiraReferences
        }
      }
    };

  } catch (error) {
    console.error('Announcement generation error:', error);
    return {
      success: false,
      error: error.message,
      details: error.response?.data || null
    };
  }
}

// --- Security and validation helpers ---
function validateApiKey(req) {
  const requiredApiKey = process.env.ANNOUNCE_API_KEY;
  if (!requiredApiKey) {
    return { valid: false, error: 'API key not configured on server' };
  }
  
  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!providedKey || providedKey !== requiredApiKey) {
    return { valid: false, error: 'Invalid or missing API key' };
  }
  
  return { valid: true };
}

function validateRequiredEnvVars() {
  const required = [
    'SLACK_BOT_TOKEN',
    'GITHUB_TOKEN', 
    'GITHUB_OWNER',
    'GITHUB_REPO',
    'JIRA_SERVER',
    'JIRA_PROJECT'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  
  return { valid: true };
}

// --- Main handler ---
module.exports = async (req, res) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests'
    });
  }

  try {
    // Validate environment variables
    const envCheck = validateRequiredEnvVars();
    if (!envCheck.valid) {
      return res.status(500).json({
        error: 'Server configuration error',
        missing: envCheck.missing
      });
    }

    // Validate API key
    const apiKeyCheck = validateApiKey(req);
    if (!apiKeyCheck.valid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: apiKeyCheck.error
      });
    }

    // Parse request body
    const { 
      releaseNumber, 
      channelId, 
      channelName,
      autoSend = true,
      filterEmptyCommits = true,
      includeCommitDetails = false,
      customMessage = null 
    } = req.body;

    // Validate required parameters
    if (!releaseNumber) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'releaseNumber is required'
      });
    }

    if (!channelId && !channelName) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Either channelId or channelName is required'
      });
    }

    // Resolve channel ID if channel name provided
    let targetChannelId = channelId;
    if (!targetChannelId && channelName) {
      try {
        // Try to find channel by name
        const channels = await slack.conversations.list({
          types: 'public_channel,private_channel'
        });
        
        const channel = channels.channels.find(c => 
          c.name === channelName || c.name === channelName.replace('#', '')
        );
        
        if (!channel) {
          return res.status(404).json({
            error: 'Channel not found',
            message: `Could not find channel: ${channelName}`
          });
        }
        
        targetChannelId = channel.id;
      } catch (slackError) {
        return res.status(500).json({
          error: 'Slack API error',
          message: slackError.message
        });
      }
    }

    // Generate and send announcement
    const result = await generateAndSendAnnouncement(releaseNumber, targetChannelId, {
      autoSend,
      filterEmptyCommits,
      includeCommitDetails,
      customMessage
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: `Release announcement sent for ${releaseNumber}`,
        ...result.data
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

  } catch (error) {
    console.error('Announce endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 