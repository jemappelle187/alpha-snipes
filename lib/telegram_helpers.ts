// lib/telegram_helpers.ts
// Utility helpers to generate Telegram inline keyboard rows for Solana explorer links.
// Used for mint, alpha wallet, and transaction shortcuts.

export interface LinkRowOptions {
  mint?: string;
  alpha?: string;
  tx?: string;
  chartUrl?: string; // Optional DexScreener chart URL
  extraRows?: Array<{ text: string; url: string }[]>; // optional extra buttons below main row
}

/**
 * Build Telegram inline keyboard rows with Solscan links for mint, alpha wallet, tx, and CoinGecko chart.
 * - Auto-skips undefined values.
 * - Adds emojis for easy recognition.
 * - Returns object ready for sendMessage() / reply().
 * - Supports optional extraRows for flexible layout (future use).
 */
export function linkRow({ mint, alpha, tx, chartUrl, extraRows }: LinkRowOptions) {
  const row: Array<{ text: string; url: string }> = [];

  if (mint) {
    row.push({ text: '🪙 Mint', url: `https://solscan.io/address/${mint}` });
    // Add chart link (DexScreener if provided, otherwise CoinGecko fallback)
    if (chartUrl) {
      row.push({ text: '📈 Chart', url: chartUrl });
    } else {
      // Fallback to DexScreener search
      row.push({ text: '📈 Chart', url: `https://dexscreener.com/solana/${mint}` });
    }
  }
  if (alpha) row.push({ text: '👤 Alpha', url: `https://solscan.io/address/${alpha}` });
  if (tx) row.push({ text: '🔗 TX', url: `https://solscan.io/tx/${tx}` });

  // Combine with optional extra rows (if provided)
  const inline_keyboard = [row, ...(extraRows || [])].filter(r => r.length > 0);

  return {
    reply_markup: { inline_keyboard },
    parse_mode: 'HTML' as const,
    disable_web_page_preview: true,
  };
}



