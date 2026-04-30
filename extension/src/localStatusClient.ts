/**
 * Strategy A — Local Antigravity language-server quota reader.
 *
 * Antigravity does not expose a stable public quota API for extensions. The
 * most useful observable surface is the local language server that the IDE
 * starts. This client discovers that local server, calls known Connect-RPC
 * status endpoints, and parses quota-like model data defensively.
 */

import * as http from 'http';
import * as https from 'https';
import { execFile } from 'child_process';
import type { ModelQuota } from './types';
import { DEFAULT_LIMITS, KNOWN_MODELS } from './types';

interface ProcessInfo {
  pid: number;
  commandLine: string;
}

interface ServerCandidate {
  port: number;
  csrfToken: string | null;
  pid: number | null;
  protocol: 'http' | 'https';
  reason: string;
}

interface ConnectResponse {
  endpoint: string;
  candidate: ServerCandidate;
  body: unknown;
}

export interface LocalQuotaResult {
  models: ModelQuota[];
  endpoint: string;
  port: number;
  protocol: 'http' | 'https';
  email: string | null;
}

export interface LocalDiagnosticReport {
  processes: number;
  candidates: ServerCandidate[];
  endpointsTried: string[];
  quotaModels: number;
  notes: string[];
}

// Only GetUserStatus works — GetCommandModelConfigs returns HTTP 501 unimplemented.
const STATUS_ENDPOINTS = [
  '/exa.language_server_pb.LanguageServerService/GetUserStatus',
];

const PROBE_ENDPOINTS = [
  '/exa.language_server_pb.LanguageServerService/GetUserStatus',
  '/exa.language_server_pb.LanguageServerService/GetUnleashData',
];

// The language server rejects any body fields other than the proto schema.
// Sending an empty object is the safest approach for GetUserStatus.
const EMPTY_REQUEST_BODY = {};

/** Try to fetch quota from the running Antigravity local language server. */
export async function fetchQuotasViaLocalAntigravity(): Promise<LocalQuotaResult | null> {
  const candidates = await discoverServerCandidates();
  for (const candidate of candidates) {
    for (const endpoint of STATUS_ENDPOINTS) {
      try {
        const response = await postConnect(candidate, endpoint, EMPTY_REQUEST_BODY);
        const models = extractModelQuotas(response.body);
        if (models.length > 0) {
          return {
            models,
            endpoint: response.endpoint,
            port: response.candidate.port,
            protocol: response.candidate.protocol,
            email: extractUserEmail(response.body),
          };
        }
      } catch {
        // Try the next endpoint/candidate.
      }
    }
  }
  return null;
}

/** Produce a human-readable diagnostic summary for the extension command. */
export async function diagnoseLocalAntigravity(): Promise<LocalDiagnosticReport> {
  const notes: string[] = [];
  const processes = await discoverAntigravityProcesses();
  const candidates = await discoverServerCandidates(processes);
  let quotaModels = 0;

  if (processes.length === 0) {
    notes.push('No likely Antigravity language-server process was found.');
  }
  if (candidates.length === 0) {
    notes.push('No local server port candidates were discovered from process arguments.');
  }

  for (const candidate of candidates) {
    for (const endpoint of STATUS_ENDPOINTS) {
      try {
        const response = await postConnect(candidate, endpoint, EMPTY_REQUEST_BODY, 2500);
        const models = extractModelQuotas(response.body);
        quotaModels = Math.max(quotaModels, models.length);
        if (models.length > 0) {
          notes.push(`Quota data found via ${candidate.protocol}://127.0.0.1:${candidate.port}${endpoint}.`);
          return { processes: processes.length, candidates, endpointsTried: STATUS_ENDPOINTS, quotaModels, notes };
        }
        notes.push(`Endpoint responded but no quota models were parsed: ${endpoint} on ${candidate.port}.`);
      } catch (err) {
        notes.push(`${candidate.protocol}://127.0.0.1:${candidate.port}${endpoint} failed: ${(err as Error).message}`);
      }
    }
  }

  return { processes: processes.length, candidates, endpointsTried: STATUS_ENDPOINTS, quotaModels, notes };
}

async function discoverServerCandidates(processes?: ProcessInfo[]): Promise<ServerCandidate[]> {
  const foundProcesses = processes ?? await discoverAntigravityProcesses();
  const candidates = new Map<string, ServerCandidate>();
  const listeningPorts = await discoverListeningPorts(foundProcesses.map((proc) => proc.pid).filter((pid) => pid > 0));

  for (const proc of foundProcesses) {
    const token = extractArgValue(proc.commandLine, ['csrf_token', 'csrf-token']);
    const ports = extractPortCandidates(proc.commandLine);
    for (const portCandidate of ports) {
      addCandidate(candidates, {
        port: portCandidate.port,
        csrfToken: portCandidate.csrfToken ?? token,
        pid: proc.pid,
        protocol: 'http',
        reason: portCandidate.reason,
      });
      addCandidate(candidates, {
        port: portCandidate.port,
        csrfToken: portCandidate.csrfToken ?? token,
        pid: proc.pid,
        protocol: 'https',
        reason: portCandidate.reason,
      });
    }

    for (const port of listeningPorts.get(proc.pid) ?? []) {
      addCandidate(candidates, {
        port,
        csrfToken: token,
        pid: proc.pid,
        protocol: 'http',
        reason: 'listening-socket',
      });
      addCandidate(candidates, {
        port,
        csrfToken: token,
        pid: proc.pid,
        protocol: 'https',
        reason: 'listening-socket',
      });
    }
  }

  const probed: ServerCandidate[] = [];
  for (const candidate of candidates.values()) {
    if (await probeCandidate(candidate)) {
      probed.push(candidate);
    }
  }

  return probed.length > 0 ? probed : Array.from(candidates.values());
}

function addCandidate(map: Map<string, ServerCandidate>, candidate: ServerCandidate): void {
  if (candidate.port <= 0 || candidate.port > 65535) return;
  map.set(`${candidate.protocol}:${candidate.port}:${candidate.csrfToken ?? ''}`, candidate);
}

async function probeCandidate(candidate: ServerCandidate): Promise<boolean> {
  for (const endpoint of PROBE_ENDPOINTS) {
    try {
      await postConnect(candidate, endpoint, EMPTY_REQUEST_BODY, 1200);
      return true;
    } catch {
      // Keep probing.
    }
  }
  return false;
}

async function discoverAntigravityProcesses(): Promise<ProcessInfo[]> {
  const raw = process.platform === 'win32'
    ? await listWindowsProcesses()
    : await listUnixProcesses();

  return raw.filter((proc) => {
    const lower = proc.commandLine.toLowerCase();
    const isAntigravity = lower.includes('antigravity') || lower.includes('--ide_name antigravity');
    const isLanguageServer = lower.includes('language_server') || lower.includes('codeium') || lower.includes('extension_server_port');
    return isAntigravity && isLanguageServer;
  });
}

async function listWindowsProcesses(): Promise<ProcessInfo[]> {
  const script = [
    "Get-CimInstance Win32_Process",
    "Where-Object { $_.CommandLine -match 'antigravity|language_server|codeium' }",
    "Select-Object ProcessId,CommandLine",
    "ConvertTo-Json -Compress",
  ].join(' | ');

  try {
    const output = await execFileText('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 5000);
    if (!output.trim()) return [];
    const parsed = JSON.parse(output) as Array<{ ProcessId?: number; CommandLine?: string }> | { ProcessId?: number; CommandLine?: string };
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .filter((row) => row.CommandLine)
      .map((row) => ({ pid: Number(row.ProcessId) || 0, commandLine: String(row.CommandLine) }));
  } catch {
    return [];
  }
}

async function listUnixProcesses(): Promise<ProcessInfo[]> {
  try {
    const output = await execFileText('ps', ['-ax', '-o', 'pid=', '-o', 'command='], 5000);
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.+)$/);
        return match ? { pid: Number(match[1]), commandLine: match[2] } : null;
      })
      .filter((proc): proc is ProcessInfo => proc !== null);
  } catch {
    return [];
  }
}

async function discoverListeningPorts(pids: number[]): Promise<Map<number, number[]>> {
  if (pids.length === 0) return new Map();
  return process.platform === 'win32'
    ? discoverWindowsListeningPorts(pids)
    : discoverUnixListeningPorts(pids);
}

async function discoverWindowsListeningPorts(pids: number[]): Promise<Map<number, number[]>> {
  const pidList = pids.join(',');
  const script = `$pids = @(${pidList}); ` + [
    'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue',
    'Where-Object { $pids -contains $_.OwningProcess }',
    'Select-Object OwningProcess,LocalPort',
    'ConvertTo-Json -Compress',
  ].join(' | ');

  try {
    const output = await execFileText('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 5000);
    if (!output.trim()) return new Map();
    const parsed = JSON.parse(output) as Array<{ OwningProcess?: number; LocalPort?: number }> | { OwningProcess?: number; LocalPort?: number };
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const byPid = new Map<number, number[]>();
    for (const row of rows) {
      const pid = Number(row.OwningProcess);
      const port = Number(row.LocalPort);
      if (!pid || !port) continue;
      byPid.set(pid, [...(byPid.get(pid) ?? []), port]);
    }
    return byPid;
  } catch {
    return new Map();
  }
}

async function discoverUnixListeningPorts(pids: number[]): Promise<Map<number, number[]>> {
  const byPid = new Map<number, number[]>();
  await Promise.all(pids.map(async (pid) => {
    try {
      const output = await execFileText('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)], 5000);
      const ports = new Set<number>();
      for (const match of output.matchAll(/(?:127\.0\.0\.1|localhost|\*):(\d{2,5})/gi)) {
        ports.add(Number(match[1]));
      }
      if (ports.size > 0) byPid.set(pid, Array.from(ports));
    } catch {
      // lsof is not always installed; process-argument discovery may still work.
    }
  }));
  return byPid;
}

function execFileText(file: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function extractPortCandidates(commandLine: string): Array<{ port: number; csrfToken: string | null; reason: string }> {
  const ports = new Map<number, { port: number; csrfToken: string | null; reason: string }>();
  const defaultToken = extractArgValue(commandLine, ['csrf_token', 'csrf-token']);
  const extensionServerToken = extractArgValue(commandLine, ['extension_server_csrf_token', 'extension-server-csrf-token']);
  const extensionServerPort = extractArgValue(commandLine, ['extension_server_port', 'extension-server-port']);

  if (extensionServerPort && /^\d+$/.test(extensionServerPort)) {
    const port = Number(extensionServerPort);
    ports.set(port, {
      port,
      csrfToken: extensionServerToken ?? defaultToken,
      reason: 'extension-server-port',
    });
  }

  const argNames = [
    'port',
    'server_port',
    'api_server_port',
    'http_port',
    'grpc_port',
  ];

  for (const name of argNames) {
    const value = extractArgValue(commandLine, [name]);
    if (value && /^\d+$/.test(value)) {
      const port = Number(value);
      ports.set(port, { port, csrfToken: defaultToken, reason: `process-arg:${name}` });
    }
  }

  for (const match of commandLine.matchAll(/(?:127\.0\.0\.1|localhost):(\d{2,5})/gi)) {
    const port = Number(match[1]);
    ports.set(port, { port, csrfToken: defaultToken, reason: 'localhost-url' });
  }

  return Array.from(ports.values());
}

function extractArgValue(commandLine: string, names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(`--${escapeRegExp(name)}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|([^\\s]+))`, 'i');
    const match = commandLine.match(pattern);
    if (match) return match[1] ?? match[2] ?? match[3] ?? null;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function postConnect(
  candidate: ServerCandidate,
  endpoint: string,
  payload: unknown,
  timeoutMs = 4000,
): Promise<ConnectResponse> {
  const body = JSON.stringify(payload);
  const isHttps = candidate.protocol === 'https';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: '127.0.0.1',
        port: candidate.port,
        path: endpoint,
        method: 'POST',
        rejectUnauthorized: false,
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Connect-Protocol-Version': '1',
          ...(candidate.csrfToken ? { 'x-codeium-csrf-token': candidate.csrfToken } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8').trim();
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} ${text.slice(0, 120)}`));
            return;
          }
          if (!text) {
            resolve({ endpoint, candidate, body: {} });
            return;
          }
          try {
            resolve({ endpoint, candidate, body: JSON.parse(text) });
          } catch {
            reject(new Error('Response was not JSON'));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(body);
    req.end();
  });
}

function extractModelQuotas(body: unknown): ModelQuota[] {
  const candidates: ModelQuota[] = [];
  walk(body, (obj) => {
    const quotaInfo = objectValue(obj.quotaInfo);
    const modelOrAlias = objectValue(obj.modelOrAlias);
    const label = findString(obj, ['label', 'modelName', 'displayName', 'name']);
    const rawModelId = findString(obj, ['modelId', 'model_id', 'id', 'model'])
      ?? (modelOrAlias ? findString(modelOrAlias, ['model', 'alias', 'id']) : null);
    const modelId = normaliseModelId(rawModelId, label);
    if (!modelId || !looksLikeModelId(`${modelId} ${label ?? ''}`)) return;

    const quotaSource = quotaInfo ?? obj;
    const remainingFraction = findNumber(quotaSource, [
      'remainingFraction',
      'quotaRemainingFraction',
      'usageLimitRemainingFraction',
      'remaining_fraction',
    ]);
    const usedFraction = findNumber(quotaSource, ['usedFraction', 'usageFraction', 'consumedFraction']);
    const limit = findNumber(quotaSource, ['limit', 'limitTokens', 'tokenLimit', 'quotaLimit']) ?? DEFAULT_LIMITS[modelId] ?? 100;
    const explicitUsed = findNumber(quotaSource, ['used', 'usedTokens', 'tokenCount', 'consumedTokens']);
    const resetAt = findString(quotaSource, ['resetAt', 'resetTime', 'quotaResetTime', 'nextResetTime']);

    let used = explicitUsed;
    if (used === null && remainingFraction !== null) {
      used = Math.round(limit * (1 - clamp01(remainingFraction)));
    }
    if (used === null && usedFraction !== null) {
      used = Math.round(limit * clamp01(usedFraction));
    }
    if (used === null && resetAt !== null) {
      used = 0;
    }
    if (used === null) return;

    candidates.push({
      modelId,
      modelName: label ?? KNOWN_MODELS[modelId] ?? modelId,
      used: Math.max(0, Math.min(limit, Math.round(used))),
      limit,
      resetAt: normaliseResetTime(resetAt),
    });
  });

  return dedupeModels(candidates);
}

function extractUserEmail(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  let found: string | null = null;
  walk(body, (obj) => {
    if (found) return;
    const email = findString(obj, ['email']);
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      found = email;
    }
  });
  return found;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normaliseModelId(rawModelId: string | null, label: string | null): string | null {
  const raw = rawModelId?.trim();
  if (raw && raw.toLowerCase().startsWith('model_')) return raw;
  if (raw && looksLikeModelId(raw)) return raw;
  if (label && looksLikeModelId(label)) {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  return raw ?? null;
}

function walk(value: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const obj = value as Record<string, unknown>;
  visit(obj);
  for (const child of Object.values(obj)) walk(child, visit);
}

function findString(obj: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const direct = obj[name];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && names.some((name) => key.toLowerCase().includes(name.toLowerCase()))) {
      return value.trim();
    }
  }

  return null;
}

function findNumber(obj: Record<string, unknown>, names: string[]): number | null {
  for (const name of names) {
    const direct = obj[name];
    const parsed = toNumber(direct);
    if (parsed !== null) return parsed;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (!names.some((name) => key.toLowerCase().includes(name.toLowerCase()))) continue;
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function looksLikeModelId(value: string): boolean {
  const lower = value.toLowerCase();
  // Match known Gemini/Claude/GPT names AND Antigravity's opaque MODEL_PLACEHOLDER / MODEL_OPENAI IDs
  return (
    lower.includes('gemini') ||
    lower.includes('claude') ||
    lower.includes('gpt') ||
    lower.includes('opus') ||
    lower.includes('sonnet') ||
    lower.startsWith('model_placeholder') ||
    lower.startsWith('model_openai') ||
    lower.match(/^model_[a-z]/) !== null
  );
}

function normaliseResetTime(value: string | null): string | null {
  if (!value) return null;
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();

  const duration = value.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (!duration) return null;
  const hours = Number(duration[1] ?? 0);
  const mins = Number(duration[2] ?? 0);
  const secs = Number(duration[3] ?? 0);
  const ms = ((hours * 60 + mins) * 60 + secs) * 1000;
  return ms > 0 ? new Date(Date.now() + ms).toISOString() : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function dedupeModels(models: ModelQuota[]): ModelQuota[] {
  const byId = new Map<string, ModelQuota>();
  for (const model of models) {
    const existing = byId.get(model.modelId);
    if (!existing || scoreModel(model) > scoreModel(existing)) {
      byId.set(model.modelId, model);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.modelName.localeCompare(b.modelName));
}

function scoreModel(model: ModelQuota): number {
  return (model.resetAt ? 2 : 0) + (model.limit > 1 ? 1 : 0);
}
