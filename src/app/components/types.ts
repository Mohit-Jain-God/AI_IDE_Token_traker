export interface ModelQuota {
  modelId: string;
  modelName: string;
  used: number;
  limit: number;
  resetAt: string | null; // ISO timestamp when this model quota resets
}

export interface Account {
  id: string;
  email: string;
  isActive: boolean;
  status: 'available' | 'low' | 'exhausted';
  models: ModelQuota[];
  lastSnapshot: string; // ISO timestamp of last sync
  exhaustedAt?: string; // ISO timestamp when account became exhausted
  source?: 'local-server' | 'grpc' | 'cache' | 'log' | 'manual';
}

export interface SystemSnapshot {
  accounts: Account[];
  lastUpdated: string;
  activeEmail: string | null;
  extensionVersion: string;
}

export interface LogEntry {
  ts: number;
  type: 'SYNC' | 'EVENT' | 'SWITCH' | 'RESET' | 'WARN' | 'ERROR';
  message: string;
}
