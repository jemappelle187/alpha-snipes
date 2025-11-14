// tools/quote_smoke.ts
import { fetchQuoteResilient } from '../lib/quote_client.js';

async function main() {
  process.env.DEBUG_QUOTE = '1';

  const res = await fetchQuoteResilient(
    {
      // SOL -> USDC, 0.01 SOL
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: 10_000_000,
      slippageBps: 3000,
    },
    { maxAttempts: 2, timeoutMs: 2000 }
  );

  if (res.ok) {
    console.log('quote result: OK via', res.base);
    console.log(res.quote);
  } else {
    console.error('quote result: ERR', res.error?.message || res.error);
  }
}

main().catch(e => { console.error(e); process.exit(1); });