# Release Announcer Slack Bot

A Slack bot that automatically generates release announcements by extracting JIRA ticket references from GitHub commit messages. Built with Node.js and deployed on Vercel.

## Features

- 🚀 **Automated Release Announcements**: Generate release summaries with a simple `/release` command
- 🔗 **GitHub Integration**: Compares release branches to identify commits
- 🎫 **JIRA Reference Extraction**: Finds JIRA ticket references (e.g., process.env.JIRA_PROJECT-12345) in commit messages
- ✅ **Interactive Confirmation**: Preview and confirm before sending to channel
- 📝 **Complete Commit Coverage**: Shows all commits, with or without JIRA references
- 🔒 **Secure**: Uses Slack's request signing for authentication
- ⚡ **Serverless**: Deployed on Vercel for automatic scaling and zero server management

## How It Works

1. **User runs command**: `/release 67`
2. **GitHub Analysis**: Compares commits between previous release and current release
3. **Reference Extraction**: 
   - First looks for JIRA ticket references (e.g., process.env.JIRA_PROJECT-12345) in commit titles and messages
   - If no JIRA found, looks for GitHub issue/PR references (e.g., #544)
   - Creates clickable links for both JIRA tickets and GitHub issues/PRs
4. **Preview & Confirmation**: Shows a preview with interactive buttons to confirm or cancel
5. **Slack Announcement**: Posts the formatted message to the channel upon confirmation

## Prerequisites

Before setting up the bot, you'll need:

- A Slack workspace with admin permissions
- GitHub repository access
- Jira instance access
- Vercel account (free tier works fine)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd release-announcer
pnpm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp env.example .env.local
```

Fill in your actual values in `.env.local`:

- **SLACK_BOT_TOKEN**: Get from your Slack app's "OAuth & Permissions" page
- **SLACK_SIGNING_SECRET**: Get from your Slack app's "Basic Information" page
- **GITHUB_TOKEN**: Create a personal access token with repo permissions
- **JIRA_SERVER**: Your Jira server URL (e.g., https://yourcompany.atlassian.net) - used for generating ticket URLs

### 3. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" > "From scratch"
3. Name your app (e.g., "Release Announcer") and select your workspace
4. Navigate to "Slash Commands" and create a new command:
   - **Command**: `/release`
   - **Request URL**: `https://your-app.vercel.app/api/slack` (you'll get this after deployment)
   - **Short Description**: "Announce a new release"
5. Navigate to "Interactivity & Shortcuts" and configure:
   - **Interactivity**: ON
   - **Request URL**: `https://your-app.vercel.app/api/slack-interactions`
6. Go to "OAuth & Permissions" and add these bot token scopes:
   - `commands`
   - `chat:write`
   - `chat:write.public`
7. Install the app to your workspace

### 4. Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "Add New..." > "Project"
4. Import your GitHub repository
5. Add environment variables in the deployment settings
6. Deploy!

#### Option B: Deploy via Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

### 5. Update Slack App Configuration

After deployment, Vercel will give you a URL like `https://your-app-name.vercel.app`.

1. Go back to your Slack app settings
2. Update the "Request URL" in "Slash Commands" to: `https://your-app-name.vercel.app/api/slack`
3. Update the "Request URL" in "Interactivity & Shortcuts" to: `https://your-app-name.vercel.app/api/slack-interactions`
4. Save the changes

## Usage

In any Slack channel where the bot is installed:

```
/release 67
```

The bot will:
1. Compare `releases/2.0` with `releases/2.1.0` branches
2. Extract JIRA ticket references from commit messages
3. Show a preview with confirmation buttons
4. Send the announcement when you click "✅ Send Announcement":
   - **If used in a channel**: Posts the announcement to that same channel
   - **If used in a DM**: Sends the announcement to that same DM

**Example announcement format:**
```
*Deploying to prod* 🚀
*Branch:* `releases/2.1.0`
*Changes:*
• <https://yourcompany.atlassian.net/browse/process.env.JIRA_PROJECT-123|process.env.JIRA_PROJECT-123 - Fix user login issue>
• <https://yourcompany.atlassian.net/browse/process.env.JIRA_PROJECT-124|process.env.JIRA_PROJECT-124 - Add new dashboard feature>
• Fix authentication flow <https://github.com/company/repo/pull/789|(#789)>
• <https://yourcompany.atlassian.net/browse/process.env.JIRA_PROJECT-125|Fix critical bug> <https://github.com/company/repo/pull/125|(#125)>
```

**Note on dual references**: If a commit has both JIRA and GitHub references (e.g., "process.env.JIRA_PROJECT-125 - Fix critical bug (#125)"), they appear on the same line:
- The JIRA ticket link with the clean title, followed by the GitHub PR link

**Features:**
- ✅ **Shows only commits with references** (JIRA tickets or GitHub issues/PRs)
- ✅ **Bullet point format** for easy reading
- ✅ **Interactive confirmation** before posting to channel
- ✅ **Clickable links** to JIRA tickets or GitHub issues/PRs when referenced
- ✅ **Smart routing** - sends to the same channel/DM where command was used

**Note**: The bot looks for JIRA references (e.g., `process.env.JIRA_PROJECT-12345`) first, then GitHub references (e.g., `#544`) in commit titles and messages. Only commits with at least one reference are included in the announcement!

## Testing Endpoint

The bot includes a comprehensive testing endpoint at `/api/test` that helps you verify all integrations are working properly without going through Slack.

### Available Tests

**Health Check** - Basic status and environment check
```
GET https://your-app.vercel.app/api/test
```

**GitHub Connection Test** - Verifies GitHub API access and repository permissions
```
GET https://your-app.vercel.app/api/test?test=github
```

**JIRA Configuration Test** - Validates JIRA server URL and project settings
```
GET https://your-app.vercel.app/api/test?test=jira
```

**Release Announcement Test** - Tests the full release logic end-to-end
```
GET https://your-app.vercel.app/api/test?test=release&release=2.1.0
```

**Run All Tests** - Comprehensive test suite
```
GET https://your-app.vercel.app/api/test?test=all&release=2.1.0
```

### Example Response

The testing endpoint returns detailed JSON responses. For example, the `all` test returns:

```json
{
  "test": "all",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "github": {
    "success": true,
    "data": {
      "authenticatedUser": "your-username",
      "repository": "process.env.GITHUB_OWNER/process.env.GITHUB_REPO",
      "repositoryUrl": "https://github.com/process.env.GITHUB_OWNER/process.env.GITHUB_REPO"
    }
  },
  "jira": {
    "success": true,
    "data": {
      "jiraServer": "https://yourcompany.atlassian.net",
      "projectKey": "process.env.JIRA_PROJECT",
      "projectUrl": "https://yourcompany.atlassian.net/projects/process.env.JIRA_PROJECT",
      "extractionRegex": "\\bprocess.env.JIRA_PROJECT-\\d+\\b",
      "note": "JIRA connection test validates configuration only (no API calls needed)"
    }
  },
  "release": {
    "releaseNumber": "2.1.0",
    "previousRelease": "2.0.0",
    "github": {
      "success": true,
      "commitCount": 15,
      "commits": [...],
      "moreCommits": true
    },
    "jiraExtraction": {
      "success": true,
      "totalCommits": 15,
      "commitsWithJira": 8,
      "commitsWithoutJira": 7,
      "totalJiraReferences": 12,
      "releaseChanges": [...],
      "regex": "/\\bprocess.env.JIRA_PROJECT-\\d+\\b/gi"
    },
    "announcement": "*Deploying to prod* 🚀\n*Branch:* `releases/2.1.0`\n*Changes:*\n..."
  },
  "overall": {
    "success": true,
    "readyForProduction": true
  }
}
```

### Using the Testing Endpoint

1. **During Development**: Use the health check to verify your environment variables are set correctly
2. **Before Deployment**: Run the `all` test to ensure everything is working
3. **Debugging Issues**: Use individual tests (`github`, `jira`) to isolate problems
4. **Testing Releases**: Use the `release` test with different version numbers to see what would be announced

### Testing Endpoint Security

The testing endpoint includes several security measures to prevent unauthorized access:

#### 🔒 **Automatic Production Protection**
- The test endpoint is **automatically disabled in production** unless explicitly enabled
- Set `ENABLE_TEST_ENDPOINT=true` in production environment variables to enable it

#### 🔑 **API Key Protection**
Add an API key requirement for enhanced security:

```bash
# Generate a secure API key
pnpm generate-key
# or: node scripts/generate-api-key.js

# Then add it to your .env.local or Vercel environment variables
TEST_API_KEY=your-generated-api-key-here
```

Then access the endpoint with the key:
```bash
# As a header (recommended)
curl -H "X-API-Key: your-secret-api-key-here" https://your-app.vercel.app/api/test

# Or as a query parameter
curl "https://your-app.vercel.app/api/test?api_key=your-secret-api-key-here"
```

#### 🌐 **Origin Restrictions**
Limit which domains can access the test endpoint:

```bash
# Allow specific origins (comma-separated)
TEST_ALLOWED_ORIGINS=http://localhost:3001,https://yourdomain.com
```

#### ⏱️ **Rate Limiting**
- Maximum 10 requests per 5-minute window per IP address
- Prevents abuse and excessive API usage
- Returns HTTP 429 when limit exceeded

#### 🛡️ **Security Headers**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- Restrictive CORS policies

### Security Configuration Examples

**Development (most permissive):**
```bash
# .env.local - no additional security needed
ENABLE_TEST_ENDPOINT=true
```

**Staging (moderate security):**
```bash
ENABLE_TEST_ENDPOINT=true
TEST_API_KEY=staging-secret-key-123
TEST_ALLOWED_ORIGINS=https://staging.yourcompany.com
```

**Production (high security):**
```bash
ENABLE_TEST_ENDPOINT=true
TEST_API_KEY=prod-super-secret-key-456
TEST_ALLOWED_ORIGINS=https://admin.yourcompany.com
```

## Security

This bot implements several security measures:

- **Request Signing**: Verifies all requests come from Slack using cryptographic signatures
- **Environment Variables**: All secrets are stored securely in Vercel's environment variables
- **Least Privilege**: API tokens are configured with minimal required permissions

## Customization

### Modifying GitHub/Jira Settings

Edit the constants in `api/slack.js`:

```javascript
const GITHUB_OWNER = 'your-org';
const GITHUB_REPO = 'your-repo';
const JIRA_PROJECT = 'YOUR-PROJECT';
```

### Changing Release Branch Logic

The `getPreviousRelease()` function determines which previous release to compare against. Modify this function to match your versioning scheme.

### Customizing the Message Format

Edit the message formatting section in the slash command handler to change how announcements appear.

## Troubleshooting

### Common Issues

**"URL verification failed"**
- Check that your Slack signing secret is correct
- Ensure the request URL ends with `/api/slack`

**"GitHub API errors"**
- Verify your GitHub token has access to the repository
- Check that the release branches exist

**"JIRA configuration invalid"** 
- Confirm your JIRA_SERVER environment variable is set correctly
- Ensure it includes the full URL (e.g., https://yourcompany.atlassian.net)

### Logs

View logs in the Vercel dashboard under your project's "Functions" tab to debug issues.

## Development

### Local Testing

#### Option A: Using the Local Testing Script (Recommended)

```bash
# Run the local testing server
pnpm dev
# or: pnpm test
# or: node scripts/test-local.js
```

This will start a local testing server at `http://localhost:3001` with a friendly web interface for testing all bot functionality.

#### Option B: Using Vercel Dev

```bash
# Install Vercel CLI
npm install -g vercel

# Start Vercel development server
pnpm dev:vercel
# or: vercel dev
```

Your bot will be available at `http://localhost:3000/api/slack` for testing, and the testing endpoint at `http://localhost:3000/api/test`.

### Using ngrok for Slack Testing

Since Slack needs a public URL, use ngrok for local development:

```bash
# Install ngrok
npm install -g ngrok

# In one terminal, start your Vercel dev server
pnpm dev:vercel

# In another terminal, expose it publicly
ngrok http 3000

# Use the ngrok URL in your Slack app settings
https://abc123.ngrok.io/api/slack
```

**Development Workflow:**
- Use `pnpm dev` for testing bot logic without Slack
- Use `pnpm dev:vercel` + ngrok when you need to test the actual Slack integration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Summary

This Slack Release Announcer provides a complete, secure solution for automated release announcements:

### 🔒 **Security Features**
- **Request Signing**: Slack's built-in request verification protects the main bot endpoint
- **Test Endpoint Protection**: Multi-layered security for the testing endpoint
- **Rate Limiting**: Prevents abuse with automatic request throttling
- **Environment-based Controls**: Automatic production protection
- **API Key Authentication**: Optional additional security layer

### 🧪 **Testing Features**
- **Comprehensive Test Suite**: Verify GitHub integration and JIRA extraction logic
- **Local Testing Server**: Friendly web interface for development
- **Production Testing**: Secure endpoint for live system verification
- **API Key Generator**: Built-in tool for creating secure access keys

### 🚀 **Deployment Features**
- **Serverless Architecture**: Zero server management with Vercel
- **Automatic Scaling**: Handles traffic spikes automatically
- **Environment Variables**: Secure credential management
- **Easy Deployment**: One-click deployment from GitHub

### 📋 **Quick Start Commands**
```bash
# Setup
pnpm install
cp env.example .env.local
# (edit .env.local with your credentials)

# Generate API key for testing
pnpm generate-key

# Local development
pnpm dev            # Start local testing server (recommended)
pnpm dev:vercel     # Start Vercel dev server (for Slack integration testing)

# Deploy to production
git push            # Triggers automatic deployment
```

## License

MIT License - see LICENSE file for details. 