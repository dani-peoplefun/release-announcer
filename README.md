# Release Announcer Slack Bot

A Slack bot that automatically generates release announcements by cross-referencing GitHub commits with Jira tickets. Built with Node.js and deployed on Vercel.

## Features

- 🚀 **Automated Release Announcements**: Generate release summaries with a simple `/release-announce` command
- 🔗 **GitHub Integration**: Compares release branches to identify commits
- 🎫 **Jira Integration**: Cross-references commits with Jira tickets
- 🔒 **Secure**: Uses Slack's request signing for authentication
- ⚡ **Serverless**: Deployed on Vercel for automatic scaling and zero server management

## How It Works

1. **User runs command**: `/release-announce 2.1.0`
2. **GitHub Analysis**: Compares commits between previous release and current release
3. **Jira Cross-Reference**: Searches for recently closed Jira tickets that reference the release commits
4. **Slack Announcement**: Posts a formatted message with all relevant changes

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
- **JIRA_USERNAME**: Your Jira email address
- **JIRA_API_TOKEN**: Create from your Jira account settings

### 3. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" > "From scratch"
3. Name your app (e.g., "Release Announcer") and select your workspace
4. Navigate to "Slash Commands" and create a new command:
   - **Command**: `/release-announce`
   - **Request URL**: `https://your-app.vercel.app/api/slack` (you'll get this after deployment)
   - **Short Description**: "Announce a new release"
   - **Usage Hint**: `[release-number]`
5. Go to "OAuth & Permissions" and add these bot token scopes:
   - `commands`
   - `chat:write`
6. Install the app to your workspace

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
3. Save the changes

## Usage

In any Slack channel where the bot is installed:

```
/release-announce 2.1.0
```

The bot will:
1. Compare `releases/2.0` with `releases/2.1.0` branches
2. Find Jira tickets that reference commits in this release
3. Post a formatted message like:

```
*Deploying to prod* 🚀
*Branch:* `releases/2.1.0`
*Changes:*
https://process.env.GITHUB_OWNER.atlassian.net/browse/process.env.JIRA_PROJECT-123
process.env.JIRA_PROJECT-123 Fix user login issue
https://process.env.GITHUB_OWNER.atlassian.net/browse/process.env.JIRA_PROJECT-124
process.env.JIRA_PROJECT-124 Add new dashboard feature
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

**"Jira connection failed"** 
- Confirm your Jira credentials and server URL
- Test the JQL query in Jira's issue search

### Logs

View logs in the Vercel dashboard under your project's "Functions" tab to debug issues.

## Development

### Local Testing

```bash
# Install Vercel CLI
npm install -g vercel

# Start local development server
vercel dev
```

Your bot will be available at `http://localhost:3000/api/slack` for testing.

### Using ngrok for Slack Testing

Since Slack needs a public URL, use ngrok for local development:

```bash
# Install ngrok
npm install -g ngrok

# In one terminal, start your local server
vercel dev

# In another terminal, expose it publicly
ngrok http 3000

# Use the ngrok URL in your Slack app settings
https://abc123.ngrok.io/api/slack
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 