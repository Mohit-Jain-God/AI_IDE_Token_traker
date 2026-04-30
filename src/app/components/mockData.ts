import type { Account, LogEntry, SystemSnapshot } from './types';

const NOW = Date.now();
const H = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const H_AGO = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const MIN_AGO = (m: number) => new Date(NOW - m * 60_000).toISOString();

function deriveStatus(models: Account['models']): Account['status'] {
  const percentages = models.map((m) => (m.limit - m.used) / m.limit);
  const min = Math.min(...percentages);
  if (min <= 0) return 'exhausted';
  if (min < 0.15) return 'low';
  return 'available';
}

const rawAccounts: Omit<Account, 'status'>[] = [
  {
    id: '01',
    email: 'user.ai.01@gmail.com',
    isActive: true,
    lastSnapshot: MIN_AGO(3),
    source: 'grpc',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 650_000, limit: 1_000_000, resetAt: H(18.5) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 280_000, limit: 1_000_000, resetAt: H(18.5) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 182_000, limit: 500_000, resetAt: H(18.5) },
    ],
  },
  {
    id: '02',
    email: 'user.ai.02@gmail.com',
    isActive: false,
    lastSnapshot: MIN_AGO(45),
    source: 'grpc',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 120_000, limit: 1_000_000, resetAt: H(22) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 85_000, limit: 1_000_000, resetAt: H(22) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 30_000, limit: 500_000, resetAt: H(22) },
    ],
  },
  {
    id: '03',
    email: 'user.ai.03@gmail.com',
    isActive: false,
    lastSnapshot: H_AGO(3),
    exhaustedAt: H_AGO(21),
    source: 'log',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 1_000_000, limit: 1_000_000, resetAt: H(3) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 1_000_000, limit: 1_000_000, resetAt: H(3) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 500_000, limit: 500_000, resetAt: H(3) },
    ],
  },
  {
    id: '04',
    email: 'user.ai.04@gmail.com',
    isActive: false,
    lastSnapshot: MIN_AGO(12),
    source: 'cache',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 450_000, limit: 1_000_000, resetAt: H(15) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 310_000, limit: 1_000_000, resetAt: H(15) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 200_000, limit: 500_000, resetAt: H(15) },
    ],
  },
  {
    id: '05',
    email: 'user.ai.05@gmail.com',
    isActive: false,
    lastSnapshot: MIN_AGO(28),
    source: 'grpc',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 870_000, limit: 1_000_000, resetAt: H(6) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 920_000, limit: 1_000_000, resetAt: H(6) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 445_000, limit: 500_000, resetAt: H(6) },
    ],
  },
  {
    id: '06',
    email: 'user.ai.06@gmail.com',
    isActive: false,
    lastSnapshot: H_AGO(7),
    exhaustedAt: H_AGO(17),
    source: 'log',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 1_000_000, limit: 1_000_000, resetAt: H(7) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 1_000_000, limit: 1_000_000, resetAt: H(7) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 500_000, limit: 500_000, resetAt: H(7) },
    ],
  },
  {
    id: '07',
    email: 'user.ai.07@gmail.com',
    isActive: false,
    lastSnapshot: H_AGO(1.5),
    source: 'grpc',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 0, limit: 1_000_000, resetAt: null },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 0, limit: 1_000_000, resetAt: null },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 0, limit: 500_000, resetAt: null },
    ],
  },
  {
    id: '08',
    email: 'user.ai.08@gmail.com',
    isActive: false,
    lastSnapshot: MIN_AGO(8),
    source: 'cache',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 550_000, limit: 1_000_000, resetAt: H(10) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 400_000, limit: 1_000_000, resetAt: H(10) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 150_000, limit: 500_000, resetAt: H(10) },
    ],
  },
  {
    id: '09',
    email: 'user.ai.09@gmail.com',
    isActive: false,
    lastSnapshot: H_AGO(10),
    exhaustedAt: H_AGO(10),
    source: 'log',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 1_000_000, limit: 1_000_000, resetAt: H(14) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 1_000_000, limit: 1_000_000, resetAt: H(14) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 500_000, limit: 500_000, resetAt: H(14) },
    ],
  },
  {
    id: '10',
    email: 'user.ai.10@gmail.com',
    isActive: false,
    lastSnapshot: MIN_AGO(55),
    source: 'grpc',
    models: [
      { modelId: 'gemini-2.5-pro', modelName: 'Gemini 2.5 Pro', used: 750_000, limit: 1_000_000, resetAt: H(8) },
      { modelId: 'gemini-2.0-flash', modelName: 'Gemini 2.0 Flash', used: 600_000, limit: 1_000_000, resetAt: H(8) },
      { modelId: 'gemini-1.5-pro', modelName: 'Gemini 1.5 Pro', used: 320_000, limit: 500_000, resetAt: H(8) },
    ],
  },
];

export const MOCK_ACCOUNTS: Account[] = rawAccounts.map((a) => ({
  ...a,
  status: deriveStatus(a.models),
}));

export const MOCK_SNAPSHOT: SystemSnapshot = {
  accounts: MOCK_ACCOUNTS,
  lastUpdated: MIN_AGO(3),
  activeEmail: 'user.ai.01@gmail.com',
  extensionVersion: '1.2.4',
};

export const MOCK_LOGS: LogEntry[] = [
  { ts: NOW - 30_000, type: 'SYNC', message: 'user.ai.01@gmail.com → 3 models updated via gRPC' },
  { ts: NOW - 2 * 60_000, type: 'SYNC', message: 'user.ai.10@gmail.com → 3 models updated via gRPC' },
  { ts: NOW - 8 * 60_000, type: 'SWITCH', message: 'Active account changed → user.ai.01@gmail.com' },
  { ts: NOW - 12 * 60_000, type: 'SYNC', message: 'user.ai.05@gmail.com → 3 models updated via cache' },
  { ts: NOW - 28 * 60_000, type: 'SYNC', message: 'user.ai.08@gmail.com → 3 models updated via cache' },
  { ts: NOW - 45 * 60_000, type: 'SYNC', message: 'user.ai.02@gmail.com → 3 models updated via gRPC' },
  { ts: NOW - 55 * 60_000, type: 'SYNC', message: 'user.ai.10@gmail.com → 3 models updated via gRPC' },
  { ts: NOW - 1.5 * 3_600_000, type: 'RESET', message: 'user.ai.07@gmail.com → quota restored, all models at 100%' },
  { ts: NOW - 3 * 3_600_000, type: 'EVENT', message: 'user.ai.03@gmail.com → RESOURCE_EXHAUSTED on gemini-2.5-pro' },
  { ts: NOW - 3.5 * 3_600_000, type: 'WARN', message: '429 Too Many Requests → gemini-1.5-pro (user.ai.03@gmail.com)' },
  { ts: NOW - 7 * 3_600_000, type: 'EVENT', message: 'user.ai.06@gmail.com → RESOURCE_EXHAUSTED on gemini-2.0-flash' },
  { ts: NOW - 10 * 3_600_000, type: 'EVENT', message: 'user.ai.09@gmail.com → RESOURCE_EXHAUSTED, all models exhausted' },
  { ts: NOW - 10.5 * 3_600_000, type: 'ERROR', message: 'gRPC probe failed for 127.0.0.1:7493 → falling back to log watcher' },
];
