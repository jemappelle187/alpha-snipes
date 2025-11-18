// lib/pricing.ts
// Safe P&L calculation helpers

export type PriceReliability = "ok" | "unavailable";

export interface Position {
  entryPrice: number;
  costSol: number;
  tokens?: bigint;
  [key: string]: any; // Allow other fields
}

export function computePnlPct(
  position: Position,
  currentPrice: number | null
): {
  pnlPct: number | null;
  reliability: PriceReliability;
} {
  const entry = position.entryPrice;
  
  if (!entry || entry <= 0 || currentPrice === null || currentPrice <= 0) {
    return { pnlPct: null, reliability: "unavailable" };
  }

  const pnlPct = ((currentPrice - entry) / entry) * 100;
  
  if (!Number.isFinite(pnlPct)) {
    return { pnlPct: null, reliability: "unavailable" };
  }

  return { pnlPct, reliability: "ok" };
}

/**
 * Helper: recompute entry price if it was accidentally stored as 0
 */
export function getEffectiveEntryPrice(position: Position): number | null {
  if (position.entryPrice && position.entryPrice > 0) {
    return position.entryPrice;
  }

  // Fallback: compute from costSol and tokens if available
  if (position.costSol > 0 && position.tokens && position.tokens > 0n) {
    const computed = position.costSol / Number(position.tokens);
    if (Number.isFinite(computed) && computed > 0) {
      return computed;
    }
  }

  return null;
}

