#!/usr/bin/env node

const crypto = require('crypto');

/**
 * Generate a secure API key for the /api/announce endpoint
 */
function generateApiKey() {
  // Generate a random 32-byte key and encode it as base64url
  const randomBytes = crypto.randomBytes(32);
  const apiKey = randomBytes.toString('base64url');
  
  return apiKey;
}

function main() {
  console.log('🔐 Release Announcer API Key Generator\n');
  
  // Generate multiple options
  const keys = [];
  for (let i = 0; i < 3; i++) {
    keys.push(generateApiKey());
  }
  
  console.log('Generated API keys (choose one):');
  console.log('================================');
  
  keys.forEach((key, index) => {
    console.log(`${index + 1}. ${key}`);
  });
  
  console.log('\n📋 Next steps:');
  console.log('1. Copy one of the keys above');
  console.log('2. Add it to your .env.local file as ANNOUNCE_API_KEY=your-key-here');
  console.log('3. Add it as a GitHub repository secret named ANNOUNCE_API_KEY');
  console.log('4. Use it in the X-API-Key header when calling /api/announce');
  
  console.log('\n🔒 Security notes:');
  console.log('• Keep this key secret - treat it like a password');
  console.log('• Store it securely in GitHub Secrets, not in your code');
  console.log('• Regenerate it if you suspect it has been compromised');
  console.log('• The key is 32 bytes (256 bits) of cryptographically secure random data');
  
  console.log('\n💡 Example usage:');
  console.log('curl -X POST https://your-app.vercel.app/api/announce \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -H "X-API-Key: ${keys[0]}" \\`);
  console.log('  -d \'{"releaseNumber": "2.1.0", "channelName": "releases"}\'');
}

if (require.main === module) {
  main();
}

module.exports = { generateApiKey }; 