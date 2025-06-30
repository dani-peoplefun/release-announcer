// Import necessary libraries
const { Octokit } = require('@octokit/rest');
const JiraApi = require('jira-client');
require('dotenv').config();

// --- Initialize clients ---
const jira = new JiraApi({
  protocol: 'https',
  host: process.env.JIRA_SERVER,
  username: process.env.JIRA_USERNAME,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '2',
  strictSSL: true,
});

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const GITHUB_OWNER = 'process.env.GITHUB_OWNER';
const GITHUB_REPO = 'process.env.GITHUB_REPO';
const JIRA_PROJECT = 'process.env.JIRA_PROJECT';

// --- Helper function to determine previous release ---
function getPreviousRelease(releaseNumber) {
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

// --- Test functions ---
async function testGitHubConnection() {
  try {
    const { data: user } = await octokit.users.getAuthenticated();
    const { data: repo } = await octokit.repos.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
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
    const user = await jira.getCurrentUser();
    const project = await jira.getProject(JIRA_PROJECT);
    
    return {
      success: true,
      data: {
        authenticatedUser: user.displayName,
        userEmail: user.emailAddress,
        project: project.name,
        projectKey: project.key,
        projectUrl: `${process.env.JIRA_SERVER}/projects/${project.key}`,
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: error.errorMessages || error.errors || null,
    };
  }
}

async function testReleaseAnnouncement(releaseNumber) {
  const results = {
    releaseNumber,
    previousRelease: getPreviousRelease(releaseNumber),
    github: { success: false },
    jira: { success: false },
    crossReference: { success: false },
    announcement: null,
  };

  try {
    // --- 1. Test GitHub comparison ---
    const previousRelease = getPreviousRelease(releaseNumber);
    const { data: comparison } = await octokit.repos.compareCommits({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
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

    const releaseCommitShas = new Set(comparison.commits.map(commit => commit.sha));

    // --- 2. Test Jira search ---
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    const jqlDate = twoMonthsAgo.toISOString().split('T')[0];
    
    const jqlQuery = `project = ${JIRA_PROJECT} AND status = Closed AND updated >= "${jqlDate}"`;
    const searchResult = await jira.searchJira(jqlQuery, { 
      fields: ["summary", "comment", "description"],
      maxResults: 50,
    });

    results.jira = {
      success: true,
      totalIssues: searchResult.total,
      searchedIssues: searchResult.issues.length,
      jqlQuery,
      sampleIssues: searchResult.issues.slice(0, 3).map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        url: `${process.env.JIRA_SERVER}/browse/${issue.key}`,
      })),
    };

    // --- 3. Test cross-reference ---
    const releaseChanges = [];
    const addedIssues = new Set();
    let totalCommitMatches = 0;

    for (const issue of searchResult.issues) {
      const allText = [
        issue.fields.description || '',
        ...(issue.fields.comment?.comments.map(c => c.body) || [])
      ].join(' ');

      const commitRegex = /github\.com\/.*?\/.*?\/commit\/([a-f0-9]{40})/g;
      let match;
      while ((match = commitRegex.exec(allText)) !== null) {
        const commitSha = match[1];
        totalCommitMatches++;
        
        if (releaseCommitShas.has(commitSha) && !addedIssues.has(issue.key)) {
          releaseChanges.push({
            key: issue.key,
            summary: issue.fields.summary,
            url: `${process.env.JIRA_SERVER}/browse/${issue.key}`,
            matchedCommit: commitSha.substring(0, 7),
          });
          addedIssues.add(issue.key);
          break;
        }
      }
    }

    results.crossReference = {
      success: true,
      totalCommitReferences: totalCommitMatches,
      matchedIssues: releaseChanges.length,
      releaseChanges,
    };

    // --- 4. Generate announcement ---
    if (releaseChanges.length > 0) {
      const changesText = releaseChanges
        .map(change => `${change.url}\n${change.key} ${change.summary}`)
        .join('\n');
      
      results.announcement = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
    } else {
      results.announcement = `No new changes found for release ${releaseNumber}.`;
    }

  } catch (error) {
    if (!results.github.success) {
      results.github = { success: false, error: error.message };
    } else if (!results.jira.success) {
      results.jira = { success: false, error: error.message };
    } else {
      results.crossReference = { success: false, error: error.message };
    }
  }

  return results;
}

// --- Main handler ---
module.exports = async (req, res) => {
  // Set CORS headers for testing from browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
          hasJiraUsername: !!process.env.JIRA_USERNAME,
          hasJiraToken: !!process.env.JIRA_API_TOKEN,
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
          success: githubResult.success && jiraResult.success && releaseResult.crossReference.success,
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