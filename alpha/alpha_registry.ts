// alpha/alpha_registry.ts
import fs from 'fs';
import path from 'path';

type Score = { signals: number; lastSeen?: number; lastPromotedAt?: number };

type Registry = {
  active: string[];
  candidates: string[];
  scores: Record<string, Score>;
};

const REG_DIR = path.resolve(process.cwd(), 'alpha');
const REG_FILE = path.join(REG_DIR, 'registry.json');
const TMP_FILE = path.join(REG_DIR, 'registry.json.tmp');

// Helper: deduplicate array
function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function ensureDir() {
  if (!fs.existsSync(REG_DIR)) fs.mkdirSync(REG_DIR, { recursive: true });
}

function loadJSON<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// --- Atomic writer (prevents duplicate promotions on rapid signals)
function saveRegistryAtomic(reg: Registry) {
  ensureDir();
  fs.writeFileSync(TMP_FILE, JSON.stringify(reg, null, 2));
  fs.renameSync(TMP_FILE, REG_FILE);
}

export function readRegistry(): Registry {
  ensureDir();
  const reg = loadJSON<Registry>(REG_FILE, { active: [], candidates: [], scores: {} });

  // Dedupe & self-heal registry on every read
  const before = JSON.stringify(reg);
  reg.active = uniq(reg.active);
  reg.candidates = uniq(reg.candidates);
  // Prevent same wallet being both candidate and active
  reg.candidates = reg.candidates.filter((a) => !new Set(reg.active).has(a));
  if (JSON.stringify(reg) !== before) {
    // persist atomic if we fixed anything
    write(reg);
  }
  return reg;
}

function write(reg: Registry) {
  saveRegistryAtomic(reg);
}

export function addCandidate(addr: string) {
  const reg = readRegistry();
  if (!reg.active.includes(addr)) {
    reg.candidates = uniq([...reg.candidates, addr]);
  }
  if (!reg.scores[addr]) reg.scores[addr] = { signals: 0 };
  write(reg);
}

export function addActive(addr: string) {
  const reg = readRegistry();
  reg.active = uniq([...reg.active, addr]);
  reg.candidates = reg.candidates.filter((a) => a !== addr);
  if (!reg.scores[addr]) reg.scores[addr] = { signals: 0 };
  write(reg);
}

export function removeCandidate(addr: string) {
  const reg = readRegistry();
  reg.candidates = reg.candidates.filter((a) => a !== addr);
  write(reg);
}

export function removeActive(addr: string) {
  const reg = readRegistry();
  reg.active = reg.active.filter((a) => a !== addr);
  write(reg);
}

export function bumpScore(addr: string) {
  const reg = readRegistry();
  const s = reg.scores[addr] || { signals: 0 };
  s.signals += 1;
  s.lastSeen = Date.now();
  reg.scores[addr] = s;
  write(reg);
}

export function maybePromote(addr: string, threshold: number, windowMs: number): boolean {
  const reg = readRegistry();
  const s = reg.scores[addr];
  if (!s) return false;

  // ignore if recently promoted (debounce duplicate alerts)
  if (s.lastPromotedAt && Date.now() - s.lastPromotedAt < 60_000) {
    return false;
  }

  // decay: only keep signals inside window
  if (s.lastSeen && Date.now() - s.lastSeen > windowMs) {
    s.signals = 0;
  }

  if (s.signals >= threshold) {
    // update state BEFORE write
    s.lastPromotedAt = Date.now();
    // move candidate -> active
    reg.active = uniq([...reg.active, addr]);
    reg.candidates = reg.candidates.filter((a) => a !== addr);
    // persist atomically to avoid double "AUTO-PROMOTED"
    write(reg);
    return true;
  }

  // persist score changes
  reg.scores[addr] = s;
  write(reg);
  return false;
}

export function manualPromote(addr: string): boolean {
  const reg = readRegistry();
  const already = reg.active.includes(addr);
  if (already) return false;
  reg.active = uniq([...reg.active, addr]);
  reg.candidates = reg.candidates.filter((a) => a !== addr);
  const s = reg.scores[addr] || { signals: 0 };
  s.lastPromotedAt = Date.now();
  reg.scores[addr] = s;
  write(reg);
  return true;
}

export function listAll(): { active: string[]; candidates: string[]; scores: Record<string, Score> } {
  return readRegistry();
}

