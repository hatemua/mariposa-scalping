const axios = require('axios');

// ============================================
// CONFIGURATION
// ============================================
const config = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3001',
  authToken: process.env.AUTH_TOKEN,  // JWT token (from OTP login)
  apiKey: process.env.API_KEY,        // API key (from dashboard)
  delayBetweenReports: 10000, // 10 seconds between each report
  retryAttempts: 1,
  requestTimeout: 180000 // 3 minutes timeout for PDF generation
};

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Get all dates between start and end (inclusive)
 */
function getDateRange(startDateStr, endDateStr) {
  const dates = [];
  const startDate = new Date(startDateStr);
  const endDate = endDateStr ? new Date(endDateStr) : new Date();

  // Validate dates
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start date: ${startDateStr}`);
  }
  if (isNaN(endDate.getTime())) {
    throw new Error(`Invalid end date: ${endDateStr}`);
  }

  // Generate date array
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(currentDate.toISOString().split('T')[0]); // YYYY-MM-DD format
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

/**
 * Get last N days of dates
 */
function getLastNDays(n) {
  const dates = [];
  const today = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }

  return dates;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Send a single report to Telegram
 */
async function sendReport(date) {
  // Check if either AUTH_TOKEN or API_KEY is provided
  if (!config.authToken && !config.apiKey) {
    throw new Error('Either AUTH_TOKEN or API_KEY must be set. Export AUTH_TOKEN=your-jwt-token or API_KEY=mk_live_xxx before running.');
  }

  // Use v1 API if API_KEY is provided, otherwise use internal API
  const url = config.apiKey
    ? `${config.backendUrl}/api/v1/market-reports/send-telegram?date=${date}`
    : `${config.backendUrl}/api/market-reports/send-telegram?date=${date}`;

  // Set auth header based on which credential is provided
  const authHeader = config.apiKey
    ? `Bearer ${config.apiKey}`  // API key auth
    : `Bearer ${config.authToken}`;  // JWT auth

  try {
    const response = await axios.post(url, {}, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: config.requestTimeout
    });

    return {
      success: true,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

/**
 * Delay execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// MAIN BATCH SEND LOGIC
// ============================================

async function sendHistoricalReports(dates) {
  const results = {
    total: dates.length,
    success: 0,
    failed: 0,
    errors: []
  };

  console.log('\n📊 Sending Historical Market Reports to Telegram');
  console.log('━'.repeat(50));
  console.log(`Date Range: ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`Total Reports: ${dates.length}\n`);
  console.log('Starting batch send...\n');

  const startTime = Date.now();

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const reportNum = i + 1;

    process.stdout.write(`[${reportNum}/${dates.length}] 📅 ${date}... `);

    const reportStartTime = Date.now();

    // Send report (with retry)
    let result = await sendReport(date);

    if (!result.success && config.retryAttempts > 0) {
      process.stdout.write('⚠️  Retrying... ');
      await delay(3000); // Wait 3 seconds before retry
      result = await sendReport(date);
    }

    const reportDuration = ((Date.now() - reportStartTime) / 1000).toFixed(1);

    if (result.success) {
      results.success++;
      console.log(`✅ Sent (took ${reportDuration}s)`);
    } else {
      results.failed++;
      results.errors.push({ date, error: result.error });
      console.log(`❌ Failed (${result.error})`);
    }

    // Wait before next request (except for last one)
    if (i < dates.length - 1) {
      const delaySeconds = config.delayBetweenReports / 1000;
      process.stdout.write(`   ⏳ Waiting ${delaySeconds}s before next report...\n`);
      await delay(config.delayBetweenReports);
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Print summary
  console.log('\n' + '━'.repeat(50));
  console.log('Summary:');
  console.log(`✅ Successfully sent: ${results.success} reports`);
  console.log(`❌ Failed: ${results.failed} reports`);
  console.log(`⏱️  Total time: ${totalDuration} minutes`);

  if (results.errors.length > 0) {
    console.log('\n📝 Failed Reports:');
    results.errors.forEach(({ date, error }) => {
      console.log(`  • ${date}: ${error}`);
    });
  }

  console.log('━'.repeat(50) + '\n');

  return results;
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
  const args = process.argv.slice(2);

  // Show help
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📊 Send Historical Market Reports to Telegram
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  node scripts/sendHistoricalReports.js <start-date> [end-date]
  node scripts/sendHistoricalReports.js --last-N-days

Examples:
  # Send all reports from Jan 1 to today
  node scripts/sendHistoricalReports.js 2025-01-01

  # Send reports for specific date range
  node scripts/sendHistoricalReports.js 2025-01-01 2025-01-27

  # Send last 7 days
  node scripts/sendHistoricalReports.js --last-7-days

  # Send last 30 days
  node scripts/sendHistoricalReports.js --last-30-days

Environment Variables:
  AUTH_TOKEN    (required) Your JWT authentication token
  BACKEND_URL   (optional) Backend URL (default: http://localhost:3001)

Setup:
  1. Get your auth token by logging in:
     curl -X POST http://localhost:3001/api/auth/login \\
       -H "Content-Type: application/json" \\
       -d '{"email":"your-email","password":"your-password"}'

  2. Export the token:
     export AUTH_TOKEN="your-token-here"

  3. Run the script:
     node scripts/sendHistoricalReports.js 2025-01-01
`);
    process.exit(0);
  }

  // Check auth token
  if (!config.authToken) {
    console.error('❌ Error: AUTH_TOKEN environment variable not set!');
    console.error('\nPlease export your authentication token:');
    console.error('  export AUTH_TOKEN="your-jwt-token"\n');
    process.exit(1);
  }

  try {
    let dates;

    // Handle --last-N-days flags
    if (args[0].startsWith('--last-')) {
      const match = args[0].match(/--last-(\d+)-days?/);
      if (!match) {
        throw new Error('Invalid format. Use --last-7-days or --last-30-days');
      }
      const numDays = parseInt(match[1]);
      dates = getLastNDays(numDays);
    } else {
      // Handle date range
      const startDate = args[0];
      const endDate = args[1]; // Optional, defaults to today
      dates = getDateRange(startDate, endDate);
    }

    if (dates.length === 0) {
      console.error('❌ No dates to process!');
      process.exit(1);
    }

    // Confirm before sending (if more than 10 reports)
    if (dates.length > 10) {
      console.log(`\n⚠️  About to send ${dates.length} reports to Telegram.`);
      console.log('This will take approximately', Math.ceil(dates.length * 13 / 60), 'minutes.');
      console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');
      await delay(5000);
    }

    // Send reports
    const results = await sendHistoricalReports(dates);

    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// ============================================
// RUN
// ============================================

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { sendHistoricalReports, getDateRange, getLastNDays };
