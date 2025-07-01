// Import necessary libraries
const { App, AwsLambdaReceiver } = require('@slack/bolt');
require('dotenv').config();

// Disable Vercel's body parser to get raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// --- Initialize clients for interactions only ---
const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  processBeforeResponse: true,
});

// --- Interactive Button Handlers ---
app.action('send_announcement', async ({ ack, body, say, respond, client }) => {
  try {
    await ack();
    
    const buttonData = JSON.parse(body.actions[0].value);
    const { allChanges, releaseNumber, channelId, channelName } = buttonData;
    
    // Get selected changes from checkboxes
    let selectedChanges = [];
    const checkboxStates = body.state?.values || {};
    
    // Extract selected changes from all checkbox groups
    Object.keys(checkboxStates).forEach(blockId => {
      Object.keys(checkboxStates[blockId]).forEach(actionId => {
        if (actionId.startsWith('select_changes_')) {
          const selectedOptions = checkboxStates[blockId][actionId].selected_options || [];
          selectedOptions.forEach(option => {
            const changeIndex = parseInt(option.value);
            if (changeIndex >= 0 && changeIndex < allChanges.length) {
              selectedChanges.push(allChanges[changeIndex]);
            }
          });
        }
      });
    });
    
    // Create the announcement message
    let message;
    if (selectedChanges.length > 0) {
      const changesText = selectedChanges.join('\n');
      message = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:*\n${changesText}`;
    } else {
      message = `*Deploying to prod* 🚀\n*Branch:* \`releases/${releaseNumber}\`\n*Changes:* No changes selected.`;
    }
    
    // Determine where to send the announcement
    const channel = body.channel;
    const user = body.user;
    const isDM = channel.id.startsWith('D') || channel.name === 'directmessage';
    
    let sentTo;
    
    console.log('Channel info:', { channelId: channel.id, channelName: channel.name, isDM });
    
    try {
      if (isDM) {
        // For DMs, send directly to the user
        await client.chat.postMessage({
          channel: user.id,
          text: message,
        });
        sentTo = 'your DMs';
      } else {
        // For channels, check if bot has access first
        try {
          await client.conversations.info({
            channel: channel.id
          });
          
          // Bot has access to channel, send the message
          await client.chat.postMessage({
            channel: channel.id,
            text: message,
          });
          sentTo = `<#${channel.id}>`;
        } catch (accessError) {
          console.log('No direct channel access, falling back to ephemeral message');
          
          // Fallback to ephemeral message if bot can't post to channel
          await client.chat.postEphemeral({
            channel: channel.id,
            user: user.id,
            text: `⚠️ Bot doesn't have permission to post to this channel. Here's your announcement:\n\n${message}`,
          });
          sentTo = `<#${channel.id}> (as ephemeral message - bot needs to be added to channel)`;
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      throw new Error(`Unable to send announcement: ${error.message}`);
    }
    
    // Update the original message to show where it was sent
    const selectedCount = selectedChanges.length;
    const totalCount = allChanges.length;
    await respond({
      text: `✅ Release announcement for \`${releaseNumber}\` has been sent to ${sentTo}.\n\n*Included:* ${selectedCount} of ${totalCount} changes`,
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

// --- Checkbox Handlers ---
// Handle checkbox selections (these don't need to do anything special, just acknowledge)
app.action(/select_changes_\d+/, async ({ ack }) => {
  try {
    await ack();
    // No need to respond - checkboxes handle their own state
  } catch (error) {
    console.error('Checkbox selection error:', error);
    await ack();
  }
});

// --- Error handling ---
app.error(async (error) => {
  console.error('Slack interactions error:', error);
});

// --- Helper function to get raw body ---
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', err => {
      reject(err);
    });
  });
}

// --- Vercel Export for Interactions ---
module.exports = async (req, res) => {
  try {
    // Get the raw body since body parser is disabled
    const body = await getRawBody(req);

    // Convert Vercel request to AWS Lambda event format
    const event = {
      body: body,
      headers: req.headers,
      httpMethod: req.method,
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      path: req.url,
      pathParameters: null,
      queryStringParameters: req.query || null,
      requestContext: {
        accountId: '',
        apiId: '',
        httpMethod: req.method,
        requestId: '',
        resourceId: '',
        resourcePath: req.url,
        stage: '',
      },
      resource: '',
      stageVariables: null,
    };

    // AWS Lambda context
    const context = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'slack-interactions-handler',
      functionVersion: '$LATEST',
      invokedFunctionArn: '',
      memoryLimitInMB: '1024',
      awsRequestId: 'vercel-interactions-' + Date.now(),
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    // Get the Lambda handler and process the request
    const handler = await awsLambdaReceiver.toHandler();
    const response = await handler(event, context);

    // Send response back to Vercel
    res.status(response.statusCode || 200);
    
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    
    res.send(response.body || '');

  } catch (error) {
    console.error('Failed to process interaction request:', error);
    console.error('Request details:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: typeof req.body === 'string' ? req.body.substring(0, 200) : req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}; 