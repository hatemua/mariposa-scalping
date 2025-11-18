/**
 * MT4 Credentials Verification Script
 *
 * This script checks which users have MT4 credentials configured
 * and displays their status without exposing sensitive data.
 */

import mongoose from 'mongoose';
import { config } from '../src/config/environment';
import { User } from '../src/models';

async function checkCredentials() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const users = await User.find({}).select('_id email mt4ServerUrl mt4AccountNumber mt4Password mt4BrokerName createdAt');

    console.log(`📊 Total users in database: ${users.length}\n`);
    console.log('='.repeat(80));

    if (users.length === 0) {
      console.log('⚠️  No users found in database');
      await mongoose.disconnect();
      return;
    }

    for (const user of users) {
      const hasMT4ServerUrl = !!user.mt4ServerUrl;
      const hasMT4AccountNumber = !!user.mt4AccountNumber;
      const hasMT4Password = !!user.mt4Password;
      const hasAllCredentials = hasMT4ServerUrl && hasMT4AccountNumber && hasMT4Password;

      console.log(`\n👤 User: ${user.email}`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   MT4 Broker Name: ${user.mt4BrokerName || '(not set)'}`);
      console.log(`   \n   MT4 Credentials Status:`);
      console.log(`   ├─ Server URL: ${hasMT4ServerUrl ? '✅ SET' : '❌ NOT SET'} ${hasMT4ServerUrl ? `(${user.mt4ServerUrl.length} chars)` : ''}`);
      console.log(`   ├─ Account Number: ${hasMT4AccountNumber ? '✅ SET' : '❌ NOT SET'} ${hasMT4AccountNumber ? `(${user.mt4AccountNumber.length} chars)` : ''}`);
      console.log(`   └─ Password: ${hasMT4Password ? '✅ SET' : '❌ NOT SET'} ${hasMT4Password ? `(${user.mt4Password.length} chars)` : ''}`);

      if (hasAllCredentials) {
        console.log(`   \n   ✅ MT4 FULLY CONFIGURED - Status check should return "connected" or "bridge_offline"`);
      } else {
        console.log(`   \n   ⚠️  MT4 NOT CONFIGURED - Status check will return "not_configured"`);
      }

      // Show preview of encrypted data format (first 100 chars)
      if (hasMT4ServerUrl && user.mt4ServerUrl.length > 0) {
        const preview = user.mt4ServerUrl.substring(0, 100);
        console.log(`   \n   📝 Server URL format preview: ${preview}...`);

        // Validate it's properly formatted JSON
        try {
          const parsed = JSON.parse(user.mt4ServerUrl);
          if (parsed.encrypted && parsed.iv && parsed.tag) {
            console.log(`   ✅ Encryption format valid (has encrypted, iv, tag)`);
          } else {
            console.log(`   ⚠️  Encryption format may be invalid (missing fields)`);
          }
        } catch (e) {
          console.log(`   ❌ ERROR: Server URL is not valid JSON!`);
        }
      }

      console.log('\n' + '-'.repeat(80));
    }

    console.log('\n📋 SUMMARY:');
    const configuredUsers = users.filter(u => u.mt4ServerUrl && u.mt4AccountNumber && u.mt4Password);
    const unconfiguredUsers = users.filter(u => !u.mt4ServerUrl || !u.mt4AccountNumber || !u.mt4Password);

    console.log(`   ✅ Users with MT4 configured: ${configuredUsers.length}`);
    console.log(`   ⚠️  Users without MT4 configured: ${unconfiguredUsers.length}`);

    if (configuredUsers.length > 0) {
      console.log(`\n   Users with MT4 credentials:`);
      configuredUsers.forEach(u => {
        console.log(`   - ${u.email} (${u._id})`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 To configure MT4 credentials for a user:');
    console.log('   POST /api/mt4/configure');
    console.log('   Headers: { "Authorization": "Bearer <jwt_token>" }');
    console.log('   Body: {');
    console.log('     "serverUrl": "http://localhost:8080",');
    console.log('     "accountNumber": "your_mt4_account",');
    console.log('     "password": "your_mt4_password",');
    console.log('     "brokerName": "Exness" (optional)');
    console.log('   }\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkCredentials();
