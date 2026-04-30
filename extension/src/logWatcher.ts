/**
 * Strategy C — Background LogWatcher
 *
 * Tails the Antigravity IDE's .log files using fs.watch / fs.watchFile.
 * Looks for patterns indicating quota exhaustion:
 *   - "RESOURCE_EXHAUSTED"
 *   - "429 Too Many Requests"
 *   - "quotaExceeded"
 *   - "Quota exceeded"
 *
 * When a pattern is found, emits an event so the extension can:
 *   1. Update the account's exhaustedAt timestamp
 *   2. Trigger an immediate sync to the dashboard server
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as os from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogEvent {
  type: 'RESOURCE_EXHAUSTED' | 'QUOTA_LOW' | 'RESET' | 'AUTH_CHANGE';
  modelId: string | null;
  email: string | null;
  raw: string;
  timestamp: Date;
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

interface LogPattern {
  regex: RegExp;
  type: LogEvent['type'];
  extractModel?: (m: RegExpMatchArray) => string | null;
  extractEmail?: (m: RegExpMatchArray) => string | null;
}

const PATTERNS: LogPattern[] = [
  {
    regex: /RESOURCE_EXHAUSTED.*?(?:model[_\s]?id[:\s=]+)?["']?(gemini-[\w.-]+)["']?/i,
    type: 'RESOURCE_EXHAUSTED',
    extractModel: (m) => m[1] ?? null,
  },
  {
    regex: /429\s+Too\s+Many\s+Requests.*?(gemini-[\w.-]+)/i,
    type: 'RESOURCE_EXHAUSTED',
    extractModel: (m) => m[1] ?? null,
  },
  {
    regex: /quotaExceeded.*?(gemini-[\w.-]+)/i,
    type: 'RESOURCE_EXHAUSTED',
    extractModel: (m) => m[1] ?? null,
  },
  {
    regex: /Quota exceeded for quota metric.*?(gemini-[\w.-]+)/i,
    type: 'RESOURCE_EXHAUSTED',
    extractModel: (m) => m[1] ?? null,
  },
  {
    // Generic RESOURCE_EXHAUSTED without model ID
    regex: /RESOURCE_EXHAUSTED/i,
    type: 'RESOURCE_EXHAUSTED',
    extractModel: () => null,
  },
  {
    regex: /429\s+Too\s+Many\s+Requests/i,
    type: 'RESOURCE_EXHAUSTED',
    extractModel: () => null,
  },
  {
    // Detect account/email mentions nearby
    regex: /(?:account|user|email)[:\s=]+["']?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']?/i,
    type: 'AUTH_CHANGE',
    extractEmail: (m) => m[1] ?? null,
  },
];

// ─── LogWatcher class ─────────────────────────────────────────────────────────

export class LogWatcher extends EventEmitter {
  private watchers: fs.FSWatcher[] = [];
  private filePositions = new Map<string, number>(); // tracks read position per file
  private watchedPaths: string[] = [];
  private tailInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly logDirs: string[]) {
    super();
  }

  /**
   * Start watching all discovered log files.
   */
  start(): void {
    this.watchedPaths = this.discoverLogFiles();
    console.log(`[LogWatcher] Watching ${this.watchedPaths.length} log file(s)`);

    for (const filePath of this.watchedPaths) {
      this.initFile(filePath);
      this.watchFile(filePath);
    }

    // Poll for new log files every 60 seconds
    this.tailInterval = setInterval(() => this.refreshWatchers(), 60_000);
  }

  /**
   * Stop all file watchers.
   */
  stop(): void {
    for (const w of this.watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    this.watchers = [];
    if (this.tailInterval) {
      clearInterval(this.tailInterval);
      this.tailInterval = null;
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Find all .log files in the configured directories. */
  private discoverLogFiles(): string[] {
    const files: string[] = [];
    for (const dir of this.logDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (entry.endsWith('.log')) {
            files.push(path.join(dir, entry));
          }
        }
      } catch {
        // Directory not accessible — skip
      }
    }
    return files;
  }

  /** Seek to the end of a file so we only process new content. */
  private initFile(filePath: string): void {
    try {
      const stat = fs.statSync(filePath);
      this.filePositions.set(filePath, stat.size);
    } catch {
      this.filePositions.set(filePath, 0);
    }
  }

  /** Attach an fs.watch listener for a single log file. */
  private watchFile(filePath: string): void {
    try {
      const watcher = fs.watch(filePath, { persistent: false }, (event) => {
        if (event === 'change') {
          this.readNewContent(filePath);
        }
      });
      watcher.on('error', () => {
        // Silently remove broken watcher
        this.watchers = this.watchers.filter((w) => w !== watcher);
      });
      this.watchers.push(watcher);
    } catch (err) {
      console.debug(`[LogWatcher] Cannot watch ${filePath}: ${(err as Error).message}`);
    }
  }

  /** Read only the newly appended bytes since the last read position. */
  private readNewContent(filePath: string): void {
    try {
      const fd = fs.openSync(filePath, 'r');
      try {
        const stat = fs.fstatSync(fd);
        const prevPos = this.filePositions.get(filePath) ?? 0;
        if (stat.size <= prevPos) return;

        const chunkSize = Math.min(stat.size - prevPos, 65_536); // max 64 KB per read
        const buf = Buffer.allocUnsafe(chunkSize);
        fs.readSync(fd, buf, 0, chunkSize, prevPos);
        this.filePositions.set(filePath, prevPos + chunkSize);

        const newText = buf.toString('utf8');
        this.parseLines(newText, filePath);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // File might have been rotated — reinitialise
      this.initFile(filePath);
    }
  }

  /** Scan newly read lines against all patterns. */
  private parseLines(text: string, filePath: string): void {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      for (const pattern of PATTERNS) {
        const match = line.match(pattern.regex);
        if (match) {
          const event: LogEvent = {
            type: pattern.type,
            modelId: pattern.extractModel ? pattern.extractModel(match) : null,
            email: pattern.extractEmail ? pattern.extractEmail(match) : null,
            raw: line.slice(0, 300), // truncate for safety
            timestamp: new Date(),
          };
          console.log(`[LogWatcher] Event detected in ${path.basename(filePath)}: ${event.type} model=${event.modelId}`);
          this.emit('event', event);
          break; // first matching pattern wins
        }
      }
    }
  }

  /** Re-scan for new log files (e.g., after log rotation). */
  private refreshWatchers(): void {
    const current = new Set(this.watchedPaths);
    const found = this.discoverLogFiles();
    for (const f of found) {
      if (!current.has(f)) {
        console.log(`[LogWatcher] New log file discovered: ${f}`);
        this.watchedPaths.push(f);
        this.initFile(f);
        this.watchFile(f);
      }
    }
  }
}

// ─── Log directory discovery ─────────────────────────────────────────────────

/**
 * Return candidate log directories for the Antigravity IDE.
 * Checks common locations across macOS, Linux, and Windows.
 */
export function discoverLogDirs(globalStoragePath?: string): string[] {
  const home = os.homedir();
  const dirs: string[] = [];

  // Extension-provided global storage
  if (globalStoragePath) dirs.push(globalStoragePath);

  // macOS
  dirs.push(path.join(home, 'Library', 'Application Support', 'Antigravity', 'logs'));
  dirs.push(path.join(home, 'Library', 'Logs', 'Antigravity'));

  // Linux
  dirs.push(path.join(home, '.config', 'Antigravity', 'logs'));
  dirs.push(path.join(home, '.local', 'share', 'Antigravity', 'logs'));

  // Windows
  dirs.push(path.join(home, 'AppData', 'Roaming', 'Antigravity', 'logs'));
  dirs.push(path.join(home, 'AppData', 'Local', 'Antigravity', 'logs'));

  // VS Code-style paths (some forks use the same)
  dirs.push(path.join(home, '.vscode', 'logs'));
  dirs.push(path.join(home, 'Library', 'Application Support', 'Code', 'logs'));
  dirs.push(path.join(home, '.config', 'Code', 'logs'));

  return dirs.filter((d) => {
    try { return fs.existsSync(d); } catch { return false; }
  });
}
