// lib/telegram_rate.ts
type Task<T = any> = {
  fn: () => Promise<T>;
  chatId?: string | number;
  resolve: (val: T) => void;
  reject: (err: any) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function extractRetryAfter(e: any): number | undefined {
  // telegraf/grammy errors often include "retry after X" or have e.parameters.retry_after
  const p = e?.parameters?.retry_after;
  if (typeof p === 'number') return (p + 1) * 1000;
  const m = /retry after (\d+)/i.exec(String(e?.description || e?.message || ''));
  if (m && m[1]) return (parseInt(m[1], 10) + 1) * 1000;
  return undefined;
}

class RateQueue {
  private q: Task[] = [];
  private running = false;
  private gapMs = 350; // ~2.8 rps global. Safer for bursts.
  private lastByChat = new Map<string | number, number>();
  private perChatGapMs = 900; // ~1 msg per chat per ~1s

  enqueue<T>(fn: () => Promise<T>, opts?: { chatId?: string | number }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.q.push({
        fn,
        chatId: opts?.chatId,
        resolve: resolve as any,
        reject,
      });
      this.run();
    });
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    
    while (this.q.length) {
      const item = this.q.shift()!;
      const now = Date.now();
      
      // Per-chat spacing
      if (item.chatId != null) {
        const last = this.lastByChat.get(item.chatId) ?? 0;
        const wait = Math.max(0, this.perChatGapMs - (now - last));
        if (wait > 0) {
          this.q.unshift(item); // Put it back
          await sleep(wait);
          continue;
        }
        this.lastByChat.set(item.chatId, now);
      }
      
      // Execute with retry_after handling
      try {
        const res = await item.fn();
        item.resolve(res);
      } catch (e: any) {
        const retry = extractRetryAfter(e);
        if (retry) {
          console.warn(`[TG] 429 detected, sleeping ${retry}ms`);
          await sleep(retry);
        }
        item.reject(e);
      }
      
      // Global spacing
      await sleep(this.gapMs);
    }
    
    this.running = false;
  }
}

export const tgQueue = new RateQueue();

