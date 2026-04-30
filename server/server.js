#!/usr/bin/env node
/**
 * Antigravity Quota Tracker — Local Dashboard Server
 * Pure Node.js (no external dependencies)
 * Port: 9876
 * Storage: ~/.antigravity-quota-tracker.json
 */

'use strict';

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import url from 'url';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT = 9876;
const HOST = '127.0.0.1';
const DB_FILE = path.join(os.homedir(), '.antigravity-quota-tracker.json');
const STATIC_DIR = path.join(__dirname, 'public');
const CORS_ORIGIN = '*'; // Restrict in production

// ─── MIME types ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ─── Persistent storage helpers ───────────────────────────────────────────────

/**
 * Load the current snapshot from disk.
 * Returns a default structure if the file doesn't exist or is corrupt.
 * @returns {object}
 */
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[DB] Failed to read ${DB_FILE}:`, err.message);
  }
  return {
    accounts: [],
    lastUpdated: new Date().toISOString(),
    activeEmail: null,
    extensionVersion: 'unknown',
  };
}

/**
 * Persist the snapshot to disk atomically.
 * Writes to a temp file first then renames to avoid partial-write corruption.
 * @param {object} data
 */
function saveDB(data) {
  const tmp = `${DB_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error(`[DB] Failed to write ${DB_FILE}:`, err.message);
  }
}

// ─── Request helpers ──────────────────────────────────────────────────────────

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': CORS_ORIGIN,
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

/**
 * Read the full request body as a string.
 * Rejects if the body exceeds MAX_BODY_BYTES.
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  const MAX_BODY_BYTES = 1024 * 512; // 512 KB
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ─── Snapshot validation ──────────────────────────────────────────────────────

/**
 * Validate and normalise an incoming snapshot payload.
 * Throws if required fields are missing or malformed.
 * @param {any} payload
 * @returns {object}
 */
function validateSnapshot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload must be a JSON object');

  const { activeEmail, accounts, extensionVersion } = payload;

  if (!Array.isArray(accounts)) throw new Error('"accounts" must be an array');

  const validated = accounts.map((acc, i) => {
    if (typeof acc.email !== 'string') throw new Error(`accounts[${i}].email must be a string`);
    if (!Array.isArray(acc.models)) throw new Error(`accounts[${i}].models must be an array`);

    const models = acc.models.map((m, j) => {
      if (typeof m.modelId !== 'string') throw new Error(`accounts[${i}].models[${j}].modelId must be a string`);
      const used = Number(m.used) || 0;
      const limit = Number(m.limit) || 1;
      const remaining = Math.max(0, limit - used);
      const pct = remaining / limit;

      return {
        modelId: m.modelId,
        modelName: m.modelName || m.modelId,
        used,
        limit,
        resetAt: typeof m.resetAt === 'string' ? m.resetAt : null,
      };
    });

    // Derive status from models
    const minPct = Math.min(...models.map((m) => (m.limit - m.used) / m.limit));
    const status = minPct <= 0 ? 'exhausted' : minPct < 0.15 ? 'low' : 'available';

    return {
      id: String(acc.id || String(i + 1).padStart(2, '0')),
      email: acc.email,
      isActive: acc.email === activeEmail,
      status,
      models,
      lastSnapshot: new Date().toISOString(),
      exhaustedAt: status === 'exhausted' ? (acc.exhaustedAt || new Date().toISOString()) : undefined,
      source: acc.source || 'manual',
    };
  });

  return {
    accounts: validated,
    lastUpdated: new Date().toISOString(),
    activeEmail: typeof activeEmail === 'string' ? activeEmail : null,
    extensionVersion: typeof extensionVersion === 'string' ? extensionVersion : 'unknown',
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/snapshot
 * Accepts a snapshot payload from the IDE extension and persists it.
 */
async function handlePostSnapshot(req, res) {
  try {
    const raw = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return sendError(res, 400, 'Invalid JSON body');
    }

    const snapshot = validateSnapshot(payload);
    saveDB(snapshot);
    console.log(
      `[API] Snapshot saved — ${snapshot.accounts.length} accounts, active: ${snapshot.activeEmail ?? 'none'}`
    );

    sendJSON(res, 200, { ok: true, savedAt: snapshot.lastUpdated, accounts: snapshot.accounts.length });
  } catch (err) {
    console.error('[API] Snapshot error:', err.message);
    sendError(res, 422, err.message);
  }
}

/**
 * GET /api/accounts
 * Returns the current snapshot to the frontend dashboard.
 */
function handleGetAccounts(_req, res) {
  const data = loadDB();
  sendJSON(res, 200, data);
}

/**
 * GET /api/health
 * Simple liveness check.
 */
function handleGetHealth(_req, res) {
  sendJSON(res, 200, { status: 'ok', ts: new Date().toISOString(), port: PORT, dbFile: DB_FILE });
}

/**
 * Serve static files from the /server/public directory.
 * Falls back to index.html for client-side routing (SPA fallback).
 */
function serveStatic(reqPath, res) {
  let filePath = path.join(STATIC_DIR, reqPath === '/' ? 'index.html' : reqPath);

  // Prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    return sendError(res, 403, 'Forbidden');
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback — serve index.html for unknown routes
    filePath = path.join(STATIC_DIR, 'index.html');
    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, 'index.html not found. Place your dashboard build in server/public/');
    }
  }

  try {
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
    res.end(data);
  } catch {
    sendError(res, 500, 'Failed to read file');
  }
}

// ─── Main HTTP server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';
  const method = req.method?.toUpperCase();

  console.log(`[HTTP] ${method} ${pathname}`);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  setCORS(res);

  // API routes
  if (pathname === '/api/snapshot' && method === 'POST') {
    return handlePostSnapshot(req, res);
  }
  if (pathname === '/api/accounts' && method === 'GET') {
    return handleGetAccounts(req, res);
  }
  if (pathname === '/api/health' && method === 'GET') {
    return handleGetHealth(req, res);
  }

  // Static files (dashboard UI)
  if (method === 'GET') {
    return serveStatic(pathname, res);
  }

  sendError(res, 404, `Route not found: ${method} ${pathname}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use.\n  → Is the server already running?\n`);
  } else {
    console.error('[ERROR] Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   ANTIGRAVITY QUOTA TRACKER — LOCAL SERVER           ║
╠══════════════════════════════════════════════════════╣
║  Dashboard  →  http://${HOST}:${PORT}/                    ║
║  API        →  http://${HOST}:${PORT}/api/accounts        ║
║  Health     →  http://${HOST}:${PORT}/api/health          ║
║  DB file    →  ${DB_FILE.slice(0, 34).padEnd(34)}  ║
╚══════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
