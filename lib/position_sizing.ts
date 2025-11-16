export type PositionSizingInput = {
  baseBuySol: number;
  minBuySol: number;
  maxBuySol: number;
  liquidityUsd: number;
  alphaSolSpent?: number;
  signalAgeSec?: number;
  watchlistRetry?: boolean;
  liquidityPenalty?: number; // Multiplier when liquidity is unknown (e.g., 0.5 = half size)
};

export type PositionSizingResult = {
  sizeSol: number;
  multiplier: number;
  notes: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computePositionSize(input: PositionSizingInput): PositionSizingResult {
  const notes: string[] = [];
  const {
    baseBuySol,
    minBuySol,
    maxBuySol,
    liquidityUsd,
    alphaSolSpent = baseBuySol,
    signalAgeSec = 0,
    watchlistRetry = false,
    liquidityPenalty,
  } = input;

  let multiplier = 1;

  const liq = Math.max(0, liquidityUsd);
  let liquidityFactor = 1;
  if (liq < 10000) liquidityFactor = 0.5;
  else if (liq < 25000) liquidityFactor = 0.75;
  else if (liq < 50000) liquidityFactor = 1;
  else if (liq < 100000) liquidityFactor = 1.15;
  else liquidityFactor = 1.3;
  multiplier *= liquidityFactor;
  
  if (liquidityPenalty !== undefined) {
    // Apply penalty when liquidity is unknown (provider error)
    multiplier *= liquidityPenalty;
    notes.push(`Liquidity penalty: ${liquidityPenalty.toFixed(2)}x (liquidity unknown due to provider error)`);
  } else {
    notes.push(`Liquidity factor: ${liquidityFactor.toFixed(2)} (liq=$${liq.toFixed(0)})`);
  }

  const spendRatio = clamp(alphaSolSpent / Math.max(baseBuySol, 1e-9), 0, 5);
  const alphaFactor =
    spendRatio >= 3 ? 1.25 : spendRatio >= 1.5 ? 1.1 : spendRatio >= 0.75 ? 1 : 0.8;
  multiplier *= alphaFactor;
  notes.push(`Alpha spend factor: ${alphaFactor.toFixed(2)} (ratio=${spendRatio.toFixed(2)})`);

  const age = Math.max(0, signalAgeSec);
  const ageFactor = age <= 10 ? 1.05 : age <= 30 ? 1 : age <= 60 ? 0.85 : 0.7;
  multiplier *= ageFactor;
  notes.push(`Signal age factor: ${ageFactor.toFixed(2)} (${age.toFixed(1)}s old)`);

  if (watchlistRetry) {
    multiplier *= 0.8;
    notes.push('Watchlist penalty: 0.80 (retry trade)');
  }

  const unclampedSize = baseBuySol * multiplier;
  const sizeSol = clamp(unclampedSize, minBuySol, maxBuySol);
  const finalMultiplier = sizeSol / Math.max(baseBuySol, 1e-9);

  notes.push(
    `Result: ${sizeSol.toFixed(4)} SOL (clamped between ${minBuySol} and ${maxBuySol}, ×${finalMultiplier.toFixed(
      2
    )})`
  );

  return {
    sizeSol: Number(sizeSol.toFixed(6)),
    multiplier: Number(finalMultiplier.toFixed(2)),
    notes,
  };
}

