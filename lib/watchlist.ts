import fs from 'fs';
import path from 'path';

export type WatchlistEntry = {
  mint: string;
  alpha: string;
  reason: string;
  alphaEntryPrice?: number;
  solSpent?: number;
  tokenDelta?: number;
  txSig?: string;
  addedAt: number;
  lastChecked: number;
  checkCount: number;
};

type WatchlistStore = Record<string, WatchlistEntry>;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): WatchlistStore {
  try {
    const raw = fs.readFileSync(WATCHLIST_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as WatchlistStore;
    }
  } catch {
    // ignore
  }
  return {};
}

let store: WatchlistStore = load();

function persist() {
  try {
    ensureDir();
    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.warn('[WATCHLIST] Persist failed:', err);
  }
}

export function getWatchlistEntries(): WatchlistEntry[] {
  return Object.values(store);
}

export function getWatchlistEntry(mint: string): WatchlistEntry | undefined {
  return store[mint];
}

export function addToWatchlist(entry: {
  mint: string;
  alpha: string;
  reason: string;
  alphaEntryPrice?: number;
  solSpent?: number;
  tokenDelta?: number;
  txSig?: string;
}): WatchlistEntry {
  const now = Date.now();
  const existing = store[entry.mint];
  const merged: WatchlistEntry = {
    mint: entry.mint,
    alpha: entry.alpha,
    reason: entry.reason,
    addedAt: existing?.addedAt ?? now,
    lastChecked: existing?.lastChecked ?? 0,
    checkCount: existing?.checkCount ?? 0,
    alphaEntryPrice: entry.alphaEntryPrice ?? existing?.alphaEntryPrice,
    solSpent: entry.solSpent ?? existing?.solSpent,
    tokenDelta: entry.tokenDelta ?? existing?.tokenDelta,
    txSig: entry.txSig ?? existing?.txSig,
  };
  store[entry.mint] = merged;
  persist();
  return merged;
}

export function removeFromWatchlist(mint: string) {
  if (!(mint in store)) return;
  delete store[mint];
  persist();
}

export function markChecked(mint: string, when: number = Date.now()) {
  const entry = store[mint];
  if (!entry) return;
  entry.lastChecked = when;
  entry.checkCount += 1;
  persist();
}

export function pruneExpired(maxAgeMs: number): WatchlistEntry[] {
  if (!maxAgeMs || maxAgeMs <= 0) return [];
  const now = Date.now();
  const removed: WatchlistEntry[] = [];
  for (const entry of Object.values(store)) {
    if (now - entry.addedAt > maxAgeMs) {
      removed.push(entry);
      delete store[entry.mint];
    }
  }
  if (removed.length) persist();
  return removed;
}

export function nextEntriesToCheck(intervalMs: number): WatchlistEntry[] {
  const now = Date.now();
  return Object.values(store).filter((entry) => {
    if (!entry.lastChecked) return true;
    return now - entry.lastChecked >= intervalMs;
  });
}

