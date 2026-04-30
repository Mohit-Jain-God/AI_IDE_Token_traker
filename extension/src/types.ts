export interface ModelQuota {
  modelId: string;
  modelName: string;
  used: number;
  limit: number;
  resetAt: string | null;
}

export interface AccountSnapshot {
  id: string;
  email: string;
  models: ModelQuota[];
  exhaustedAt?: string;
  source: 'local-server' | 'grpc' | 'cache' | 'log' | 'manual';
}

export interface FullSnapshot {
  accounts: AccountSnapshot[];
  activeEmail: string | null;
  extensionVersion: string;
}

export interface GrpcQuotaResponse {
  modelId: string;
  usedTokens: number;
  limitTokens: number;
  resetAtUnixMs: number;
}

/** Known model IDs and human-readable names (Gemini + Antigravity live API). */
export const KNOWN_MODELS: Record<string, string> = {
  // Classic Gemini free-tier models
  'gemini-2.5-pro':   'Gemini 2.5 Pro',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-1.5-pro':   'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-1.0-pro':   'Gemini 1.0 Pro',
  // Antigravity live API model IDs (from GetUserStatus → cascadeModelConfigData)
  'MODEL_PLACEHOLDER_M26': 'Claude Opus 4.6 (Thinking)',
  'MODEL_PLACEHOLDER_M35': 'Claude Sonnet 4.6 (Thinking)',
  'MODEL_PLACEHOLDER_M36': 'Gemini 3.1 Pro (Low)',
  'MODEL_PLACEHOLDER_M37': 'Gemini 3.1 Pro (High)',
  'MODEL_PLACEHOLDER_M84': 'Gemini 3 Flash',
  'MODEL_OPENAI_GPT_OSS_120B_MEDIUM': 'GPT-OSS 120B (Medium)',
};

/** Default monthly credit limits per plan (Pro tier = 50,000 prompt + 150,000 flow). */
export const DEFAULT_LIMITS: Record<string, number> = {
  // Classic Gemini free-tier
  'gemini-2.5-pro':   1_000_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-1.5-pro':     500_000,
  'gemini-1.5-flash':   500_000,
  'gemini-1.0-pro':     500_000,
  // Antigravity Pro tier — monthly prompt credits (50,000 total shared)
  'MODEL_PLACEHOLDER_M26': 50_000,
  'MODEL_PLACEHOLDER_M35': 50_000,
  'MODEL_PLACEHOLDER_M36': 50_000,
  'MODEL_PLACEHOLDER_M37': 50_000,
  'MODEL_PLACEHOLDER_M84': 50_000,
  'MODEL_OPENAI_GPT_OSS_120B_MEDIUM': 50_000,
};
