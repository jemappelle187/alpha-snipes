// index.ts - Alpha Snipes Bot with Alpha Verifier & PM2 Support
import 'dotenv/config';
import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import TelegramBot from 'node-telegram-bot-api';
import { basicRugChecks } from './lib/rug_checks.js';
import { priorityIxs } from './lib/priority.js';
import {
  readRegistry,
  addCandidate,
  removeCandidate,
  removeActive,
  addActive,
  bumpScore,
  maybePromote,
  manualPromote,
  listAll,
} from './alpha/alpha_registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

// Trading Mode
const TRADE_MODE = (process.env.TRADE_MODE || 'paper').toLowerCase();
const IS_PAPER = TRADE_MODE !== 'live';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const COMMAND_CHAT_ID = process.env.COMMAND_CHAT_ID || TELEGRAM_CHAT_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '';
const LEGACY_ALPHA_WALLET = process.env.ALPHA_WALLET || '';

const BUY_SOL = parseFloat(process.env.BUY_SOL || '0.01');
const EARLY_TP_PCT = parseFloat(process.env.EARLY_TP_PCT || '0.3');
const TRAIL_STOP_PCT = parseFloat(process.env.TRAIL_STOP_PCT || '0.2');

// Priority fee (Jito-lite)
const CU_UNIT_PRICE = parseInt(process.env.CU_UNIT_PRICE_MICROLAMPORTS || '5000', 10);
const CU_LIMIT = parseInt(process.env.CU_LIMIT || '800000', 10);

// Rug checks
const REQUIRE_AUTH_REVOKED = (process.env.REQUIRE_AUTHORITY_REVOKED || 'true') === 'true';
const MAX_TAX_BPS = parseInt(process.env.MAX_TAX_BPS || '500', 10);
const MAX_PRICE_IMPACT_BPS = parseInt(process.env.MAX_PRICE_IMPACT_BPS || '3000', 10);
const SENTRY_WINDOW_SEC = parseInt(process.env.SENTRY_WINDOW_SEC || '120', 10);
const SENTRY_MAX_DD = parseFloat(process.env.SENTRY_MAX_DRAWDOWN_PCT || '0.22');

// Alpha Verifier Settings
const PROMOTION_THRESHOLD = 2; // signals needed to auto-promote
const PROMOTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Wallet
let walletKeypair: Keypair;
if (IS_PAPER) {
  walletKeypair = Keypair.generate();
  console.log('📄 PAPER MODE: No real transactions will be sent');
} else {
  try {
    const privKey = process.env.WALLET_PRIVATE_KEY || '';
    if (!privKey) {
      throw new Error('WALLET_PRIVATE_KEY required for live mode');
    }
    walletKeypair = Keypair.fromSecretKey(bs58.decode(privKey));
  } catch (err: any) {
    console.error('❌ Invalid WALLET_PRIVATE_KEY in .env:', err.message);
    process.exit(1);
  }
}

// Connection
const connection = new Connection(RPC_URL, 'confirmed');

// Telegram Bot (with polling for commands)
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// State
const seenMints = new Set<string>();
const openPositions: Record<
  string,
  {
    mint: PublicKey;
    qty: bigint;
    costSol: number;
    entryPrice: number;
    highPrice: number;
  }
> = {};

// Dynamic Alpha Management
let ACTIVE_ALPHAS: string[] = [];
let CANDIDATE_ALPHAS: string[] = [];
const subscriptions = new Map<string, number>();

// ═══════════════════════════════════════════════════════════════════════════════
// Telegram Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function isAdmin(msg: TelegramBot.Message): boolean {
  if (!ADMIN_USER_ID) return true; // If not set, allow all (backward compat)
  return (
    String(msg.chat.id) === String(COMMAND_CHAT_ID) &&
    String(msg.from?.id) === String(ADMIN_USER_ID)
  );
}

async function alert(text: string) {
  const tag = IS_PAPER ? '[PAPER] ' : '';
  const fullText = text.startsWith('[PAPER]') ? text : `${tag}${text}`;

  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, fullText, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err: any) {
    console.error('Alert failed:', err.message || err);
  }
}

async function sendCommand(chatId: string | number, text: string) {
  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err: any) {
    console.error('Command response failed:', err.message || err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Telegram Command Handlers
// ═══════════════════════════════════════════════════════════════════════════════

bot.onText(/^\/alpha_add\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = match![1];
  addCandidate(addr);
  await sendCommand(msg.chat.id, `👀 <b>Candidate added:</b>\n<code>${addr}</code>\n\nThe bot will now monitor this wallet and score it based on early mint touches.`);
});

bot.onText(/^\/alpha_add_active\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = match![1];
  addActive(addr);
  refreshAlphas();
  await sendCommand(msg.chat.id, `✅ <b>Active alpha added:</b>\n<code>${addr}</code>\n\nThe bot will now copy trades from this wallet.`);
});

bot.onText(/^\/alpha_list$/, async (msg) => {
  if (!isAdmin(msg)) return;
  const { active, candidates, scores } = listAll();
  
  const activeList = active.length
    ? active.map((a) => `  • <code>${a}</code>`).join('\n')
    : '  (none)';
  
  const candidateList = candidates.length
    ? candidates
        .map((a) => {
          const score = scores[a];
          return `  • <code>${a}</code>\n    Signals: ${score?.signals || 0} | Last: ${score?.lastSeen ? new Date(score.lastSeen).toLocaleString() : 'never'}`;
        })
        .join('\n')
    : '  (none)';

  await sendCommand(
    msg.chat.id,
    `<b>🎯 Active Alphas</b> (currently trading):\n${activeList}\n\n<b>🧪 Candidates</b> (being scored):\n${candidateList}\n\n<i>Candidates auto-promote after ${PROMOTION_THRESHOLD} signals in 24h</i>`
  );
});

bot.onText(/^\/alpha_remove\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = match![1];
  removeCandidate(addr);
  removeActive(addr);
  refreshAlphas();
  await sendCommand(msg.chat.id, `🗑️ <b>Removed:</b>\n<code>${addr}</code>`);
});

bot.onText(/^\/alpha_promote\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = match![1];
  const promoted = manualPromote(addr);
  if (promoted) {
    refreshAlphas();
    await sendCommand(msg.chat.id, `✅ <b>Promoted to active:</b>\n<code>${addr}</code>`);
  } else {
    await sendCommand(msg.chat.id, `❌ Cannot promote <code>${addr}</code>\nEither not a candidate or already active.`);
  }
});

bot.onText(/^\/help$/, async (msg) => {
  if (!isAdmin(msg)) return;
  await sendCommand(
    msg.chat.id,
    `<b>📚 Alpha Snipes Commands</b>\n\n` +
      `<b>/alpha_add</b> &lt;address&gt;\n  Add wallet as candidate (auto-scores)\n\n` +
      `<b>/alpha_add_active</b> &lt;address&gt;\n  Add wallet directly to active (skip scoring)\n\n` +
      `<b>/alpha_list</b>\n  Show active alphas and candidates with scores\n\n` +
      `<b>/alpha_promote</b> &lt;address&gt;\n  Manually promote candidate to active\n\n` +
      `<b>/alpha_remove</b> &lt;address&gt;\n  Remove from candidates or active\n\n` +
      `<b>/help</b>\n  Show this message`
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Alpha Registry Management
// ═══════════════════════════════════════════════════════════════════════════════

function refreshAlphas() {
  const reg = readRegistry();
  ACTIVE_ALPHAS = reg.active;
  CANDIDATE_ALPHAS = reg.candidates;
  
  // If registry is empty and we have a legacy alpha wallet, add it
  if (ACTIVE_ALPHAS.length === 0 && CANDIDATE_ALPHAS.length === 0 && LEGACY_ALPHA_WALLET) {
    console.log(`Adding legacy ALPHA_WALLET to active: ${LEGACY_ALPHA_WALLET}`);
    addActive(LEGACY_ALPHA_WALLET);
    ACTIVE_ALPHAS = [LEGACY_ALPHA_WALLET];
  }
}

// Initial load
refreshAlphas();

// Refresh every 30 seconds
setInterval(refreshAlphas, 30_000);

// ═══════════════════════════════════════════════════════════════════════════════
// Jupiter V6 API Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50
): Promise<any> {
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.statusText}`);
  return await res.json();
}

async function getJupiterSwapTransaction(quoteResponse: any): Promise<string> {
  const url = 'https://quote-api.jup.ag/v6/swap';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: walletKeypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      priorityLevelWithMaxLamports: {
        maxLamports: CU_LIMIT * CU_UNIT_PRICE,
      },
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap failed: ${res.statusText}`);
  const { swapTransaction } = await res.json();
  return swapTransaction;
}

async function executeSwap(serializedTx: string): Promise<string> {
  const txBuf = Buffer.from(serializedTx, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([walletKeypair]);

  const sig = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Paper Trading Functions
// ═══════════════════════════════════════════════════════════════════════════════

type PaperExec = { txid: string; outAmount: string; solOutLamports?: number };

async function paperBuy(mint: PublicKey, solAmount: number): Promise<PaperExec> {
  const SOL = 'So11111111111111111111111111111111111111112';
  const lamports = Math.floor(solAmount * 1e9);

  const quote = await getJupiterQuote(SOL, mint.toBase58(), lamports, 300);
  if (!quote || !quote.outAmount) {
    throw new Error('No route found (paper mode)');
  }

  return { txid: '[PAPER-BUY]', outAmount: quote.outAmount };
}

async function paperSell(mint: PublicKey, tokenAmount: bigint): Promise<PaperExec> {
  const SOL = 'So11111111111111111111111111111111111111112';
  const quote = await getJupiterQuote(mint.toBase58(), SOL, Number(tokenAmount), 300);
  if (!quote || !quote.outAmount) {
    throw new Error('No sell route found (paper mode)');
  }

  return { txid: '[PAPER-SELL]', outAmount: '0', solOutLamports: Number(quote.outAmount) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Live Trading Functions
// ═══════════════════════════════════════════════════════════════════════════════

async function liveSwapSOLforToken(
  mint: PublicKey,
  solAmount: number
): Promise<{ txid: string; outAmount: string }> {
  const SOL = 'So11111111111111111111111111111111111111112';
  const lamports = Math.floor(solAmount * 1e9);

  const quote = await getJupiterQuote(SOL, mint.toBase58(), lamports, 300);
  const swapTx = await getJupiterSwapTransaction(quote);
  const txid = await executeSwap(swapTx);

  return { txid, outAmount: quote.outAmount };
}

async function liveSwapTokenForSOL(mint: PublicKey, tokenAmount: bigint): Promise<{ txid: string }> {
  const SOL = 'So11111111111111111111111111111111111111112';
  const quote = await getJupiterQuote(mint.toBase58(), SOL, Number(tokenAmount), 300);
  const swapTx = await getJupiterSwapTransaction(quote);
  const txid = await executeSwap(swapTx);

  return { txid };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Swap Functions (Branch on Mode)
// ═══════════════════════════════════════════════════════════════════════════════

async function swapSOLforToken(
  mint: PublicKey,
  solAmount: number
): Promise<{ txid: string; outAmount: string }> {
  if (IS_PAPER) {
    return await paperBuy(mint, solAmount);
  } else {
    return await liveSwapSOLforToken(mint, solAmount);
  }
}

async function swapTokenForSOL(
  mint: PublicKey,
  tokenAmount: bigint
): Promise<{ txid: string; solOutLamports?: number }> {
  if (IS_PAPER) {
    return await paperSell(mint, tokenAmount);
  } else {
    return await liveSwapTokenForSOL(mint, tokenAmount);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Price Monitoring
// ═══════════════════════════════════════════════════════════════════════════════

async function getQuotePrice(mint: PublicKey): Promise<number | null> {
  try {
    const SOL = 'So11111111111111111111111111111111111111112';
    const quote = await getJupiterQuote(mint.toBase58(), SOL, 1_000_000, 1000);
    if (!quote || !quote.outAmount) return null;
    const solOut = Number(quote.outAmount) / 1e9;
    if (solOut <= 0) return null;
    return solOut / 0.001;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Paper Trading PnL Reporting
// ═══════════════════════════════════════════════════════════════════════════════

function toSol(lamports: number): number {
  return lamports / 1e9;
}

async function reportPaperPnL(mintStr: string, entrySol: number, exitSolLamports: number) {
  const exitSol = toSol(exitSolLamports);
  const pnl = exitSol - entrySol;
  const pct = (pnl / entrySol) * 100;
  const emoji = pnl >= 0 ? '📈' : '📉';

  await alert(
    `${emoji} PnL for <code>${mintStr.slice(0, 8)}...</code>\n` +
      `Entry: ${entrySol.toFixed(4)} SOL\n` +
      `Exit: ${exitSol.toFixed(4)} SOL\n` +
      `Profit: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} SOL (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Alpha Wallet Watching with Log Subscriptions
// ═══════════════════════════════════════════════════════════════════════════════

function watchAddress(addr: string, label: 'active' | 'candidate') {
  if (subscriptions.has(addr)) return;

  try {
    const pk = new PublicKey(addr);
    const subId = connection.onLogs(
      pk,
      async (logs) => {
        if (logs.err) return;
        await handleAlphaTransaction(logs.signature, addr, label).catch((err) => {
          console.error(`Error handling ${label} tx:`, err);
        });
      },
      'confirmed'
    );
    subscriptions.set(addr, subId);
    console.log(`👀 Watching ${label}: ${addr}`);
  } catch (err) {
    console.error(`Failed to watch ${addr}:`, err);
  }
}

function unwatchAddress(addr: string) {
  const subId = subscriptions.get(addr);
  if (subId !== undefined) {
    connection.removeOnLogsListener(subId);
    subscriptions.delete(addr);
    console.log(`👋 Stopped watching: ${addr}`);
  }
}

// Refresh watchers every 60 seconds
function refreshWatchers() {
  const want = new Set([...ACTIVE_ALPHAS, ...CANDIDATE_ALPHAS]);
  const current = new Set(subscriptions.keys());

  // Add new watchers
  for (const addr of want) {
    if (!current.has(addr)) {
      const label = ACTIVE_ALPHAS.includes(addr) ? 'active' : 'candidate';
      watchAddress(addr, label);
    }
  }

  // Remove old watchers
  for (const addr of current) {
    if (!want.has(addr)) {
      unwatchAddress(addr);
    }
  }
}

setInterval(refreshWatchers, 60_000);

// ═══════════════════════════════════════════════════════════════════════════════
// Transaction Handler with Alpha Scoring
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAlphaTransaction(sig: string, signer: string, label: 'active' | 'candidate') {
  const tx = await connection.getParsedTransaction(sig, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || !tx.meta) return;

  // Extract new mints from transaction
  const mints = extractMints(tx);
  if (mints.length === 0) return;

  for (const m of mints) {
    if (seenMints.has(m)) continue;
    seenMints.add(m);

    if (label === 'candidate') {
      // Score a "signal": candidate touched a new mint
      bumpScore(signer);
      const promoted = maybePromote(signer, PROMOTION_THRESHOLD, PROMOTION_WINDOW_MS);
      
      await alert(
        `🧪 <b>Candidate signal</b>\n` +
          `Wallet: <code>${signer.slice(0, 8)}...</code>\n` +
          `Mint: <code>${m.slice(0, 8)}...</code>\n` +
          `TX: <code>${sig.slice(0, 8)}...</code>${promoted ? '\n\n✅ <b>AUTO-PROMOTED to active!</b>' : ''}`
      );
      
      if (promoted) {
        refreshAlphas();
      }
      return; // Candidates are not traded
    }

    // label === 'active' → proceed with trade flow
    const mintPk = new PublicKey(m);
    await alert(`👀 Alpha touched new mint <code>${m.slice(0, 12)}...</code>\nTX: <code>${sig.slice(0, 12)}...</code>`);

    try {
      // Run rug checks
      const report = await basicRugChecks(connection, mintPk, BUY_SOL, {
        requireAuthorityRevoked: REQUIRE_AUTH_REVOKED,
        maxTaxBps: MAX_TAX_BPS,
        maxImpactBps: MAX_PRICE_IMPACT_BPS,
      });

      if (!report.ok) {
        await alert(`⛔️ Skipping <code>${m.slice(0, 12)}...</code> due to: ${report.reasons.join(', ')}`);
        continue;
      }

      // Checks passed - execute buy
      const start = report.entryPrice ?? (await getQuotePrice(mintPk)) ?? 0;
      const buy = await swapSOLforToken(mintPk, BUY_SOL);
      const qty = BigInt(buy.outAmount);

      openPositions[m] = {
        mint: mintPk,
        qty,
        costSol: BUY_SOL,
        entryPrice: start,
        highPrice: start,
      };

      await alert(
        [
          `✅ Bought ${BUY_SOL.toFixed(3)} SOL of <code>${m.slice(0, 12)}...</code> (checks passed)`,
          `TX: https://solscan.io/tx/${buy.txid}`,
          start ? `Ref price ~ ${start.toFixed(10)} SOL/token` : '',
        ]
          .filter(Boolean)
          .join('\n')
      );

      // Start sentry + exit manager
      Promise.all([manageExit(m), postBuySentry(m)]).catch(() => {});
    } catch (e: any) {
      await alert(`❌ Buy failed for ${m.slice(0, 12)}...: ${e.message || e}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exit Manager (Early TP + Trailing Stop)
// ═══════════════════════════════════════════════════════════════════════════════

async function manageExit(mintStr: string) {
  const pos = openPositions[mintStr];
  if (!pos) return;

  const earlyTarget = pos.entryPrice * (1 + EARLY_TP_PCT);
  let phase: 'early' | 'trailing' = 'early';

  while (openPositions[mintStr]) {
    await new Promise((r) => setTimeout(r, 5000));
    const price = await getQuotePrice(pos.mint);
    if (!price) continue;

    if (price > pos.highPrice) pos.highPrice = price;

    if (phase === 'early' && price >= earlyTarget) {
      phase = 'trailing';
      await alert(
        `🎯 Early TP hit for ${mintStr.slice(0, 12)}...: ${price.toFixed(10)} SOL (target ${earlyTarget.toFixed(
          10
        )})\nSwitching to trailing stop...`
      );
    }

    if (phase === 'trailing') {
      const trailTrigger = pos.highPrice * (1 - TRAIL_STOP_PCT);
      if (price <= trailTrigger) {
        try {
          const tx = await swapTokenForSOL(pos.mint, pos.qty);
          const pnl = ((price - pos.entryPrice) / pos.entryPrice) * 100;
          await alert(
            `🛑 Trailing stop exit: ${mintStr.slice(0, 12)}...\nPrice: ${price.toFixed(
              10
            )} SOL\nPnL: ${pnl.toFixed(1)}%\nTX: https://solscan.io/tx/${tx.txid}`
          );

          if (IS_PAPER && tx.solOutLamports) {
            await reportPaperPnL(mintStr, pos.costSol, tx.solOutLamports);
          }

          delete openPositions[mintStr];
          return;
        } catch (err: any) {
          await alert(`❌ Exit failed for ${mintStr.slice(0, 12)}...: ${err.message || err}`);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Post-Buy Sentry (Early Drawdown Monitor)
// ═══════════════════════════════════════════════════════════════════════════════

async function postBuySentry(mintStr: string) {
  const pos = openPositions[mintStr];
  if (!pos) return;
  const entry = pos.entryPrice || 0;
  const start = Date.now();

  await alert(`🛡️ Sentry monitoring ${mintStr.slice(0, 12)}... for ${SENTRY_WINDOW_SEC}s...`);

  while ((Date.now() - start) / 1000 < SENTRY_WINDOW_SEC) {
    await new Promise((r) => setTimeout(r, 4000));
    if (!openPositions[mintStr]) return;

    const price = await getQuotePrice(pos.mint);
    if (!price || entry === 0) continue;

    const dd = (entry - price) / entry;
    if (dd >= SENTRY_MAX_DD) {
      try {
        const tx = await swapTokenForSOL(pos.mint, pos.qty);
        await alert(
          `🚨 Sentry abort: drawdown ${(dd * 100).toFixed(
            1
          )}% reached.\nTX: https://solscan.io/tx/${tx.txid}`
        );

        if (IS_PAPER && tx.solOutLamports) {
          await reportPaperPnL(mintStr, pos.costSol, tx.solOutLamports);
        }

        delete openPositions[mintStr];
        return;
      } catch (err: any) {
        await alert(`❌ Sentry exit failed for ${mintStr.slice(0, 12)}...: ${err.message || err}`);
      }
    }
  }

  if (openPositions[mintStr]) {
    await alert(`🛡️ Sentry window ended for ${mintStr.slice(0, 12)}... - no issues detected`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mint Extraction Helper
// ═══════════════════════════════════════════════════════════════════════════════

function extractMints(tx: any): string[] {
  const mints: string[] = [];
  const SOL = 'So11111111111111111111111111111111111111112';

  try {
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    for (const post of postBalances) {
      const mint = post.mint;
      if (mint === SOL) continue;
      const pre = preBalances.find((p: any) => p.mint === mint);
      if (!pre || Number(post.uiTokenAmount.uiAmount) > Number(pre.uiTokenAmount.uiAmount)) {
        mints.push(mint);
      }
    }
  } catch {
    // Ignore extraction errors
  }

  return mints;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Entry
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const mode = IS_PAPER ? '📄 PAPER MODE' : '💰 LIVE MODE';
  console.log(`🚀 Alpha Snipes Bot Starting... ${mode}`);
  console.log(`📍 Wallet: ${walletKeypair.publicKey.toBase58()}`);
  console.log(`💰 Buy size: ${BUY_SOL} SOL`);
  console.log(`🎯 Early TP: ${EARLY_TP_PCT * 100}%`);
  console.log(`🛑 Trailing stop: ${TRAIL_STOP_PCT * 100}%`);
  console.log(`🛡️ Sentry window: ${SENTRY_WINDOW_SEC}s (max DD: ${SENTRY_MAX_DD * 100}%)`);
  console.log(`⚙️  Priority: ${CU_UNIT_PRICE} microLamports, ${CU_LIMIT} CU limit`);

  if (IS_PAPER) {
    console.log('');
    console.log('⚠️  PAPER MODE ACTIVE - No real transactions will be sent!');
    console.log('   All trades are simulated using live Jupiter quotes.');
    console.log('   Set TRADE_MODE=live in .env to enable real trading.');
    console.log('');
  }

  console.log(`\n🔍 Alpha Verifier Active:`);
  console.log(`   Active alphas: ${ACTIVE_ALPHAS.length}`);
  console.log(`   Candidates: ${CANDIDATE_ALPHAS.length}`);
  console.log(`   Use /alpha_list to see details\n`);

  await alert(
    [
      `🚀 <b>Alpha Snipes Bot Started</b> ${IS_PAPER ? '(PAPER MODE)' : '(LIVE)'}`,
      `Wallet: <code>${walletKeypair.publicKey.toBase58()}</code>`,
      `Buy: ${BUY_SOL} SOL | TP: ${EARLY_TP_PCT * 100}% | Trail: ${TRAIL_STOP_PCT * 100}%`,
      `Sentry: ${SENTRY_WINDOW_SEC}s (DD: ${SENTRY_MAX_DD * 100}%)`,
      `\n🔍 Watching: ${ACTIVE_ALPHAS.length} active, ${CANDIDATE_ALPHAS.length} candidates`,
    ].join('\n')
  );

  // Start watching all alphas
  refreshWatchers();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});


