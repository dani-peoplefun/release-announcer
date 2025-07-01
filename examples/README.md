# Examples

This directory contains example files to help you integrate the release announcer with your repositories.

## GitHub Workflows

The `github-workflows/` directory contains example GitHub Action workflows that you should copy to your **target repository** (not the release-announcer repository itself).

### Available Examples

#### 1. `release-announcement.yml` - Full Release Announcer Integration

**Purpose**: Automatically trigger your release announcer bot when releases are created or branches are pushed.

**Features**:
- ✅ Triggers on GitHub releases
- ✅ Triggers on pushes to `releases/*` branches  
- ✅ Manual trigger with custom parameters
- ✅ Extracts JIRA and GitHub references from commits
- ✅ Posts formatted announcements to Slack

**Setup**:
1. Copy to your repository's `.github/workflows/release-announcement.yml`
2. Set up the required secrets and variables (see main README)
3. Customize the triggers and channel routing as needed

#### 2. `simple-slack-notification.yml` - Basic Slack Notifications

**Purpose**: Simple Slack notifications using the official Slack GitHub Action.

**Features**:
- ✅ Basic push, PR, and release notifications
- ✅ No complex setup required
- ✅ Uses official Slack GitHub Action
- ✅ Customizable message formatting

**Setup**:
1. Copy to your repository's `.github/workflows/simple-slack-notification.yml`
2. Set `SLACK_BOT_TOKEN` secret and `SLACK_CHANNEL_ID` variable
3. Customize the trigger events and message formatting

## Usage Instructions

### For Target Repository (where releases happen)

1. **Choose your approach**:
   - Use `release-announcement.yml` for full release announcer integration
   - Use `simple-slack-notification.yml` for basic notifications

2. **Copy the workflow file**:
   ```bash
   # In your target repository
   mkdir -p .github/workflows
   
   # Copy the desired workflow
   cp path/to/release-announcer/examples/github-workflows/release-announcement.yml .github/workflows/
   ```

3. **Configure secrets and variables** (in your target repository):
   - Go to Settings > Secrets and variables > Actions
   - Add the required secrets and variables as documented in the main README

4. **Customize the workflow**:
   - Adjust trigger events to match your release process
   - Modify channel routing logic if needed
   - Update message formatting as desired

5. **Test the workflow**:
   - Create a test release or push to a release branch
   - Check the Actions tab for workflow execution
   - Verify the announcement appears in your Slack channel

### Important Notes

- **Do NOT** copy these workflows to the release-announcer repository itself
- These examples assume your release announcer is deployed and accessible via the configured URL
- Make sure your Slack bot has permissions to post to the target channels
- Test with a non-production channel first to verify everything works

### Customization Examples

#### Different Channels for Different Release Types

```yaml
- name: Determine target channel
  id: channel
  run: |
    if [[ "${{ steps.extract-release.outputs.release_number }}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "channel_name=releases-prod" >> $GITHUB_OUTPUT
    else
      echo "channel_name=releases-staging" >> $GITHUB_OUTPUT  
    fi
```

#### Only Announce Non-Prerelease Versions

```yaml
- name: Check if announcement needed
  id: should-announce
  run: |
    if [[ "${{ github.event.release.prerelease }}" == "false" ]]; then
      echo "should_announce=true" >> $GITHUB_OUTPUT
    else
      echo "should_announce=false" >> $GITHUB_OUTPUT
    fi

- name: Announce release
  if: steps.should-announce.outputs.should_announce == 'true'
  # ... rest of announcement logic
```

#### Custom Message Templates

```yaml
- name: Send custom announcement
  run: |
    curl -X POST "${{ vars.RELEASE_ANNOUNCER_URL }}/api/announce" \
      -H "Content-Type: application/json" \
      -H "X-API-Key: ${{ secrets.ANNOUNCE_API_KEY }}" \
      -d '{
        "releaseNumber": "${{ steps.extract-release.outputs.release_number }}",
        "channelName": "releases",
        "customMessage": "🎉 Version {{releaseNumber}} is now live! Check out the {{changeCount}} new features and fixes."
      }'
```

## Getting Help

If you encounter issues with these examples:

1. Check the main README for complete setup instructions
2. Verify all required secrets and variables are configured
3. Test the `/api/announce` endpoint directly with curl first
4. Check the GitHub Actions logs for detailed error messages
5. Ensure your release announcer deployment is accessible and healthy 