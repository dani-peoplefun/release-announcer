// Import necessary libraries
const { App, AwsLambdaReceiver } = require('@slack/bolt');
require('dotenv').config();

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
app.action('send_announcement', async ({ ack, body, say, respond }) => {
  try {
    await ack();
    
    const buttonData = JSON.parse(body.actions[0].value);
    const { message, releaseNumber } = buttonData;
    
    // Send the announcement to the channel
    await say({
      text: message,
      response_type: 'in_channel'
    });
    
    // Update the original message to show it was sent
    await respond({
      text: `✅ Release announcement for \`${releaseNumber}\` has been sent to the channel.`,
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

// --- Vercel Export for Interactions ---
module.exports = async (req, res) => {
  try {
    // Handle the request body properly for AWS Lambda receiver
    let body;
    
    if (typeof req.body === 'string') {
      body = req.body;
    } else if (req.body && typeof req.body === 'object') {
      // Convert object back to URL-encoded string for signature verification
      body = new URLSearchParams(req.body).toString();
    } else {
      body = '';
    }

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