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
  type CopyTradeSource,
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
import {
  performHealthCheck,
  attemptAutoFix,
  recordAlphaSignal,
  recordPriceFailure,
  recordPriceSuccess,
  getHealthStatus,
} from './lib/health_check.js';
import {
  fetchWalletTradesSince,
  fetchTokenSnapshot,
  validateBuyWithBirdeye,
  type BirdeyeTrade,
  type BirdeyeTokenSnapshot,
} from './lib/birdeye.js';

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

// Fixed buy size: 1 SOL for all flows
const BUY_SOL = 1.0;
const MIN_BUY_SOL = 1.0;
const MAX_BUY_SOL = 1.0;
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
const MAX_SIGNAL_AGE_SEC = parseInt(process.env.MAX_SIGNAL_AGE_SEC || '300', 10); // 5 minutes default (increased from 180s to catch more valid signals delayed by infra/API issues)
const MAX_ALPHA_ENTRY_MULTIPLIER = parseFloat(process.env.MAX_ALPHA_ENTRY_MULTIPLIER || '2');
const MIN_LIQUIDITY_USD = parseFloat(process.env.MIN_LIQUIDITY_USD || '10000');
const MIN_LIQUIDITY_USD_ALPHA = parseFloat(process.env.MIN_LIQUIDITY_USD_ALPHA || process.env.MIN_LIQUIDITY_USD || '3000'); // Lower threshold for alpha signals
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
import type { PositionMode } from './lib/positions.js';

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
    entryLiquidityUsd?: number; // Track liquidity at entry for monitoring
    mode?: PositionMode; // Explicit mode: 'normal' for standard entries, 'tiny_entry' for probe positions
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
  source?: 'rpc' | 'birdeye'; // Data source
  txHash?: string; // Transaction hash for validation
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

// Classify transaction type from parsed transaction
function classifyTxType(tx: ParsedTransactionWithMeta | null): string {
  if (!tx || !tx.meta || !tx.transaction) return 'unknown';
  
  const instructions = tx.transaction.message?.instructions || [];
  const programIds = new Set<string>();
  
  for (const ix of instructions) {
    if ('programId' in ix && ix.programId) {
      programIds.add(ix.programId.toString());
    }
  }
  
  // Check for common DEX programs
  const RAYDIUM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
  const ORCA_PROGRAM = '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP';
  const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
  const METEORA_PROGRAM = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB';
  
  if (programIds.has(JUPITER_PROGRAM)) return 'swap (Jupiter)';
  if (programIds.has(RAYDIUM_PROGRAM)) return 'swap (Raydium)';
  if (programIds.has(ORCA_PROGRAM)) return 'swap (Orca)';
  if (programIds.has(METEORA_PROGRAM)) return 'swap (Meteora)';
  
  // Check for liquidity pool operations
  const hasLiquidityOps = Array.from(programIds).some(id => 
    id.includes('pool') || id.includes('liquidity') || id.includes('amm')
  );
  if (hasLiquidityOps) return 'liquidity_op';
  
  // Check for token program (transfers)
  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  if (programIds.has(TOKEN_PROGRAM) && programIds.size === 1) return 'transfer';
  
  // Check for system program (SOL transfers)
  const SYSTEM_PROGRAM = '11111111111111111111111111111111';
  if (programIds.has(SYSTEM_PROGRAM) && programIds.size === 1) return 'transfer';
  
  return 'other';
}

// Format time duration (e.g., "2m", "1h", "30s")
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
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
    const alphaInAccountKeys = alphaIndex !== -1;

    // Method 1: Check SOL balance changes (if alpha is in account keys)
    let solSpent = 0;
    let solReceived = 0;
    if (alphaInAccountKeys) {
      const preLamports = Number(tx?.meta?.preBalances?.[alphaIndex] ?? 0);
      const postLamports = Number(tx?.meta?.postBalances?.[alphaIndex] ?? 0);
      solSpent = (preLamports - postLamports) / 1e9;
      solReceived = (postLamports - preLamports) / 1e9;
    } else {
      // Alpha not in account keys - check token balances instead
      // This catches transactions via DEX aggregators, token transfers, etc.
      dbg(`[CLASSIFY] alpha ${short(alpha)} not in account keys for tx ${sig?.slice(0, 8)}, checking token balances...`);
    }
    
    // If alpha not in account keys, we can't verify SOL spent directly
    // But we can still detect token balance increases (BUY signals)
    // We'll use Birdeye to get actual SOL spent later
    if (!alphaInAccountKeys) {
      // Skip SOL-based filtering if alpha not in account keys
      // Proceed to token balance checking below
    } else if (!Number.isFinite(solSpent) || solSpent < DUST_SOL_SPENT) {
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
            // Note: We don't exit on alpha SELL - we only exit at +20% gain
          }
        }
      }
      
      // Enhanced logging: show what type of transaction this is
      if (solReceived >= DUST_SOL_SPENT) {
        dbg(
          `[CLASSIFY] skip tx ${sig?.slice(0, 8)}: SELL detected (solReceived=${solReceived.toFixed(6)}), not BUY`
        );
      } else {
        dbg(
          `[CLASSIFY] skip tx ${sig?.slice(0, 8)}: solSpent=${solSpent.toFixed(6)} < dust ${DUST_SOL_SPENT} (likely transfer/other, not swap)`
        );
      }
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
      // Enhanced logging: show why no gains were found
      const allPostBalances = postBalances.filter((p: any) => p?.owner === alpha && p?.mint);
      if (allPostBalances.length === 0) {
        dbg(`[CLASSIFY] tx ${sig?.slice(0, 8)}: no token balances found for alpha (likely transfer/other, not swap)`);
      } else {
        dbg(`[CLASSIFY] tx ${sig?.slice(0, 8)}: found ${allPostBalances.length} token balance(s) but none qualified (filtered by MIN_BALANCE or MIN_SIZE_INCREASE_RATIO)`);
      }
      return [];
    }

    const totalDelta = gains.reduce((sum, g) => sum + g.delta, 0);
    if (!Number.isFinite(totalDelta) || totalDelta <= 0) {
      dbg(`[CLASSIFY] invalid token delta sum (${totalDelta}) for tx ${sig?.slice(0, 8)}`);
      return [];
    }

    // If alpha not in account keys, we can't calculate exact SOL spent
    // Set a placeholder - Birdeye validation will provide actual SOL spent
    let alphaEntryPrice = 0;
    if (alphaInAccountKeys && solSpent > 0) {
      alphaEntryPrice = solSpent / totalDelta;
      if (!isValidPrice(alphaEntryPrice)) {
        dbg(`[CLASSIFY] invalid alpha entry price ${alphaEntryPrice} for tx ${sig?.slice(0, 8)}`);
        return [];
      }
    } else if (!alphaInAccountKeys) {
      // Alpha not in account keys - we'll get SOL spent from Birdeye
      // For now, use a placeholder price (will be updated by Birdeye validation)
      dbg(`[CLASSIFY] alpha not in account keys, will get SOL spent from Birdeye for tx ${sig?.slice(0, 8)}`);
      alphaEntryPrice = 0; // Placeholder, Birdeye will provide actual
    }

    const blockTimeMs = tx?.blockTime ? tx.blockTime * 1000 : Date.now();
    const signalAgeSec = tx?.blockTime ? Math.max(0, (Date.now() - blockTimeMs) / 1000) : 0;

    return gains.map((g) => {
      const detectionMethod = alphaInAccountKeys ? 'account_keys' : 'token_balances';
      dbg(
        `[CLASSIFY] BUY | source=rpc | method=${detectionMethod} | Alpha: ${short(alpha)} | Mint: ${short(
          g.mint
        )} | solSpent=${solSpent > 0 ? solSpent.toFixed(4) : 'TBD (Birdeye)'} | tokens=${g.delta.toFixed(2)} | entryPrice=${alphaEntryPrice > 0 ? alphaEntryPrice.toExponential(3) : 'TBD (Birdeye)'} | previousBalance=${g.preAmount.toFixed(2)}`
      );

      return {
        mint: g.mint,
        solSpent: solSpent > 0 ? solSpent : 0, // Will be updated by Birdeye if not in account keys
        tokenDelta: g.delta,
        alphaEntryPrice,
        alphaPreBalance: g.preAmount,
        alphaPostBalance: g.postAmount,
        blockTimeMs,
        signalAgeSec,
        source: 'rpc' as const,
        txHash: sig,
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
      `🔄 <b>/close_all</b>\nForce-close all open positions\n\n` +
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
    const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : `https://dexscreener.com/solana/${mintStr}`;
    
    // Try to get price with timeout
    const currentPrice = await Promise.race([
      getQuotePrice(pos.mint),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)) // 5s timeout
    ]).catch(() => null);
    
    if (!currentPrice || !isValidPrice(currentPrice)) {
      // Show position info even if price fetch fails
      const durationMin = Math.floor((Date.now() - pos.entryTime) / 60000);
      lines.push(
        `⚠️ <a href="${chartUrl}">${tokenDisplay}</a>  [price unavailable]\n` +
        `  Entry: ${formatSol(pos.entryPrice)}  |  Cost: ${formatSol(pos.costSol)}\n` +
        `  🎯 AUTO-CLOSE @ +20%  |  <code>${esc(String(durationMin))}</code>m\n`
      );
      continue;
    }
    
    // Sanity check: If price is way off from entry (>10x difference), likely bad price from BUY fallback
    // Don't display incorrect PnL - show "price unreliable" instead
    const priceRatio = Math.max(currentPrice / pos.entryPrice, pos.entryPrice / currentPrice);
    if (priceRatio > 10) {
      lines.push(
        `<a href="${chartUrl}">${tokenDisplay}</a>  [price unreliable]\n` +
        `  Entry: ${formatSol(pos.entryPrice)}  |  Current: [unreliable]\n` +
        `  ⏳ EARLY TP  |  <code>${esc(String(Math.floor((Date.now() - pos.entryTime) / 60000)))}</code>m\n`
      );
      continue;
    }
    
    const uPct = ((currentPrice / pos.entryPrice) - 1) * 100;
    const uSol = (currentPrice - pos.entryPrice) * pos.costSol;
    const uUsd = uSol * (solUsd || 0);
    const sign = uPct >= 0 ? '+' : '';
    const phaseLabel = '🎯 AUTO-CLOSE @ +20%';
    const durationMin = Math.floor((Date.now() - pos.entryTime) / 60000);
    
    // Highlight profit/loss with emojis and colors
    const profitEmoji = uPct >= 0 ? '🟢' : '🔴';
    const pctColor = uPct >= 0 ? '' : ''; // Telegram HTML doesn't support colors, use emojis instead
    
    lines.push(
      `${profitEmoji} <a href="${chartUrl}"><b>${tokenDisplay}</b></a>  <code>${esc(sign + uPct.toFixed(1))}</code>%  |  ${sign}${formatUsd(uUsd)}\n` +
      `  Entry: ${formatSol(pos.entryPrice)}  |  Now: ${formatSol(currentPrice)}\n` +
      `  ${phaseLabel}  |  <code>${esc(String(durationMin))}</code>m\n`
    );
  }
  
  await sendCommand(
    msg.chat.id,
    lines.length 
      ? `📂 <b>Open positions:</b>\n\n${lines.join('\n')}\n\n💡 Use <code>/close_all</code> to force-close all positions`
      : '📂 No open positions.'
  );
});

// Close all open positions command
bot.onText(/^\/close_all$/, async (msg) => {
  if (!isAdmin(msg)) return;
  
  const positions = Object.keys(openPositions);
  if (positions.length === 0) {
    await sendCommand(msg.chat.id, '📂 No open positions to close.');
    return;
  }
  
  await sendCommand(msg.chat.id, `🔄 Force-closing ${positions.length} position(s)...`);
  
  let successCount = 0;
  let failCount = 0;
  const results: string[] = [];
  
  for (const mintStr of positions) {
    const pos = openPositions[mintStr];
    if (!pos) continue;
    
    try {
      const tx = await swapTokenForSOL(pos.mint, pos.qty);
      const solUsd = await getSolUsd();
      const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
      const entryUsd = pos.costSol * (solUsd || 0);
      const exitUsd = exitSol * (solUsd || 0);
      const pnlUsd = exitUsd - entryUsd;
      const pnlPct = entryUsd > 0 ? ((exitUsd - entryUsd) / entryUsd) * 100 : 0;
      
      // Get token name
      const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
      const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
      
      recordTrade({
        t: Date.now(),
        kind: 'sell',
        mode: IS_PAPER ? 'paper' : 'live',
        mint: mintStr,
        alpha: pos.alpha,
        exitPriceSol: pos.entryPrice, // Approximate
        exitUsd,
        pnlSol: exitSol - pos.costSol,
        pnlUsd,
        pnlPct,
        durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
        tx: tx.txid,
      });
      
      delete openPositions[mintStr];
      successCount++;
      results.push(`✅ ${tokenDisplay}: ${(pnlPct >= 0 ? '+' : '')}${pnlPct.toFixed(1)}%`);
    } catch (err: any) {
      failCount++;
      const errMsg = err?.message || String(err);
      
      // If it's a dead token or rate limit, just remove it
      if (isDeadTokenError(err) || errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('DNS')) {
        const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
        const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
        
        // Record as 100% loss for dead tokens
        if (isDeadTokenError(err)) {
          const solUsd = await getSolUsd();
          const entryUsd = pos.costSol * (solUsd || 0);
          recordTrade({
            t: Date.now(),
            kind: 'sell',
            mode: IS_PAPER ? 'paper' : 'live',
            mint: mintStr,
            alpha: pos.alpha,
            exitPriceSol: 0,
            exitUsd: 0,
            pnlSol: -pos.costSol,
            pnlUsd: -entryUsd,
            pnlPct: -100,
            durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
            tx: 'DEAD_TOKEN',
          });
        }
        
        delete openPositions[mintStr];
        results.push(`⚠️ ${tokenDisplay}: removed (${isDeadTokenError(err) ? 'dead token' : 'rate limit'})`);
      } else {
        results.push(`❌ ${short(mintStr)}: ${errMsg.slice(0, 50)}`);
      }
    }
    
    // Small delay between exits to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  savePositions(serializeLivePositions(openPositions));
  
  await sendCommand(
    msg.chat.id,
    `📊 <b>Close all results:</b>\n\n` +
    `✅ Success: ${successCount}\n` +
    `❌ Failed: ${failCount}\n\n` +
    results.join('\n')
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
    
    // Step 1: Fetch liquidity FIRST (triangulated) - this will be used in the message
    dbg(`[FORCE_BUY] Fetching triangulated liquidity for ${short(mintStr)}`);
    const liquidity = await getLiquidityResilient(mintStr, { retries: 2, cacheMaxAgeMs: 5_000 });
    const liquidityUsd = liquidity.ok && typeof liquidity.liquidityUsd === 'number' ? liquidity.liquidityUsd : 0;
    const liquiditySource = liquidity.source || 'unknown';
    const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
    const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
    
    dbg(`[ENTRY][DEBUG] Liquidity provider results: source=${liquiditySource}, liquidityUsd=${liquidityUsd}, ok=${liquidity.ok}`);
    
    // Step 2: Fetch current price with triangulation fallback
    dbg(`[FORCE_BUY] Fetching price for ${short(mintStr)} (with triangulation fallback)`);
    let currentPrice = await getQuotePrice(mintPk);
    
    // If price fetch failed, try using liquidity price as fallback
    if (!currentPrice || !isValidPrice(currentPrice)) {
      dbg(`[ENTRY][DEBUG] Primary price fetch failed, trying liquidity price fallback`);
      if (liquidity.priceSol && isValidPrice(liquidity.priceSol)) {
        currentPrice = liquidity.priceSol;
        dbg(`[ENTRY][DEBUG] Using liquidity price fallback: ${currentPrice.toExponential(3)} SOL/token`);
      } else {
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
    }
    
    dbg(`[ENTRY][DEBUG] Price after triangulation: ${currentPrice.toExponential(3)} SOL/token`);
    
    // Step 3: Determine buy amount (default 1 SOL, allow custom override)
    const FORCE_BUY_DEFAULT_SOL = 1.0;
    const buySol = customAmount || FORCE_BUY_DEFAULT_SOL;
    const buyAmountLamports = Math.floor(buySol * 1e9);
    
    // Step 4: Execute buy
    dbg(`[FORCE_BUY] Executing buy for ${short(mintStr)}: ${buySol} SOL`);
    const tx = await swapSOLforToken(mintPk, buySol);
    
    const solUsd = await getSolUsd();
    const entryUsd = buySol * (solUsd || 0);
    const tokenAmount = tx.outAmount ? Number(tx.outAmount) : 0;
    
    // Step 5: Calculate ACTUAL entry price from swap result (not quote price)
    // Entry price = SOL spent / tokens received
    const actualEntryPrice = tokenAmount > 0 ? buySol / tokenAmount : currentPrice;
    const finalEntryPrice = isValidPrice(actualEntryPrice) ? actualEntryPrice : (isValidPrice(currentPrice) ? currentPrice : 0);
    
    dbg(`[ENTRY][DEBUG] Entry price calculation: actualEntryPrice=${actualEntryPrice.toExponential(3)}, currentPrice=${currentPrice?.toExponential(3) || 'null'}, finalEntryPrice=${finalEntryPrice.toExponential(3)}`);
    
    // Check if this should be tiny-entry mode
    const TINY_ENTRY_THRESHOLD = 1e-9;
    const isTinyEntry = finalEntryPrice < TINY_ENTRY_THRESHOLD;
    const tinyEntryReason = isTinyEntry ? 
      (finalEntryPrice === 0 ? 'entryPrice is 0 (price fetch failed)' : 
       `entryPrice=${finalEntryPrice.toExponential(3)} < ${TINY_ENTRY_THRESHOLD.toExponential(3)}`) : 
      'normal entry';
    
    dbg(`[ENTRY][DEBUG] Tiny-entry mode? ${isTinyEntry} | reason=${tinyEntryReason}`);
    
    // Force-buy must always use mode: 'normal' - never tiny_entry
    // If we cannot get a reliable price, abort instead of creating a bad position
    if (!isValidPrice(finalEntryPrice) || finalEntryPrice <= 0) {
      await sendCommand(
        msg.chat.id,
        `⛔️ Force buy aborted: could not determine reliable entry price for <code>${short(mintStr)}</code>\n\n` +
        `Price fetch failed and liquidity fallback unavailable. Please try again when price data is available.`
      );
      return;
    }
    
    // Step 6: Create position with actual entry price - ALWAYS mode='normal' for force-buy
    const pos = {
      mint: mintPk,
      qty: BigInt(Math.floor(tokenAmount)),
      entryPrice: finalEntryPrice, // Use actual swap result, not quote price
      entryTime: Date.now(),
      costSol: buySol, // Actual SOL size (e.g. 1.0 SOL)
      alpha: 'force_buy',
      highPrice: finalEntryPrice,
      entryLiquidityUsd: typeof liquidityUsd === 'number' ? liquidityUsd : 0,
      mode: 'normal' as PositionMode, // Force-buy is always normal mode
      source: 'force' as CopyTradeSource, // Track source for exit logs
    };
    
    dbg(`[ENTRY][FORCE] mint=${short(mintStr)} sizeSol=${buySol} mode=${pos.mode} entryPrice=${pos.entryPrice.toExponential(3)} costSol=${pos.costSol}`);
    openPositions[mintStr] = pos;
    persistPositions();
    
    // Step 7: Send notifications with triangulated liquidity and actual entry price
    const tag = '[PAPER] ';
    const entryPriceUsd = finalEntryPrice * (solUsd || 0);
    const liquiditySourceLabel = liquiditySource === 'birdeye' ? ' (Birdeye)' : liquiditySource === 'dexscreener' ? ' (DexScreener)' : '';
    const poolInfo = liquidity.pairAddress ? `\nPool: ${short(liquidity.pairAddress)}${liquiditySourceLabel}` : '';
    
    await tgQueue.enqueue(() => bot.sendMessage(
      TELEGRAM_CHAT_ID,
      `${tag}🔨 Force buy: <b>${tokenDisplay}</b>\n` +
      `Entry: ${formatSol(finalEntryPrice)}${solUsd ? ` (~${formatUsd(entryPriceUsd)})` : ''}\n` +
      `Size: ${formatSol(buySol)}${solUsd ? ` (~${formatUsd(entryUsd)})` : ''}\n` +
      `Liquidity: ${formatUsd(liquidityUsd)}${liquiditySourceLabel}${poolInfo}\n` +
      `Tokens: ${tokenAmount.toLocaleString()}`,
      linkRow({ mint: mintStr, alpha: 'force_buy', tx: tx.txid, chartUrl })
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

async function liveSwapTokenForSOL(mint: PublicKey, tokenAmount: bigint): Promise<{ txid: string; solOutLamports?: number }> {
  const SOL = 'So11111111111111111111111111111111111111112';
  const params = {
    inputMint: mint,
    outputMint: new PublicKey(SOL),
    amount: tokenAmount,
    slippageBps: 300,
    connection,
    wallet: walletKeypair,
  };

  // Retry logic with exponential backoff for rate limits
  let lastError: Error | null = null;
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await swapWithDEXFallback(
        async () => {
          const quote = await getJupiterQuote(mint.toBase58(), SOL, Number(tokenAmount), 300);
          if (!quote || !quote.outAmount) {
            throw new Error('no_route: Jupiter could not find a swap path (dead token or no liquidity)');
          }
          const swapTx = await getJupiterSwapTransaction(quote);
          const txid = await executeSwap(swapTx);
          dbg(`[SWAP] Jupiter swap successful | txid: ${txid} | dex: jupiter`);
          return { txid, solOutLamports: Number(quote.outAmount) };
        },
        params,
        ENABLE_ORCA_FALLBACK,
        ENABLE_RAYDIUM_FALLBACK
      );
      dbg(`[SWAP] Sell swap completed | txid: ${result.txid} | dex: ${result.dex || 'jupiter'}`);
      return { txid: result.txid, solOutLamports: result.solOutLamports ? Number(result.solOutLamports) : undefined };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errMsg = err?.message || String(err);
      
      // Check if it's a "no route" error (dead token)
      if (errMsg.includes('no_route') || errMsg.includes('No route') || errMsg.includes('could not find a swap path')) {
        throw new Error('DEAD_TOKEN: No liquidity route available - token is dead or has no liquidity');
      }
      
      // Check if it's a rate limit error
      const isRateLimited = errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('cooldown') || errMsg.includes('backoff');
      
      if (isRateLimited && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s
        dbg(`[SWAP] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // Retry
      }
      
      // If not rate limited or out of retries, throw the error
      throw lastError;
    }
  }
  
  throw lastError || new Error('Swap failed after retries');
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

// Helper function to detect if error is a dead token (no route)
function isDeadTokenError(err: any): boolean {
  const errMsg = err?.message || String(err);
  return errMsg.includes('DEAD_TOKEN') || 
         errMsg.includes('no_route') || 
         errMsg.includes('No route') || 
         errMsg.includes('could not find a swap path') ||
         errMsg.includes('illiquid') ||
         errMsg.includes('no liquidity');
}

// Unified exit error handler - handles dead tokens, rate limits, DNS errors, and other errors
async function handleExitError(
  err: any,
  mintStr: string,
  pos: typeof openPositions[string],
  exitType: 'max_loss' | 'crashed' | 'liquidity_drop' | 'early_tp' | 'trailing_stop' | 'hard_profit'
): Promise<'retry' | 'removed'> {
  const errMsg = err?.message || String(err);
  
  // Dead token - remove immediately
  if (isDeadTokenError(err)) {
    dbg(`[EXIT] Dead token detected for ${short(mintStr)} (${exitType}) - removing position`);
    await alert(`💀 Dead token: <b>${short(mintStr)}</b>\nNo liquidity route available. Removing position.`);
    
    // Record as 100% loss
    const solUsd = await getSolUsd();
    const entryUsd = pos.costSol * (solUsd || 0);
    recordTrade({
      t: Date.now(),
      kind: 'sell',
      mode: IS_PAPER ? 'paper' : 'live',
      mint: mintStr,
      alpha: pos.alpha,
      exitPriceSol: 0,
      exitUsd: 0,
      pnlSol: -pos.costSol,
      pnlUsd: -entryUsd,
      pnlPct: -100,
      durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
      tx: 'DEAD_TOKEN',
    });
    
    delete openPositions[mintStr];
    savePositions(serializeLivePositions(openPositions));
    return 'removed';
  }
  
  // Rate limit - exponential backoff with max attempts (no alert on first attempts)
  const isRateLimited = errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('cooldown') || errMsg.includes('backoff') || errMsg.includes('cooling down');
  if (isRateLimited) {
    const rateLimitAttempts = (pos as any).rateLimitAttempts || 0;
    (pos as any).rateLimitAttempts = rateLimitAttempts + 1;
    
    // After 5 attempts, remove position
    if (rateLimitAttempts >= 5) {
      dbg(`[EXIT] ${exitType} exit rate limited ${rateLimitAttempts} times for ${short(mintStr)} - removing position`);
      await alert(`⚠️ ${exitType} exit rate limited repeatedly for ${short(mintStr)}. Removing position.`);
      delete openPositions[mintStr];
      savePositions(serializeLivePositions(openPositions));
      return 'removed';
    }
    
    // Exponential backoff: 30s, 60s, 120s, 240s, 480s
    const delay = 30_000 * Math.pow(2, Math.min(rateLimitAttempts, 4));
    dbg(`[EXIT] ${exitType} exit rate limited for ${short(mintStr)} - retrying in ${delay/1000}s (attempt ${rateLimitAttempts + 1}/5)`);
    // Don't send alert for rate limits - they're temporary, just retry
    await new Promise(resolve => setTimeout(resolve, delay));
    return 'retry';
  }
  
  // DNS/Network errors - treat as temporary, retry with backoff (no alert on first attempts)
  const isNetworkError = errMsg.includes('DNS lookup failed') || 
                         errMsg.includes('host unreachable') || 
                         errMsg.includes('quote host unreachable') ||
                         errMsg.includes('ENOTFOUND') ||
                         errMsg.includes('getaddrinfo') ||
                         errMsg.includes('ECONNREFUSED') ||
                         errMsg.includes('ETIMEDOUT') ||
                         errMsg.includes('network timeout') ||
                         errMsg.includes('network error') ||
                         errMsg.includes('quote server could not be resolved');
  if (isNetworkError) {
    const networkAttempts = (pos as any).networkAttempts || 0;
    (pos as any).networkAttempts = networkAttempts + 1;
    
    // After 5 attempts, remove position
    if (networkAttempts >= 5) {
      dbg(`[EXIT] ${exitType} exit network error ${networkAttempts} times for ${short(mintStr)} - removing position`);
      await alert(`⚠️ ${exitType} exit network error repeatedly for ${short(mintStr)}. Removing position.`);
      delete openPositions[mintStr];
      savePositions(serializeLivePositions(openPositions));
      return 'removed';
    }
    
    // Exponential backoff: 15s, 30s, 60s, 120s, 240s (faster than rate limits)
    const delay = 15_000 * Math.pow(2, Math.min(networkAttempts, 4));
    dbg(`[EXIT] ${exitType} exit network error for ${short(mintStr)} - retrying in ${delay/1000}s (attempt ${networkAttempts + 1}/5)`);
    // Don't send alert for network errors - they're temporary, just retry
    await new Promise(resolve => setTimeout(resolve, delay));
    return 'retry';
  }
  
  // Other errors - track attempts and remove after 3 failures (alert on first failure)
  const errorAttempts = (pos as any).errorAttempts || 0;
  if (errorAttempts < 2) {
    (pos as any).errorAttempts = errorAttempts + 1;
    // Only alert on first failure for non-network errors
    if (errorAttempts === 0) {
      await alert(`❌ ${exitType} exit failed for ${short(mintStr)}: ${errMsg}`);
    }
    await new Promise(resolve => setTimeout(resolve, 30_000));
    return 'retry';
  } else {
    dbg(`[EXIT] ${exitType} exit failed ${errorAttempts + 1} times for ${short(mintStr)} - removing position`);
    await alert(`⚠️ ${exitType} exit failed repeatedly for ${short(mintStr)}. Removing position.`);
    delete openPositions[mintStr];
    savePositions(serializeLivePositions(openPositions));
    return 'removed';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Price Monitoring
// ═══════════════════════════════════════════════════════════════════════════════

async function getQuotePrice(mint: PublicKey): Promise<number | null> {
    const SOL = 'So11111111111111111111111111111111111111112';
  const shortMint = short(mint.toBase58());
  const mintStr = mint.toBase58();
  
  // PRIMARY: Try DexScreener API (fast, reliable, no rate limits with caching)
  try {
    const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 10_000 });
    if (liquidity.ok && liquidity.priceSol && liquidity.priceSol > 0) {
      dbg(`[PRICE] DexScreener price for ${shortMint}: ${liquidity.priceSol.toExponential(3)} SOL/token`);
      return liquidity.priceSol;
    }
  } catch (err) {
    dbg(`[PRICE] DexScreener price fetch failed for ${shortMint}: ${err}`);
  }
  
  try {
    // FALLBACK: Try SELL quote (1M tokens → SOL) - most accurate for price
    dbg(`[PRICE] Fetching SELL quote for ${shortMint} (1M tokens → SOL)`);
    const sellQuote = await getJupiterQuote(mintStr, SOL, 1_000_000, 1000);
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
    
    // LAST RESORT: Try BUY quote (0.1 SOL → tokens) - works for new tokens in bonding curve
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
  
  // LAST RESORT: Try Birdeye API for price
  try {
    const { fetchTokenSnapshot } = await import('./lib/birdeye.js');
    const birdeyeSnapshot = await fetchTokenSnapshot(mintStr);
    if (birdeyeSnapshot.price && birdeyeSnapshot.price > 0) {
      dbg(`[PRICE] Birdeye fallback success for ${shortMint}: ${birdeyeSnapshot.price.toExponential(3)} SOL/token`);
      return birdeyeSnapshot.price;
    }
  } catch (birdeyeErr: any) {
    dbg(`[PRICE] Birdeye fallback failed for ${shortMint}: ${birdeyeErr?.message || birdeyeErr}`);
  }
  
  // All methods failed
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

// Polling backup: Check for missed transactions every 10 seconds
// This catches transactions that onLogs() might miss due to RPC issues
// Only process transactions from the last 30 seconds to avoid old signals
let lastPollTime = new Map<string, number>();
setInterval(async () => {
  const now = Date.now();
  const maxAge = 30_000; // Only process transactions from last 30 seconds
  
  for (const alpha of ACTIVE_ALPHAS) {
    try {
      const pk = new PublicKey(alpha);
      const lastSeen = lastPollTime.get(alpha) || now - maxAge; // Default to 30s ago
      const sigs = await connection.getSignaturesForAddress(pk, {
        limit: 10, // Reduced to focus on recent transactions
        until: undefined,
      });

      for (const sigInfo of sigs) {
        if (!sigInfo.blockTime) continue;
        const txTime = sigInfo.blockTime * 1000;
        const txAge = now - txTime;
        
        // Skip transactions older than 30 seconds (already processed or too old)
        if (txAge > maxAge || txTime <= lastSeen) {
          if (txTime <= lastSeen) break; // Already processed, rest are older
          continue; // Too old, skip
        }

        // Skip if we already processed this signature
        if (seenSignatures.has(sigInfo.signature)) continue;

        // Retry logic for failed transactions
        let retries = 2;
        let success = false;
        while (retries > 0 && !success) {
          try {
            seenSignatures.add(sigInfo.signature); // Mark as seen before processing
            await handleAlphaTransaction(sigInfo.signature, alpha, 'active');
            success = true;
          } catch (err: any) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
            } else {
              dbg(`[POLL] Failed to process ${sigInfo.signature.slice(0, 8)} after retries: ${err.message || err}`);
            }
          }
        }
      }

      // Update last poll time to most recent processed transaction
      const mostRecent = sigs.find(s => s.blockTime && (now - s.blockTime * 1000) <= maxAge);
      if (mostRecent?.blockTime) {
        lastPollTime.set(alpha, mostRecent.blockTime * 1000);
      } else {
        lastPollTime.set(alpha, now); // Update to current time if no recent transactions
      }
    } catch (err: any) {
      // Retry on RPC errors
      if (err.message?.includes('429') || err.message?.includes('rate limit')) {
        dbg(`[POLL] Rate limit hit for ${short(alpha)}, will retry on next cycle`);
      } else {
        dbg(`[POLL] Failed to poll ${short(alpha)}: ${err.message || err}`);
      }
    }
  }
}, 15_000); // Poll every 15 seconds (enhanced from 30s for better catch rate)

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

  // Classify transaction type once for all signals
  const txType = classifyTxType(tx);

  for (const signal of signals) {
    const mint = signal.mint;
    if (seenMints.has(mint)) {
      if (DEBUG_TX) dbg(`ignored mint ${mint.slice(0, 8)}: already seen`);
      continue;
    }

    // Birdeye validation: cross-check RPC BUY signal with Birdeye (optional)
    // Also updates SOL spent if alpha not in account keys (detected via token balances)
    // NOTE: Birdeye validation is optional - if it fails or API key not configured, we still proceed with RPC signal
    if (signal.source === 'rpc' && signal.txHash && process.env.BIRDEYE_API_KEY) {
      try {
        const blockTimeSec = Math.floor(signal.blockTimeMs / 1000);
        const validation = await validateBuyWithBirdeye(signer, mint, signal.txHash, blockTimeSec);
        
        if (validation.confirmed && validation.trade) {
          // Update SOL spent and entry price from Birdeye if not available from RPC
          if (signal.solSpent === 0 && validation.trade.amountSol > 0) {
            signal.solSpent = validation.trade.amountSol;
            signal.alphaEntryPrice = validation.trade.amountSol / signal.tokenDelta;
            dbg(
              `[BIRDEYE] Updated SOL spent from Birdeye | ${short(mint)} | SOL: ${validation.trade.amountSol.toFixed(4)} | Entry Price: ${signal.alphaEntryPrice.toExponential(3)}`
            );
          } else {
            dbg(
              `[BIRDEYE] RPC BUY signal confirmed by Birdeye | ${short(mint)} | Birdeye SOL: ${validation.trade.amountSol.toFixed(4)} | RPC SOL: ${signal.solSpent.toFixed(4)}`
            );
          }
        } else if (!validation.confirmed) {
          // Birdeye didn't confirm, but we still proceed with RPC signal (Birdeye may not have the data yet)
          dbg(
            `[BIRDEYE] RPC BUY signal for ${short(mint)} not confirmed by Birdeye, but proceeding with RPC signal (Birdeye may not have indexed yet)`
          );
        }
      } catch (err: any) {
        // Birdeye validation failed (API error, rate limit, etc.) - still proceed with RPC signal
        dbg(
          `[BIRDEYE] Validation failed for ${short(mint)}: ${err.message || err}, proceeding with RPC signal`
        );
      }
    } else if (signal.source === 'rpc' && signal.txHash && !process.env.BIRDEYE_API_KEY) {
      // No Birdeye API key - proceed with RPC signal only
      dbg(`[BIRDEYE] No API key configured, proceeding with RPC signal only for ${short(mint)}`);
    }

    seenMints.add(mint);

    if (label === 'candidate') {
      bumpScore(signer);
      const promoted = maybePromote(signer, PROMOTION_THRESHOLD, PROMOTION_WINDOW_MS);
      
      // Get actual SOL spent from signal (use the value from classification, not placeholder)
      const solSpent = signal.solSpent || 0;
      
      // Classify signal type based on SOL spent
      const DUST_SOL = DUST_SOL_SPENT;
      let signalLabel: string;
      let solLine: string;
      
      if (solSpent >= 0.0001) {
        // Real buy - show with 4 decimals
        signalLabel = 'Candidate BUY signal';
        solLine = `Sol spent: <code>${solSpent.toFixed(4)}</code> SOL`;
      } else if (solSpent > 0) {
        // Tiny dust - never round to 0.0000
        signalLabel = 'Candidate TOUCH (dust)';
        solLine = `Sol spent: <code>&lt;0.0001</code> SOL (dust touch)`;
      } else {
        // 0 or unknown - no SOL spend (pure mint/transfer)
        signalLabel = 'Candidate TOUCH (no swap)';
        solLine = `Sol spent: <code>0</code> SOL (no swap in this tx)`;
      }
      
      // Derive transaction type label (more specific than classifyTxType)
      let txTypeLabel = txType;
      if (txType === 'swap (Jupiter)' || txType === 'swap (Raydium)' || txType === 'swap (Orca)' || txType === 'swap (Meteora)') {
        txTypeLabel = 'BUY';
      } else if (txType === 'liquidity_op') {
        txTypeLabel = 'ADD_LP';
      } else if (txType === 'transfer') {
        txTypeLabel = 'TRANSFER';
      } else if (txType === 'unknown' || txType === 'other') {
        // Try to infer from token delta
        if (signal.tokenDelta > 0 && solSpent === 0) {
          txTypeLabel = 'MINT';
        } else {
          txTypeLabel = 'UNKNOWN';
        }
      }
      
      // Calculate age: now - blockTime (in seconds)
      const signalAgeSec = signal.signalAgeSec ?? 0;
      const ageDisplay = signalAgeSec < 60 
        ? `${Math.floor(signalAgeSec)}s ago`
        : signalAgeSec < 3600
        ? `${Math.floor(signalAgeSec / 60)}m ago`
        : `${Math.floor(signalAgeSec / 3600)}h ago`;
      
      // Try to get quick liquidity snapshot (non-blocking, 2s timeout)
      let liquidityLine = '';
      let liqDisplay = 'unknown';
      try {
        const liquidity = await Promise.race([
          getLiquidityResilient(mint, { retries: 1, cacheMaxAgeMs: 300_000 }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)) // 2s timeout
        ]);
        
        if (liquidity && liquidity.ok && typeof liquidity.liquidityUsd === 'number' && liquidity.liquidityUsd > 0) {
          const vol24h = liquidity.volume24h ?? 0;
          const sourceLabel = liquidity.source ? ` (${liquidity.source})` : '';
          liqDisplay = formatUsd(liquidity.liquidityUsd);
          liquidityLine = `\nLiquidity: <code>${formatUsd(liquidity.liquidityUsd)}</code>${sourceLabel}`;
          if (vol24h > 0) {
            liquidityLine += `\n24h Volume: <code>${formatUsd(vol24h)}</code>`;
          }
        } else {
          liqDisplay = 'unknown';
          liquidityLine = `\nLiquidity: <code>unknown</code>`;
        }
      } catch (err) {
        // Silently fail - don't block the alert
        liqDisplay = 'unknown';
        liquidityLine = `\nLiquidity: <code>unknown</code>`;
      }
      
      // Debug log before sending
      dbg(`[ALPHA][CANDIDATE] wallet=${short(signer)} mint=${short(mint)} solSpent=${solSpent} txType=${txTypeLabel} liq=${liqDisplay} ageSec=${signalAgeSec}`);
      
      const tag = IS_PAPER ? '[PAPER] ' : '';
      await alert(
        `${tag}🧪 <b>${signalLabel}</b>\n` +
          `Wallet: <code>${short(signer)}</code>\n` +
          `Mint: <code>${short(mint)}</code>\n` +
          `Tx type: <code>${txTypeLabel}</code>\n` +
          `${solLine}\n` +
          `Age: <code>${ageDisplay}</code>${liquidityLine}\n` +
          `TX: <code>${short(sig)}</code>\n` +
          `\nStatus: <i>Candidate only (no copy trade yet)</i>${promoted ? '\n\n✅ <b>AUTO-PROMOTED to active!</b>' : ''}`
      );
      if (promoted) {
        refreshAlphas();
      }
      return;
    }

    dbg(`[HANDLE] Calling executeCopyTradeFromSignal for ${short(mint)} | Alpha: ${short(signer)} | TX: ${sig.slice(0, 8)}...`);
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
      
      dbg(`[NOTIFY] Sending "Alpha touched" message for ${short(mintStr)} | Alpha: ${short(alpha)}`);
      await tgQueue.enqueue(
        () =>
          bot.sendMessage(
      TELEGRAM_CHAT_ID,
            `${tag}👀 ${source === 'watchlist' ? 'Watchlist retry' : 'Alpha touched new mint'} <b>${tokenDisplay}</b>\nAlpha: <code>${short(alpha)}</code>`,
            linkRow({ mint: mintStr, alpha, tx: txSig, chartUrl })
          ),
        { chatId: TELEGRAM_CHAT_ID }
      );
      dbg(`[NOTIFY] "Alpha touched" message queued for ${short(mintStr)}`);
      pushEvent({ t: Date.now(), kind: 'touch', mint: mintStr, alpha, tx: txSig });
      recordAlphaSignal(); // Record for health monitoring
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

    const liq = await getLiquidityResilient(mintStr);
    const tokenDisplay = liq?.tokenName || liq?.tokenSymbol || short(mintStr);
    const chartUrl = liq?.pairAddress ? `https://dexscreener.com/solana/${liq.pairAddress}` : undefined;
    
    // Use lower threshold for alpha signals, higher for watchlist
    const minLiq = source === 'alpha' ? MIN_LIQUIDITY_USD_ALPHA : MIN_LIQUIDITY_USD;
    
    // Check for liquidity migration (unreliable data - skip)
    if (liq.isMigrating || liq.errorTag === 'migrating') {
      dbg(
        `[GUARD] Liquidity | status=migrating | ❌ FAIL (liquidity migration detected - unreliable data)`
      );
      await alert(
        `⛔️ Skipping <code>${short(mintStr)}</code>: Liquidity is being migrated (unreliable data, potential rug risk)`
      );
      pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: 'liquidity_migrating' });
      return 'skipped';
    }
    
    // Extract liquidityUsd - handle both known (number) and unknown (undefined) cases
    const liquidityUsd: number | undefined = liq.ok && typeof liq.liquidityUsd === 'number' ? liq.liquidityUsd : undefined;
    
    if (typeof liquidityUsd === 'number') {
      // Known liquidity value (including 0 = known low liquidity)
      const liqPass = liquidityUsd >= minLiq;
      dbg(
        `[GUARD] Liquidity | liquidity=$${liquidityUsd.toFixed(0)} | min=$${minLiq} | source=${liq.source ?? 'unknown'} | ${
          liqPass ? '✅ PASS' : '❌ FAIL'
        }`
      );
      if (!liqPass) {
        await alert(
          `⛔️ Skipping <code>${short(mintStr)}</code>: Liquidity ${formatUsd(liquidityUsd)} < ${formatUsd(minLiq)}`
        );
        pushEvent({ t: Date.now(), kind: 'skip', mint: mintStr, alpha, reason: 'liquidity_guard' });
        if (source === 'alpha') {
          await queueWatchlistAdd(signal, alpha, 'low_liquidity', txSig);
        }
        return 'skipped';
      }
      // Known liquidity passed - will use liquidityUsd for sizing
    } else {
      // Provider failed (rate_limit, timeout, network) → fail OPEN, but log loudly and shrink size
      dbg(
        `[GUARD] Liquidity | liquidity=unknown | reason=${liq.errorTag ?? 'unknown'} | FAIL_OPEN (proceeding with reduced size)`
      );
      // Will apply liquidity penalty in position sizing
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

    // Price guard removed - bot will enter regardless of price vs alpha entry
    // This allows catching tokens even if price has moved significantly since alpha entry
    if (isValidPrice(signal.alphaEntryPrice) && isValidPrice(start)) {
      const ratio = start / signal.alphaEntryPrice;
      dbg(
        `[GUARD] Price guard (DISABLED) | alphaEntry=${signal.alphaEntryPrice.toExponential(3)} | botEntry=${start.toExponential(3)} | ratio=${ratio.toFixed(2)}x | (limit removed - entering anyway)`
      );
    } else if (!isValidPrice(signal.alphaEntryPrice)) {
      dbg(`[GUARD] Alpha entry price unavailable - proceeding without price guard`);
    }

    // Fixed buy size: 1 SOL for all flows (alpha, watchlist, force-buy)
    // Position sizing is bypassed - we always use BUY_SOL
    const buySol = BUY_SOL;

    const buyKey = `${mintStr}:${txSig}:${source}`;
      if (IS_PAPER && !canPaperBuy(buyKey)) {
      dbg(`[PAPER] duplicate buy suppressed ${buyKey}`);
      return 'skipped';
      }
      
    // Try to buy - if it fails with no_route, it means Jupiter hasn't indexed the token yet
    // even though DexScreener shows liquidity
    let buy;
    let entryTime;
    let qty: bigint;
    let finalEntryPrice: number;
    
    try {
      buy = await swapSOLforToken(mintPk, buySol);
      entryTime = Date.now();
      qty = BigInt(buy.outAmount);
      
      // Calculate actual entry price from the buy transaction
      // Entry price = SOL spent / tokens received
      const tokensReceived = Number(qty);
      const actualEntryPrice = tokensReceived > 0 ? buySol / tokensReceived : start;
      finalEntryPrice = isValidPrice(actualEntryPrice) ? actualEntryPrice : start;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      
      // If it's a "no route" error, Jupiter hasn't indexed the token yet
      // even though DexScreener shows liquidity - this is a timing issue
      if (errMsg.includes('no_route') || errMsg.includes('No route') || errMsg.includes('could not find a swap path')) {
        await alert(
          `⛔ Skipping <code>${short(mintStr)}</code>\n` +
          `due to: <b>no_route_buy</b>: Jupiter could not find a swap path (illiquid or new token)\n\n` +
          `• No liquidity route available on Jupiter for this token pair.\n` +
          `• This means Jupiter could not find a valid liquidity route for the trade.\n` +
          `• The token is likely illiquid right now, or Jupiter hasn't indexed it yet.\n` +
          `• DexScreener may show liquidity, but Jupiter needs time to index new tokens.`
        );
        // Remove from watchlist to prevent repeated attempts
        if (ENABLE_WATCHLIST) {
          removeFromWatchlist(mintStr);
        }
        return 'skipped';
      }
      
      // Re-throw other errors
      throw err;
    }
    
    // Store entry liquidity for monitoring (use 0 if unknown - we'll skip liquidity drop detection in that case)
    const entryLiquidity = typeof liquidityUsd === 'number' ? liquidityUsd : 0;
    
    // Determine position mode: all entries >= 1 SOL use 'normal' mode
    // Tiny-entry mode is disabled since all flows use 1 SOL
    const TINY_ENTRY_MAX_SOL = 0; // Disabled - all entries are 1 SOL
    
    // 1) Liquidity flags
    const liquidityKnown = liq.ok && typeof liquidityUsd === 'number' && Number.isFinite(liquidityUsd);
    const liquidityUsdValue = liquidityKnown ? liquidityUsd! : undefined;
    const liquidityUnknown = !liquidityKnown;
    
    // 2) Price flags
    const priceKnown = typeof finalEntryPrice === 'number' && Number.isFinite(finalEntryPrice) && finalEntryPrice > 0;
    const isTinyPrice = priceKnown && finalEntryPrice < 1e-9;
    
    // 3) Mode decision
    let positionMode: PositionMode;
    
    if (source === 'watchlist') {
      // Watchlist auto-buys have passed liquidity/volume checks - always normal
      positionMode = 'normal';
      dbg(`[ENTRY][WATCHLIST] opening position mint=${short(mintStr)} sizeSol=${buySol} entryPrice=${finalEntryPrice.toExponential(3)} liquidityUsd=${liquidityUsd} mode=${positionMode} (forced normal - liquidity validated)`);
    } else if (source === 'alpha') {
      // Alpha signals: use normal mode if we have good liquidity AND valid price
      const hasGoodLiquidity = liquidityKnown && liquidityUsdValue! >= MIN_LIQUIDITY_USD_ALPHA;
      
      // RULES: All entries >= 1 SOL → always 'normal' mode
      // Tiny-entry mode is disabled since all flows use 1 SOL
      if (buySol >= 1.0) {
        positionMode = 'normal';
      } else {
        // Fallback (should never happen with 1 SOL fixed size)
        positionMode = 'normal';
      }
      
      dbg(
        `[ENTRY][ALPHA] opening position mint=${short(mintStr)} sizeSol=${buySol} liquidityUsd=${
          liquidityKnown ? liquidityUsdValue!.toFixed(0) : 'unknown'
        } entryPrice=${priceKnown ? finalEntryPrice.toExponential(3) : 'unknown'} mode=${positionMode}`
      );
    } else {
      // Fallback for any other source (shouldn't happen, but default to normal)
      positionMode = 'normal';
      dbg(`[ENTRY] Position mode: ${positionMode} | sizeSol=${buySol} | source=${source}`);
    }
    
    // All entries >= 1 SOL must use mode='normal' (tiny-entry mode disabled)
    const finalMode: PositionMode = buySol >= 1.0 ? 'normal' : positionMode;
    
    // Debug log for position opening
    dbg(`[ENTRY][OPEN] mint=${short(mintStr)} source=${source} sizeSol=${buySol} mode=${finalMode}`);
    
    openPositions[mintStr] = {
        mint: mintPk,
        qty,
      costSol: buySol,
        entryPrice: finalEntryPrice,
        highPrice: finalEntryPrice,
        entryTime,
      alpha,
      entryLiquidityUsd: entryLiquidity, // Store for liquidity drop detection (0 = unknown, skip detection)
      mode: finalMode, // Explicit mode: 'normal' for all 1 SOL entries, 'tiny_entry' disabled
      source: source, // Track source for exit logs (alpha/watchlist/force)
      };
    persistPositions();

      const solUsd = await getSolUsd();
    const buyUsd = buySol * (solUsd || 0);
      const refPriceUsd = finalEntryPrice * (solUsd || 0);
      const msgPrefix = source === 'watchlist' ? `${tag}🔁 Watchlist auto-buy` : `${tag}✅ Bought`;
      // tokenDisplay and chartUrl already defined above from liquidity fetch
    // Fixed size: 1 SOL for all flows (no multiplier)
    const sizingLine = `Size: ${formatSol(buySol)}`;
    
    // Use the entry price from signal if available, otherwise use calculated price
    const displayEntryPrice = isValidPrice(signal.alphaEntryPrice) ? signal.alphaEntryPrice : finalEntryPrice;
    const displayEntryPriceUsd = displayEntryPrice * (solUsd || 0);
    
    await tgQueue.enqueue(
      () =>
        bot.sendMessage(
        TELEGRAM_CHAT_ID,
          `${msgPrefix} <b>${tokenDisplay}</b> <code>${short(mintStr)}</code>\n` +
          `Size: ${formatSol(buySol)}${solUsd ? ` (${formatUsd(buyUsd)})` : ''}\n` +
          `Entry: ${formatSol(displayEntryPrice)} SOL/token${solUsd ? ` (~${formatUsd(displayEntryPriceUsd)})` : ''}\n` +
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
        const liquidityUsd = liquidity.ok && typeof liquidity.liquidityUsd === 'number' ? liquidity.liquidityUsd : 0;
        const volume24h = liquidity.volume24h ?? 0;
        
        // Check liquidity threshold - skip if unknown (provider error) or below minimum
        if (!liquidity.ok || typeof liquidity.liquidityUsd !== 'number' || liquidityUsd < WATCHLIST_MIN_LIQUIDITY_USD) {
          const liqDisplay = typeof liquidity.liquidityUsd === 'number' ? `$${liquidityUsd.toFixed(0)}` : 'unknown';
          dbg(
            `[WATCHLIST] waiting ${short(entry.mint)} | liquidity=${liqDisplay} | min=${WATCHLIST_MIN_LIQUIDITY_USD}`
          );
          continue;
        }
        
        // Check volume threshold - use relative volume for new pairs
        // For tokens < 6 hours old, scale down the volume requirement proportionally
        // This prevents rejecting active new tokens that haven't had 24h to accumulate volume
        let minVolume = WATCHLIST_MIN_VOLUME_24H_USD;
        if (liquidity.pairCreatedAt) {
          const pairAgeHours = (Date.now() - liquidity.pairCreatedAt * 1000) / (1000 * 60 * 60);
          if (pairAgeHours < 6) {
            // Scale down minimum volume for new pairs (e.g., 1 hour old = $1000 * (1/6) = $167)
            minVolume = WATCHLIST_MIN_VOLUME_24H_USD * Math.max(pairAgeHours / 6, 0.1); // Minimum 10% of threshold
            dbg(
              `[WATCHLIST] New pair detected (${pairAgeHours.toFixed(1)}h old) | scaling volume threshold: $${minVolume.toFixed(0)} (from $${WATCHLIST_MIN_VOLUME_24H_USD})`
            );
          } else if (pairAgeHours > 24) {
            // For old pairs (> 24h), require higher volume to avoid dead tokens
            minVolume = WATCHLIST_MIN_VOLUME_24H_USD * 2;
          }
        }
        
        if (volume24h < minVolume) {
          dbg(
            `[WATCHLIST] skipping ${short(entry.mint)} | volume24h=$${volume24h.toFixed(0)} | min=$${minVolume.toFixed(0)} (insufficient trading activity)`
          );
          continue;
        }

        // Fetch current price for entry price display (fallback if alphaEntryPrice not available)
        let entryPrice = entry.alphaEntryPrice ?? 0;
        let entryPriceDisplay = 'N/A';
        if (entryPrice > 0 && isValidPrice(entryPrice)) {
          entryPriceDisplay = formatSol(entryPrice);
        } else {
          // Try to fetch current price as fallback
          try {
            const mintPk = new PublicKey(entry.mint);
            const currentPrice = await getQuotePrice(mintPk);
            if (currentPrice && isValidPrice(currentPrice)) {
              entryPrice = currentPrice;
              entryPriceDisplay = formatSol(currentPrice);
            }
          } catch (err) {
            dbg(`[WATCHLIST] Could not fetch price for ${short(entry.mint)}: ${err}`);
          }
        }

        const signalSnapshot: AlphaSignal = {
          mint: entry.mint,
          solSpent: entry.solSpent ?? BUY_SOL,
          tokenDelta: entry.tokenDelta ?? 0,
          alphaEntryPrice: entryPrice,
          alphaPreBalance: 0,
          alphaPostBalance: entry.tokenDelta ?? 0,
          blockTimeMs: entry.addedAt,
          signalAgeSec: Math.max(0, (Date.now() - entry.addedAt) / 1000),
        };

        await alert(
          `👀 <b>Watchlist ready</b>\n` +
            `Mint: <code>${short(entry.mint)}</code>\n` +
            `Entry Price: ${entryPriceDisplay}\n` +
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
  if (!pos) {
    dbg(`[EXIT][DEBUG] manageExit: position not found for ${mintStr}`);
    return;
  }
  
  // Declare priceRatio at the top to avoid "Cannot access before initialization" errors
  // It will be calculated when we have valid prices
  let priceRatio: number | null = null;
  
  // Debug: Log entry values
  dbg(`[EXIT][DEBUG] manageExit started for ${mintStr}, entryPrice=${pos.entryPrice}, entryUsd=${pos.costSol}, entryLiquidityUsd=${pos.entryLiquidityUsd || 0}`);
  
  // Guard: skip TP/TSL if invalid entry price
  if (!isValidPrice(pos.entryPrice)) {
    dbg(`[EXIT][DEBUG] skip TP/TSL: invalid entryPrice for ${mintStr}`, { entryPrice: pos.entryPrice, isValid: isValidPrice(pos.entryPrice) });
    return;
  }

  // Use explicit mode instead of inferring from entryPrice
  // mode='tiny_entry' is set at position creation for actual probe positions
  // mode='normal' is used for all standard entries (including force-buy)
  const useTinyEntryMode = pos.mode === 'tiny_entry';
  
  if (useTinyEntryMode) {
    dbg(`[EXIT] Tiny-entry mode for ${short(mintStr)} (mode=${pos.mode}) — using absolute-price exit mode`);
  } else {
    dbg(`[EXIT] Normal mode for ${short(mintStr)} (mode=${pos.mode || 'normal'}) — using standard exit logic`);
  }

  // Simple exit strategy: auto-close at +20% (no early TP or trailing stop)
  // Phase tracking removed - we just exit at +20%

  let consecutivePriceFailures = 0;
  const MAX_PRICE_FAILURES = 12; // ~60s at 5s intervals
  const MAX_LOSS_PCT = -10; // Force exit at -10% loss (tighter protection)

  let lastPrice = pos.entryPrice;

  while (openPositions[mintStr]) {
    // Dynamic polling: check more frequently if price dropped significantly last check
    const priceDropFromHighPct = lastPrice > 0 && pos.highPrice > 0 
      ? ((pos.highPrice - lastPrice) / pos.highPrice) * 100 
      : 0;
    const pollInterval = priceDropFromHighPct > 20 ? 1000 : 5000; // 1s if >20% drop from high, else 5s
    
    await new Promise((r) => setTimeout(r, pollInterval));
    const price = await getQuotePrice(pos.mint);
    
    // Debug: Log price fetch
    dbg(`[EXIT][DEBUG] price=${price}, high=${pos.highPrice}, entry=${pos.entryPrice}, mint=${short(mintStr)}`);
    
    // Tiny entry mode: handle extremely small entry prices differently
    if (useTinyEntryMode) {
      // If price is null/unavailable → exit immediately (unreliable data)
      if (!price || !isValidPrice(price)) {
        dbg(`[EXIT] Tiny entry mode: price unavailable for ${short(mintStr)} - forcing exit`);
        try {
          const tx = await swapTokenForSOL(pos.mint, pos.qty);
          const solUsd = await getSolUsd();
          const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
          const entryUsd = pos.costSol * (solUsd || 0);
          const exitUsd = exitSol * (solUsd || 0);
          const pnlUsd = exitUsd - entryUsd;
          const pnlPct = entryUsd > 0 ? ((exitUsd - entryUsd) / entryUsd) * 100 : -100;
          
          const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
          const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
          const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
          
          await tgQueue.enqueue(() => bot.sendMessage(
            TELEGRAM_CHAT_ID,
            `⚠️ Tiny entry exit: <b>${tokenDisplay}</b>\n` +
            `Price unavailable (tiny entry price mode). Exiting to prevent loss.`,
            linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid, chartUrl })
          ), { chatId: TELEGRAM_CHAT_ID });
          
          recordTrade({
            t: Date.now(),
            kind: 'sell',
            mode: IS_PAPER ? 'paper' : 'live',
            mint: mintStr,
            alpha: pos.alpha,
            exitPriceSol: pos.entryPrice, // Use entry as estimate
            exitUsd,
            pnlSol: exitSol - pos.costSol,
            pnlUsd,
            pnlPct,
            durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
            tx: tx.txid,
          });
          
          dbg(`[EXIT] Position closed for ${short(mintStr)} | source=${pos.source || 'unknown'} | mode=${pos.mode || 'normal'} | reason=tiny_entry_unreliable_price | pnl=${pnlPct.toFixed(1)}%`);
          delete openPositions[mintStr];
          savePositions(serializeLivePositions(openPositions));
          return;
        } catch (err: any) {
          const result = await handleExitError(err, mintStr, pos, 'tiny_entry');
          if (result === 'removed') return;
          continue;
        }
      }
      
      // If price > entry by 10% → exit (fallback TP for tiny entries)
      if (price > pos.entryPrice * 1.1) {
        dbg(`[EXIT] Tiny entry mode: +10% gain detected for ${short(mintStr)} (${price.toExponential(3)} > ${pos.entryPrice.toExponential(3)} * 1.1)`);
        try {
          const tx = await swapTokenForSOL(pos.mint, pos.qty);
          const solUsd = await getSolUsd();
          const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
          const entryUsd = pos.costSol * (solUsd || 0);
          const exitUsd = exitSol * (solUsd || 0);
          const pnlUsd = exitUsd - entryUsd;
          const pnlPct = entryUsd > 0 ? ((exitUsd - entryUsd) / entryUsd) * 100 : 0;
          
          const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
          const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
          const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
          
          // Use actual costSol for entry display (not entryPrice which might be tiny)
          const entrySolDisplay = formatSol(pos.costSol);
          const exitSolDisplay = formatSol(exitSol);
          
          await tgQueue.enqueue(() => bot.sendMessage(
            TELEGRAM_CHAT_ID,
            `✅ Tiny entry TP hit: <b>${tokenDisplay}</b>\n` +
            `Gain: +${pnlPct.toFixed(1)}% (fallback TP for tiny entry)\n` +
            `Entry: ${entrySolDisplay} SOL → Exit: ${exitSolDisplay} SOL`,
            linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid, chartUrl })
          ), { chatId: TELEGRAM_CHAT_ID });
          
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
            pnlPct,
            durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
            tx: tx.txid,
          });
          
          dbg(`[EXIT] Position closed for ${short(mintStr)} | source=${pos.source || 'unknown'} | mode=${pos.mode || 'normal'} | reason=tiny_entry_tp | pnl=${pnlPct.toFixed(1)}%`);
          delete openPositions[mintStr];
          savePositions(serializeLivePositions(openPositions));
          return;
        } catch (err: any) {
          const result = await handleExitError(err, mintStr, pos, 'tiny_entry_tp');
          if (result === 'removed') return;
          continue;
        }
      }
      
      // Continue monitoring (price is valid but not yet at TP)
      consecutivePriceFailures = 0;
      lastPrice = price;
      if (price > pos.highPrice) pos.highPrice = price;
      continue; // Skip normal exit logic for tiny entries
    }
    
    // Record price fetch result for health monitoring
    if (!price || !isValidPrice(price)) {
      recordPriceFailure();
      consecutivePriceFailures++;
    } else {
      recordPriceSuccess();
      if (consecutivePriceFailures >= MAX_PRICE_FAILURES) {
        // Check if error is due to rate limiting - if so, just remove position without trying to swap
        const isRateLimited = typeof price === 'undefined' || 
          (typeof price === 'object' && price !== null && 'message' in price && 
           String(price.message || '').includes('rate limit') || 
           String(price.message || '').includes('429') ||
           String(price.message || '').includes('cooldown'));
        
        if (isRateLimited) {
          // Rate limited - just remove position without trying to swap
          dbg(`[EXIT] Removing position ${short(mintStr)} due to persistent rate limits (price unavailable)`);
          await alert(
            `⚠️ Position removed: <code>${short(mintStr)}</code>\n` +
            `Price unavailable due to rate limits. Position removed from tracking.`
          );
          delete openPositions[mintStr];
          savePositions(serializeLivePositions(openPositions));
          return;
        }
        
        // Not rate limited - try to force exit
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
          
          dbg(`[EXIT] Position closed for ${short(mintStr)} | source=${pos.source || 'unknown'} | mode=${pos.mode || 'normal'} | reason=dead_token | pnl=${pnlPct.toFixed(1)}%`);
          delete openPositions[mintStr];
          savePositions(serializeLivePositions(openPositions));
          return;
        } catch (err: any) {
          // If swap fails due to rate limits, just remove position
          const errMsg = String(err?.message || err || '');
          if (errMsg.includes('rate limit') || errMsg.includes('429') || errMsg.includes('cooldown')) {
            dbg(`[EXIT] Swap failed due to rate limits for ${short(mintStr)} - removing position`);
            await alert(
              `⚠️ Position removed: <code>${short(mintStr)}</code>\n` +
              `Exit failed due to rate limits. Position removed from tracking.`
            );
            dbg(`[EXIT] Position removed for ${short(mintStr)} | reason=rate_limit_removal`);
            delete openPositions[mintStr];
            savePositions(serializeLivePositions(openPositions));
            return;
          }
          // Other error - log but don't spam
          if (consecutivePriceFailures % 5 === 0) { // Only alert every 5th failure
            await alert(`❌ Dead token exit failed for ${short(mintStr)}: ${errMsg}`);
          }
        }
      }
      continue;
    }
    
    consecutivePriceFailures = 0; // Reset on successful price fetch
    lastPrice = price; // Update for next iteration's dynamic polling
    
    // Liquidity drop detection: Exit if liquidity drops >50% from entry (early warning of potential rug)
    if (pos.entryLiquidityUsd && pos.entryLiquidityUsd > 0) {
      const currentLiquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 10_000 }).catch(() => null);
      if (currentLiquidity?.ok && currentLiquidity.liquidityUsd !== null) {
        const liquidityDropPct = ((pos.entryLiquidityUsd - currentLiquidity.liquidityUsd) / pos.entryLiquidityUsd) * 100;
        if (liquidityDropPct > 50) {
          dbg(`[EXIT] Liquidity drop detected for ${short(mintStr)}: ${liquidityDropPct.toFixed(1)}% drop (${formatUsd(pos.entryLiquidityUsd)} → ${formatUsd(currentLiquidity.liquidityUsd)})`);
          try {
            const tx = await swapTokenForSOL(pos.mint, pos.qty);
            const solUsd = await getSolUsd();
            const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
            const entryUsd = pos.costSol * (solUsd || 0);
            const exitUsd = exitSol * (solUsd || 0);
            const pnlUsd = exitUsd - entryUsd;
            const pnlPct = entryUsd > 0 ? ((exitUsd - entryUsd) / entryUsd) * 100 : -100;
            
            const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
            const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
            const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
            
            await tgQueue.enqueue(() => bot.sendMessage(
              TELEGRAM_CHAT_ID,
              `⚠️ Liquidity drop exit: <b>${tokenDisplay}</b>\n` +
              `Liquidity dropped ${liquidityDropPct.toFixed(1)}% (${formatUsd(pos.entryLiquidityUsd)} → ${formatUsd(currentLiquidity.liquidityUsd)})\n` +
              `Exiting to prevent potential rug.`,
              linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid, chartUrl })
            ), { chatId: TELEGRAM_CHAT_ID });
            
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
              pnlPct,
              durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
              tx: tx.txid,
            });
            
            dbg(`[EXIT] Position closed for ${short(mintStr)} | source=${pos.source || 'unknown'} | mode=${pos.mode || 'normal'} | reason=liquidity_drop | pnl=${pnlPct.toFixed(1)}%`);
            delete openPositions[mintStr];
            savePositions(serializeLivePositions(openPositions));
            return;
          } catch (err: any) {
            const result = await handleExitError(err, mintStr, pos, 'liquidity_drop');
            if (result === 'removed') return;
            // Continue to other exit checks
          }
        }
      }
    }
    
    // Calculate priceRatio early if we have valid prices (used for multiple checks)
    if (isValidPrice(price) && isValidPrice(pos.entryPrice) && pos.entryPrice > 0) {
      const hi = Math.max(price, pos.entryPrice);
      const lo = Math.min(price, pos.entryPrice);
      priceRatio = hi / lo;
    }
    
    // Note: Price ratio check was already done above for milestone calculations
    // This check is for crashed token detection (different threshold)
    const priceRatioForCrash = priceRatio !== null ? priceRatio : Math.max(price / pos.entryPrice, pos.entryPrice / price);
    const priceDropFromEntryPct = priceRatio !== null && pos.entryPrice > 0 ? ((pos.entryPrice - price) / pos.entryPrice) * 100 : 0;
    
    if (priceRatioForCrash > 10) {
      // If price is extremely unreliable (>15x difference), likely token crashed - force exit
      // Also check if price dropped >90% (clear crash indicator)
      if (priceRatioForCrash > 15 || (priceRatioForCrash > 10 && priceDropFromEntryPct > 90)) {
        dbg(`[EXIT] Price extremely unreliable (${priceRatioForCrash.toFixed(1)}x) for ${short(mintStr)} - likely crashed, forcing exit`);
        try {
          const tx = await swapTokenForSOL(pos.mint, pos.qty);
          const solUsd = await getSolUsd();
          const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
          const entryUsd = pos.costSol * (solUsd || 0);
          const exitUsd = exitSol * (solUsd || 0);
          const pnlUsd = exitUsd - entryUsd;
          const pnlPct = entryUsd > 0 ? ((exitUsd - entryUsd) / entryUsd) * 100 : -100;
          
          // Get token name for display
          const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
          const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
          const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
          
          await tgQueue.enqueue(() => bot.sendMessage(
            TELEGRAM_CHAT_ID,
            `💀 Crashed token auto-exit: <b>${tokenDisplay}</b>\n` +
            `Price unreliable (${priceRatioForCrash.toFixed(0)}x off) - likely crashed. Forcing exit.`,
            linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid, chartUrl })
          ), { chatId: TELEGRAM_CHAT_ID });
          
          recordTrade({
            t: Date.now(),
            kind: 'sell',
            mode: IS_PAPER ? 'paper' : 'live',
            mint: mintStr,
            alpha: pos.alpha,
            exitPriceSol: price, // Use the unreliable price as estimate
            exitUsd,
            pnlSol: exitSol - pos.costSol,
            pnlUsd,
            pnlPct,
            durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
            tx: tx.txid,
          });
          
            dbg(`[EXIT] Position closed for ${short(mintStr)} | source=${pos.source || 'unknown'} | mode=${pos.mode || 'normal'} | reason=crashed_token | pnl=${pnlPct.toFixed(1)}%`);
            delete openPositions[mintStr];
            savePositions(serializeLivePositions(openPositions));
            return;
          } catch (err: any) {
            const result = await handleExitError(err, mintStr, pos, 'crashed');
            if (result === 'removed') return;
            continue; // Retry on next iteration
          }
      } else {
        // Price is unreliable but not extreme - skip max loss check but continue monitoring
        dbg(`[EXIT] Skipping max loss check for ${short(mintStr)}: price seems unreliable (ratio: ${priceRatio !== null ? priceRatio.toFixed(1) + 'x' : 'n/a'}, entry: ${pos.entryPrice.toExponential(3)}, current: ${price.toExponential(3)})`);
        continue; // Skip this iteration, wait for next price check
      }
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
        
        // Get token name for display
        const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
        const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
        const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
        
        await tgQueue.enqueue(() => bot.sendMessage(
          TELEGRAM_CHAT_ID,
          `🛡️ Max loss protection: <b>${tokenDisplay}</b>\n` +
          `Loss: ${currentLossPct.toFixed(1)}% (limit: ${MAX_LOSS_PCT}%)\n` +
          `Forcing exit to prevent further losses.`,
          linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid, chartUrl })
        ), { chatId: TELEGRAM_CHAT_ID });
        
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
        
        dbg(`[EXIT] Position closed for ${short(mintStr)} | source=${pos.source || 'unknown'} | mode=${pos.mode || 'normal'} | reason=max_loss | pnl=${currentLossPct.toFixed(1)}%`);
        delete openPositions[mintStr];
        savePositions(serializeLivePositions(openPositions));
        return;
      } catch (err: any) {
        const result = await handleExitError(err, mintStr, pos, 'max_loss');
        if (result === 'removed') return;
        continue; // Retry on next iteration
      }
    }

    if (price > pos.highPrice) pos.highPrice = price;
    
    // Sanity check: Don't use unreliable prices for gain calculations
    // priceRatio was already calculated above, but recalculate if null
    if (priceRatio === null && isValidPrice(price) && isValidPrice(pos.entryPrice) && pos.entryPrice > 0) {
      const hi = Math.max(price, pos.entryPrice);
      const lo = Math.min(price, pos.entryPrice);
      priceRatio = hi / lo;
    }
    
    if (priceRatio !== null && priceRatio > 10) {
      // Price is unreliable - skip milestone and profit calculations
      dbg(`[EXIT] Skipping milestone/profit calculations for ${short(mintStr)}: price unreliable (ratio: ${priceRatio.toFixed(1)}x, entry=${pos.entryPrice.toExponential(3)}, current=${price.toExponential(3)})`);
      continue;
    }
    
    // Auto-close at +20% gain (user requested - simple exit strategy)
    const gainPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
    
    // Debug: Log gain calculation
    dbg(`[EXIT][DEBUG] gainPct=${gainPct.toFixed(2)}% for ${short(mintStr)} (price=${price.toExponential(3)}, entry=${pos.entryPrice.toExponential(3)})`);
    
    // Sanity check: Gain percentage should be reasonable (between -99% and +10000%)
    if (!Number.isFinite(gainPct) || gainPct < -99 || gainPct > 10000) {
      dbg(`[EXIT] Skipping profit calculations for ${short(mintStr)}: invalid gainPct (${gainPct}), price=${price}, entryPrice=${pos.entryPrice}`);
      continue;
    }
    
    // Exit at +20% gain
    if (gainPct >= 20) {
      dbg(`[EXIT] Auto-close at +20% target hit for ${short(mintStr)}: ${gainPct.toFixed(1)}%`);
      try {
        const tx = await swapTokenForSOL(pos.mint, pos.qty);
        const solUsd = await getSolUsd();
        const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;
        const entryUsd = pos.costSol * (solUsd || 0);
        const exitUsd = exitSol * (solUsd || 0);
        const pnlUsd = exitUsd - entryUsd;
        const pnlPct = entryUsd > 0 ? ((exitUsd - entryUsd) / entryUsd) * 100 : 0;
        
        const liquidity = await getLiquidityResilient(mintStr, { retries: 1, cacheMaxAgeMs: 300_000 }).catch(() => null);
        const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
        const chartUrl = liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined;
        
        await tgQueue.enqueue(() => bot.sendMessage(
          TELEGRAM_CHAT_ID,
          `✅ Auto-close at +20%: <b>${tokenDisplay}</b>\n` +
          `Gain: +${gainPct.toFixed(1)}% (target: +20%)\n` +
          `Entry: ${formatSol(pos.entryPrice)} → Exit: ${formatSol(price)}`,
          linkRow({ mint: mintStr, alpha: pos.alpha, tx: tx.txid, chartUrl })
        ), { chatId: TELEGRAM_CHAT_ID });
        
        const summaryLine = solUsd ? 
          `💡 Bought ${formatUsd(entryUsd)} → Sold ${formatUsd(exitUsd)}  |  ` +
          `${(pnlUsd >= 0 ? '+' : '')}${formatUsd(pnlUsd)} (${(pnlPct >= 0 ? '+' : '')}${pnlPct.toFixed(1)}%)` : '';
        await tgQueue.enqueue(() => bot.sendMessage(TELEGRAM_CHAT_ID, summaryLine, { 
          parse_mode: 'HTML', 
          disable_web_page_preview: true 
        }), { chatId: TELEGRAM_CHAT_ID });
        
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
          pnlPct,
          durationSec: Math.floor((Date.now() - pos.entryTime) / 1000),
          tx: tx.txid,
        });
        
        dbg(`[EXIT] Position closed for ${short(mintStr)} | source=alpha | mode=${pos.mode || 'normal'} | reason=hard_profit_20pct | pnl=${pnlPct.toFixed(2)}%`);
        delete openPositions[mintStr];
        savePositions(serializeLivePositions(openPositions));
        return;
      } catch (err: any) {
        const result = await handleExitError(err, mintStr, pos, 'hard_profit');
        if (result === 'removed') return;
        // Continue to other exit checks
      }
    }
    
    // Milestone alerts: notify at 10% gain (before +20% exit)
    // Note: We exit at +20%, so milestones stop at 10%
    const milestones = [10];
    const lastMilestone = (pos as any).lastMilestone || 0;
    const nextMilestone = milestones.find(m => gainPct >= m && m > lastMilestone);
    
    if (nextMilestone) {
      (pos as any).lastMilestone = nextMilestone;
      const solUsd = await getSolUsd();
      const priceUsd = price * (solUsd || 0);
      const entryUsd = pos.costSol * (solUsd || 0);
      
      // Calculate unrealized PnL correctly: (current price - entry price) * token quantity
      const tokensHeld = Number(pos.qty);
      const unrealizedSol = (price - pos.entryPrice) * tokensHeld;
      const unrealizedUsd = unrealizedSol * (solUsd || 0);
      
      // Sanity check: Unrealized should be reasonable
      if (!Number.isFinite(unrealizedUsd) || Math.abs(unrealizedUsd) > entryUsd * 100) {
        dbg(`[EXIT] Skipping milestone alert for ${short(mintStr)}: invalid unrealizedUsd (${unrealizedUsd})`);
        continue;
      }
      
      const tag = IS_PAPER ? '[PAPER] ' : '';
      
      // Get token name for display
      const liquidity = await getLiquidityResilient(mintStr).catch(() => null);
      const tokenDisplay = liquidity?.tokenName || liquidity?.tokenSymbol || short(mintStr);
      
      await tgQueue.enqueue(() => bot.sendMessage(
        TELEGRAM_CHAT_ID,
        `${tag}🎉 Milestone: <b>${tokenDisplay}</b> hit +${nextMilestone}%!\n` +
        `Current: ${formatSol(price)}${solUsd ? ` (~${formatUsd(priceUsd)})` : ''}\n` +
        `Unrealized: ${(unrealizedUsd >= 0 ? '+' : '')}${formatUsd(unrealizedUsd)} (${(gainPct >= 0 ? '+' : '')}${gainPct.toFixed(1)}%)\n` +
        `Will auto-close at +20%`,
        linkRow({ mint: mintStr, alpha: pos.alpha, chartUrl: liquidity?.pairAddress ? `https://dexscreener.com/solana/${liquidity.pairAddress}` : undefined })
      ), { chatId: TELEGRAM_CHAT_ID });
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
        const result = await handleExitError(err, mintStr, pos, 'max_loss'); // Use max_loss type for sentry
        if (result === 'removed') return;
        // Continue sentry monitoring
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

// Self-healing health check system
// Checks bot health every 5 minutes and auto-fixes issues (silent - no messages unless issues found)
setInterval(async () => {
  try {
    const { active } = listAll();
    const health = await performHealthCheck(bot, connection, TELEGRAM_CHAT_ID, active.map(a => a.address));
    
    // Only alert if there are actual issues (not just degraded)
    if (health.telegram === 'down' || health.rpc === 'down') {
      console.warn('[HEALTH] Critical issues detected:', health.issues);
      const fixes = await attemptAutoFix(bot, connection, TELEGRAM_CHAT_ID);
      if (fixes.length > 0) {
        console.log('[HEALTH] Auto-fix attempts:', fixes);
        // Re-check health after fixes
        const recheck = await performHealthCheck(bot, connection, TELEGRAM_CHAT_ID, active.map(a => a.address));
        if (recheck.issues.length < health.issues.length) {
          await alert(`🔧 <b>Auto-fix applied</b>\n${fixes.join('\n')}\n\nHealth status:\n• Telegram: ${recheck.telegram}\n• RPC: ${recheck.rpc}\n• Price fetch: ${recheck.priceFetch}\n• Alpha monitoring: ${recheck.alphaMonitoring}`);
        }
      } else {
        // No fixes available - alert about critical issue
        await alert(`⚠️ <b>Critical health issue</b>\n${health.issues.join('\n')}\n\nBot may not be functioning correctly.`);
      }
    }
    // Don't send messages for degraded status - just log it
    else if (health.telegram !== 'healthy' || health.rpc !== 'healthy' || health.priceFetch !== 'healthy') {
      console.warn('[HEALTH] Degraded status (silent):', health.issues);
    }
  } catch (err) {
    console.error('[HEALTH] Health check failed:', err);
  }
}, 5 * 60_000); // Check every 5 minutes (reduced from 2 minutes to reduce load)

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
  console.log(`[CONFIG] MAX_SIGNAL_AGE_SEC = ${MAX_SIGNAL_AGE_SEC}s (${MAX_SIGNAL_AGE_SEC / 60} minutes)`);
  if (USE_HELIUS_RPC) {
    const maskedKey = HELIUS_API_KEY ? `${HELIUS_API_KEY.slice(0, 8)}...${HELIUS_API_KEY.slice(-4)}` : 'extracted from URL';
    console.log(`✅ Helius RPC enabled (API key: ${maskedKey})`);
  } else if (RPC_URL.includes('helius') && !HELIUS_API_KEY) {
    console.log(`⚠️  Helius RPC URL detected but no API key found`);
  }
  console.log(`📍 Wallet: ${walletKeypair.publicKey.toBase58()}`);
  console.log(`[CONFIG] BUY_SOL = ${BUY_SOL} SOL (applied to alpha, watchlist and force-buy)`);
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

  // Build improved system-start message
  const modeLabel = IS_PAPER ? 'PAPER' : 'LIVE';
  const modeEmoji = IS_PAPER ? '🚀' : '⚡';
  const modePrefix = IS_PAPER ? '[PAPER]' : '[LIVE]';
  const liveWarning = !IS_PAPER ? '\n(REAL MONEY MODE)' : '';
  
  const walletShort = short(walletKeypair.publicKey.toBase58());
  const buySizeDisplay = formatSol(BUY_SOL);
  const tpPercent = Math.round(EARLY_TP_PCT * 100);
  const trailPercent = Math.round(TRAIL_STOP_PCT * 100);
  const minLiquidityDisplay = formatUsd(MIN_LIQUIDITY_USD_ALPHA);
  const activeWatchers = ACTIVE_ALPHAS.length;
  const candidateCount = CANDIDATE_ALPHAS.length;
  
  // Get version from package.json (synchronous read)
  let botVersion = '1.0.0';
  try {
    const pkgContent = fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8');
    const pkg = JSON.parse(pkgContent);
    botVersion = pkg.version || '1.0.0';
  } catch {
    // Fallback if package.json not available
  }
  
  const startTime = new Date().toISOString();
  
  await alert(
    [
      `${modePrefix} ${modeEmoji} <b>Alpha Snipes Bot Started</b>${liveWarning}`,
      `Mode: <b>${modeLabel}</b>`,
      `Wallet: <code>${walletShort}</code>`,
      `Buy Size: ${buySizeDisplay}`,
      `Take-Profit: +${tpPercent}%`,
      `Trailing Stop: ${trailPercent}%`,
      `Sentry Window: ${SENTRY_WINDOW_SEC}s`,
      `Max Signal Age: ${MAX_SIGNAL_AGE_SEC}s`,
      `Liquidity Guard: ≥ ${minLiquidityDisplay}`,
      `Watchers Active: ${activeWatchers}`,
      `Candidates Monitoring: ${candidateCount}`,
      `\nVersion: ${botVersion}`,
      `Started: ${startTime}`,
    ].join('\n')
  );

  // Start watching all alphas
  refreshWatchers();

  // Scan recent transactions for missed signals during downtime
  // Enhanced: Now scans last 15 minutes (was 5 min) for better catch rate
  if (ACTIVE_ALPHAS.length > 0) {
    console.log('🔍 Scanning recent transactions (last 15 min) for missed alpha signals...');
    scanRecentAlphaTransactions().catch((err) => {
      console.error('[STARTUP] Scan failed:', err);
    });
    
    // Birdeye backfill: catch any missed trades from Birdeye
    if (process.env.BIRDEYE_API_KEY) {
      console.log('🔍 Birdeye backfill: checking for missed alpha trades...');
      birdeyeStartupBackfill().catch((err) => {
        console.error('[STARTUP] Birdeye backfill failed:', err);
      });
    }
  }
  
  // Restart exit managers for all loaded positions
  const loadedPositions = Object.keys(openPositions);
  if (loadedPositions.length > 0) {
    console.log(`🔄 Restarting exit managers for ${loadedPositions.length} loaded position(s)...`);
    for (const mintStr of loadedPositions) {
      const pos = openPositions[mintStr];
      if (!pos) continue;
      
      // Restart exit manager (but not sentry, as sentry window has passed)
      manageExit(mintStr).catch((err) => {
        console.error(`[STARTUP] Failed to restart exit manager for ${short(mintStr)}:`, err);
      });
    }
    console.log('✅ Exit managers restarted');
  }
}

async function scanRecentAlphaTransactions() {
  const SCAN_WINDOW_MS = 15 * 60 * 1000; // Last 15 minutes (enhanced from 5 min for better catch rate)
  const now = Date.now();
  const since = now - SCAN_WINDOW_MS;

  for (const alpha of ACTIVE_ALPHAS) {
    try {
      const pk = new PublicKey(alpha);
      const sigs = await connection.getSignaturesForAddress(pk, {
        limit: 100, // Increased from 50 to cover longer time window
        until: undefined,
      });

      for (const sigInfo of sigs) {
        if (!sigInfo.blockTime) continue;
        const txTime = sigInfo.blockTime * 1000;
        if (txTime < since) break; // Too old

        // Check if we already processed this signature
        if (seenSignatures.has(sigInfo.signature)) continue;

        // Retry logic for failed transactions
        let retries = 2;
        let success = false;
        while (retries > 0 && !success) {
          try {
            seenSignatures.add(sigInfo.signature); // Mark as seen before processing
            await handleAlphaTransaction(sigInfo.signature, alpha, 'active');
            success = true;
          } catch (err: any) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
            } else {
              dbg(`[SCAN] Failed to process ${sigInfo.signature.slice(0, 8)} after retries: ${err.message || err}`);
            }
          }
        }
      }
    } catch (err: any) {
      // Retry on RPC errors
      if (err.message?.includes('429') || err.message?.includes('rate limit')) {
        console.warn(`[SCAN] Rate limit hit for ${short(alpha)}, retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Retry once
        try {
          const pk = new PublicKey(alpha);
          const sigs = await connection.getSignaturesForAddress(pk, {
            limit: 100,
            until: undefined,
          });
          // Process retry (same logic as above, but simplified)
          for (const sigInfo of sigs) {
            if (!sigInfo.blockTime) continue;
            const txTime = sigInfo.blockTime * 1000;
            if (txTime < since) break;
            if (seenSignatures.has(sigInfo.signature)) continue;
            try {
              seenSignatures.add(sigInfo.signature);
              await handleAlphaTransaction(sigInfo.signature, alpha, 'active');
            } catch (retryErr: any) {
              dbg(`[SCAN] Retry failed for ${sigInfo.signature.slice(0, 8)}: ${retryErr.message || retryErr}`);
            }
          }
        } catch (retryErr: any) {
          console.warn(`[SCAN] Retry failed for ${short(alpha)}: ${retryErr.message || retryErr}`);
        }
      } else {
        console.warn(`[SCAN] Failed to scan ${short(alpha)}: ${err.message || err}`);
      }
    }
  }

  console.log('✅ Startup scan complete');
}

/**
 * Birdeye startup backfill: Fetch missed alpha trades from Birdeye
 * This catches trades that RPC might have missed during downtime
 */
async function birdeyeStartupBackfill() {
  if (!process.env.BIRDEYE_API_KEY) {
    return;
  }

  const BACKFILL_WINDOW_SEC = 30 * 60; // Last 30 minutes (increased to catch more missed transactions)
  const now = Math.floor(Date.now() / 1000);
  const since = now - BACKFILL_WINDOW_SEC;

  for (const alpha of ACTIVE_ALPHAS) {
    try {
      console.log(`[BIRDEYE] Fetching trades for ${short(alpha)} since ${new Date(since * 1000).toISOString()}...`);
      const trades = await fetchWalletTradesSince(alpha, since);

      if (trades.length === 0) {
        dbg(`[BIRDEYE] No trades found for ${short(alpha)} in last 5 minutes`);
        continue;
      }

      console.log(`[BIRDEYE] Found ${trades.length} trade(s) for ${short(alpha)}`);

      // Process BUY trades only
      for (const trade of trades) {
        if (trade.side !== 'buy') {
          dbg(`[BIRDEYE] Skipping ${trade.side} trade for ${short(trade.mint)}`);
          continue;
        }

        const mint = trade.mint;
        
        // Skip if already seen
        if (seenMints.has(mint)) {
          dbg(`[BIRDEYE] Mint ${short(mint)} already seen, skipping`);
          continue;
        }

        // Skip if transaction already processed
        if (seenSignatures.has(trade.txHash)) {
          dbg(`[BIRDEYE] TX ${trade.txHash.slice(0, 8)} already processed, skipping`);
          continue;
        }

        // Convert Birdeye trade to AlphaSignal format
        const solSpent = trade.amountSol || 0;
        const tokenDelta = trade.amountToken || 0;
        
        // Validate trade meets minimum thresholds
        if (solSpent < DUST_SOL_SPENT) {
          dbg(`[BIRDEYE] Trade SOL spent ${solSpent.toFixed(6)} < dust ${DUST_SOL_SPENT}, skipping`);
          continue;
        }

        if (tokenDelta < MIN_ALPHA_TOKEN_BALANCE) {
          dbg(`[BIRDEYE] Trade token amount ${tokenDelta.toFixed(6)} < min ${MIN_ALPHA_TOKEN_BALANCE}, skipping`);
          continue;
        }

        const alphaEntryPrice = tokenDelta > 0 ? solSpent / tokenDelta : 0;
        if (!isValidPrice(alphaEntryPrice)) {
          dbg(`[BIRDEYE] Invalid entry price ${alphaEntryPrice} for ${short(mint)}, skipping`);
          continue;
        }

        const blockTimeMs = trade.timestamp * 1000;
        const signalAgeSec = Math.max(0, (Date.now() - blockTimeMs) / 1000);

        // Check time window guard
        if (signalAgeSec > MAX_SIGNAL_AGE_SEC) {
          dbg(
            `[BIRDEYE] Trade age ${signalAgeSec.toFixed(1)}s > max ${MAX_SIGNAL_AGE_SEC}s, skipping`
          );
          continue;
        }

        const signal: AlphaSignal = {
          mint,
          solSpent,
          tokenDelta,
          alphaEntryPrice,
          alphaPreBalance: 0, // Birdeye doesn't provide this
          alphaPostBalance: tokenDelta,
          blockTimeMs,
          signalAgeSec,
          source: 'birdeye',
          txHash: trade.txHash,
        };

        dbg(
          `[BIRDEYE] BUY signal | source=birdeye | Alpha: ${short(alpha)} | Mint: ${short(
            mint
          )} | solSpent=${solSpent.toFixed(4)} | tokens=${tokenDelta.toFixed(2)} | entryPrice=${alphaEntryPrice.toExponential(3)}`
        );

        seenMints.add(mint);
        seenSignatures.add(trade.txHash);

        // Execute copy trade
        await executeCopyTradeFromSignal({
          signal,
          alpha,
          txSig: trade.txHash,
          source: 'alpha',
          notifyTouch: true,
          skipTimeGuard: true, // Already checked above
        });
      }
    } catch (err: any) {
      console.error(`[BIRDEYE] Backfill failed for ${short(alpha)}: ${err.message || err}`);
    }
  }

  console.log('✅ Birdeye backfill complete');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

