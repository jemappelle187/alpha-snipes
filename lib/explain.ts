// lib/explain.ts

export function explainSkip(code: string): string {
  switch (code) {
    case 'authority_not_revoked':
      return 'Creator can still mint more tokens (rug risk) — skipped by safety rule.';
    case 'freeze_not_revoked':
      return 'Creator can freeze token accounts (rug risk) — skipped by safety rule.';
    case 'high_tax':
      return 'Token has high buy/sell taxes that would eat into profits — skipped.';
    case 'no_route_buy_429':
      return 'Jupiter rate-limited (429). We will cool down briefly and retry.';
    case 'no_route_buy_400':
      return 'Jupiter could not build a route for this amount/token right now.';
    case 'no_route':
      return 'No liquidity route available on Jupiter for this token pair.';
    case 'price_impact_too_high':
      return 'Price impact exceeds safety threshold — not enough liquidity.';
    case 'invalid_entry_price':
      return 'Could not determine a valid entry price (NaN/zero) — skipped for safety.';
    case 'quote_skipped_cooldown':
      return 'Temporary cooldown after previous error (429/400) — will retry automatically.';
    case 'quote_skipped_rate_limit':
      return 'Rate limiter active to prevent API overload — will retry shortly.';
    case 'dns_lookup_failed':
      return 'Network connectivity issue (DNS failure) — check RPC/network connection.';
    default:
      return 'Conditions not met for a safe buy.';
  }
}

