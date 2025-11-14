import fs from 'fs';
const LOCK = '/tmp/alpha_snipes.lock';
if (fs.existsSync(LOCK)) {
  console.error('Another Alpha Snipes instance is already running. Exiting.');
  process.exit(1);
}
fs.writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch {} });
for (const sig of ['SIGINT','SIGTERM']) {
  process.on(sig as NodeJS.Signals, () => { try { fs.unlinkSync(LOCK); } catch {}; process.exit(0); });
}
// index.ts - Alpha Snipes Bot with Alpha Verifier & PM2 Support
import 'dotenv/config';
import dns from 'dns';
import { Connection, PublicKey, Keypair, VersionedTransaction, type ParsedTransactionWithMeta } from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import TelegramBot from 'node-telegram-bot-api';
import { basicRugChecks } from './lib/rug_checks.js';
import { priorityIxs } from './lib/priority.js';
import { fetchQuoteResilient, explainQuoteError } from './lib/quote_client.js';
import { JUP_QUOTE_BASE, JUP_SWAP_BASE, logJupiterBases } from './lib/jupiter_endpoints.js';
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
import { getSolUsd } from './lib/sol_price.js';
import { formatSol, formatUsd, short, lamportsToSol, esc, safeAgo } from './lib/format.js';
import { linkRow } from './lib/telegram_helpers.js';
import { tgQueue } from './lib/telegram_rate.js';
import { recordTrade, readTrades, summarize } from './lib/ledger.js';
import { explainSkip } from './lib/explain.js';
import { getLiquidityResilient } from './lib/liquidity.js';
import { swapWithDEXFallback } from './lib/dex_fallbacks.js';
import { computePositionSize } from './lib/position_sizing.js';
import {
  loadPositions,
  savePositions,
  hydratePositions,
  serializeLivePositions,
} from './lib/positions.js';
import {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlistEntries,
  getWatchlistEntry,
  markChecked as markWatchlistChecked,
  pruneExpired as pruneWatchlist,
  nextEntriesToCheck,
} from './lib/watchlist.js';

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
const MIN_BUY_SOL = parseFloat(process.env.MIN_BUY_SOL || '0.005');
const MAX_BUY_SOL = parseFloat(process.env.MAX_BUY_SOL || '0.05');
const EARLY_TP_PCT = parseFloat(process.env.EARLY_TP_PCT || '0.3');
const TRAIL_STOP_PCT = parseFloat(process.env.TRAIL_STOP_PCT || '0.2');
const PARTIAL_TP_PCT = Math.max(0, Math.min(1, parseFloat(process.env.PARTIAL_TP_PCT || '0')));

// Priority fee (Jito-lite)
const CU_UNIT_PRICE = parseInt(process.env.CU_UNIT_PRICE_MICROLAMPORTS || '5000', 10);
const CU_LIMIT = parseInt(process.env.CU_LIMIT || '800000', 10);
const JITO_PRIORITY_FEE_MULTIPLIER = parseFloat(process.env.JITO_PRIORITY_FEE_MULTIPLIER || '1.0');
const MAX_PRIORITY_FEE_LAMPORTS = parseInt(process.env.MAX_PRIORITY_FEE_LAMPORTS || '50000000', 10); // 0.05 SOL max

// Helius configuration
// Extract API key from URL if embedded, or use separate env var
const heliusKeyFromUrl = RPC_URL.match(/[?&]api-key=([^&]+)/)?.[1] || '';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || heliusKeyFromUrl;
const USE_HELIUS_RPC = RPC_URL.includes('helius') && (HELIUS_API_KEY || heliusKeyFromUrl);

// Rug checks
const REQUIRE_AUTH_REVOKED = (process.env.REQUIRE_AUTHORITY_REVOKED || 'true') === 'true';
const MAX_TAX_BPS = parseInt(process.env.MAX_TAX_BPS || '500', 10);
const MAX_PRICE_IMPACT_BPS = parseInt(process.env.MAX_PRICE_IMPACT_BPS || '3000', 10);
const SENTRY_WINDOW_SEC = parseInt(process.env.SENTRY_WINDOW_SEC || '120', 10);
const SENTRY_MAX_DD = parseFloat(process.env.SENTRY_MAX_DRAWDOWN_PCT || '0.22');
const DUST_SOL_SPENT = parseFloat(process.env.DUST_SOL_SPENT || '0.001');
const MIN_ALPHA_TOKEN_BALANCE = parseFloat(process.env.MIN_ALPHA_TOKEN_BALANCE || '0.000001');
const MIN_SIZE_INCREASE_RATIO = parseFloat(process.env.MIN_SIZE_INCREASE_RATIO || '0.25');
const MAX_SIGNAL_AGE_SEC = parseInt(process.env.MAX_SIGNAL_AGE_SEC || '60', 10);
const MAX_ALPHA_ENTRY_MULTIPLIER = parseFloat(process.env.MAX_ALPHA_ENTRY_MULTIPLIER || '2');
const MIN_LIQUIDITY_USD = parseFloat(process.env.MIN_LIQUIDITY_USD || '10000');
const ENABLE_WATCHLIST = (process.env.ENABLE_WATCHLIST || 'true') === 'true';
const WATCHLIST_CHECK_INTERVAL_MS = parseInt(process.env.WATCHLIST_CHECK_INTERVAL_MS || '30000', 10);
const WATCHLIST_MAX_AGE_MS = parseInt(
  process.env.WATCHLIST_MAX_AGE_MS || String(3 * 24 * 60 * 60 * 1000),
  10
);
const WATCHLIST_MIN_LIQUIDITY_USD = parseFloat(process.env.WATCHLIST_MIN_LIQUIDITY_USD || '4000');
const WATCHLIST_MIN_VOLUME_24H_USD = parseFloat(process.env.WATCHLIST_MIN_VOLUME_24H_USD || '1000'); // Require $1k+ 24h volume
const WATCHLIST_MAX_INACTIVE_HOURS = parseFloat(process.env.WATCHLIST_MAX_INACTIVE_HOURS || '2'); // Skip if no activity in last 2 hours
const ENABLE_ORCA_FALLBACK = (process.env.ENABLE_ORCA_FALLBACK || 'false') === 'true';
const ENABLE_RAYDIUM_FALLBACK = (process.env.ENABLE_RAYDIUM_FALLBACK || 'false') === 'true';

// Alpha Verifier Settings
const PROMOTION_THRESHOLD = 2; // signals needed to auto-promote
const PROMOTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Debug flags
const DEBUG_TX = (process.env.DEBUG_TX || 'false') === 'true';
const DEBUG_TO_TELEGRAM = (process.env.DEBUG_TO_TELEGRAM || 'false') === 'true';

// Monitoring & Heartbeat
const HEARTBEAT_EVERY_MIN = Number(process.env.HEARTBEAT_EVERY_MIN || 15);
const SILENT_ALERT_MIN = Number(process.env.SILENT_ALERT_MIN || 60);
const PULSE_MAX_ROWS = Number(process.env.PULSE_MAX_ROWS || 5);

// Optional DNS override for more reliable hostname resolution (comma-separated)
const DNS_OVERRIDE = process.env.DNS_OVERRIDE || '';

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
// Apply DNS override (if set), before any network calls
if (DNS_OVERRIDE) {
  try {
    dns.setServers(
      DNS_OVERRIDE.split(',').map((s) => s.trim()).filter(Boolean)
    );
    console.log('🔁 DNS override applied:', DNS_OVERRIDE);
  } catch (e: any) {
    console.warn('⚠️ Failed to apply DNS override:', e?.message || e);
  }
}
const connection = new Connection(RPC_URL, 'confirmed');

// Telegram Bot (with polling for commands)
const bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: {
    interval: 1500,              // 1.5s between polls (backup; long-poll handles most)
    params: { 
      timeout: 50,               // long-poll up to 50s
      limit: 100,                // batch up to 100 updates
      allowed_updates: ['message', 'callback_query'] // Only updates we use
    }
  }
});

// Clear webhook to ensure polling mode
(async () => {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook?drop_pending_updates=true`);
    console.log('✅ Telegram webhook cleared (polling mode ensured)');
  } catch (e) {
    console.warn('⚠️ Failed to clear webhook:', e);
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Safe Transaction Fetcher (handles RPC quirks)
// ═══════════════════════════════════════════════════════════════════════════════

// Raw JSON-RPC fallback with sanitization
async function rawGetParsedTxBySig(
  rpcUrl: string,
  signature: string
): Promise<any | null> {
  try {
    const body = {
      jsonrpc: "2.0",
      id: "alpha",
      method: "getTransaction",
      params: [
        signature,
        {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
          encoding: "jsonParsed"
        }
      ]
    };
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const json: any = await res.json();
    if (!json || !(json as any).result) return null;

    const tx = (json as any).result;

    // --- sanitize the known RPC quirk ---
    if (tx?.meta && tx.meta.costUnits === null) {
      delete tx.meta.costUnits; // remove the field entirely
    }

    // Also guard token balances/meta arrays so downstream logic never explodes
    if (tx?.meta) {
      tx.meta.preTokenBalances = tx.meta.preTokenBalances ?? [];
      tx.meta.postTokenBalances = tx.meta.postTokenBalances ?? [];
      tx.meta.innerInstructions = tx.meta.innerInstructions ?? [];
      tx.meta.logMessages = tx.meta.logMessages ?? [];
      tx.meta.rewards = tx.meta.rewards ?? [];
    }

    return tx; // "ParsedTransactionWithMeta-like"; our code only needs meta + balances
  } catch (e) {
    if (DEBUG_TX) {
      console.warn("[DBG] rawGetParsedTxBySig failed for", signature, e);
    }
    return null;
  }
}

async function safeGetParsedTx(connection: any, sig: string): Promise<any | null> {
  const rpcUrl = RPC_URL;
  let alreadyLogged = false;

  const logOnce = (msg: string, ...rest: any[]) => {
    if (DEBUG_TX && !alreadyLogged) {
      alreadyLogged = true;
      console.log(msg, ...rest);
    }
  };

  try {
    // Primary: normal parsed call
    const tx = await connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (tx?.meta?.costUnits === null) {
      // sanitize in-memory for good measure
      delete (tx.meta as any).costUnits;
    }
    return tx;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("meta.costUnits")) {
      logOnce("[DBG] costUnits=null from RPC, trying fallback getTransaction for", sig);
      try {
        // Secondary: web3 getTransaction
        const tx2 = await connection.getTransaction(sig, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        } as any);
        if (tx2?.meta?.costUnits === null) {
          delete (tx2.meta as any).costUnits;
        }
        return tx2;
      } catch (e2) {
        logOnce("[DBG] fallback getTransaction failed; using raw JSON-RPC for", sig);
        // Tertiary: raw JSON-RPC (bypasses superstruct)
        if (rpcUrl) {
          const raw = await rawGetParsedTxBySig(rpcUrl, sig);
          if (raw) return raw;
        }
        return null;
      }
    } else {
      // Unknown error: try raw as last resort
      if (rpcUrl) {
        logOnce("[DBG] unknown getParsedTransaction error; trying raw JSON-RPC for", sig, e);
        const raw = await rawGetParsedTxBySig(rpcUrl, sig);
        if (raw) return raw;
      }
      return null;
    }
  }
}

// State
const seenMints = new Set<string>(); // Track processed mint addresses
const seenSignatures = new Set<string>(); // Track processed transaction signatures
const recentPaperBuys = new Map<string, number>(); // key -> timestamp for idempotency
let openPositions: Record<
  string,
  {
    mint: PublicKey;
    qty: bigint;
    costSol: number;
    entryPrice: number;
    highPrice: number;
    entryTime: number;
    alpha?: string;
    phase?: 'early' | 'trailing';
  }
> = hydratePositions(loadPositions());

function persistPositions() {
  try {
    savePositions(serializeLivePositions(openPositions));
  } catch (err) {
    console.warn('[POSITIONS] Persist failed:', err);
  }
}

setInterval(persistPositions, 60_000);
process.on('beforeExit', () => {
  try {
    persistPositions();
  } catch {}
});

type AlphaSignal = {
  mint: string;
  solSpent: number;
  tokenDelta: number;
  alphaEntryPrice: number;
  alphaPreBalance: number;
  alphaPostBalance: number;
  blockTimeMs: number;
  signalAgeSec: number;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Monitoring & Activity Tracking
// ═══════════════════════════════════════════════════════════════════════════════

type BotEvent =
  | { t: number; kind: 'touch'; mint: string; alpha: string; tx: string }
  | { t: number; kind: 'buy'; mint: string; alpha: string; sol: number; usd: number; tx: string }
  | { t: number; kind: 'skip'; mint?: string; alpha?: string; reason: string }
  | { t: number; kind: 'exit'; mint: string; pnlUsd: number; pnlPct: number; tx: string }
  | { t: number; kind: 'partial'; mint: string; usd: number; pnlPct: number; tx: string };

const RECENT: BotEvent[] = [];
const MAX_RECENT = 50;

let LAST_ACTIVITY_AT = Date.now();
let LAST_SIGNAL_AT = Date.now();
let LAST_TRADE_AT = 0;
let SILENT_ALERT_SENT = false;

function pushEvent(e: BotEvent) {
  RECENT.push(e);
  if (RECENT.length > MAX_RECENT) RECENT.shift();
  LAST_ACTIVITY_AT = Date.now();
  if (e.kind === 'buy' || e.kind === 'exit' || e.kind === 'partial') LAST_TRADE_AT = Date.now();
  if (e.kind === 'touch' || e.kind === 'buy') LAST_SIGNAL_AT = Date.now();
}

function ago(ms: number): string {
  const m = Math.floor(ms / 60000);
  return m <= 0 ? '≤1m' : `${m}m`;
}

function getMatchParam(match: RegExpExecArray | null, index: number): string | null {
  if (!match) return null;
  const value = match[index];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

function isValidPrice(n: number | undefined | null): boolean {
  return Number.isFinite(n as number) && (n as number) > 0;
}

function canPaperBuy(key: string, ms = 60_000): boolean {
  const last = recentPaperBuys.get(key) ?? 0;
  const now = Date.now();
  if (now - last < ms) return false;
  recentPaperBuys.set(key, now);
  return true;
}

// Dynamic Alpha Management
let ACTIVE_ALPHAS: string[] = [];
let CANDIDATE_ALPHAS: string[] = [];
const subscriptions = new Map<string, number>();

// ═══════════════════════════════════════════════════════════════════════════════
// Telegram Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function isAdmin(msg: TelegramBot.Message): boolean {
  if (!ADMIN_USER_ID) return true; // If not set, allow all (backward compat)
  const chatId = String(msg.chat.id);
  const userId = String(msg.from?.id);
  // Allow commands from: COMMAND_CHAT_ID (private) OR TELEGRAM_CHAT_ID (channel/group)
  const allowedChat = chatId === String(COMMAND_CHAT_ID) || chatId === String(TELEGRAM_CHAT_ID);
  return allowedChat && userId === String(ADMIN_USER_ID);
}

async function alert(text: string) {
  const tag = IS_PAPER ? '[PAPER] ' : '';
  const fullText = text.startsWith('[PAPER]') ? text : `${tag}${text}`;

  try {
    await tgQueue.enqueue(() => bot.sendMessage(TELEGRAM_CHAT_ID, fullText, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }), { chatId: TELEGRAM_CHAT_ID });
  } catch (err: any) {
    console.error('Alert failed:', err.message || err);
  }
}

async function sendCommand(chatId: string | number, text: string) {
  try {
    await tgQueue.enqueue(() => bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }), { chatId });
  } catch (err: any) {
    console.error('Command response failed:', err.message || err);
  }
}

function dbg(line: string) {
  if (!DEBUG_TX) return;
  const tag = IS_PAPER ? '[PAPER][DBG] ' : '[DBG] ';
  const msg = `${tag}${line}`;
  console.log(msg);
  if (DEBUG_TO_TELEGRAM) {
    // Use command chat to avoid channel spam
    sendCommand(COMMAND_CHAT_ID, `<code>${msg}</code>`).catch(() => {});
  }
}

function parseUiAmount(info: any): number {
  if (!info) return 0;
  const str = info.uiAmountString;
  if (typeof str === 'string' && str.length) {
    const parsed = Number(str);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const num = info.uiAmount;
  if (typeof num === 'number' && Number.isFinite(num)) return num;
  if (typeof info.amount === 'string') {
    const raw = Number(info.amount);
    const decimals = Number(info.decimals ?? 0);
    if (Number.isFinite(raw)) {
      return raw / Math.pow(10, decimals);
    }
  }
  return 0;
}

function classifyAlphaSignals(tx: any, alpha: string, sig?: string): AlphaSignal[] {
  try {
    const keys: any[] = tx?.transaction?.message?.accountKeys ?? [];
    const normalize = (k: any) =>
      typeof k === 'string' ? k : k?.pubkey ?? (typeof k?.toBase58 === 'function' ? k.toBase58() : '');
    const alphaIndex = keys.findIndex((k) => normalize(k) === alpha);
    if (alphaIndex === -1) {
      dbg(`[CLASSIFY] alpha ${short(alpha)} not found in account keys for tx ${sig?.slice(0, 8)}`);
      return [];
    }

    const preLamports = Number(tx?.meta?.preBalances?.[alphaIndex] ?? 0);
    const postLamports = Number(tx?.meta?.postBalances?.[alphaIndex] ?? 0);
    const solSpent = (preLamports - postLamports) / 1e9;
    const solReceived = (postLamports - preLamports) / 1e9;
    
    if (!Number.isFinite(solSpent) || solSpent < DUST_SOL_SPENT) {
      // Check if this is a SELL (SOL received, tokens decreased)
      if (Number.isFinite(solReceived) && solReceived >= DUST_SOL_SPENT) {
        const preBalances = tx?.meta?.preTokenBalances ?? [];
        const postBalances = tx?.meta?.postTokenBalances ?? [];
        const preByMint = new Map<string, any>();
        for (const bal of preBalances) {
          if (bal?.owner !== alpha || !bal?.mint) continue;
          preByMint.set(bal.mint, bal);
        }
        
        const sells: { mint: string; tokensSold: number; solReceived: number }[] = [];
        for (const pre of preBalances) {
          if (pre?.owner !== alpha || !pre?.mint) continue;
          const preAmount = parseUiAmount(pre.uiTokenAmount);
          const post = postBalances.find((p: any) => p?.owner === alpha && p?.mint === pre.mint);
          const postAmount = post ? parseUiAmount(post.uiTokenAmount) : 0;
          const delta = preAmount - postAmount;
          if (delta > 0 && preAmount >= MIN_ALPHA_TOKEN_BALANCE) {
            sells.push({ mint: pre.mint, tokensSold: delta, solReceived });
          }
        }
        
        if (sells.length > 0) {
          for (const sell of sells) {
            dbg(
              `[CLASSIFY] SELL | Alpha: ${short(alpha)} | Mint: ${short(
                sell.mint
              )} | solReceived=${sell.solReceived.toFixed(4)} | tokensSold=${sell.tokensSold.toFixed(2)}`
            );
          }
        }
      }
      
      dbg(
        `[CLASSIFY] skip tx ${sig?.slice(0, 8)}: solSpent=${solSpent.toFixed(6)} < dust ${DUST_SOL_SPENT}`
      );
      return [];
    }

    const preBalances = tx?.meta?.preTokenBalances ?? [];
    const postBalances = tx?.meta?.postTokenBalances ?? [];

    const preByMint = new Map<string, any>();
    for (const bal of preBalances) {
      if (bal?.owner !== alpha || !bal?.mint) continue;
      preByMint.set(bal.mint, bal);
    }

    const gains: { mint: string; delta: number; postAmount: number; preAmount: number }[] = [];
    for (const post of postBalances) {
      if (post?.owner !== alpha || !post?.mint) continue;
      const postAmount = parseUiAmount(post.uiTokenAmount);
      const preAmount = preByMint.has(post.mint)
        ? parseUiAmount(preByMint.get(post.mint).uiTokenAmount)
        : 0;
      const delta = postAmount - preAmount;
      if (delta <= 0) continue;
      if (postAmount < MIN_ALPHA_TOKEN_BALANCE) {
        dbg(
          `[CLASSIFY] skip mint ${short(post.mint)}: alpha post-balance ${postAmount.toFixed(
            6
          )} < dust ${MIN_ALPHA_TOKEN_BALANCE}`
        );
        continue;
      }
      if (preAmount > 0) {
        const ratio = delta / preAmount;
        if (ratio < MIN_SIZE_INCREASE_RATIO) {
          dbg(
            `[CLASSIFY] skip mint ${short(post.mint)}: size increase ${ratio.toFixed(
              2
            )}x < min ${MIN_SIZE_INCREASE_RATIO}x`
          );
          continue;
        }
      }
      gains.push({ mint: post.mint, delta, postAmount, preAmount });
    }

    if (!gains.length) {
      dbg(`[CLASSIFY] tx ${sig?.slice(0, 8)} had no qualifying token balance increases`);
      return [];
    }

    const totalDelta = gains.reduce((sum, g) => sum + g.delta, 0);
    if (!Number.isFinite(totalDelta) || totalDelta <= 0) {
      dbg(`[CLASSIFY] invalid token delta sum (${totalDelta}) for tx ${sig?.slice(0, 8)}`);
      return [];
    }

    const alphaEntryPrice = solSpent / totalDelta;
    if (!isValidPrice(alphaEntryPrice)) {
      dbg(`[CLASSIFY] invalid alpha entry price ${alphaEntryPrice} for tx ${sig?.slice(0, 8)}`);
      return [];
    }

    const blockTimeMs = tx?.blockTime ? tx.blockTime * 1000 : Date.now();
    const signalAgeSec = tx?.blockTime ? Math.max(0, (Date.now() - blockTimeMs) / 1000) : 0;

    return gains.map((g) => {
      dbg(
        `[CLASSIFY] BUY | Alpha: ${short(alpha)} | Mint: ${short(
          g.mint
        )} | solSpent=${solSpent.toFixed(4)} | tokens=${g.delta.toFixed(2)} | entryPrice=${alphaEntryPrice.toExponential(3)} | previousBalance=${g.preAmount.toFixed(2)}`
      );

      return {
        mint: g.mint,
        solSpent,
        tokenDelta: g.delta,
        alphaEntryPrice,
        alphaPreBalance: g.preAmount,
        alphaPostBalance: g.postAmount,
        blockTimeMs,
        signalAgeSec,
      };
    });
  } catch (err: any) {
    dbg(`[CLASSIFY] failed for tx ${sig?.slice(0, 8)}: ${err.message || err}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Telegram Command Handlers
// ═══════════════════════════════════════════════════════════════════════════════

bot.onText(/^\/alpha_add\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /alpha_add <wallet>');
    return;
  }
  addCandidate(addr);
  await sendCommand(msg.chat.id, `👀 <b>Candidate added:</b>\n<code>${addr}</code>\n\nThe bot will now monitor this wallet and score it based on early mint touches.`);
});

bot.onText(/^\/alpha_add_active\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /alpha_add_active <wallet>');
    return;
  }
  addActive(addr);
  refreshAlphas();
  await sendCommand(msg.chat.id, `✅ <b>Active alpha added:</b>\n<code>${addr}</code>\n\nThe bot will now copy trades from this wallet.`);
});

bot.onText(/^\/alpha_list$/, async (msg) => {
  if (!isAdmin(msg)) return;
  const { active, candidates, scores } = listAll();
  
  // Dedupe before rendering (self-heal should have caught this, but be safe)
  const uniqActive = Array.from(new Set(active));
  const uniqCandidates = Array.from(new Set(candidates));
  
  const activeList = uniqActive.length
    ? uniqActive.map((a) => `  • <code>${a}</code>`).join('\n')
    : '  (none)';
  
  const candidateList = uniqCandidates.length
    ? uniqCandidates
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
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /alpha_remove <wallet>');
    return;
  }
  removeCandidate(addr);
  removeActive(addr);
  refreshAlphas();
  await sendCommand(msg.chat.id, `🗑️ <b>Removed:</b>\n<code>${addr}</code>`);
});

bot.onText(/^\/alpha_promote\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /alpha_promote <wallet>');
    return;
  }
  const promoted = manualPromote(addr);
  if (promoted) {
    refreshAlphas();
    await sendCommand(msg.chat.id, `✅ <b>Promoted to active:</b>\n<code>${addr}</code>`);
  } else {
    await sendCommand(msg.chat.id, `❌ Cannot promote <code>${addr}</code>\nEither not a candidate or already active.`);
  }
});

bot.onText(/^\/debug(?:\s+(on|off))?$/, async (msg, m) => {
  if (!isAdmin(msg)) return;
  const arg = (m?.[1] || '').toLowerCase();
  if (arg === 'on' || arg === 'off') {
    // NOTE: process.env is read-only after start; tell user how to persist
    await sendCommand(
      msg.chat.id,
      `🔧 Debug ${arg === 'on' ? 'ENABLED' : 'DISABLED'} for this session.\n` +
        `To persist across restarts: set DEBUG_TX=${arg === 'on'} in .env`
    );
  }
  await sendCommand(
    msg.chat.id,
    `<b>Debug status</b>\n` +
      `DEBUG_TX: <code>${DEBUG_TX}</code>\n` +
      `DEBUG_TO_TELEGRAM: <code>${DEBUG_TO_TELEGRAM}</code>\n` +
      `Use: <code>/debug on</code> or <code>/debug off</code> (session only)\n` +
      `To persist: edit .env and restart pm2`
  );
});

bot.onText(/^\/help$/, async (msg) => {
  if (!isAdmin(msg)) return;
  await sendCommand(
    msg.chat.id,
    `<b>📚 Alpha Snipes Commands</b>\n\n` +
      `➕ <b>/add</b> <code>&lt;wallet&gt;</code>\nAdd wallet as candidate (auto-scored)\n\n` +
      `🚀 <b>/addactive</b> <code>&lt;wallet&gt;</code>\nAdd wallet directly to active list\n\n` +
      `📋 <b>/list</b>\nShow all active alphas and candidates\n\n` +
      `🧩 <b>/promote</b> <code>&lt;wallet&gt;</code>\nManually promote candidate to active\n\n` +
      `🗑️ <b>/remove</b> <code>&lt;wallet&gt;</code>\nRemove wallet from tracking\n\n` +
      `📊 <b>/pnl</b> [24h|today]\nShow realized PnL summary\n\n` +
      `📂 <b>/open</b>\nShow open positions with unrealized PnL\n\n` +
      `🔨 <b>/force_exit</b> <code>&lt;mint&gt;</code>\nManually exit position (paper mode only)\n\n` +
      `💰 <b>/force_sell</b> <code>&lt;mint&gt;</code>\nAlias for /force_exit (paper mode only)\n\n` +
      `🛒 <b>/force_buy</b> <code>&lt;mint&gt;</code> [amount_sol]\nManually buy token (paper mode only)\n\n` +
      `💓 <b>/status</b>\nShow bot health and recent activity\n\n` +
      `🪲 <b>/debug</b>\nShow/toggle debug mode\n\n` +
      `❓ <b>/help</b>\nShow this menu`
  );
});

// PnL command
bot.onText(/^\/pnl(?:\s+(\S+))?$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const arg = (match?.[1] || '').toLowerCase();
  const trades = readTrades();
  let since: number | undefined;
  let hdr = 'All time';
  
  if (arg === '24h') {
    since = Date.now() - 24 * 3600 * 1000;
    hdr = 'Last 24h';
  } else if (arg === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    since = d.getTime();
    hdr = 'Today';
  }
  
  const { buys, sells, pnlUsd, pnlSol } = summarize(trades, since);
  const winRate = sells > 0 ? ((trades.filter(t => t.kind === 'sell' && (t.pnlUsd || 0) > 0).length / sells) * 100).toFixed(0) : '0';
  
  await sendCommand(
    msg.chat.id,
    `📊 <b>PnL Summary — ${esc(hdr)}</b>\n\n` +
    `Buys: <code>${esc(String(buys))}</code> | Sells: <code>${esc(String(sells))}</code>\n` +
    `Win rate: <code>${esc(winRate)}</code>%\n\n` +
    `Realized PnL:\n` +
    `${formatUsd(pnlUsd)} (${formatSol(pnlSol)})\n\n` +
    `💡 Use <code>/pnl 24h</code> or <code>/pnl today</code> for filtered results`
  );
});

// Open positions command
bot.onText(/^\/open$/, async (msg) => {
  if (!isAdmin(msg)) return;
  const solUsd = await getSolUsd().catch(() => 0);
  const lines: string[] = [];
  
  for (const [mintStr, pos] of Object.entries(openPositions)) {
    // Get token name for display (quick fetch with long cache)
    const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
    const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
    
    const currentPrice = await getQuotePrice(pos.mint).catch(() => null);
    if (!currentPrice || !isValidPrice(currentPrice)) {
      lines.push(`<b>${tokenDisplay}</b>  [fetching...]`);
      continue;
    }
    
    // Sanity check: If price is way off from entry (>10x difference), likely bad price from BUY fallback
    // Don't display incorrect PnL - show "price unreliable" instead
    const priceRatio = Math.max(currentPrice / pos.entryPrice, pos.entryPrice / currentPrice);
    if (priceRatio > 10) {
      lines.push(
        `<b>${tokenDisplay}</b>  [price unreliable]\n` +
        `  Entry: ${formatSol(pos.entryPrice)}  |  Current: [unreliable]\n` +
        `  ⏳ EARLY TP  |  <code>${esc(String(Math.floor((Date.now() - pos.entryTime) / 60000)))}</code>m\n`
      );
      continue;
    }
    
    const uPct = ((currentPrice / pos.entryPrice) - 1) * 100;
    const uSol = (currentPrice - pos.entryPrice) * pos.costSol;
    const uUsd = uSol * (solUsd || 0);
    const sign = uPct >= 0 ? '+' : '';
    const phaseLabel = pos.phase === 'trailing' ? '🎯 TRAILING' : '⏳ EARLY TP';
    const durationMin = Math.floor((Date.now() - pos.entryTime) / 60000);
    
    lines.push(
      `<b>${tokenDisplay}</b>  <code>${esc(sign + uPct.toFixed(1))}</code>%  |  ${sign}${formatUsd(uUsd)}\n` +
      `  Entry: ${formatSol(pos.entryPrice)}  |  Now: ${formatSol(currentPrice)}\n` +
      `  ${phaseLabel}  |  <code>${esc(String(durationMin))}</code>m\n`
    );
  }
  
  await sendCommand(
    msg.chat.id,
    lines.length 
      ? `📂 <b>Open positions:</b>\n\n${lines.join('\n')}`
      : '📂 No open positions.'
  );
});

// Status/Health command - on-demand heartbeat
bot.onText(/^\/status|^\/health$/, async (msg) => {
  if (!isAdmin(msg)) return;
  await sendHeartbeat();
});

// Watchlist overview
bot.onText(/^\/watchlist$/, async (msg) => {
  if (!isAdmin(msg)) return;
  if (!ENABLE_WATCHLIST) {
    await sendCommand(msg.chat.id, '👀 Watchlist is disabled. Set ENABLE_WATCHLIST=true to enable it.');
    return;
  }
  const entries = getWatchlistEntries().sort((a, b) => a.addedAt - b.addedAt);
  if (!entries.length) {
    await sendCommand(msg.chat.id, '👀 Watchlist is empty. No tokens are currently being monitored.');
    return;
  }
  const now = Date.now();
  const maxHours = Math.round(WATCHLIST_MAX_AGE_MS / 3600000);
  const blocks: string[] = [
    `👀 <b>Watchlist (${entries.length})</b>\nMonitoring for liquidity (max ${maxHours}h)\n`,
  ];
  for (const entry of entries) {
    const ageMin = Math.floor((now - entry.addedAt) / 60000);
    const remainingMin = Math.max(0, Math.floor((WATCHLIST_MAX_AGE_MS - (now - entry.addedAt)) / 60000));
    blocks.push(
      `<code>${short(entry.mint)}</code> — ${entry.reason}\n` +
        `• Age: ${ageMin}m (expires in ${remainingMin}m)\n` +
        `• Alpha: <code>${short(entry.alpha)}</code>\n` +
        `• Checks: ${entry.checkCount}`
    );
  }
  await sendCommand(msg.chat.id, blocks.join('\n'));
});

// Force exit command (paper mode testing)
bot.onText(/^\/force_exit\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const mintStr = getMatchParam(match, 1);
  if (!mintStr) {
    await sendCommand(msg.chat.id, '❌ Usage: /force_exit <mint>');
    return;
  }
  const pos = openPositions[mintStr];
  
  if (!pos) {
    await sendCommand(msg.chat.id, `❌ No open position for <code>${short(mintStr)}</code>`);
    return;
  }
  
  if (!IS_PAPER) {
    await sendCommand(msg.chat.id, `⚠️ Force exit only available in paper mode. Use trailing stop in live mode.`);
    return;
  }
  
  try {
    const price = await getQuotePrice(pos.mint);
    if (!price || !isValidPrice(price)) {
      // Get detailed error from Jupiter
      const SOL = 'So11111111111111111111111111111111111111112';
      let jupiterError = 'Unknown error';
      try {
        await getJupiterQuote(pos.mint.toBase58(), SOL, 1_000_000, 1000);
      } catch (e: any) {
        jupiterError = e?.message || String(e);
      }
      
      await sendCommand(
        msg.chat.id,
        `❌ Could not fetch current price for <code>${short(mintStr)}</code>\n\n` +
        `Jupiter error: <code>${jupiterError}</code>\n\n` +
        `Check logs: <code>grep "${short(mintStr)}" logs/bot_*.log | grep "\\[PRICE\\]"</code>`
      );
      return;
    }
    
    const tx = await swapTokenForSOL(pos.mint, pos.qty);
    const solUsd = await getSolUsd();
    
    // Calculate compact summary
    const entrySol = pos.costSol;
    const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
    const pnlSol = exitSol - entrySol;
    const entryUsd = entrySol * (solUsd || 0);
    const exitUsd = exitSol * (solUsd || 0);
    const pnlUsd = exitUsd - entryUsd; // USD PnL = exit USD - entry USD
    
    // Calculate percentage from actual exit vs entry (not quote price)
    const pnl = entrySol > 0 ? (pnlSol / entrySol) * 100 : 0;
    const priceUsd = price * (solUsd || 0);
    const durationSec = Math.floor((Date.now() - pos.entryTime) / 1000);
    
    const tag = '[PAPER] ';
    await tgQueue.enqueue(() => bot.sendMessage(
      TELEGRAM_CHAT_ID,
      `${tag}🔨 Force exit: <code>${short(mintStr)}</code>\n` +
      `Exit: ${formatSol(price)}${solUsd ? ` (~${formatUsd(priceUsd)})` : ''}`,
      linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid })
    ), { chatId: TELEGRAM_CHAT_ID });
    
    const summaryLine = solUsd ? 
      `💡 Bought ${formatUsd(entryUsd)} → Sold ${formatUsd(exitUsd)}  |  ` +
      `${(pnlUsd >= 0 ? '+' : '')}${formatUsd(pnlUsd)} (${(pnl >= 0 ? '+' : '')}${pnl.toFixed(1)}%)` : '';
    await tgQueue.enqueue(() => bot.sendMessage(TELEGRAM_CHAT_ID, summaryLine, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true 
    }), { chatId: TELEGRAM_CHAT_ID });
    
    // Record trade in ledger
    recordTrade({
      t: Date.now(),
      kind: 'sell',
      mode: 'paper',
      mint: mintStr,
      alpha: pos.alpha,
      exitPriceSol: price,
      exitUsd,
      pnlSol,
      pnlUsd,
      pnlPct: pnl,
      durationSec,
      tx: tx.txid,
    });
    
    delete openPositions[mintStr];
    persistPositions();
    await sendCommand(msg.chat.id, `✅ Position closed via force exit.`);
  } catch (err: any) {
    await sendCommand(msg.chat.id, `❌ Force exit failed: ${err.message || err}`);
  }
});

// Force sell alias (same as force_exit)
bot.onText(/^\/force_sell\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const mintStr = getMatchParam(match, 1);
  if (!mintStr) {
    await sendCommand(msg.chat.id, '❌ Usage: /force_sell <mint> (alias for /force_exit)');
    return;
  }
  // Reuse force_exit logic - just call it directly
  const pos = openPositions[mintStr];
  
  if (!pos) {
    await sendCommand(msg.chat.id, `❌ No open position for <code>${short(mintStr)}</code>`);
    return;
  }
  
  if (!IS_PAPER) {
    await sendCommand(msg.chat.id, `⚠️ Force sell only available in paper mode. Use trailing stop in live mode.`);
    return;
  }
  
  try {
    const price = await getQuotePrice(pos.mint);
    if (!price || !isValidPrice(price)) {
      // Get detailed error from Jupiter
      const SOL = 'So11111111111111111111111111111111111111112';
      let jupiterError = 'Unknown error';
      try {
        await getJupiterQuote(pos.mint.toBase58(), SOL, 1_000_000, 1000);
      } catch (e: any) {
        jupiterError = e?.message || String(e);
      }
      
      await sendCommand(
        msg.chat.id,
        `❌ Could not fetch current price for <code>${short(mintStr)}</code>\n\n` +
        `Jupiter error: <code>${jupiterError}</code>\n\n` +
        `Check logs: <code>grep "${short(mintStr)}" logs/bot_*.log | grep "\\[PRICE\\]"</code>`
      );
      return;
    }
    
    const tx = await swapTokenForSOL(pos.mint, pos.qty);
    const solUsd = await getSolUsd();
    
    // Calculate compact summary
    const entrySol = pos.costSol;
    const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
    const pnlSol = exitSol - entrySol;
    const entryUsd = entrySol * (solUsd || 0);
    const exitUsd = exitSol * (solUsd || 0);
    const pnlUsd = exitUsd - entryUsd; // USD PnL = exit USD - entry USD
    
    // Calculate percentage from actual exit vs entry (not quote price)
    const pnl = entrySol > 0 ? (pnlSol / entrySol) * 100 : 0;
    const priceUsd = price * (solUsd || 0);
    const durationSec = Math.floor((Date.now() - pos.entryTime) / 1000);
    
    const tag = '[PAPER] ';
    await tgQueue.enqueue(() => bot.sendMessage(
      TELEGRAM_CHAT_ID,
      `${tag}🔨 Force sell: <code>${short(mintStr)}</code>\n` +
      `Exit: ${formatSol(price)}${solUsd ? ` (~${formatUsd(priceUsd)})` : ''}`,
      linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid })
    ), { chatId: TELEGRAM_CHAT_ID });
    
    const summaryLine = solUsd ? 
      `💡 Bought ${formatUsd(entryUsd)} → Sold ${formatUsd(exitUsd)}  |  ` +
      `${(pnlUsd >= 0 ? '+' : '')}${formatUsd(pnlUsd)} (${(pnl >= 0 ? '+' : '')}${pnl.toFixed(1)}%)` : '';
    await tgQueue.enqueue(() => bot.sendMessage(TELEGRAM_CHAT_ID, summaryLine, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true 
    }), { chatId: TELEGRAM_CHAT_ID });
    
    // Record trade in ledger
    recordTrade({
      t: Date.now(),
      kind: 'sell',
      mode: 'paper',
      mint: mintStr,
      alpha: pos.alpha,
      exitPriceSol: price,
      exitUsd,
      pnlSol,
      pnlUsd,
      pnlPct: pnl,
      durationSec,
      tx: tx.txid,
    });
    
    delete openPositions[mintStr];
    persistPositions();
    await sendCommand(msg.chat.id, `✅ Position closed via force sell.`);
  } catch (err: any) {
    await sendCommand(msg.chat.id, `❌ Force sell failed: ${err.message || err}`);
  }
});

// Force buy command (paper mode testing)
bot.onText(/^\/force_buy\s+([1-9A-HJ-NP-Za-km-z]{32,44})(?:\s+([\d.]+))?$/, async (msg, match) => {
  if (!isAdmin(msg)) {
    console.log(`[CMD] force_buy rejected: chatId=${msg.chat.id}, userId=${msg.from?.id}, chatType=${msg.chat.type}`);
    return;
  }
  const mintStr = getMatchParam(match, 1);
  const customAmount = match[2] ? parseFloat(match[2]) : null;
  
  if (!mintStr) {
    await sendCommand(msg.chat.id, '❌ Usage: /force_buy <mint> [amount_sol]');
    return;
  }
  
  if (!IS_PAPER) {
    await sendCommand(msg.chat.id, `⚠️ Force buy only available in paper mode.`);
    return;
  }
  
  if (openPositions[mintStr]) {
    await sendCommand(msg.chat.id, `⚠️ Position already open for <code>${short(mintStr)}</code>. Use /force_exit first.`);
    return;
  }
  
  try {
    const mintPk = new PublicKey(mintStr);
    
    // Step 1: Fetch current price with detailed error logging
    dbg(`[FORCE_BUY] Fetching price for ${short(mintStr)}`);
    const currentPrice = await getQuotePrice(mintPk);
    
    if (!currentPrice || !isValidPrice(currentPrice)) {
      // Get detailed error from Jupiter
      const SOL = 'So11111111111111111111111111111111111111112';
      let jupiterError = 'Unknown error';
      try {
        // Try to get a quote to see the actual error
        await getJupiterQuote(mintStr, SOL, 1_000_000, 1000);
      } catch (e: any) {
        jupiterError = e?.message || String(e);
      }
      
      await sendCommand(
        msg.chat.id,
        `❌ Could not fetch current price for <code>${short(mintStr)}</code>\n\n` +
        `Jupiter error: <code>${jupiterError}</code>\n\n` +
        `Possible reasons:\n` +
        `• Token not yet indexed by Jupiter\n` +
        `• No valid DEX route available\n` +
        `• Token still in bonding curve (pump.fun Instant phase)\n` +
        `• Insufficient liquidity for routing\n\n` +
        `Check logs with: <code>grep "${short(mintStr)}" logs/bot_*.log | grep "\\[PRICE\\]"</code>`
      );
      return;
    }
    
    // Step 2: Check liquidity
    const liquidity = await getLiquidityResilient(mintStr);
    const liquidityUsd = liquidity.ok && liquidity.liquidityUsd ? liquidity.liquidityUsd : 0;
    
    // Step 3: Determine buy amount
    const buySol = customAmount || BUY_SOL;
    const buyAmountLamports = Math.floor(buySol * 1e9);
    
    // Step 4: Execute buy
    dbg(`[FORCE_BUY] Executing buy for ${short(mintStr)}: ${buySol} SOL`);
    const tx = await swapSOLforToken(mintPk, buySol);
    
    const solUsd = await getSolUsd();
    const entryUsd = buySol * (solUsd || 0);
    const tokenAmount = tx.outAmount ? Number(tx.outAmount) : 0;
    
    // Step 5: Create position
    const pos: LivePosition = {
      mint: mintPk,
      qty: BigInt(Math.floor(tokenAmount)),
      entryPrice: currentPrice,
      entryTime: Date.now(),
      costSol: buySol,
      alpha: 'force_buy',
      highPrice: currentPrice,
    };
    openPositions[mintStr] = pos;
    persistPositions();
    
    // Step 6: Send notifications
    const tag = '[PAPER] ';
    await tgQueue.enqueue(() => bot.sendMessage(
      TELEGRAM_CHAT_ID,
      `${tag}🔨 Force buy: <code>${short(mintStr)}</code>\n` +
      `Entry: ${formatSol(currentPrice)}${solUsd ? ` (~${formatUsd(currentPrice * (solUsd || 0))})` : ''}\n` +
      `Size: ${formatSol(buySol)}${solUsd ? ` (~${formatUsd(entryUsd)})` : ''}\n` +
      `Liquidity: ${formatUsd(liquidityUsd)}\n` +
      `Tokens: ${tokenAmount.toLocaleString()}`,
      linkRow({ mint: mintStr, alpha: 'force_buy', tx: tx.txid })
    ), { chatId: TELEGRAM_CHAT_ID });
    
    // Start exit management
    manageExit(mintStr, pos).catch((err) => {
      console.error(`[FORCE_BUY] Exit management failed for ${short(mintStr)}:`, err);
    });
    
    await sendCommand(msg.chat.id, `✅ Force buy executed for <code>${short(mintStr)}</code>`);
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    dbg(`[FORCE_BUY] Failed for ${short(mintStr)}: ${errorMsg}`);
    await sendCommand(
      msg.chat.id,
      `❌ Force buy failed: ${errorMsg}\n\n` +
      `Check logs for details: <code>grep "${short(mintStr)}" logs/bot_*.log | grep "\\[FORCE_BUY\\]"</code>`
    );
  }
});

// Mobile-friendly command aliases
bot.onText(/^\/add\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /add <wallet>');
    return;
  }
  addCandidate(addr);
  await sendCommand(msg.chat.id, `👀 <b>Candidate added:</b>\n<code>${addr}</code>\n\nThe bot will now monitor this wallet and score it based on early mint touches.`);
});

bot.onText(/^\/addactive\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /addactive <wallet>');
    return;
  }
  addActive(addr);
  refreshAlphas();
  await sendCommand(msg.chat.id, `✅ <b>Active alpha added:</b>\n<code>${addr}</code>\n\nThe bot will now copy trades from this wallet.`);
});

bot.onText(/^\/list$/, async (msg) => {
  if (!isAdmin(msg)) return;
  const { active, candidates, scores } = listAll();
  const activeList = active.length ? active.map((a) => `  • <code>${a}</code>`).join('\n') : '  (none)';
  const candidateList = candidates.length
    ? candidates.map((a) => {
        const score = scores[a];
        return `  • <code>${a}</code>\n    Signals: ${score?.signals || 0} | Last: ${score?.lastSeen ? new Date(score.lastSeen).toLocaleString() : 'never'}`;
      }).join('\n')
    : '  (none)';
  await sendCommand(
    msg.chat.id,
    `<b>🎯 Active Alphas</b> (currently trading):\n${activeList}\n\n<b>🧪 Candidates</b> (being scored):\n${candidateList}\n\n<i>Candidates auto-promote after ${PROMOTION_THRESHOLD} signals in 24h</i>`
  );
});

bot.onText(/^\/promote\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /promote <wallet>');
    return;
  }
  const promoted = manualPromote(addr);
  if (promoted) {
    refreshAlphas();
    await sendCommand(msg.chat.id, `✅ <b>Promoted to active:</b>\n<code>${addr}</code>`);
  } else {
    await sendCommand(msg.chat.id, `❌ Cannot promote <code>${addr}</code>\nEither not a candidate or already active.`);
  }
});

bot.onText(/^\/remove\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (msg, match) => {
  if (!isAdmin(msg)) return;
  const addr = getMatchParam(match, 1);
  if (!addr) {
    await sendCommand(msg.chat.id, '❌ Usage: /remove <wallet>');
    return;
  }
  removeCandidate(addr);
  removeActive(addr);
  refreshAlphas();
  await sendCommand(msg.chat.id, `🗑️ <b>Removed:</b>\n<code>${addr}</code>`);
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
  const result = await fetchQuoteResilient({
    inputMint,
    outputMint,
    amount,
    slippageBps,
  });
  
  if (!result.ok) {
    const reason = explainQuoteError(result.error);
    throw new Error(`Jupiter quote failed: ${reason}`);
  }
  
  return result.quote;
}

async function getJupiterSwapTransaction(quoteResponse: any): Promise<string> {
  const url = JUP_SWAP_BASE;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: walletKeypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      priorityLevelWithMaxLamports: (() => {
        // maxLamports: Maximum total priority fee Jupiter can use
        // Jupiter will select appropriate priority level up to this cap
        // Typical swap uses ~200k-300k CU, so we calculate based on that
        // Formula: (typical CU usage * price per CU) * multiplier, capped at MAX
        const typicalCUUsage = 250000; // Typical swap CU usage
        const calculatedMax = Math.floor(
          (typicalCUUsage * CU_UNIT_PRICE * JITO_PRIORITY_FEE_MULTIPLIER) / 1e6
        );
        return {
          maxLamports: Math.min(calculatedMax, MAX_PRIORITY_FEE_LAMPORTS),
        };
      })(),
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap failed: ${res.statusText}`);
  const json: any = await res.json();
  const swapTransaction = (json as any)?.swapTransaction;
  if (typeof swapTransaction !== 'string' || !swapTransaction.length) {
    throw new Error('Jupiter swap response missing swapTransaction');
  }
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
    throw new Error(DEBUG_TX ? `No route (paper) for ${mint.toBase58()}` : 'No route found (paper mode)');
  }

  return { txid: '[PAPER-BUY]', outAmount: quote.outAmount };
}

async function paperSell(mint: PublicKey, tokenAmount: bigint): Promise<PaperExec> {
  const SOL = 'So11111111111111111111111111111111111111112';
  const quote = await getJupiterQuote(mint.toBase58(), SOL, Number(tokenAmount), 300);
  if (!quote || !quote.outAmount) {
    throw new Error(DEBUG_TX ? `No sell route (paper) for ${mint.toBase58()}` : 'No sell route found (paper mode)');
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
  const params = {
    inputMint: new PublicKey(SOL),
    outputMint: mint,
    amount: lamports,
    slippageBps: 300,
    connection,
    wallet: walletKeypair,
  };

  const result = await swapWithDEXFallback(
    async () => {
  const quote = await getJupiterQuote(SOL, mint.toBase58(), lamports, 300);
  const swapTx = await getJupiterSwapTransaction(quote);
  const txid = await executeSwap(swapTx);
  dbg(`[SWAP] Jupiter swap successful | txid: ${txid} | dex: jupiter`);
  return { txid, outAmount: quote.outAmount };
    },
    params,
    ENABLE_ORCA_FALLBACK,
    ENABLE_RAYDIUM_FALLBACK
  );
  if (!result.outAmount) {
    throw new Error('Swap result missing outAmount');
  }
  dbg(`[SWAP] Buy swap completed | txid: ${result.txid} | dex: ${result.dex || 'jupiter'}`);
  return { txid: result.txid, outAmount: result.outAmount };
}

async function liveSwapTokenForSOL(mint: PublicKey, tokenAmount: bigint): Promise<{ txid: string }> {
  const SOL = 'So11111111111111111111111111111111111111112';
  const params = {
    inputMint: mint,
    outputMint: new PublicKey(SOL),
    amount: tokenAmount,
    slippageBps: 300,
    connection,
    wallet: walletKeypair,
  };

  const result = await swapWithDEXFallback(
    async () => {
  const quote = await getJupiterQuote(mint.toBase58(), SOL, Number(tokenAmount), 300);
  const swapTx = await getJupiterSwapTransaction(quote);
  const txid = await executeSwap(swapTx);
  dbg(`[SWAP] Jupiter swap successful | txid: ${txid} | dex: jupiter`);
  return { txid };
    },
    params,
    ENABLE_ORCA_FALLBACK,
    ENABLE_RAYDIUM_FALLBACK
  );
  dbg(`[SWAP] Sell swap completed | txid: ${result.txid} | dex: ${result.dex || 'jupiter'}`);
  return { txid: result.txid };
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
  const SOL = 'So11111111111111111111111111111111111111112';
  const shortMint = short(mint.toBase58());
  
  try {
    // PRIMARY: Try SELL quote (1M tokens → SOL) - most accurate for price
    dbg(`[PRICE] Fetching SELL quote for ${shortMint} (1M tokens → SOL)`);
    const sellQuote = await getJupiterQuote(mint.toBase58(), SOL, 1_000_000, 1000);
    if (sellQuote && sellQuote.outAmount) {
      const solOut = Number(sellQuote.outAmount) / 1e9;
      if (solOut > 0) {
        const price = solOut / 0.001; // Price per 1M tokens = SOL per token
        dbg(`[PRICE] SELL quote success for ${shortMint}: ${price.toExponential(3)} SOL/token`);
        return price;
      }
    }
    dbg(`[PRICE] SELL quote failed for ${shortMint}: no outAmount or invalid`);
  } catch (e: any) {
    const errorMsg = e?.message || String(e);
    dbg(`[PRICE] SELL quote failed for ${shortMint}: ${errorMsg}`);
    
    // FALLBACK: Try BUY quote (0.1 SOL → tokens) - works for new tokens in bonding curve
    try {
      dbg(`[PRICE] Attempting BUY quote fallback for ${shortMint} (0.1 SOL → tokens)`);
      const buyQuote = await getJupiterQuote(SOL, mint.toBase58(), 0.1 * 1e9, 1000);
      if (buyQuote && buyQuote.outAmount) {
        const tokensOutRaw = Number(buyQuote.outAmount);
        if (tokensOutRaw > 0) {
          // Get token decimals to normalize the amount
          let tokenDecimals = 9; // Default assumption
          try {
            const mintInfo = await connection.getParsedAccountInfo(mint);
            const parsed = mintInfo.value?.data;
            if (parsed && 'parsed' in parsed && parsed.parsed?.info?.decimals !== undefined) {
              tokenDecimals = Number(parsed.parsed.info.decimals);
            }
          } catch {
            // If we can't get decimals, assume 9 (most common)
            dbg(`[PRICE] Could not fetch decimals for ${shortMint}, assuming 9`);
          }
          
          // Normalize: outAmount is in smallest unit, convert to UI units
          const tokensOutUI = tokensOutRaw / Math.pow(10, tokenDecimals);
          
          // Price = SOL spent / tokens received (in UI units)
          // This gives us SOL per token, matching the SELL quote format
          let price = 0.1 / tokensOutUI;
          dbg(`[PRICE] BUY quote fallback: raw=${tokensOutRaw.toExponential(3)}, decimals=${tokenDecimals}, UI=${tokensOutUI.toExponential(3)}, price=${price.toExponential(3)} SOL/token`);
          
          // Sanity check: if price is unreasonably small or way off from typical range, likely decimals mismatch
          // Typical token prices: 1e-6 to 1e-2 SOL/token
          // If price < 1e-6, likely wrong decimals (many pump.fun tokens have 0 decimals)
          if (price < 1e-6 && tokenDecimals === 9) {
            dbg(`[PRICE] Price too small (${price.toExponential(3)}) with 9 decimals, trying 0 decimals assumption`);
            const tokensOutUI0 = tokensOutRaw; // Assume 0 decimals
            const price0 = 0.1 / tokensOutUI0;
            // Only use 0 decimals if it gives a more reasonable price (between 1e-6 and 1e-2)
            if (price0 >= 1e-6 && price0 <= 1e-2) {
              price = price0;
              dbg(`[PRICE] BUY quote with 0 decimals: ${price.toExponential(3)} SOL/token (more reasonable)`);
            } else {
              dbg(`[PRICE] 0 decimals also gives unreasonable price (${price0.toExponential(3)}), keeping 9 decimals result`);
            }
          }
          
          dbg(`[PRICE] BUY quote fallback success for ${shortMint}: ${price.toExponential(3)} SOL/token`);
          return price;
        }
      }
      dbg(`[PRICE] BUY quote fallback failed for ${shortMint}: no outAmount or invalid`);
    } catch (fallbackErr: any) {
      const fallbackMsg = fallbackErr?.message || String(fallbackErr);
      dbg(`[PRICE] BUY quote fallback failed for ${shortMint}: ${fallbackMsg}`);
    }
  }
  
  // Both methods failed
  dbg(`[PRICE] All quote methods failed for ${shortMint} - price unavailable`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Paper Trading PnL Reporting
// ═══════════════════════════════════════════════════════════════════════════════

function toSol(lamports: number): number {
  return lamports / 1e9;
}

async function reportPaperPnL(mintStr: string, entrySol: number, exitSolLamports: number) {
  const exitSol = toSol(exitSolLamports);
  
  // Guard: skip PnL if invalid input
  if (!isValidPrice(entrySol) || !isValidPrice(exitSol)) {
    if (DEBUG_TX) console.log('[PAPER][DBG] skip PnL: invalid input', { mint: mintStr, entrySol, exitSol });
    return;
  }
  
  const pnl = exitSol - entrySol;
  const pct = (pnl / entrySol) * 100;
  
  // Guard: skip if PnL calculation failed
  if (!Number.isFinite(pct)) {
    if (DEBUG_TX) console.log('[PAPER][DBG] skip PnL: invalid calculation', { mint: mintStr, pnl, pct });
    return;
  }
  
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

// Polling backup: Check for missed transactions every 30 seconds
// This catches transactions that onLogs() might miss due to RPC issues
let lastPollTime = new Map<string, number>();
setInterval(async () => {
  for (const alpha of ACTIVE_ALPHAS) {
    try {
      const pk = new PublicKey(alpha);
      const lastSeen = lastPollTime.get(alpha) || Date.now() - 60_000; // Default to 1 min ago
      const sigs = await connection.getSignaturesForAddress(pk, {
        limit: 10, // Only check last 10 transactions
        until: undefined,
      });

      for (const sigInfo of sigs) {
        if (!sigInfo.blockTime) continue;
        const txTime = sigInfo.blockTime * 1000;
        if (txTime <= lastSeen) break; // Already processed

        // Skip if we already processed this signature
        if (seenSignatures.has(sigInfo.signature)) continue;

        try {
          seenSignatures.add(sigInfo.signature); // Mark as seen before processing
          await handleAlphaTransaction(sigInfo.signature, alpha, 'active');
        } catch (err: any) {
          dbg(`[POLL] Failed to process ${sigInfo.signature.slice(0, 8)}: ${err.message || err}`);
        }
      }

      // Update last poll time
      if (sigs.length > 0 && sigs[0].blockTime) {
        lastPollTime.set(alpha, sigs[0].blockTime * 1000);
      }
    } catch (err: any) {
      dbg(`[POLL] Failed to poll ${short(alpha)}: ${err.message || err}`);
    }
  }
}, 30_000); // Poll every 30 seconds

// ═══════════════════════════════════════════════════════════════════════════════
// Transaction Handler with Alpha Scoring
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAlphaTransaction(sig: string, signer: string, label: 'active' | 'candidate') {
  const tx = await safeGetParsedTx(connection, sig);
  if (!tx || !tx.meta) {
    if (DEBUG_TX) dbg(`skip tx ${sig.slice(0, 8)}: no parsed meta after safeGetParsedTx`);
    return;
  }

  // Guard meta fields
  const pre = tx.meta.preTokenBalances ?? [];
  const post = tx.meta.postTokenBalances ?? [];
  
  // Optional debug line
  if (DEBUG_TX) {
    console.log('[DBG] considering tx', sig.slice(0, 8), 'preTokens:', pre.length, 'postTokens:', post.length);
  }

  const signals = classifyAlphaSignals(tx, signer, sig);
  if (signals.length === 0) {
    if (DEBUG_TX) dbg(`ignored tx ${sig.slice(0, 8)}: no qualifying BUY signals`);
    return;
  }

  for (const signal of signals) {
    const mint = signal.mint;
    if (seenMints.has(mint)) {
      if (DEBUG_TX) dbg(`ignored mint ${mint.slice(0, 8)}: already seen`);
      continue;
    }
    seenMints.add(mint);

    if (label === 'candidate') {
      bumpScore(signer);
      const promoted = maybePromote(signer, PROMOTION_THRESHOLD, PROMOTION_WINDOW_MS);
      await alert(
        `🧪 <b>Candidate BUY signal</b>\n` +
          `Wallet: <code>${short(signer)}</code>\n` +
          `Mint: <code>${short(mint)}</code>\n` +
          `Sol spent: <code>${signal.solSpent.toFixed(4)}</code>\n` +
          `TX: <code>${sig.slice(0, 8)}...</code>${promoted ? '\n\n✅ <b>AUTO-PROMOTED to active!</b>' : ''}`
      );
      if (promoted) {
        refreshAlphas();
      }
      return;
    }

    await executeCopyTradeFromSignal({
      signal,
      alpha: signer,
      txSig: sig,
      source: 'alpha',
      notifyTouch: true,
    });
  }
}

type CopyTradeSource = 'alpha' | 'watchlist';

async function executeCopyTradeFromSignal(opts: {
  signal: AlphaSignal;
  alpha: string;
  txSig: string;
  source: CopyTradeSource;
  notifyTouch?: boolean;
  skipTimeGuard?: boolean;
}): Promise<'bought' | 'skipped'> {
  const { signal, alpha, txSig, source, notifyTouch = true, skipTimeGuard = false } = opts;
  const mintStr = signal.mint;
  const mintPk = new PublicKey(mintStr);
    const tag = IS_PAPER ? '[PAPER] ' : '';

  try {
    if (notifyTouch) {
      // Get token name for display (quick fetch, don't wait if slow)
      const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
      const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
      const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
      
      await tgQueue.enqueue(
        () =>
          bot.sendMessage(
      TELEGRAM_CHAT_ID,
            `${tag}👀 ${source === 'watchlist' ? 'Watchlist retry' : 'Alpha touched new mint'} <b>${tokenDisplay}</b>\nAlpha: <code>${short(alpha)}</code>`,
            linkRow({ mint: mintStr, alpha, tx: txSig, chartUrl })
          ),
        { chatId: TELEGRAM_CHAT_ID }
      );
      pushEvent({ t: Date.now(), kind: 'touch', mint: mintStr, alpha, tx: txSig });
    }

    if (!skipTimeGuard && MAX_SIGNAL_AGE_SEC > 0) {
      const age = signal.signalAgeSec ?? 0;
      const pass = age <= MAX_SIGNAL_AGE_SEC;
      dbg(
        `[GUARD] Time window | signalAge=${age.toFixed(1)}s | max=${MAX_SIGNAL_AGE_SEC}s | ${
          pass ? '✅ PASS' : '❌ FAIL'
        }`
      );
      if (!pass) {
        await alert(
          `⛔️ Skipping <code>${short(mintStr)}</code>: Signal too old (${age.toFixed(
            1
          )}s > ${MAX_SIGNAL_AGE_SEC}s)`
        );
        pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: 'signal_age' });
        return 'skipped';
      }
    }

    const liquidity = await getLiquidityResilient(mintStr);
    const liquidityUsd = liquidity.ok && liquidity.liquidityUsd ? liquidity.liquidityUsd : 0;
    const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
    const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
    const liqPass = liquidityUsd >= MIN_LIQUIDITY_USD;
    dbg(
      `[GUARD] Liquidity | liquidity=$${liquidityUsd.toFixed(0)} | min=$${MIN_LIQUIDITY_USD} | ${
        liqPass ? '✅ PASS' : '❌ FAIL'
      } | source=${liquidity.source || 'dexscreener'}`
    );
    if (!liqPass) {
      await alert(
        `⛔️ Skipping <code>${short(mintStr)}</code>: Liquidity ${formatUsd(liquidityUsd)} < ${formatUsd(
          MIN_LIQUIDITY_USD
        )}`
      );
      pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: 'liquidity_guard' });
      if (source === 'alpha') {
        await queueWatchlistAdd(signal, alpha, 'low_liquidity', txSig);
      }
      return 'skipped';
    }

      const report = await basicRugChecks(connection, mintPk, BUY_SOL, {
        requireAuthorityRevoked: REQUIRE_AUTH_REVOKED,
        maxTaxBps: MAX_TAX_BPS,
        maxImpactBps: MAX_PRICE_IMPACT_BPS,
      });

      if (!report.ok) {
        const primaryReason = report.reasons[0] || 'unknown';
        let code = 'default';
        if (/authority.*not.*revoked/i.test(primaryReason)) code = 'authority_not_revoked';
        else if (/freeze.*not.*revoked/i.test(primaryReason)) code = 'freeze_not_revoked';
        else if (/tax|fee/i.test(primaryReason)) code = 'high_tax';
        else if (/impact/i.test(primaryReason)) code = 'price_impact_too_high';
        else if (/route/i.test(primaryReason)) code = 'no_route';

        let explanation = explainSkip(code);
        if (code === 'authority_not_revoked') {
          explanation +=
            " This means the token's mint authority is still active, allowing unlimited new supply. This is a high rug‑risk condition and we skip such tokens by default.";
        } else if (code === 'no_route') {
          explanation +=
          ' This means Jupiter could not find a valid liquidity route for the trade. The token is likely illiquid right now.';
        }
        
        await alert(
        `⛔️ Skipping <code>${short(mintStr)}</code> due to: ${report.reasons.join(', ')}\n• ${explanation}`
      );
      pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: primaryReason });

      if (source === 'alpha' && /no_route|illiquid|bad_buy_quote/i.test(primaryReason)) {
        await queueWatchlistAdd(signal, alpha, primaryReason, txSig);
      }
      return 'skipped';
    }

      const start = report.entryPrice ?? (await getQuotePrice(mintPk)) ?? 0;
      if (!isValidPrice(start)) {
      await alert(`⚠️ Skipping <code>${short(mintStr)}</code>: Reference price unavailable`);
      pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: 'no_price' });
      return 'skipped';
    }

    if (!isValidPrice(signal.alphaEntryPrice)) {
      await alert(`⚠️ Skipping <code>${short(mintStr)}</code>: Alpha entry price unavailable`);
      pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: 'alpha_price_missing' });
      return 'skipped';
    }

    const ratio = start / signal.alphaEntryPrice;
    const pricePass = ratio <= MAX_ALPHA_ENTRY_MULTIPLIER;
    dbg(
      `[GUARD] Price guard | alphaEntry=${signal.alphaEntryPrice} | botEntry=${start} | ratio=${ratio.toFixed(
        2
      )}x | max=${MAX_ALPHA_ENTRY_MULTIPLIER}x | ${pricePass ? '✅ PASS' : '❌ FAIL'}`
    );
    if (!pricePass) {
      await alert(
        `⛔️ Skipping <code>${short(mintStr)}</code>: Price ${ratio.toFixed(2)}x higher than alpha entry (limit ${
          MAX_ALPHA_ENTRY_MULTIPLIER
        }x)`
      );
      pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: 'price_guard' });
      return 'skipped';
    }

    const sizing = computePositionSize({
      baseBuySol: BUY_SOL,
      minBuySol: MIN_BUY_SOL,
      maxBuySol: MAX_BUY_SOL,
      liquidityUsd,
      alphaSolSpent: signal.solSpent,
      signalAgeSec: signal.signalAgeSec ?? 0,
      watchlistRetry: source === 'watchlist',
    });
    const buySol = sizing.sizeSol;

    const buyKey = `${mintStr}:${txSig}:${source}`;
      if (IS_PAPER && !canPaperBuy(buyKey)) {
      dbg(`[PAPER] duplicate buy suppressed ${buyKey}`);
      return 'skipped';
      }
      
    const buy = await swapSOLforToken(mintPk, buySol);
      const entryTime = Date.now();
    const qty = BigInt(buy.outAmount);

    openPositions[mintStr] = {
        mint: mintPk,
        qty,
      costSol: buySol,
        entryPrice: start,
        highPrice: start,
        entryTime,
      alpha,
      };
    persistPositions();

      const solUsd = await getSolUsd();
    const buyUsd = buySol * (solUsd || 0);
      const refPriceUsd = start * (solUsd || 0);
      const msgPrefix = source === 'watchlist' ? `${tag}🔁 Watchlist auto-buy` : `${tag}✅ Bought`;
      // tokenDisplay and chartUrl already defined above from liquidity fetch
    const sizingLine = `Size: ${formatSol(buySol)} (${sizing.multiplier >= 1 ? '▲' : '▼'}×${sizing.multiplier.toFixed(
      2
    )})`;
    await tgQueue.enqueue(
      () =>
        bot.sendMessage(
        TELEGRAM_CHAT_ID,
          `${msgPrefix} <b>${tokenDisplay}</b>\n` +
          `Size: ${formatSol(buySol)}${solUsd ? ` (${formatUsd(buyUsd)})` : ''}\n` +
          `Entry: ${start.toFixed(10)} SOL/token${solUsd ? ` (~${formatUsd(refPriceUsd)})` : ''}\n` +
          `${sizingLine}`,
          linkRow({ mint: mintStr, alpha, tx: buy.txid, chartUrl })
        ),
      { chatId: TELEGRAM_CHAT_ID }
    );

      recordTrade({
        t: entryTime,
        kind: 'buy',
        mode: IS_PAPER ? 'paper' : 'live',
      mint: mintStr,
      alpha,
      sizeSol: buySol,
        entryPriceSol: start,
        entryUsd: buyUsd,
        tx: buy.txid,
      });

    pushEvent({ t: entryTime, kind: 'buy', mint: mintStr, alpha, sol: buySol, usd: buyUsd, tx: buy.txid });

    if (ENABLE_WATCHLIST) {
      removeFromWatchlist(mintStr);
    }

    Promise.all([manageExit(mintStr), postBuySentry(mintStr)]).catch((err) =>
      console.error(`[EXIT] Manage exit failed:`, err)
    );

    return 'bought';
  } catch (err: any) {
    await alert(`❌ Copy trade failed for ${short(mintStr)}: ${err.message || err}`);
    return 'skipped';
  }
}

async function queueWatchlistAdd(signal: AlphaSignal, alpha: string, reason: string, txSig: string) {
  if (!ENABLE_WATCHLIST) return;
  const existed = !!getWatchlistEntry(signal.mint);
  const entry = addToWatchlist({
    mint: signal.mint,
    alpha,
    reason,
    alphaEntryPrice: signal.alphaEntryPrice,
    solSpent: signal.solSpent,
    tokenDelta: signal.tokenDelta,
    txSig,
  });
  if (!existed) {
    const maxHours = Math.round(WATCHLIST_MAX_AGE_MS / 3600000);
    await alert(
      `👀 Added <code>${short(signal.mint)}</code> to watchlist (${reason}). Monitoring up to ${maxHours}h for liquidity.`
    );
  } else {
    dbg(`[WATCHLIST] refreshed ${short(signal.mint)} for reason ${reason}`);
  }
}

async function monitorWatchlist() {
  if (!ENABLE_WATCHLIST) return;
  try {
    const expired = pruneWatchlist(WATCHLIST_MAX_AGE_MS);
    for (const entry of expired) {
      await alert(`⌛️ Removed <code>${short(entry.mint)}</code> from watchlist (expired).`);
    }

    const due = nextEntriesToCheck(WATCHLIST_CHECK_INTERVAL_MS);
    if (!due.length) return;

    for (const entry of due) {
      try {
        markWatchlistChecked(entry.mint);
        const liquidity = await getLiquidityResilient(entry.mint);
        const liquidityUsd = liquidity.ok && liquidity.liquidityUsd ? liquidity.liquidityUsd : 0;
        const volume24h = liquidity.volume24h ?? 0;
        
        // Check liquidity threshold
        if (!liquidity.ok || liquidityUsd < WATCHLIST_MIN_LIQUIDITY_USD) {
          dbg(
            `[WATCHLIST] waiting ${short(entry.mint)} | liquidity=$${liquidityUsd.toFixed(0)} | min=${WATCHLIST_MIN_LIQUIDITY_USD}`
          );
          continue;
        }
        
        // Check volume threshold - skip dead tokens with no trading activity
        if (volume24h < WATCHLIST_MIN_VOLUME_24H_USD) {
          dbg(
            `[WATCHLIST] skipping ${short(entry.mint)} | volume24h=$${volume24h.toFixed(0)} | min=$${WATCHLIST_MIN_VOLUME_24H_USD} (insufficient trading activity)`
          );
          continue;
        }
        
        // Check if pair is too old and inactive (optional - based on pair creation time)
        if (liquidity.pairCreatedAt) {
          const pairAgeHours = (Date.now() - liquidity.pairCreatedAt * 1000) / (1000 * 60 * 60);
          // If pair is old but has no recent volume, it's likely dead
          if (pairAgeHours > 24 && volume24h < WATCHLIST_MIN_VOLUME_24H_USD * 2) {
            dbg(
              `[WATCHLIST] skipping ${short(entry.mint)} | pair age=${pairAgeHours.toFixed(1)}h, volume=$${volume24h.toFixed(0)} (likely dead token)`
            );
            continue;
          }
        }

        const signalSnapshot: AlphaSignal = {
          mint: entry.mint,
          solSpent: entry.solSpent ?? BUY_SOL,
          tokenDelta: entry.tokenDelta ?? 0,
          alphaEntryPrice: entry.alphaEntryPrice ?? 0,
          alphaPreBalance: 0,
          alphaPostBalance: entry.tokenDelta ?? 0,
          blockTimeMs: entry.addedAt,
          signalAgeSec: Math.max(0, (Date.now() - entry.addedAt) / 1000),
        };

        await alert(
          `👀 <b>Watchlist ready</b>\n` +
            `Mint: <code>${short(entry.mint)}</code>\n` +
            `Liquidity: ${formatUsd(liquidityUsd)}\n` +
            `24h Volume: ${formatUsd(volume24h)}\n` +
            `Auto-buying now...`
        );

        pushEvent({
          t: Date.now(),
          kind: 'touch',
          mint: entry.mint,
          alpha: entry.alpha,
          tx: entry.txSig || '[watchlist]',
        });

        const result = await executeCopyTradeFromSignal({
          signal: signalSnapshot,
          alpha: entry.alpha,
          txSig: entry.txSig || '[watchlist]',
          source: 'watchlist',
          notifyTouch: false,
          skipTimeGuard: true,
        });

        if (result === 'bought') {
          removeFromWatchlist(entry.mint);
        }
      } catch (err) {
        dbg(`[WATCHLIST] monitor error for ${short(entry.mint)}: ${err instanceof Error ? err.message : err}`);
      }
    }
  } catch (err) {
    console.error('[WATCHLIST] monitor failed', err);
  }
}

if (ENABLE_WATCHLIST && WATCHLIST_CHECK_INTERVAL_MS > 0) {
  setInterval(() => {
    monitorWatchlist().catch((err) => console.error('[WATCHLIST] interval error', err));
  }, WATCHLIST_CHECK_INTERVAL_MS);
  monitorWatchlist().catch((err) => console.error('[WATCHLIST] initial run failed', err));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exit Manager (Early TP + Trailing Stop)
// ═══════════════════════════════════════════════════════════════════════════════

async function manageExit(mintStr: string) {
  const pos = openPositions[mintStr];
  if (!pos) return;
  
  // Guard: skip TP/TSL if invalid entry price
  if (!isValidPrice(pos.entryPrice)) {
    if (DEBUG_TX) console.log('[PAPER][DBG] skip TP/TSL: invalid entryPrice', { mint: mintStr, entryPrice: pos.entryPrice });
    return;
  }

  const earlyTarget = pos.entryPrice * (1 + EARLY_TP_PCT);
  let phase: 'early' | 'trailing' = 'early';
  pos.phase = phase; // Track phase in position

  let consecutivePriceFailures = 0;
  const MAX_PRICE_FAILURES = 12; // ~60s at 5s intervals
  const MAX_LOSS_PCT = -20; // Force exit at -20% loss

  let lastPrice = pos.entryPrice;
  
  while (openPositions[mintStr]) {
    // Dynamic polling: check more frequently if price dropped significantly last check
    const priceDropPct = lastPrice > 0 && pos.highPrice > 0 
      ? ((pos.highPrice - lastPrice) / pos.highPrice) * 100 
      : 0;
    const pollInterval = priceDropPct > 20 ? 1000 : 5000; // 1s if >20% drop from high, else 5s
    
    await new Promise((r) => setTimeout(r, pollInterval));
    const price = await getQuotePrice(pos.mint);
    
    // Dead token detection: if price unavailable for too long, force exit
    if (!price || !isValidPrice(price)) {
      consecutivePriceFailures++;
      if (consecutivePriceFailures >= MAX_PRICE_FAILURES) {
        try {
          dbg(`[EXIT] Dead token detected for ${short(mintStr)} - forcing exit`);
          const tx = await swapTokenForSOL(pos.mint, pos.qty);
          const solUsd = await getSolUsd();
          const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
          const entryUsd = pos.costSol * (solUsd || 0);
          const exitUsd = exitSol * (solUsd || 0);
          const pnlUsd = exitUsd - entryUsd;
          const pnlPct = entryUsd > 0 ? ((exitUsd - entryUsd) / entryUsd) * 100 : -100;
          
          await alert(
            `💀 Dead token auto-exit: <code>${short(mintStr)}</code>\n` +
            `Price unavailable for >60s. Forcing exit to prevent 100% loss.`
          );
          
          recordTrade({
            t: Date.now(),
            kind: 'sell',
            mode: IS_PAPER ? 'paper' : 'live',
            mint: mintStr,
            alpha: pos.alpha,
            exitPriceSol: pos.entryPrice * 0.5, // Estimate
            exitUsd,
            pnlSol: exitSol - pos.costSol,
            pnlUsd,
            pnlPct,
            durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
            tx: tx.txid,
          });
          
          delete openPositions[mintStr];
          savePositions(serializeLivePositions(openPositions));
          return;
        } catch (err: any) {
          await alert(`❌ Dead token exit failed for ${short(mintStr)}: ${err.message || err}`);
        }
      }
      continue;
    }
    
    consecutivePriceFailures = 0; // Reset on successful price fetch
    lastPrice = price; // Update for next iteration's dynamic polling
    
    // Sanity check: If price is way off from entry (>10x difference), likely bad price from BUY fallback
    // Don't use it for max loss protection - wait for next price check
    const priceRatio = Math.max(price / pos.entryPrice, pos.entryPrice / price);
    if (priceRatio > 10) {
      dbg(`[EXIT] Skipping max loss check for ${short(mintStr)}: price seems unreliable (ratio: ${priceRatio.toFixed(1)}x, entry: ${pos.entryPrice.toExponential(3)}, current: ${price.toExponential(3)})`);
      continue; // Skip this iteration, wait for next price check
    }
    
    // Max loss protection: force exit if down >20% from entry
    const currentLossPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
    if (currentLossPct <= MAX_LOSS_PCT) {
      try {
        dbg(`[EXIT] Max loss protection triggered for ${short(mintStr)}: ${currentLossPct.toFixed(1)}%`);
        const tx = await swapTokenForSOL(pos.mint, pos.qty);
        const solUsd = await getSolUsd();
        const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
        const entryUsd = pos.costSol * (solUsd || 0);
        const exitUsd = exitSol * (solUsd || 0);
        const pnlUsd = exitUsd - entryUsd;
        
        await alert(
          `🛡️ Max loss protection: <code>${short(mintStr)}</code>\n` +
          `Loss: ${currentLossPct.toFixed(1)}% (limit: ${MAX_LOSS_PCT}%)\n` +
          `Forcing exit to prevent further losses.`
        );
        
        recordTrade({
          t: Date.now(),
          kind: 'sell',
          mode: IS_PAPER ? 'paper' : 'live',
          mint: mintStr,
          alpha: pos.alpha,
          exitPriceSol: price,
          exitUsd,
          pnlSol: exitSol - pos.costSol,
          pnlUsd,
          pnlPct: currentLossPct,
          durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
          tx: tx.txid,
        });
        
        delete openPositions[mintStr];
        savePositions(serializeLivePositions(openPositions));
        return;
      } catch (err: any) {
        await alert(`❌ Max loss exit failed for ${short(mintStr)}: ${err.message || err}`);
      }
    }

    if (price > pos.highPrice) pos.highPrice = price;
    
    // Milestone alerts: notify at 10%, 20%, 30%, 100%, 200%, 500% gains
    const gainPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
    const milestones = [10, 20, 30, 100, 200, 500];
    const lastMilestone = (pos as any).lastMilestone || 0;
    const nextMilestone = milestones.find(m => gainPct >= m && m > lastMilestone);
    
    if (nextMilestone) {
      (pos as any).lastMilestone = nextMilestone;
      const solUsd = await getSolUsd();
      const priceUsd = price * (solUsd || 0);
      const entryUsd = pos.costSol * (solUsd || 0);
      const unrealizedUsd = (price - pos.entryPrice) * pos.costSol * (solUsd || 0);
      const tag = IS_PAPER ? '[PAPER] ' : '';
      
      // Get token name for display
      const liquidity = await getLiquidityResilient(mintStr).catch(() => null);
      const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
      
      await tgQueue.enqueue(() => bot.sendMessage(
        TELEGRAM_CHAT_ID,
        `${tag}🎉 Milestone: <b>${tokenDisplay}</b> hit +${nextMilestone}%!\n` +
        `Current: ${formatSol(price)}${solUsd ? ` (~${formatUsd(priceUsd)})` : ''}\n` +
        `Unrealized: ${(unrealizedUsd >= 0 ? '+' : '')}${formatUsd(unrealizedUsd)} (${(gainPct >= 0 ? '+' : '')}${gainPct.toFixed(1)}%)`,
        linkRow({ mint: mintStr, alpha: pos.alpha, chartUrl: liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined })
      ), { chatId: TELEGRAM_CHAT_ID });
    }

    if (phase === 'early' && price >= earlyTarget) {
      phase = 'trailing';
      pos.phase = phase; // Update phase in position
      const solUsd = await getSolUsd();
      const priceUsd = price * (solUsd || 0);
      const tag = IS_PAPER ? '[PAPER] ' : '';
      
      // Partial TP: sell a fraction immediately
      if (PARTIAL_TP_PCT > 0 && pos.costSol > 0) {
        const sellSizeSol = pos.costSol * PARTIAL_TP_PCT;
        const exitPriceSol = price;
        const exitUsd = sellSizeSol * (solUsd || 0);
        const entryUsd = (pos.costSol * (solUsd || 0)) * PARTIAL_TP_PCT;
        const pnlUsd = exitUsd - entryUsd;
        const pnlSol = sellSizeSol * (exitPriceSol - pos.entryPrice) / Math.max(exitPriceSol, 1e-18);
        const pnlPct = (exitPriceSol / pos.entryPrice - 1) * 100;
        
        await tgQueue.enqueue(() => bot.sendMessage(
          TELEGRAM_CHAT_ID,
          `${tag}💡 Partial TP: Sold ${formatUsd(exitUsd)}  |  ${(pnlUsd >= 0 ? '+' : '')}${formatUsd(pnlUsd)} (${(pnlPct >= 0 ? '+' : '')}${pnlPct.toFixed(1)}%)`,
          { parse_mode: 'HTML', disable_web_page_preview: true }
        ), { chatId: TELEGRAM_CHAT_ID });
        
        // Track partial TP event
        pushEvent({ t: Date.now(), kind: 'partial', mint: mintStr, usd: exitUsd, pnlPct, tx: 'partial' });
        
        // Record partial sell to ledger
        recordTrade({
          t: Date.now(),
          kind: 'sell',
          mode: IS_PAPER ? 'paper' : 'live',
          mint: mintStr,
          alpha: pos.alpha,
          exitPriceSol,
          exitUsd,
          pnlSol,
          pnlUsd,
          pnlPct,
          durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
          tx: 'partial-tp',
        });
        
        // Reduce position size for remainder
        pos.costSol = pos.costSol * (1 - PARTIAL_TP_PCT);
      }
      
      // Get token name for display
      const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
      const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
      
      await alert(
        `${tag}🎯 Early TP hit for <b>${tokenDisplay}</b>\n` +
        `Price: ${formatSol(price)}${solUsd ? ` (~${formatUsd(priceUsd)})` : ''}\n` +
        `Target: ${formatSol(earlyTarget)}\n` +
        `${PARTIAL_TP_PCT > 0 ? `Partial: ${(PARTIAL_TP_PCT * 100).toFixed(0)}% sold above` : '(no partial TP configured)'}\n` +
        `Switching to trailing stop...`
      );
    }

    if (phase === 'trailing') {
      const trailTrigger = pos.highPrice * (1 - TRAIL_STOP_PCT);
      if (price <= trailTrigger) {
        try {
          const tx = await swapTokenForSOL(pos.mint, pos.qty);
          const solUsd = await getSolUsd();
          
          // Calculate compact summary with entry/exit/PnL in USD
          const entrySol = pos.costSol;
          const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
          const pnlSol = exitSol - entrySol;
          const entryUsd = entrySol * (solUsd || 0);
          const exitUsd = exitSol * (solUsd || 0);
          const pnlUsd = exitUsd - entryUsd; // USD PnL = exit USD - entry USD
          
          // Calculate percentage from actual exit vs entry (not quote price)
          const pnl = entrySol > 0 ? (pnlSol / entrySol) * 100 : 0;
          const priceUsd = price * (solUsd || 0);
          const durationSec = Math.floor((Date.now() - pos.entryTime) / 1000);
          
          const tag = IS_PAPER ? '[PAPER] ' : '';
          // Get token name for display
          const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
          const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
          const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
          
          await tgQueue.enqueue(() => bot.sendMessage(
            TELEGRAM_CHAT_ID,
            `${tag}🛑 Trailing stop exit: <b>${tokenDisplay}</b>\n` +
            `Exit: ${formatSol(price)}${solUsd ? ` (~${formatUsd(priceUsd)})` : ''}`,
            linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid, chartUrl })
          ), { chatId: TELEGRAM_CHAT_ID });
          
          const summaryLine = solUsd ? 
            `💡 Bought ${formatUsd(entryUsd)} → Sold ${formatUsd(exitUsd)}  |  ` +
            `${(pnlUsd >= 0 ? '+' : '')}${formatUsd(pnlUsd)} (${(pnl >= 0 ? '+' : '')}${pnl.toFixed(1)}%)` : '';
          await tgQueue.enqueue(() => bot.sendMessage(TELEGRAM_CHAT_ID, summaryLine, { 
            parse_mode: 'HTML', 
            disable_web_page_preview: true 
          }), { chatId: TELEGRAM_CHAT_ID });

          // Track exit event
          pushEvent({ t: Date.now(), kind: 'exit', mint: mintStr, pnlUsd, pnlPct: pnl, tx: tx.txid });

          // Record trade in ledger
          recordTrade({
            t: Date.now(),
            kind: 'sell',
            mode: IS_PAPER ? 'paper' : 'live',
            mint: mintStr,
            alpha: pos.alpha,
            exitPriceSol: price,
            exitUsd,
            pnlSol,
            pnlUsd,
            pnlPct: pnl,
            durationSec,
            tx: tx.txid,
          });

          if (IS_PAPER && tx.solOutLamports) {
            await reportPaperPnL(mintStr, pos.costSol, tx.solOutLamports);
          }

          delete openPositions[mintStr];
          persistPositions();
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
    
    // Sanity check: If price is way off from entry (>10x difference), likely bad price from BUY fallback
    // Skip this check and wait for next price update
    const priceRatio = Math.max(price / entry, entry / price);
    if (priceRatio > 10) {
      dbg(`[SENTRY] Skipping sentry check for ${short(mintStr)}: price seems unreliable (ratio: ${priceRatio.toFixed(1)}x, entry: ${entry.toExponential(3)}, current: ${price.toExponential(3)})`);
      continue;
    }

    const dd = (entry - price) / entry;
    if (dd >= SENTRY_MAX_DD) {
      try {
        const tx = await swapTokenForSOL(pos.mint, pos.qty);
        const solUsd = await getSolUsd();
        
        // Calculate compact summary with entry/exit/PnL in USD
        const entrySol = pos.costSol;
        const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
        const pnlSol = exitSol - entrySol;
        const entryUsd = entrySol * (solUsd || 0);
        const exitUsd = exitSol * (solUsd || 0);
        const pnlUsd = exitUsd - entryUsd; // USD PnL = exit USD - entry USD
        
        // Calculate percentage from actual exit vs entry (not drawdown estimate)
        const pnl = entrySol > 0 ? (pnlSol / entrySol) * 100 : 0;
        const durationSec = Math.floor((Date.now() - pos.entryTime) / 1000);
        
        const tag = IS_PAPER ? '[PAPER] ' : '';
        await tgQueue.enqueue(() => bot.sendMessage(
          TELEGRAM_CHAT_ID,
          `${tag}🚨 Sentry abort: <code>${short(mintStr)}</code>  |  DD: ${(dd * 100).toFixed(1)}%`,
          linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid })
        ), { chatId: TELEGRAM_CHAT_ID });
        
        const summaryLine = solUsd ? 
          `💡 Bought ${formatUsd(entryUsd)} → Sold ${formatUsd(exitUsd)}  |  ` +
          `${(pnlUsd >= 0 ? '+' : '')}${formatUsd(pnlUsd)} (${(pnl >= 0 ? '+' : '')}${pnl.toFixed(1)}%)` : '';
        await tgQueue.enqueue(() => bot.sendMessage(TELEGRAM_CHAT_ID, summaryLine, { 
          parse_mode: 'HTML', 
          disable_web_page_preview: true 
        }), { chatId: TELEGRAM_CHAT_ID });

        // Track sentry exit event
        pushEvent({ t: Date.now(), kind: 'exit', mint: mintStr, pnlUsd, pnlPct: pnl, tx: tx.txid });

        // Record trade in ledger
        recordTrade({
          t: Date.now(),
          kind: 'sell',
          mode: IS_PAPER ? 'paper' : 'live',
          mint: mintStr,
          alpha: pos.alpha,
          exitPriceSol: entry * (1 - dd), // approximate exit price
          exitUsd,
          pnlSol,
          pnlUsd,
          pnlPct: pnl,
          durationSec,
          tx: tx.txid,
        });

        if (IS_PAPER && tx.solOutLamports) {
          await reportPaperPnL(mintStr, pos.costSol, tx.solOutLamports);
        }

        delete openPositions[mintStr];
        persistPositions();
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
// Heartbeat & Market Pulse
// ═══════════════════════════════════════════════════════════════════════════════

async function buildPulseBlock(): Promise<string> {
  const solUsd = await getSolUsd().catch(() => 0);
  const lines: string[] = [];
  
  // Take most recent events, newest first
  const slice = [...RECENT].reverse().slice(0, PULSE_MAX_ROWS);
  
  for (const e of slice) {
    const when = `<code>${safeAgo(ago(Date.now() - e.t))}</code>`;
    if (e.kind === 'touch') {
      lines.push(`👀 ${when} | touch | ${short(e.mint)} by ${short(e.alpha)}`);
    } else if (e.kind === 'buy') {
      lines.push(`✅ ${when} | buy   | ${short(e.mint)} for <code>${esc(e.sol.toFixed(3))}</code> SOL (${formatUsd(e.usd)})`);
    } else if (e.kind === 'partial') {
      lines.push(`💡 ${when} | pTP   | ${short(e.mint)} ${formatUsd(e.usd)} (<code>${esc((e.pnlPct >= 0 ? '+' : '') + e.pnlPct.toFixed(1))}</code>%)`);
    } else if (e.kind === 'exit') {
      lines.push(`🛑 ${when} | exit  | ${short(e.mint)} ${(e.pnlUsd >= 0 ? '+' : '')}${formatUsd(e.pnlUsd)} (<code>${esc((e.pnlPct >= 0 ? '+' : '') + e.pnlPct.toFixed(1))}</code>%)`);
    } else if (e.kind === 'skip') {
      const reasonShort = (e.reason || '').slice(0, 30);
      lines.push(`⛔ ${when} | skip  | ${esc(reasonShort)}`);
    }
  }
  
  return lines.length ? lines.join('\n') : '— no recent events —';
}

async function sendHeartbeat() {
  try {
    const now = Date.now();
    const sinceActivity = now - LAST_ACTIVITY_AT;
    const sinceSignal = now - LAST_SIGNAL_AT;
    const sinceTrade = LAST_TRADE_AT ? (now - LAST_TRADE_AT) : 0;

    const pulse = await buildPulseBlock();
    const { active, candidates } = listAll();
    
    const header =
      `<b>[BOT] 💓 Heartbeat</b>\n` +
      `• Watching: <code>${esc(String(active.length))}</code> active, <code>${esc(String(candidates.length))}</code> candidates\n` +
      `• Last activity: <code>${safeAgo(ago(sinceActivity))}</code>\n` +
      `• Last signal: <code>${safeAgo(ago(sinceSignal))}</code>\n` +
      (LAST_TRADE_AT ? `• Last trade: <code>${safeAgo(ago(sinceTrade))}</code>\n` : '') +
      `\n📊 Market pulse (latest <code>${esc(String(PULSE_MAX_ROWS))}</code>):\n${pulse}`;

    await alert(header);
  } catch (e) {
    console.error('[HB] Heartbeat failed', e);
  }
}

// Fire heartbeat periodically
if (HEARTBEAT_EVERY_MIN > 0) {
  setInterval(sendHeartbeat, HEARTBEAT_EVERY_MIN * 60_000);
}

// Silent watchdog: alert if no signals for too long
setInterval(async () => {
  const idleMin = (Date.now() - LAST_SIGNAL_AT) / 60000;
  if (!SILENT_ALERT_SENT && idleMin >= SILENT_ALERT_MIN) {
    SILENT_ALERT_SENT = true;
    const { active, candidates } = listAll();
    await alert(
      `<b>[BOT] 🤫 Silent period</b>\n` +
      `No new signals for <code>${esc(String(Math.floor(idleMin)))}</code> minutes.\n\n` +
      `• Watching <code>${esc(String(active.length))}</code> active, <code>${esc(String(candidates.length))}</code> candidates\n` +
      `• Tip: increase alpha list or relax filters if desired.`
    );
  }
  // Reset flag once we see new activity
  if (SILENT_ALERT_SENT && (Date.now() - LAST_SIGNAL_AT) < (SILENT_ALERT_MIN * 60_000)) {
    SILENT_ALERT_SENT = false;
  }
}, 60_000); // Check every minute

// ═══════════════════════════════════════════════════════════════════════════════
// Daily Recap (Midnight Summary)
// ═══════════════════════════════════════════════════════════════════════════════

let lastRecapDate = new Date().toDateString();

async function checkDailyRecap() {
  const now = new Date();
  const today = now.toDateString();
  
  // Only run once per day at midnight (first check after 00:00)
  if (today !== lastRecapDate && now.getHours() === 0 && now.getMinutes() < 10) {
    lastRecapDate = today;
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const since = yesterday.getTime();
    
    const trades = readTrades();
    const { buys, sells, pnlUsd, pnlSol } = summarize(trades, since);
    
    if (buys === 0 && sells === 0) {
      await alert(`📅 Daily Recap: No trades yesterday.`);
      return;
    }
    
    const sellTrades = trades.filter(t => t.kind === 'sell' && t.t >= since);
    const winners = sellTrades.filter(t => (t.pnlUsd || 0) > 0);
    const losers = sellTrades.filter(t => (t.pnlUsd || 0) < 0);
    const winRate = sells > 0 ? ((winners.length / sells) * 100).toFixed(0) : '0';
    
    const biggest = sellTrades.length > 0 
      ? sellTrades.reduce((a, b) => Math.abs(b.pnlUsd || 0) > Math.abs(a.pnlUsd || 0) ? b : a)
      : null;
    
    const biggestLabel = biggest 
      ? `\nBiggest: ${(biggest.pnlUsd || 0) >= 0 ? '+' : ''}${formatUsd(biggest.pnlUsd || 0)} (<code>${short(biggest.mint)}</code>)`
      : '';
    
    await alert(
      `📅 <b>Daily Recap</b> — <code>${esc(yesterday.toLocaleDateString())}</code>\n\n` +
      `Buys: <code>${esc(String(buys))}</code> | Sells: <code>${esc(String(sells))}</code>\n` +
      `Win rate: <code>${esc(winRate)}</code>%\n\n` +
      `Realized PnL:\n` +
      `${formatUsd(pnlUsd)} (${formatSol(pnlSol)})${biggestLabel}`
    );
  }
}

// Check for midnight recap every 5 minutes
setInterval(checkDailyRecap, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
// Main Entry
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const mode = IS_PAPER ? '📄 PAPER MODE' : '💰 LIVE MODE';
  console.log(`🚀 Alpha Snipes Bot Starting... ${mode}`);
  console.log(`🔧 SOLANA_RPC_URL: ${RPC_URL}`);
  if (USE_HELIUS_RPC) {
    const maskedKey = HELIUS_API_KEY ? `${HELIUS_API_KEY.slice(0, 8)}...${HELIUS_API_KEY.slice(-4)}` : 'extracted from URL';
    console.log(`✅ Helius RPC enabled (API key: ${maskedKey})`);
  } else if (RPC_URL.includes('helius') && !HELIUS_API_KEY) {
    console.log(`⚠️  Helius RPC URL detected but no API key found`);
  }
  console.log(`📍 Wallet: ${walletKeypair.publicKey.toBase58()}`);
  console.log(`💰 Buy size: ${BUY_SOL} SOL`);
  console.log(`🎯 Early TP: ${EARLY_TP_PCT * 100}%${PARTIAL_TP_PCT > 0 ? ` (Partial: ${PARTIAL_TP_PCT * 100}%)` : ''}`);
  console.log(`🛑 Trailing stop: ${TRAIL_STOP_PCT * 100}%`);
  console.log(`🛡️ Sentry window: ${SENTRY_WINDOW_SEC}s (max DD: ${SENTRY_MAX_DD * 100}%)`);
  const typicalCUUsage = 250000;
  const calculatedMax = Math.floor((typicalCUUsage * CU_UNIT_PRICE * JITO_PRIORITY_FEE_MULTIPLIER) / 1e6);
  const maxFeeLamports = Math.min(calculatedMax, MAX_PRIORITY_FEE_LAMPORTS);
  console.log(`⚙️  Priority: ${CU_UNIT_PRICE} microLamports/CU, ${CU_LIMIT} CU limit, max ${maxFeeLamports / 1e9} SOL (multiplier: ${JITO_PRIORITY_FEE_MULTIPLIER}x)`);
  console.log(`🪲 Debug: TX=${DEBUG_TX} | toTelegram=${DEBUG_TO_TELEGRAM}`);
  console.log(`🔧 DNS servers in use: ${(dns.getServers?.() || []).join(', ') || 'default'}`);
  logJupiterBases();
  if (process.env.DNS_OVERRIDE) {
    console.log(`🔁 DNS_OVERRIDE: ${process.env.DNS_OVERRIDE}`);
  }

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

  // Scan recent transactions for missed signals during downtime
  if (ACTIVE_ALPHAS.length > 0) {
    console.log('🔍 Scanning recent transactions for missed alpha signals...');
    scanRecentAlphaTransactions().catch((err) => {
      console.error('[STARTUP] Scan failed:', err);
    });
  }
}

async function scanRecentAlphaTransactions() {
  const SCAN_WINDOW_MS = 5 * 60 * 1000; // Last 5 minutes
  const now = Date.now();
  const since = now - SCAN_WINDOW_MS;

  for (const alpha of ACTIVE_ALPHAS) {
    try {
      const pk = new PublicKey(alpha);
      const sigs = await connection.getSignaturesForAddress(pk, {
        limit: 50,
        until: undefined,
      });

      for (const sigInfo of sigs) {
        if (!sigInfo.blockTime) continue;
        const txTime = sigInfo.blockTime * 1000;
        if (txTime < since) break; // Too old

        // Check if we already processed this signature
        if (seenSignatures.has(sigInfo.signature)) continue;

        try {
          seenSignatures.add(sigInfo.signature); // Mark as seen before processing
          await handleAlphaTransaction(sigInfo.signature, alpha, 'active');
        } catch (err: any) {
          dbg(`[SCAN] Failed to process ${sigInfo.signature.slice(0, 8)}: ${err.message || err}`);
        }
      }
    } catch (err: any) {
      console.warn(`[SCAN] Failed to scan ${short(alpha)}: ${err.message || err}`);
    }
  }

  console.log('✅ Startup scan complete');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

