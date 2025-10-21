/**
 * PURGE SCRIPT - Clears all database collections, Redis cache, and Agenda jobs
 * Run with: node purge.js
 */

const mongoose = require('mongoose');
const Redis = require('ioredis');
const Agenda = require('agenda');
require('dotenv').config();

async function purgeEverything() {
  console.log('🧹 Starting system purge...\n');

  try {
    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mariposa-scalping');
    console.log('✅ Connected to MongoDB\n');

    // Get all collections
    const collections = await mongoose.connection.db.collections();
    console.log(`📋 Found ${collections.length} collections:\n`);

    // Drop each collection
    for (const collection of collections) {
      const count = await collection.countDocuments();
      console.log(`  - ${collection.collectionName}: ${count} documents`);

      if (collection.collectionName === 'users' || collection.collectionName === 'agents') {
        console.log(`    ⚠️  Skipping ${collection.collectionName} (preserving user/agent data)`);
      } else {
        await collection.deleteMany({});
        console.log(`    ✅ Cleared ${collection.collectionName}`);
      }
    }

    console.log('\n🗑️  Collections purged\n');

    // Clear Redis
    console.log('📦 Connecting to Redis...');
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null
    });

    const keys = await redis.keys('*');
    console.log(`📋 Found ${keys.length} Redis keys\n`);

    if (keys.length > 0) {
      for (const key of keys) {
        const type = await redis.type(key);
        console.log(`  - ${key} (${type})`);
        await redis.del(key);
        console.log(`    ✅ Deleted`);
      }
    }

    console.log('\n🗑️  Redis cache purged\n');
    await redis.quit();

    // Clear Agenda jobs
    console.log('📦 Clearing Agenda jobs...');
    const agenda = new Agenda({
      db: {
        address: process.env.MONGODB_URI || 'mongodb://localhost:27017/mariposa-scalping',
        collection: 'agendaJobs'
      }
    });

    await agenda.start();
    const jobs = await agenda.jobs({});
    console.log(`📋 Found ${jobs.length} scheduled jobs\n`);

    for (const job of jobs) {
      console.log(`  - ${job.attrs.name} (${job.attrs.nextRunAt})`);
      await job.remove();
      console.log(`    ✅ Removed`);
    }

    console.log('\n🗑️  Agenda jobs purged\n');
    await agenda.stop();

    // Close connections
    await mongoose.connection.close();

    console.log('✅ PURGE COMPLETE - System is now clean\n');
    console.log('📝 Note: User and Agent collections were preserved');
    console.log('🚀 You can now restart the system with: npm start\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during purge:', error);
    process.exit(1);
  }
}

purgeEverything();
