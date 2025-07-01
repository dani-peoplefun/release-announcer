#!/usr/bin/env node

/**
 * Generate a secure API key for the test endpoint
 * Run with: node scripts/generate-api-key.js
 */

const crypto = require('crypto');

function generateApiKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateReadableKey(prefix = 'test') {
  // Generate a more readable key with prefix and timestamp
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `${prefix}-${timestamp}-${randomPart}`;
}

console.log('🔐 API Key Generator for Test Endpoint');
console.log('=====================================\n');

console.log('🔑 **Secure API Key (32 bytes):**');
console.log(`   ${generateApiKey()}\n`);

console.log('🔑 **Readable API Key:**');
console.log(`   ${generateReadableKey()}\n`);

console.log('🔑 **Production API Key (64 bytes):**');
console.log(`   ${generateApiKey(64)}\n`);

console.log('📝 **How to use:**');
console.log('   1. Copy one of the keys above');
console.log('   2. Add it to your .env.local file:');
console.log('      TEST_API_KEY=your-copied-key-here');
console.log('   3. Or add it to your Vercel environment variables\n');

console.log('⚠️  **Security Notes:**');
console.log('   • Keep your API key secret and never commit it to git');
console.log('   • Use different keys for development, staging, and production');
console.log('   • Rotate keys regularly for better security');
console.log('   • The longer the key, the more secure it is\n');

// Generate environment variable template
console.log('📄 **Environment Variable Template:**');
console.log('```');
console.log('# Testing Endpoint Security');
console.log('ENABLE_TEST_ENDPOINT=true');
console.log(`TEST_API_KEY=${generateApiKey()}`);
console.log('TEST_ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com');
console.log('```'); 