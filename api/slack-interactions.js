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
    const { message, releaseNumber } = buttonData;
    
    // Determine where to send the announcement
    const channel = body.channel;
    const user = body.user;
    const isDM = channel.id.startsWith('D') || channel.name === 'directmessage';
    
    let sentTo;
    
    if (isDM) {
      // If original command was in DM, send as DM to the user
      await client.chat.postMessage({
        channel: user.id,
        text: message,
      });
      sentTo = 'your DMs';
    } else {
      // If original command was in a channel, send as ephemeral message (only visible to you)
      await client.chat.postEphemeral({
        channel: channel.id,
        user: user.id,
        text: message,
        as_user: true
      });
      sentTo = `<#${channel.id}>`;
    }
    
    // Update the original message to show where it was sent
    await respond({
      text: `✅ Release announcement for \`${releaseNumber}\` has been sent to ${sentTo}.`,
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