// test_mock_trade.ts - Simulate a complete alpha trade flow
import 'dotenv/config';
import { PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

// Mock data
const MOCK_ALPHA = '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';
const MOCK_MINT = 'TESTMOONabcdef123456789012345678901234'; // Fake but valid-looking mint
const MOCK_TX_DETECT = 'test_detection_tx_abc123456789';
const MOCK_TX_BUY = 'test_buy_tx_def456789012';
const MOCK_TX_SELL = 'test_sell_tx_ghi789012345';

// Mock prices (in SOL per token)
const ENTRY_PRICE = 0.000001;
const TP_PRICE = 0.0000013; // +30%
const EXIT_PRICE = 0.0000012; // +20%

async function sendAlert(text: string) {
  const tag = '[PAPER] ';
  const fullText = text.startsWith('[PAPER]') ? text : `${tag}${text}`;
  
  console.log('\n' + '='.repeat(80));
  console.log(fullText);
  console.log('='.repeat(80) + '\n');
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        chat_id: TELEGRAM_CHAT_ID,
        text: fullText,
        parse_mode: 'HTML',
        disable_web_page_preview: 'true',
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('❌ Telegram error:', data);
    } else {
      console.log('✅ Alert sent to Telegram');
    }
  } catch (err: any) {
    console.error('❌ Alert failed:', err.message || err);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateTrade() {
  console.log('\n🧪 STARTING MOCK ALPHA TRADE SIMULATION\n');
  console.log(`Mock Alpha: ${MOCK_ALPHA}`);
  console.log(`Mock Mint: ${MOCK_MINT}`);
  console.log(`Entry Price: ${ENTRY_PRICE} SOL/token`);
  console.log(`TP Price: ${TP_PRICE} SOL/token (+30%)`);
  console.log(`Exit Price: ${EXIT_PRICE} SOL/token (+20%)`);
  
  // Step 1: Alpha detection
  await sendAlert(
    `👀 <b>Alpha touched new mint</b>\n` +
    `Mint: <code>${MOCK_MINT.slice(0, 12)}...</code>\n` +
    `TX: <code>${MOCK_TX_DETECT.slice(0, 12)}...</code>`
  );
  
  await sleep(2000);
  
  // Step 2: Rug checks (simulated pass)
  console.log('\n🔍 Running rug checks (simulated)...');
  console.log('  ✓ Mint authority: NULL');
  console.log('  ✓ Freeze authority: NULL');
  console.log('  ✓ Tax check: 2.3% (under 5% limit)');
  console.log('  ✓ Route exists: BUY & SELL');
  console.log('  ✓ Price impact: 1.2% (under 30% limit)');
  
  await sleep(2000);
  
  // Step 3: Buy execution
  const buySol = 0.02;
  const tokensReceived = buySol / ENTRY_PRICE;
  
  await sendAlert(
    `✅ <b>Bought ${buySol.toFixed(3)} SOL</b> of <code>${MOCK_MINT.slice(0, 12)}...</code> (checks passed)\n` +
    `TX: https://solscan.io/tx/${MOCK_TX_BUY}\n` +
    `Ref price ~ ${ENTRY_PRICE.toFixed(10)} SOL/token\n` +
    `Tokens: ${tokensReceived.toFixed(0)}`
  );
  
  await sleep(2000);
  
  // Step 4: Sentry activation
  await sendAlert(
    `🛡️ <b>Sentry monitoring</b> ${MOCK_MINT.slice(0, 12)}... for 120s...\n` +
    `Will exit if drawdown exceeds -22%`
  );
  
  await sleep(3000);
  
  // Step 5: Sentry window ends (no issues)
  await sendAlert(
    `🛡️ <b>Sentry window ended</b> for ${MOCK_MINT.slice(0, 12)}... - no issues detected`
  );
  
  await sleep(3000);
  
  // Step 6: Price monitoring (simulated price increases)
  console.log('\n📈 Price monitoring (simulated)...');
  console.log(`  Current price: ${ENTRY_PRICE.toFixed(10)} SOL → ${(ENTRY_PRICE * 1.1).toFixed(10)} SOL`);
  console.log(`  Current price: ${(ENTRY_PRICE * 1.1).toFixed(10)} SOL → ${(ENTRY_PRICE * 1.2).toFixed(10)} SOL`);
  console.log(`  Current price: ${(ENTRY_PRICE * 1.2).toFixed(10)} SOL → ${TP_PRICE.toFixed(10)} SOL`);
  
  await sleep(3000);
  
  // Step 7: Early TP hit
  const tpTarget = ENTRY_PRICE * 1.3;
  await sendAlert(
    `🎯 <b>Early TP hit</b> for ${MOCK_MINT.slice(0, 12)}...\n` +
    `Price: ${TP_PRICE.toFixed(10)} SOL\n` +
    `Target: ${tpTarget.toFixed(10)} SOL\n` +
    `Switching to trailing stop...`
  );
  
  await sleep(3000);
  
  // Step 8: Trailing stop monitoring
  console.log('\n📊 Trailing stop active...');
  console.log(`  High: ${TP_PRICE.toFixed(10)} SOL`);
  console.log(`  Trailing stop trigger: ${(TP_PRICE * 0.8).toFixed(10)} SOL (20% below high)`);
  console.log(`  Current price drops to: ${EXIT_PRICE.toFixed(10)} SOL`);
  
  await sleep(3000);
  
  // Step 9: Trailing stop exit
  const pnlPercent = ((EXIT_PRICE - ENTRY_PRICE) / ENTRY_PRICE) * 100;
  await sendAlert(
    `🛑 <b>Trailing stop exit</b>: ${MOCK_MINT.slice(0, 12)}...\n` +
    `Price: ${EXIT_PRICE.toFixed(10)} SOL\n` +
    `PnL: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%\n` +
    `TX: https://solscan.io/tx/${MOCK_TX_SELL}`
  );
  
  await sleep(2000);
  
  // Step 10: PnL Report
  const exitSol = tokensReceived * EXIT_PRICE;
  const pnlSol = exitSol - buySol;
  const emoji = pnlSol >= 0 ? '📈' : '📉';
  
  await sendAlert(
    `${emoji} <b>PnL for</b> <code>${MOCK_MINT.slice(0, 8)}...</code>\n` +
    `Entry: ${buySol.toFixed(4)} SOL\n` +
    `Exit: ${exitSol.toFixed(4)} SOL\n` +
    `Profit: ${pnlSol >= 0 ? '+' : ''}${pnlSol.toFixed(4)} SOL (${pnlSol >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`
  );
  
  console.log('\n✅ MOCK TRADE SIMULATION COMPLETE!\n');
  console.log('Summary:');
  console.log(`  Entry: ${buySol.toFixed(4)} SOL @ ${ENTRY_PRICE.toFixed(10)} SOL/token`);
  console.log(`  Exit: ${exitSol.toFixed(4)} SOL @ ${EXIT_PRICE.toFixed(10)} SOL/token`);
  console.log(`  PnL: ${pnlSol >= 0 ? '+' : ''}${pnlSol.toFixed(4)} SOL (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`);
  console.log('\n📱 Check your Telegram channel for all [PAPER] alerts!\n');
}

// Run simulation
simulateTrade()
  .then(() => {
    console.log('🎉 Simulation completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Simulation failed:', err);
    process.exit(1);
  });


