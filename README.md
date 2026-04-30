<div align="center">

# 🔋 Antigravity Quota Tracker

**Real-time AI token quota monitoring for the Antigravity IDE**

[![Version](https://img.shields.io/badge/version-1.2.5-blue.svg)](https://github.com/Mohit-Jain-God/AI_IDE_Token_traker)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![IDE](https://img.shields.io/badge/IDE-Antigravity-purple.svg)](https://antigravity.dev)

> Track your Google AI model quotas across multiple accounts — directly from the IDE, in real time, 100% locally.

</div>

---

## 📸 What It Does

The Antigravity Quota Tracker is a **3-component system** that monitors your Google AI token usage (Gemini, Claude, GPT) inside the Antigravity IDE and displays it on a beautiful local dashboard.

```
Antigravity Language Server  →  VS Code Extension  →  Node.js Server  →  React Dashboard
     (quota source)               (data collector)      (REST API)         (browser UI)
```

No cloud. No third-party servers. Everything runs on `127.0.0.1`.

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🔴🟡🟢 **Status indicators** | Available / Low Quota / Exhausted per account |
| 📊 **Per-model quota bars** | Visual progress bars with token counts |
| ⏱️ **Live countdown timers** | HH:MM:SS countdown to quota reset |
| 📋 **Activity log** | Scrollable feed of SYNC / EVENT / SWITCH / RESET / WARN events |
| 🔍 **Filter bar** | Filter accounts by status (All / Available / Low / Exhausted) |
| 🔄 **Auto-refresh** | Polls `/api/accounts` every 30 seconds |
| 🎭 **Demo mode** | Falls back to realistic mock data if server is unreachable |
| 🕐 **Live UTC clock** | Real-time clock in the dashboard header |
| 🏷️ **Data source badges** | Shows whether data came from `local-server` / `cache` / `log` |
| ⚡ **Instant exhaustion alerts** | Log watcher detects `RESOURCE_EXHAUSTED` and updates immediately |

### Models Tracked

| Model | Type |
|-------|------|
| Gemini 3.1 Pro (High) | Google AI |
| Gemini 3.1 Pro (Low) | Google AI |
| Gemini 3 Flash | Google AI |
| Claude Opus 4.6 (Thinking) | Anthropic via Antigravity |
| Claude Sonnet 4.6 (Thinking) | Anthropic via Antigravity |
| GPT-OSS 120B (Medium) | OpenAI via Antigravity |

---

## 🏗️ Architecture

```
antigravity-quota-tracker/
├── server/
│   └── server.js               # Pure Node.js REST API (port 9876, zero npm deps)
├── src/                        # React + Vite + Tailwind dashboard
│   └── app/
│       ├── App.tsx
│       ├── routes.tsx
│       └── components/
│           ├── DashboardPage.tsx   # Main dashboard view
│           ├── AccountCard.tsx     # Per-account quota card
│           ├── QuotaBar.tsx        # Animated progress bar
│           ├── CountdownTimer.tsx  # Live reset countdown
│           ├── mockData.ts         # Demo data fallback
│           └── types.ts
└── extension/                  # VS Code / Antigravity extension (TypeScript)
    └── src/
        ├── extension.ts            # Entry point, activation, sync loop
        ├── localStatusClient.ts    # Strategy A: local language server reader
        ├── grpcClient.ts           # Strategy B: legacy gRPC probe
        ├── cacheReader.ts          # Strategy C: JSON/DB cache reader
        ├── logWatcher.ts           # Strategy D: log file tail watcher
        ├── snapshotSender.ts       # HTTP POST to dashboard server
        └── types.ts                # Shared type definitions
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Antigravity IDE](https://antigravity.dev) installed
- Extension `.vsix` installed (see below)

### 1. Start the Dashboard Server

```bash
# No dependencies — pure Node.js built-ins
node server/server.js
```

Server starts at `http://127.0.0.1:9876`

```
╔══════════════════════════════════════════════════════╗
║   ANTIGRAVITY QUOTA TRACKER — LOCAL SERVER           ║
╠══════════════════════════════════════════════════════╣
║  Dashboard  →  http://127.0.0.1:9876/               ║
║  API        →  http://127.0.0.1:9876/api/accounts   ║
║  Health     →  http://127.0.0.1:9876/api/health     ║
╚══════════════════════════════════════════════════════╝
```

### 2. Install the Extension

```bash
# Build from source
cd extension
npm install
npm run compile
npm run package
```

Then in Antigravity IDE:
- `Extensions panel → ⋮ → Install from VSIX...`
- Select `extension/antigravity-quota-tracker-1.2.5.vsix`

Or via CLI:
```bash
antigravity --install-extension extension/antigravity-quota-tracker-1.2.5.vsix
```

### 3. Open the Dashboard

Open your browser at `http://127.0.0.1:9876` — or click the status bar item in the IDE.

### 4. (Optional) Run the React Dev Server

```bash
npm install
npm run dev
```

Open `http://localhost:5173` for the development version with hot-reload.

---

## ⚙️ Configuration

Add to your Antigravity `settings.json`:

```json
{
  "antigravityQuota.serverUrl": "http://127.0.0.1:9876",
  "antigravityQuota.syncIntervalSeconds": 300,
  "antigravityQuota.grpcPort": 7493,
  "antigravityQuota.enableLogWatcher": true,
  "antigravityQuota.accounts": [
    "user.ai.01@gmail.com",
    "user.ai.02@gmail.com",
    "user.ai.03@gmail.com"
  ]
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `serverUrl` | `http://127.0.0.1:9876` | URL of your local dashboard server |
| `syncIntervalSeconds` | `300` | How often to auto-sync (min: 30s) |
| `grpcPort` | `7493` | Legacy gRPC fallback port |
| `enableLogWatcher` | `true` | Watch IDE logs for exhaustion events |
| `accounts` | `[]` | List of Google account emails to track |

---

## 🛠️ IDE Commands

Open the Command Palette (`Ctrl+Shift+P`) and type `Antigravity`:

| Command | Description |
|---------|-------------|
| `Antigravity: Force Quota Sync` | Triggers an immediate sync |
| `Antigravity: Open Quota Dashboard` | Opens `http://127.0.0.1:9876` in browser |
| `Antigravity: Set Active Google Account` | Manually set which account is active |
| `Antigravity: Diagnose Quota Tracking` | Opens a detailed diagnostics report |

---

## 🔌 Server API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the dashboard UI |
| `GET` | `/api/accounts` | Returns current snapshot JSON |
| `POST` | `/api/snapshot` | Accepts quota snapshot from extension |
| `GET` | `/api/health` | Liveness check |

### Snapshot Payload (POST /api/snapshot)

```json
{
  "activeEmail": "you@gmail.com",
  "extensionVersion": "1.2.5",
  "accounts": [
    {
      "email": "you@gmail.com",
      "source": "local-server",
      "models": [
        {
          "modelId": "MODEL_PLACEHOLDER_M35",
          "modelName": "Claude Sonnet 4.6 (Thinking)",
          "used": 10000,
          "limit": 50000,
          "resetAt": "2026-05-01T08:30:00.000Z"
        }
      ]
    }
  ]
}
```

---

## 🔍 How Quota Extraction Works

The extension uses **4 strategies in priority order**:

### Strategy A — Local Language Server ✅ (Primary)
Calls the Antigravity IDE's own language server process running at `127.0.0.1`.
Reads process table to discover the CSRF token and port, then calls:
```
POST /exa.language_server_pb.LanguageServerService/GetUserStatus
```
Returns real-time `remainingFraction` per model. **This is 100% real data.**

### Strategy B — Legacy gRPC ⚠️ (Fallback)
Sends hand-crafted protobuf to port `7493` (`antigravity.QuotaService/GetModelQuota`).
Used on older Antigravity versions.

### Strategy C — JSON Cache Reader ⚠️ (Fallback)
Reads JSON files from Antigravity's `globalStorage` directory:
- `quota-cache.json`, `quota.json`, `ai-state.json`, `gemini-quota.json`

### Strategy D — Log Watcher ✅ (Always Active)
Uses `fs.watch()` on IDE log files. Detects:
- `RESOURCE_EXHAUSTED`
- `429 Too Many Requests`
- `quotaExceeded`

On detection → immediately zeros out the model's quota and pushes a snapshot.

---

## 📊 Understanding the Data

The API returns a `remainingFraction` (0.0–1.0). The extension converts it:

```
used = limit × (1 − remainingFraction)

Example: remainingFraction = 0.8, limit = 50,000
→ used = 50,000 × 0.2 = 10,000 tokens used
→ remaining = 40,000 tokens
```

Status thresholds:
- 🟢 **Available** — remaining > 15%
- 🟡 **Low** — remaining ≤ 15%
- 🔴 **Exhausted** — remaining = 0%

---

## 🔒 Privacy & Security

- ✅ **100% local** — no data ever leaves your machine
- ✅ **No telemetry** — zero analytics or tracking
- ✅ **CSRF protected** — uses the IDE's own session token
- ✅ **No internet calls** — extension only talks to `127.0.0.1`
- ✅ **Atomic file writes** — crash-safe DB updates via write-then-rename
- ✅ **512 KB body limit** — server rejects oversized payloads

---

## ⚠️ Installation Note (Engine Version Fix)

Antigravity uses a custom version number (e.g., `1.107.0`). If you get a version error during VSIX install:

1. Rename `.vsix` → `.zip` and unzip
2. Open `extension.vsixmanifest`
3. Replace the `<InstallationTarget>` tag:
```xml
<InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.0.0,)"/>
```
4. Re-zip and rename back to `.vsix`

---

## 🗺️ Roadmap

- [ ] SQLite database for historical usage tracking
- [ ] Multi-account auto-merge (preserve previous account data)
- [ ] Usage trend charts (7-day graphs)
- [ ] Cursor IDE support
- [ ] Windsurf IDE support
- [ ] GitHub Copilot quota tracking
- [ ] VS Code Marketplace publish
- [ ] Desktop notification when quota < 15%
- [ ] Electron system tray app

---

## 🧑‍💻 Development

```bash
# Dashboard (React + Vite)
npm install
npm run dev        # http://localhost:5173

# Server
node server/server.js   # http://127.0.0.1:9876

# Extension
cd extension
npm install
npm run watch      # TypeScript watch mode
npm run compile    # One-time build
npm run package    # Build .vsix
```

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
Made with ❤️ for developers who live inside their IDE quota limits
</div>
