/**
 * WEEX Contract/Futures Order Script
 *
 * Opens a LONG position on WEEX Futures with specified USDT notional value
 *
 * Usage: npx ts-node scripts/weex-buy-order.ts
 *
 * Contract API:
 *   Base URL: https://api-contract.weex.com
 *   Order Types: 1=Open Long, 2=Open Short, 3=Close Long, 4=Close Short
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { weexService } from '../src/services/weexService';

const NOTIONAL_USDT = 10; // Trade 10 USDT worth
const SYMBOL = 'cmt_btcusdt'; // Contract symbol format

async function main() {
  console.log('='.repeat(60));
  console.log('WEEX Contract/Futures Order Script');
  console.log('='.repeat(60));
  console.log(`Notional Value: ${NOTIONAL_USDT} USDT`);
  console.log(`Symbol: ${SYMBOL}`);
  console.log(`API: https://api-contract.weex.com`);
  console.log('='.repeat(60));

  try {
    // Step 1: Check credentials
    console.log('\n[1/4] Checking credentials...');
    if (!process.env.WEEX_API_KEY || !process.env.WEEX_SECRET_KEY || !process.env.WEEX_PASSPHRASE) {
      throw new Error('Missing WEEX credentials in .env file');
    }
    console.log('Credentials loaded successfully');

    // Step 2: Get current price (tests ticker endpoint)
    console.log('\n[2/4] Fetching current BTC price from contract API...');
    const currentPrice = await weexService.getTickerPrice(SYMBOL);
    console.log(`Current BTC Price: $${currentPrice.toLocaleString()}`);

    // Step 3: Calculate quantity
    console.log('\n[3/4] Calculating position size...');
    const quantity = (NOTIONAL_USDT / currentPrice).toFixed(4);
    console.log(`Position Size: ${quantity}`);
    console.log(`Approximate Value: $${(parseFloat(quantity) * currentPrice).toFixed(2)} USDT`);

    // Step 4: Open LONG position
    console.log('\n[4/4] Opening LONG position (type=1, match_price=1)...');
    const result = await weexService.buyWithNotional(NOTIONAL_USDT, SYMBOL);

    console.log('\n' + '='.repeat(60));
    console.log('POSITION OPENED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`Order ID: ${result.data.orderId}`);
    console.log(`Client Order ID: ${result.data.clientOrderId}`);
    console.log(`Status Code: ${result.code}`);
    console.log(`Message: ${result.msg}`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n' + '='.repeat(60));
    console.error('ORDER FAILED!');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}`);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error(`HTTP Status: ${error.response.status}`);
    }
    console.error('='.repeat(60));
    process.exit(1);
  }
}

main();
