import { weexService } from '../src/services/weexService';

const COMMANDS: Record<string, string> = {
  positions: 'Get all open positions',
  assets: 'Get contract account assets',
  close: 'Close all positions for symbol',
  all: 'Run all tests',
  help: 'Show this help menu',
};

function showHelp() {
  console.log('\nWEEX API Test Script');
  console.log('====================\n');
  console.log('Usage: npx ts-node scripts/weex-minimal-buy-close.ts [command]\n');
  console.log('Commands:');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(12)} ${desc}`);
  }
  console.log('\nExamples:');
  console.log('  npx ts-node scripts/weex-minimal-buy-close.ts positions');
  console.log('  npx ts-node scripts/weex-minimal-buy-close.ts assets');
  console.log('  npx ts-node scripts/weex-minimal-buy-close.ts close');
  console.log('  npx ts-node scripts/weex-minimal-buy-close.ts all');
}

async function main() {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'positions':
      console.log('Getting all positions...');
      const positions = await weexService.getAllPositions();
      console.log('Positions:', JSON.stringify(positions, null, 2));
      break;

    case 'assets':
      console.log('Getting contract assets...');
      const assets = await weexService.getContractAssets();
      console.log('Assets:', JSON.stringify(assets, null, 2));
      break;

    case 'close':
      console.log('Closing positions for cmt_btcusdt...');
      const closeResult = await weexService.closePositionsViaAPI('cmt_btcusdt');
      console.log('Result:', JSON.stringify(closeResult, null, 2));
      break;

    case 'all':
      console.log('=== All Positions ===');
      console.log(await weexService.getAllPositions());
      console.log('\n=== Contract Assets ===');
      console.log(await weexService.getContractAssets());
      break;

    case 'help':
    default:
      showHelp();
      break;
  }
}

main().catch(console.error);
