import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';

export type PositionMode = 'normal' | 'tiny_entry';

export type CopyTradeSource = 'alpha' | 'watchlist' | 'force';

export type StoredPosition = {
  mint: string;
  qty: string;
  costSol: number;
  entryPrice: number;
  highPrice: number;
  entryTime: number;
  alpha?: string;
  phase?: 'early' | 'trailing';
  entryLiquidityUsd?: number;
  mode?: PositionMode; // Explicit mode: 'normal' for standard entries, 'tiny_entry' for probe positions
  source?: CopyTradeSource; // Track source for exit logs (alpha/watchlist/force)
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const POS_FILE = path.join(DATA_DIR, 'positions.json');

export type PositionMap = Record<string, StoredPosition>;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadPositions(): PositionMap {
  try {
    const raw = fs.readFileSync(POS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      return obj as PositionMap;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function savePositions(positions: PositionMap) {
  try {
    ensureDir();
    fs.writeFileSync(POS_FILE, JSON.stringify(positions, null, 2));
  } catch (err) {
    console.warn('[POSITIONS] Failed to persist positions:', err);
  }
}

export function serializeLivePositions(
  openPositions: Record<
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
      entryLiquidityUsd?: number;
      mode?: PositionMode;
      source?: CopyTradeSource;
    }
  >
): PositionMap {
  const out: PositionMap = {};
  for (const [mint, pos] of Object.entries(openPositions)) {
    out[mint] = {
      mint,
      qty: pos.qty.toString(),
      costSol: pos.costSol,
      entryPrice: pos.entryPrice,
      highPrice: pos.highPrice,
      entryTime: pos.entryTime,
      alpha: pos.alpha,
      phase: pos.phase,
      entryLiquidityUsd: pos.entryLiquidityUsd,
      mode: pos.mode || 'normal', // Default to 'normal' for backward compatibility
      source: pos.source, // Preserve source for exit logs
    };
  }
  return out;
}

export function hydratePositions(data: PositionMap) {
  const out: Record<string, {
    mint: PublicKey;
    qty: bigint;
    costSol: number;
    entryPrice: number;
    highPrice: number;
    entryTime: number;
    alpha?: string;
    phase?: 'early' | 'trailing';
    entryLiquidityUsd?: number;
    mode?: PositionMode;
    source?: CopyTradeSource;
  }> = {};

  for (const entry of Object.values(data)) {
    try {
      const mintPk = new PublicKey(entry.mint);
      out[entry.mint] = {
        mint: mintPk,
        qty: BigInt(entry.qty),
        costSol: entry.costSol,
        entryPrice: entry.entryPrice,
        highPrice: entry.highPrice ?? entry.entryPrice,
        entryTime: entry.entryTime,
        alpha: entry.alpha,
        phase: entry.phase ?? 'early',
        entryLiquidityUsd: entry.entryLiquidityUsd,
        mode: entry.mode || 'normal', // Default to 'normal' for backward compatibility
        source: entry.source, // Preserve source for exit logs
      };
    } catch (err) {
      console.warn('[POSITIONS] Failed to hydrate entry', entry.mint, err);
    }
  }

  return out;
}

