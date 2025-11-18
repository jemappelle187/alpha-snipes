#!/usr/bin/env tsx
/**
 * Alpha Speed Benchmark Tool
 * 
 * Parses [BENCH][ALPHA] lines from PM2 logs and prints latency stats.
 * 
 * Usage:
 *   pm2 logs alpha-snipes-paper --lines 500 | grep "[BENCH][ALPHA]" | npm run alpha:bench
 *   OR
 *   npm run alpha:bench < logfile.txt
 */

import * as readline from 'readline';
import * as fs from 'fs';

const BUY_SOL = 1.0;
const MAX_SIGNAL_AGE_SEC = 300;

interface BenchmarkSample {
  detectDelayMs: number;
  signalAgeSec: number;
  path: 'logs' | 'poll';
  solSpent: number;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function parseBenchmarkLine(line: string): BenchmarkSample | null {
  // Pattern: [BENCH][ALPHA] alpha=... mint=... sig=... path=logs|poll blockTime=... detectDelayMs=... signalAgeSec=... solSpent=... tokenDelta=...
  const match = line.match(/\[BENCH\]\[ALPHA\].*path=(\w+).*detectDelayMs=([\d.]+).*signalAgeSec=([\d.]+).*solSpent=([\d.]+)/);
  if (!match) return null;
  
  const [, path, detectDelayMsStr, signalAgeSecStr, solSpentStr] = match;
  const detectDelayMs = parseFloat(detectDelayMsStr);
  const signalAgeSec = parseFloat(signalAgeSecStr);
  const solSpent = parseFloat(solSpentStr);
  
  if (!Number.isFinite(detectDelayMs) || !Number.isFinite(signalAgeSec) || !Number.isFinite(solSpent)) {
    return null;
  }
  
  if (path !== 'logs' && path !== 'poll') {
    return null;
  }
  
  return {
    detectDelayMs,
    signalAgeSec,
    path: path as 'logs' | 'poll',
    solSpent,
  };
}

async function main() {
  const samples: BenchmarkSample[] = [];
  const input = process.argv[2] 
    ? fs.createReadStream(process.argv[2])
    : process.stdin;
  
  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    const sample = parseBenchmarkLine(line);
    if (sample) {
      samples.push(sample);
    }
  }
  
  if (samples.length === 0) {
    console.log('No benchmark samples found.');
    process.exit(0);
  }
  
  // Split by path
  const logsSamples = samples.filter(s => s.path === 'logs');
  const pollSamples = samples.filter(s => s.path === 'poll');
  
  // Calculate stats for each path
  function calcStats(pathSamples: BenchmarkSample[]) {
    if (pathSamples.length === 0) {
      return {
        detectDelayMs: { min: 0, p50: 0, p90: 0, max: 0 },
        signalAgeSec: { min: 0, p50: 0, p90: 0, max: 0 },
      };
    }
    
    const delays = pathSamples.map(s => s.detectDelayMs);
    const ages = pathSamples.map(s => s.signalAgeSec);
    
    return {
      detectDelayMs: {
        min: Math.min(...delays),
        p50: percentile(delays, 50),
        p90: percentile(delays, 90),
        max: Math.max(...delays),
      },
      signalAgeSec: {
        min: Math.min(...ages),
        p50: percentile(ages, 50),
        p90: percentile(ages, 90),
        max: Math.max(...ages),
      },
    };
  }
  
  const logsStats = calcStats(logsSamples);
  const pollStats = calcStats(pollSamples);
  
  // Overall stats
  const logsPct = (logsSamples.length / samples.length) * 100;
  const pollPct = (pollSamples.length / samples.length) * 100;
  const freshPct = (samples.filter(s => s.signalAgeSec <= 5).length / samples.length) * 100;
  const stalePct = (samples.filter(s => s.signalAgeSec > MAX_SIGNAL_AGE_SEC).length / samples.length) * 100;
  const fullBuyPct = (samples.filter(s => s.solSpent >= BUY_SOL * 0.9).length / samples.length) * 100;
  
  // Print results
  console.log('Alpha Speed Benchmark');
  console.log('=====================');
  console.log(`Samples: ${samples.length} (logs: ${logsSamples.length}, poll: ${pollSamples.length})`);
  console.log('');
  
  if (logsSamples.length > 0) {
    console.log('Logs:');
    console.log(`  detectDelayMs: p50=${logsStats.detectDelayMs.p50.toFixed(0)} p90=${logsStats.detectDelayMs.p90.toFixed(0)} max=${logsStats.detectDelayMs.max.toFixed(0)}`);
    console.log(`  signalAgeSec: p50=${logsStats.signalAgeSec.p50.toFixed(1)}  p90=${logsStats.signalAgeSec.p90.toFixed(1)}  max=${logsStats.signalAgeSec.max.toFixed(1)}`);
    console.log('');
  }
  
  if (pollSamples.length > 0) {
    console.log('Poll:');
    console.log(`  detectDelayMs: p50=${pollStats.detectDelayMs.p50.toFixed(0)} p90=${pollStats.detectDelayMs.p90.toFixed(0)} max=${pollStats.detectDelayMs.max.toFixed(0)}`);
    console.log(`  signalAgeSec: p50=${pollStats.signalAgeSec.p50.toFixed(1)}  p90=${pollStats.signalAgeSec.p90.toFixed(1)}  max=${pollStats.signalAgeSec.max.toFixed(1)}`);
    console.log('');
  }
  
  console.log('Route share:');
  console.log(`  logs: ${logsPct.toFixed(1)}%`);
  console.log(`  poll: ${pollPct.toFixed(1)}%`);
  console.log('');
  
  console.log('Freshness:');
  console.log(`  <= 5s: ${freshPct.toFixed(1)}%`);
  const midPct = 100 - freshPct - stalePct;
  console.log(`  5–${MAX_SIGNAL_AGE_SEC}s: ${midPct.toFixed(1)}%`);
  console.log(`  > ${MAX_SIGNAL_AGE_SEC}s: ${stalePct.toFixed(1)}%`);
  console.log('');
  
  console.log('Trade size:');
  console.log(`  Full buys (>=${BUY_SOL * 0.9} SOL): ${fullBuyPct.toFixed(1)}%`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

