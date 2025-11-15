// lib/health_check.ts
// Self-healing health check system for the bot

import { Connection } from '@solana/web3.js';
import TelegramBot from 'node-telegram-bot-api';

export type HealthStatus = {
  telegram: 'healthy' | 'degraded' | 'down';
  rpc: 'healthy' | 'degraded' | 'down';
  priceFetch: 'healthy' | 'degraded' | 'down';
  alphaMonitoring: 'healthy' | 'degraded' | 'down';
  lastCheck: number;
  issues: string[];
};

let healthStatus: HealthStatus = {
  telegram: 'healthy',
  rpc: 'healthy',
  priceFetch: 'healthy',
  alphaMonitoring: 'healthy',
  lastCheck: Date.now(),
  issues: [],
};

let consecutiveTelegramFailures = 0;
let consecutiveRPCFailures = 0;
let consecutivePriceFailures = 0;
let lastAlphaSignalTime = Date.now();

const MAX_TELEGRAM_FAILURES = 3;
const MAX_RPC_FAILURES = 5;
const MAX_PRICE_FAILURES = 10;
const MAX_ALPHA_SILENCE_MS = 10 * 60 * 1000; // 10 minutes

export async function checkTelegramHealth(bot: TelegramBot, chatId: number): Promise<boolean> {
  try {
    // Try to get bot info (lightweight check)
    await bot.getMe();
    
    // Try to send a test message (more thorough)
    try {
      await bot.sendMessage(chatId, '💓 Health check', { disable_notification: true });
    } catch (err: any) {
      // If chat doesn't exist or bot was removed, that's a real issue
      if (err.response?.statusCode === 400 || err.response?.statusCode === 403) {
        consecutiveTelegramFailures++;
        return false;
      }
      // Other errors might be temporary
    }
    
    consecutiveTelegramFailures = 0;
    return true;
  } catch (err: any) {
    consecutiveTelegramFailures++;
    console.warn('[HEALTH] Telegram check failed:', err.message || err);
    return false;
  }
}

export async function checkRPCHealth(connection: Connection): Promise<boolean> {
  try {
    const slot = await connection.getSlot('confirmed');
    if (slot > 0) {
      consecutiveRPCFailures = 0;
      return true;
    }
    consecutiveRPCFailures++;
    return false;
  } catch (err: any) {
    consecutiveRPCFailures++;
    console.warn('[HEALTH] RPC check failed:', err.message || err);
    return false;
  }
}

export async function checkPriceFetchHealth(): Promise<boolean> {
  // Price fetch health is tracked externally via consecutivePriceFailures
  // This is just a status check
  return consecutivePriceFailures < MAX_PRICE_FAILURES;
}

export function checkAlphaMonitoringHealth(activeAlphas: string[]): boolean {
  const now = Date.now();
  const silenceDuration = now - lastAlphaSignalTime;
  
  if (activeAlphas.length === 0) {
    return true; // No alphas to monitor, so it's "healthy"
  }
  
  // If we have active alphas but no signals for >10 minutes, something might be wrong
  if (silenceDuration > MAX_ALPHA_SILENCE_MS) {
    return false;
  }
  
  return true;
}

export function recordAlphaSignal() {
  lastAlphaSignalTime = Date.now();
}

export function recordPriceFailure() {
  consecutivePriceFailures++;
}

export function recordPriceSuccess() {
  consecutivePriceFailures = 0;
}

export async function performHealthCheck(
  bot: TelegramBot,
  connection: Connection,
  chatId: number,
  activeAlphas: string[]
): Promise<HealthStatus> {
  const issues: string[] = [];
  
  // Check Telegram
  const telegramOk = await checkTelegramHealth(bot, chatId);
  if (!telegramOk) {
    healthStatus.telegram = consecutiveTelegramFailures >= MAX_TELEGRAM_FAILURES ? 'down' : 'degraded';
    issues.push(`Telegram: ${consecutiveTelegramFailures} consecutive failures`);
  } else {
    healthStatus.telegram = 'healthy';
  }
  
  // Check RPC
  const rpcOk = await checkRPCHealth(connection);
  if (!rpcOk) {
    healthStatus.rpc = consecutiveRPCFailures >= MAX_RPC_FAILURES ? 'down' : 'degraded';
    issues.push(`RPC: ${consecutiveRPCFailures} consecutive failures`);
  } else {
    healthStatus.rpc = 'healthy';
  }
  
  // Check price fetch
  const priceOk = checkPriceFetchHealth();
  if (!priceOk) {
    healthStatus.priceFetch = 'degraded';
    issues.push(`Price fetch: ${consecutivePriceFailures} consecutive failures`);
  } else {
    healthStatus.priceFetch = 'healthy';
  }
  
  // Check alpha monitoring
  const alphaOk = checkAlphaMonitoringHealth(activeAlphas);
  if (!alphaOk) {
    healthStatus.alphaMonitoring = 'degraded';
    const silenceMinutes = Math.floor((Date.now() - lastAlphaSignalTime) / 60000);
    issues.push(`Alpha monitoring: No signals for ${silenceMinutes} minutes`);
  } else {
    healthStatus.alphaMonitoring = 'healthy';
  }
  
  healthStatus.issues = issues;
  healthStatus.lastCheck = Date.now();
  
  return healthStatus;
}

export function getHealthStatus(): HealthStatus {
  return { ...healthStatus };
}

export async function attemptAutoFix(
  bot: TelegramBot,
  connection: Connection,
  chatId: number
): Promise<string[]> {
  const fixes: string[] = [];
  
  // Fix Telegram issues
  if (healthStatus.telegram !== 'healthy') {
    try {
      // Try to clear webhook and ensure polling mode
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
      fixes.push('Telegram: Cleared webhook, ensuring polling mode');
    } catch (err) {
      fixes.push(`Telegram: Auto-fix failed: ${err}`);
    }
  }
  
  // Fix RPC issues
  if (healthStatus.rpc !== 'healthy') {
    try {
      // Try to reconnect by getting slot
      await connection.getSlot('confirmed');
      fixes.push('RPC: Reconnected successfully');
    } catch (err) {
      fixes.push(`RPC: Auto-fix failed: ${err}`);
    }
  }
  
  return fixes;
}

