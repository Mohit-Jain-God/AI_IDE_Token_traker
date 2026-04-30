/**
 * Strategy B — Cache reader for Antigravity's local state files.
 *
 * Antigravity (like VS Code) stores extension state in a SQLite database
 * (state.vscdb) or in plain JSON files within globalStorage.
 * We attempt to read these files to extract cached quota data.
 *
 * Priority:
 *   1. JSON files: globalStorage/quota-cache.json, quota.json, ai-state.json
 *   2. SQLite: state.vscdb (read-only via raw binary parsing — no sqlite3 dep)
 *
 * NOTE: SQLite parsing here is minimal (WAL-safe, read-only header scan).
 *       For full SQLite support, install the `better-sqlite3` native module.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ModelQuota } from './types';
import { DEFAULT_LIMITS, KNOWN_MODELS } from './types';

// ─── JSON cache files ─────────────────────────────────────────────────────────

const CANDIDATE_JSON_NAMES = [
  'quota-cache.json',
  'quota.json',
  'ai-state.json',
  'gemini-quota.json',
  'antigravity-quota.json',
  'extension-state.json',
];

/** Attempt to read quota data from well-known JSON cache files. */
export function readQuotaFromJsonCache(
  globalStoragePath: string,
  email: string,
): ModelQuota[] | null {
  for (const name of CANDIDATE_JSON_NAMES) {
    const filePath = path.join(globalStoragePath, name);
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      const quotas = extractModelsFromCacheObject(data, email);
      if (quotas && quotas.length > 0) {
        console.log(`[CacheReader] Found quota data in ${name}`);
        return quotas;
      }
    } catch {
      // File unreadable or malformed — try next
    }
  }
  return null;
}

/**
 * Walk a parsed JSON object looking for model quota fields.
 * Handles several different cache schema conventions.
 */
function extractModelsFromCacheObject(data: unknown, email: string): ModelQuota[] | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // Schema A: { accounts: { [email]: { models: [...] } } }
  if (obj.accounts && typeof obj.accounts === 'object') {
    const accounts = obj.accounts as Record<string, unknown>;
    if (accounts[email] && typeof accounts[email] === 'object') {
      return parseModelsArray((accounts[email] as Record<string, unknown>).models);
    }
    // Try any account if email match fails
    for (const val of Object.values(accounts)) {
      const models = parseModelsArray((val as Record<string, unknown>)?.models);
      if (models) return models;
    }
  }

  // Schema B: { models: [...] }
  if (Array.isArray(obj.models)) {
    return parseModelsArray(obj.models);
  }

  // Schema C: { [modelId]: { usedTokens, limitTokens, resetAt } }
  // Handles both classic 'gemini-*' and Antigravity's 'MODEL_PLACEHOLDER_*' / 'MODEL_OPENAI_*' keys.
  const modelKeys = Object.keys(obj).filter((k) =>
    k.startsWith('gemini-') || k.startsWith('MODEL_') || k.startsWith('model_')
  );
  if (modelKeys.length > 0) {
    const models: ModelQuota[] = [];
    for (const modelId of modelKeys) {
      const entry = obj[modelId] as Record<string, unknown>;
      if (typeof entry === 'object' && entry) {
        models.push({
          modelId,
          modelName: KNOWN_MODELS[modelId] ?? modelId,
          used: Number(entry.usedTokens ?? entry.used ?? 0),
          limit: Number(entry.limitTokens ?? entry.limit ?? DEFAULT_LIMITS[modelId] ?? 1_000_000),
          resetAt: typeof entry.resetAt === 'string' ? entry.resetAt : null,
        });
      }
    }
    if (models.length > 0) return models;
  }

  return null;
}

function parseModelsArray(arr: unknown): ModelQuota[] | null {
  if (!Array.isArray(arr)) return null;
  const models: ModelQuota[] = [];
  for (const item of arr) {
    if (typeof item !== 'object' || !item) continue;
    const m = item as Record<string, unknown>;
    const modelId = String(m.modelId ?? m.model_id ?? m.id ?? '');
    if (!modelId) continue;
    models.push({
      modelId,
      modelName: String(m.modelName ?? m.model_name ?? KNOWN_MODELS[modelId] ?? modelId),
      used: Number(m.used ?? m.usedTokens ?? m.used_tokens ?? 0),
      limit: Number(m.limit ?? m.limitTokens ?? m.limit_tokens ?? DEFAULT_LIMITS[modelId] ?? 1_000_000),
      resetAt: typeof m.resetAt === 'string' ? m.resetAt : null,
    });
  }
  return models.length > 0 ? models : null;
}

// ─── Candidate global storage directories ────────────────────────────────────

/** Return candidate globalStorage directories for Antigravity across platforms. */
export function discoverGlobalStorageDirs(): string[] {
  const home = os.homedir();
  return [
    // macOS
    path.join(home, 'Library', 'Application Support', 'Antigravity', 'User', 'globalStorage'),
    path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage'),
    // Linux
    path.join(home, '.config', 'Antigravity', 'User', 'globalStorage'),
    path.join(home, '.config', 'Code', 'User', 'globalStorage'),
    // Windows
    path.join(home, 'AppData', 'Roaming', 'Antigravity', 'User', 'globalStorage'),
    path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage'),
  ].filter((d) => {
    try { return fs.existsSync(d); } catch { return false; }
  });
}

/** Build default ModelQuota entries using only the default limits (no actual data). */
export function buildDefaultQuotas(): ModelQuota[] {
  return Object.entries(KNOWN_MODELS).map(([modelId, modelName]) => ({
    modelId,
    modelName,
    used: 0,
    limit: DEFAULT_LIMITS[modelId] ?? 1_000_000,
    resetAt: null,
  }));
}
