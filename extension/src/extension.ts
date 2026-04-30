/**
 * Antigravity Quota Tracker — VS Code Extension Entry Point
 *
 * Activation: onStartupFinished
 *
 * Workflow:
 *   1. Read active Google account from vscode.authentication
 *   2. Try Strategy A: local Antigravity language-server status probe
 *   3. Try Strategy B: legacy gRPC probe on a configured port
 *   4. Try Strategy C: JSON cache files in globalStorage
 *   5. Try Strategy D: LogWatcher tailing IDE .log files
 *   6. POST snapshot to dashboard server every N seconds (default: 5 min)
 *      and immediately on any RESOURCE_EXHAUSTED log event
 */

import * as vscode from 'vscode';
import type { AccountSnapshot, FullSnapshot, ModelQuota } from './types';
import { KNOWN_MODELS, DEFAULT_LIMITS } from './types';
import { fetchQuotasViaGrpc, probeGrpcServer } from './grpcClient';
import { diagnoseLocalAntigravity, fetchQuotasViaLocalAntigravity } from './localStatusClient';
import { readQuotaFromJsonCache, discoverGlobalStorageDirs, buildDefaultQuotas } from './cacheReader';
import { LogWatcher, discoverLogDirs, type LogEvent } from './logWatcher';
import { sendSnapshot } from './snapshotSender';

// ─── Extension state ──────────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let logWatcher: LogWatcher | null = null;

// In-memory store: email → latest AccountSnapshot
const accountStore = new Map<string, AccountSnapshot>();
let activeEmail: string | null = null;
let extensionVersion = 'unknown';
const CURRENT_SESSION_EMAIL = 'current-session@antigravity.local';

// ─── Activation ───────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionVersion = String(context.extension.packageJSON.version ?? 'unknown');
  console.log(`[AntigravityQuota] Extension activating... v${extensionVersion} local-quota-parser-v2`);

  // ── Status bar item ──────────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(sync~spin) Quota…';
  statusBarItem.tooltip = 'Antigravity Quota Tracker — syncing';
  statusBarItem.command = 'antigravityQuota.openDashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityQuota.refresh', async () => {
      await runSync(context);
    }),
    vscode.commands.registerCommand('antigravityQuota.openDashboard', () => {
      const cfg = getConfig();
      vscode.env.openExternal(vscode.Uri.parse(cfg.serverUrl));
    }),
    vscode.commands.registerCommand('antigravityQuota.setActiveAccount', async () => {
      const email = await promptForAccount();
      if (email) {
        activeEmail = email;
        await context.globalState.update('activeEmail', email);
        vscode.window.showInformationMessage(`Antigravity: Active account set to ${email}`);
        await runSync(context);
      }
    }),
    vscode.commands.registerCommand('antigravityQuota.diagnose', async () => {
      await showDiagnosticsReport();
    }),
  );

  // ── Log watcher ──────────────────────────────────────────────────────────
  if (getConfig().enableLogWatcher) {
    startLogWatcher(context);
  }

  // ── Configuration change listener ────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('antigravityQuota')) {
        restartSyncTimer(context);
      }
    }),
  );

  // ── Initial sync + periodic timer ────────────────────────────────────────
  await runSync(context);
  restartSyncTimer(context);

  console.log('[AntigravityQuota] Extension activated.');
}

// ─── Deactivation ────────────────────────────────────────────────────────────

export function deactivate(): void {
  if (syncTimer) clearInterval(syncTimer);
  logWatcher?.stop();
  console.log('[AntigravityQuota] Extension deactivated.');
}

// ─── Sync orchestration ───────────────────────────────────────────────────────

async function runSync(context: vscode.ExtensionContext): Promise<void> {
  statusBarItem.text = '$(sync~spin) Syncing…';

  try {
    const cfg = getConfig();

    // Step 1: Identify active account
    const email = await resolveActiveAccount(context, cfg);
    activeEmail = email ?? CURRENT_SESSION_EMAIL;

    // Step 2: Gather quota for all configured accounts (or just the active one)
    const emails = cfg.accounts.length > 0 ? cfg.accounts : [activeEmail];

  for (const acctEmail of emails) {
      const snapshot = await gatherQuotaForAccount(acctEmail, cfg.grpcPort, context.globalStoragePath);
      accountStore.set(acctEmail, snapshot);
    }

    // Step 3: Build and send the full snapshot
    const fullSnapshot = buildFullSnapshot();
    await sendSnapshot(fullSnapshot, cfg.serverUrl);

    // Step 4: Update status bar
    updateStatusBar();
  } catch (err) {
    console.error('[AntigravityQuota] Sync error:', err);
    statusBarItem.text = '$(error) Quota error';
    statusBarItem.tooltip = `Sync failed: ${(err as Error).message}`;
  }
}

// ─── Account identification ───────────────────────────────────────────────────

async function resolveActiveAccount(
  context: vscode.ExtensionContext,
  cfg: ExtensionConfig,
): Promise<string | null> {
  // Try vscode.authentication first
  try {
    const session = await vscode.authentication.getSession('google', ['email', 'profile'], { silent: true });
    if (session?.account?.label) {
      return session.account.label;
    }
  } catch {
    // Authentication API not available or no session
  }

  // Fallback: check stored value
  const stored = context.globalState.get<string>('activeEmail');
  if (stored) return stored;

  // Fallback: first configured account
  if (cfg.accounts.length > 0) return cfg.accounts[0];

  return null;
}

async function promptForAccount(): Promise<string | null> {
  const input = await vscode.window.showInputBox({
    prompt: 'Enter the active Google account email',
    placeHolder: 'user.ai.01@gmail.com',
    validateInput: (v) => v.includes('@') ? null : 'Please enter a valid email address',
  });
  return input ?? null;
}

// ─── Quota gathering (fallback chain) ────────────────────────────────────────

async function gatherQuotaForAccount(
  email: string,
  grpcPort: number,
  globalStoragePath: string,
): Promise<AccountSnapshot> {
  // ── Strategy A: Antigravity local language server ─────────────────────
  try {
    const local = await fetchQuotasViaLocalAntigravity();
    if (local && local.models.length > 0) {
      console.log(
        `[AntigravityQuota] [A-Local] Got ${local.models.length} models via ${local.protocol}://127.0.0.1:${local.port}${local.endpoint}`,
      );
      const existing = accountStore.get(email);
      const snapshotEmail = local.email ?? email;
      if (email === CURRENT_SESSION_EMAIL && local.email) {
        activeEmail = local.email;
      }
      return { id: deriveId(snapshotEmail), email: snapshotEmail, models: local.models, source: 'local-server', exhaustedAt: existing?.exhaustedAt };
    }
  } catch (err) {
    console.debug('[AntigravityQuota] [A-Local] Failed:', (err as Error).message);
  }

  // ── Strategy B: legacy gRPC ────────────────────────────────────────────
  const grpcAvailable = await probeGrpcServer(grpcPort);
  if (grpcAvailable) {
    try {
      const grpcResults = await fetchQuotasViaGrpc(email, grpcPort);
      if (grpcResults.length > 0) {
        console.log(`[AntigravityQuota] [B-gRPC] Got ${grpcResults.length} models for ${email}`);
        const models: ModelQuota[] = grpcResults.map((r) => ({
          modelId: r.modelId,
          modelName: KNOWN_MODELS[r.modelId] ?? r.modelId,
          used: r.usedTokens,
          limit: r.limitTokens || DEFAULT_LIMITS[r.modelId] || 1_000_000,
          resetAt: r.resetAtUnixMs > 0 ? new Date(r.resetAtUnixMs).toISOString() : null,
        }));
        const existing = accountStore.get(email);
        return { id: deriveId(email), email, models, source: 'grpc', exhaustedAt: existing?.exhaustedAt };
      }
    } catch (err) {
      console.debug(`[AntigravityQuota] [B-gRPC] Failed for ${email}:`, (err as Error).message);
    }
  }

  // ── Strategy C: JSON cache ─────────────────────────────────────────────
  const storageDirs = [globalStoragePath, ...discoverGlobalStorageDirs()];
  for (const dir of storageDirs) {
    const cached = readQuotaFromJsonCache(dir, email);
    if (cached && cached.length > 0) {
      console.log(`[AntigravityQuota] [C-Cache] Got ${cached.length} models for ${email}`);
      const existing = accountStore.get(email);
      return { id: deriveId(email), email, models: cached, source: 'cache', exhaustedAt: existing?.exhaustedAt };
    }
  }

  // ── Strategy D: Log-derived data ──────────────────────────────────────
  const existing = accountStore.get(email);
  if (existing && existing.source === 'log') {
    console.log(`[AntigravityQuota] [D-Log] Using log-derived snapshot for ${email}`);
    return existing;
  }

  // ── Fallback: default placeholders ────────────────────────────────────
  console.warn(`[AntigravityQuota] [Fallback] No quota data found for ${email} — using defaults`);
  return {
    id: deriveId(email),
    email,
    models: buildDefaultQuotas(),
    source: 'manual',
    exhaustedAt: existing?.exhaustedAt,
  };
}

// ─── Log watcher integration ─────────────────────────────────────────────────

function startLogWatcher(context: vscode.ExtensionContext): void {
  const logDirs = discoverLogDirs(context.logUri?.fsPath);
  if (logDirs.length === 0) {
    console.log('[AntigravityQuota] No log directories found — log watcher disabled');
    return;
  }

  logWatcher = new LogWatcher(logDirs);
  logWatcher.on('event', async (event: LogEvent) => {
    if (event.type === 'RESOURCE_EXHAUSTED') {
      const targetEmail = event.email ?? activeEmail;
      if (!targetEmail) return;

      console.log(`[AntigravityQuota] RESOURCE_EXHAUSTED detected for ${targetEmail} model=${event.modelId}`);

      // Mark the account as exhausted
      const existing = accountStore.get(targetEmail);
      if (existing) {
        // Zero out the affected model(s)
        const updatedModels = existing.models.map((m) => {
          if (!event.modelId || m.modelId === event.modelId) {
            return { ...m, used: m.limit };
          }
          return m;
        });
        accountStore.set(targetEmail, {
          ...existing,
          models: updatedModels,
          exhaustedAt: new Date().toISOString(),
          source: 'log',
        });
      } else {
        // Create a new log-derived entry with all models exhausted
        const exhaustedModels: ModelQuota[] = Object.entries(KNOWN_MODELS).map(([id, name]) => ({
          modelId: id,
          modelName: name,
          used: DEFAULT_LIMITS[id] ?? 1_000_000,
          limit: DEFAULT_LIMITS[id] ?? 1_000_000,
          resetAt: new Date(Date.now() + 24 * 3_600_000).toISOString(), // +24h
        }));
        accountStore.set(targetEmail, {
          id: deriveId(targetEmail),
          email: targetEmail,
          models: exhaustedModels,
          exhaustedAt: new Date().toISOString(),
          source: 'log',
        });
      }

      // Immediate sync on exhaustion event
      const cfg = getConfig();
      await sendSnapshot(buildFullSnapshot(), cfg.serverUrl);
      updateStatusBar();

      vscode.window.showWarningMessage(
        `Antigravity: Quota exhausted on ${event.modelId ?? 'a model'} for ${targetEmail}`,
      );
    }
  });

  logWatcher.start();
  context.subscriptions.push({ dispose: () => logWatcher?.stop() });
  console.log('[AntigravityQuota] Log watcher started.');
}

// ─── Snapshot building ────────────────────────────────────────────────────────

function buildFullSnapshot(): FullSnapshot {
  return {
    accounts: Array.from(accountStore.values()),
    activeEmail,
    extensionVersion,
  };
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function updateStatusBar(): void {
  const total = accountStore.size;
  const exhausted = Array.from(accountStore.values()).filter((a) => {
    const min = Math.min(...a.models.map((m) => (m.limit - m.used) / m.limit));
    return min <= 0;
  }).length;
  const available = total - exhausted;

  statusBarItem.text = exhausted > 0
    ? `$(warning) ${available}/${total} Quota OK`
    : `$(check) ${total}/${total} Quota OK`;
  statusBarItem.tooltip = `Antigravity Quota Tracker\n${available} available · ${exhausted} exhausted\nClick to open dashboard`;
}

// ─── Periodic sync timer ─────────────────────────────────────────────────────

function restartSyncTimer(context: vscode.ExtensionContext): void {
  if (syncTimer) clearInterval(syncTimer);
  const intervalMs = getConfig().syncIntervalSeconds * 1000;
  syncTimer = setInterval(() => runSync(context), intervalMs);
  console.log(`[AntigravityQuota] Sync timer set to ${getConfig().syncIntervalSeconds}s`);
}

async function showDiagnosticsReport(): Promise<void> {
  const report = await diagnoseLocalAntigravity();
  const lines = [
    '# Antigravity Quota Tracker Diagnostics',
    '',
    `Processes found: ${report.processes}`,
    `Server candidates: ${report.candidates.length}`,
    `Quota models parsed: ${report.quotaModels}`,
    '',
    '## Candidates',
    ...(
      report.candidates.length > 0
        ? report.candidates.map((c) => `- ${c.protocol}://127.0.0.1:${c.port} pid=${c.pid ?? 'unknown'} csrf=${c.csrfToken ? 'yes' : 'no'} reason=${c.reason}`)
        : ['- none']
    ),
    '',
    '## Endpoints Tried',
    ...report.endpointsTried.map((endpoint) => `- ${endpoint}`),
    '',
    '## Notes',
    ...(
      report.notes.length > 0
        ? report.notes.map((note) => `- ${note}`)
        : ['- No notes.']
    ),
  ];

  const doc = await vscode.workspace.openTextDocument({
    content: lines.join('\n'),
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ExtensionConfig {
  serverUrl: string;
  syncIntervalSeconds: number;
  grpcPort: number;
  accounts: string[];
  enableLogWatcher: boolean;
}

function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('antigravityQuota');
  return {
    serverUrl: cfg.get<string>('serverUrl', 'http://127.0.0.1:9876'),
    syncIntervalSeconds: cfg.get<number>('syncIntervalSeconds', 300),
    grpcPort: cfg.get<number>('grpcPort', 7493),
    accounts: cfg.get<string[]>('accounts', []),
    enableLogWatcher: cfg.get<boolean>('enableLogWatcher', true),
  };
}

/** Derive a stable 2-digit ID from an email string. */
function deriveId(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) % 100;
  }
  return String(hash + 1).padStart(2, '0');
}
