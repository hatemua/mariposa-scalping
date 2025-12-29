import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.WEEX_API_KEY || '';
const secretKey = process.env.WEEX_SECRET_KEY || '';
const passphrase = process.env.WEEX_PASSPHRASE || '';

async function testEndpoint(path: string, name: string) {
  const timestamp = Date.now().toString();
  const method = 'GET';
  const body = '';

  const message = timestamp + method + path + body;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('base64');

  console.log(`Testing ${name}: ${path}`);

  try {
    const res = await axios.get('https://api-contract.weex.com' + path, {
      headers: {
        'Content-Type': 'application/json',
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-PASSPHRASE': passphrase,
        'ACCESS-TIMESTAMP': timestamp,
        'locale': 'en-US',
      },
      timeout: 30000,
    });
    console.log('  Success:', JSON.stringify(res.data).substring(0, 300));
  } catch (err: any) {
    console.log('  Error:', err.response?.status, JSON.stringify(err.response?.data)?.substring(0, 200) || err.message);
  }
}

async function main() {
  // Try various position endpoint variations
  await testEndpoint('/capi/v2/position/allPosition?symbol=cmt_btcusdt', 'allPosition');
  await testEndpoint('/capi/v2/position/allPosition', 'allPosition (no symbol)');
  await testEndpoint('/capi/v2/position/singlePosition?symbol=cmt_btcusdt', 'singlePosition');
  await testEndpoint('/capi/v2/account/position?symbol=cmt_btcusdt', 'account/position');
  await testEndpoint('/capi/v2/account/account?symbol=cmt_btcusdt', 'account/account');
}

main();
