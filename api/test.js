// Import necessary libraries
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// --- Initialize clients ---
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

// --- Test functions ---
async function testGitHubConnection() {
  try {
    const { data: user } = await octokit.users.getAuthenticated();
    const { data: repo } = await octokit.repos.get({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
    });
    
    return {
      success: true,
      data: {
        authenticatedUser: user.login,
        repository: `${repo.full_name}`,
        repositoryUrl: repo.html_url,
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
    };
  }
}

async function testJiraConnection() {
  try {
    // Since we no longer connect to JIRA directly, just validate configuration
    if (!process.env.JIRA_SERVER) {
      throw new Error('JIRA_SERVER environment variable not set');
    }

    if (!process.env.JIRA_PROJECT) {
      throw new Error('JIRA_PROJECT not configured');
    }

    // Validate JIRA_SERVER format
    const jiraUrl = process.env.JIRA_SERVER.startsWith('https://') 
      ? process.env.JIRA_SERVER 
      : `https://${process.env.JIRA_SERVER}`;

    return {
      success: true,
      data: {
        jiraServer: jiraUrl,
        projectKey: process.env.JIRA_PROJECT,
        projectUrl: `${jiraUrl}/projects/${process.env.JIRA_PROJECT}`,
        extractionRegex: `\\b${process.env.JIRA_PROJECT}-\\d+\\b`,
        note: 'JIRA connection test validates configuration only (no API calls needed)',
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: 'JIRA configuration validation failed',
    };
  }
}

async function testReleaseAnnouncement(releaseNumber) {
  const results = {
    releaseNumber,
    previousRelease: getPreviousRelease(releaseNumber),
    github: { success: false },
    jiraExtraction: { success: false },
    announcement: null,
  };

  try {
    // --- 1. Test GitHub comparison ---
    const previousRelease = getPreviousRelease(releaseNumber);
    const { data: comparison } = await octokit.repos.compareCommits({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      base: `releases/${previousRelease}`,
      head: `releases/${releaseNumber}`,
    });
    
    results.github = {
      success: true,
      commitCount: comparison.commits.length,
      commits: comparison.commits.slice(0, 5).map(commit => ({
        sha: commit.sha.substring(0, 7),
        message: commit.commit.message.split('\n')[0],
        author: commit.commit.author.name,
        date: commit.commit.author.date,
      })),
      moreCommits: comparison.commits.length > 5,
    };

    // --- 2. Process commits and extract JIRA references ---
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
          url: `${process.env.JIRA_SERVER}/browse/${firstJiraTicket}`,
          commitSha: commitSha,
          commitAuthor: commit.commit.author.name,
          allJiraRefs: jiraMatches.map(m => m.toUpperCase()),
        };
        
        // Add GitHub info if GitHub reference found
        if (githubMatches && githubMatches.length > 0) {
          const firstGithubRef = githubMatches[0].replace('#', '');
          const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/pull/${firstGithubRef}`;
          changeEntry.githubKey = firstGithubRef;
          changeEntry.githubUrl = githubUrl;
          changeEntry.allGithubRefs = githubMatches;
        }
        
        releaseChanges.push(changeEntry);
      } else if (githubMatches && githubMatches.length > 0) {
        // No JIRA but found GitHub reference
        const firstGithubRef = githubMatches[0].replace('#', '');
        const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/pull/${firstGithubRef}`;
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
      }
      // Skip commits with no references (don't add to releaseChanges)
    }

    const commitsWithGithub = releaseChanges.filter(change => change.type === 'github').length;
    const commitsSkipped = commits.length - releaseChanges.length;
    
    results.jiraExtraction = {
      success: true,
      totalCommits: commits.length,
      commitsIncluded: releaseChanges.length,
      commitsSkipped: commitsSkipped,
      commitsWithJira: commitsWithJira,
      commitsWithGithub: commitsWithGithub,
      totalJiraReferences,
      releaseChanges,
      regex: jiraRegex.toString(),
    };

    // --- 3. Generate announcement preview ---
    if (releaseChanges.length > 0) {
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
      
      results.announcement = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
    } else {
      results.announcement = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:* No commits found in this release.`;
    }

  } catch (error) {
    if (!results.github.success) {
      results.github = { success: false, error: error.message };
    } else {
      results.jiraExtraction = { success: false, error: error.message };
    }
  }

  return results;
}

// --- Security helpers ---
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_REQUESTS = 10; // Max requests per window
const requestCounts = new Map();

function checkRateLimit(clientId) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [id, data] of requestCounts.entries()) {
    if (data.timestamp < windowStart) {
      requestCounts.delete(id);
    }
  }
  
  const clientData = requestCounts.get(clientId) || { count: 0, timestamp: now };
  
  if (clientData.timestamp < windowStart) {
    // Reset counter for new window
    clientData.count = 1;
    clientData.timestamp = now;
  } else {
    clientData.count++;
  }
  
  requestCounts.set(clientId, clientData);
  
  return {
    allowed: clientData.count <= RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - clientData.count),
    resetTime: clientData.timestamp + RATE_LIMIT_WINDOW
  };
}

function isTestingDisabled() {
  // Disable testing in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ENDPOINT !== 'true') {
    return true;
  }

  return false;
}

function validateTestAccess(req) {
  const errors = [];
  
  // Check if testing is disabled
  if (isTestingDisabled()) {
    errors.push('Testing endpoint is disabled in production');
  }
  
  // Check for API key if required
  const requiredApiKey = process.env.TEST_API_KEY;
  if (requiredApiKey) {
    const providedKey = req.headers['x-api-key'] || req.query.api_key;
    if (!providedKey || providedKey !== requiredApiKey) {
      errors.push('Invalid or missing API key');
    }
  }
  
  // Check for allowed origins if specified
  const allowedOrigins = process.env.TEST_ALLOWED_ORIGINS;
  if (allowedOrigins) {
    const origin = req.headers.origin || req.headers.referer;
    const allowed = allowedOrigins.split(',').map(o => o.trim());
    if (origin && !allowed.some(allowed => origin.includes(allowed))) {
      errors.push('Origin not allowed');
    }
  }
  
  return {
    allowed: errors.length === 0,
    errors
  };
}

// --- Main handler ---
module.exports = async (req, res) => {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // CORS headers (restrictive by default)
  const allowedOrigin = process.env.TEST_ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3001';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limiting
  const clientId = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientId);
  
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
  res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());
  
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Too many requests. Try again after ${new Date(rateLimit.resetTime).toISOString()}`,
      retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
    });
  }
  
  // Validate access permissions
  const accessCheck = validateTestAccess(req);
  if (!accessCheck.allowed) {
    return res.status(403).json({
      error: 'Access denied',
      reasons: accessCheck.errors,
      hint: 'Contact your administrator for access'
    });
  }

  const { method, query } = req;
  const { test, release } = query;

  try {
    // Health check
    if (!test) {
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        availableTests: [
          'health',
          'github',
          'jira',
          'release',
          'all'
        ],
        usage: {
          health: '/api/test',
          github: '/api/test?test=github',
          jira: '/api/test?test=jira',
          release: '/api/test?test=release&release=2.1.0',
          all: '/api/test?test=all&release=2.1.0'
        },
        environment: {
          hasSlackToken: !!process.env.SLACK_BOT_TOKEN,
          hasSlackSecret: !!process.env.SLACK_SIGNING_SECRET,
          hasGitHubToken: !!process.env.GITHUB_TOKEN,
          hasJiraServer: !!process.env.JIRA_SERVER,
        }
      });
    }

    // GitHub connection test
    if (test === 'github') {
      const result = await testGitHubConnection();
      return res.status(result.success ? 200 : 500).json({
        test: 'github',
        ...result,
      });
    }

    // Jira connection test
    if (test === 'jira') {
      const result = await testJiraConnection();
      return res.status(result.success ? 200 : 500).json({
        test: 'jira',
        ...result,
      });
    }

    // Release announcement test
    if (test === 'release') {
      if (!release) {
        return res.status(400).json({
          error: 'Release number required',
          usage: '/api/test?test=release&release=2.1.0'
        });
      }

      const result = await testReleaseAnnouncement(release);
      return res.status(200).json({
        test: 'release',
        ...result,
      });
    }

    // Run all tests
    if (test === 'all') {
      const releaseNumber = release || '2.1.0';
      
      const [githubResult, jiraResult, releaseResult] = await Promise.all([
        testGitHubConnection(),
        testJiraConnection(),
        testReleaseAnnouncement(releaseNumber),
      ]);

      return res.status(200).json({
        test: 'all',
        timestamp: new Date().toISOString(),
        github: githubResult,
        jira: jiraResult,
        release: releaseResult,
        overall: {
          success: githubResult.success && jiraResult.success && releaseResult.jiraExtraction.success,
          readyForProduction: githubResult.success && jiraResult.success,
        }
      });
    }

    // Unknown test
    return res.status(400).json({
      error: 'Unknown test type',
      availableTests: ['health', 'github', 'jira', 'release', 'all']
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}; 