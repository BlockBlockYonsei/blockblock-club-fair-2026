import 'dotenv/config';

export type AppConfig = {
  port: number;
  host: string;
  trustProxy: boolean;
  publicBaseUrl?: string;
  allowedOrigins: string[];
  suiRpcUrl: string;
  packageId: string;
  mintConfigObjectId: string;
  sponsorPrivateKey: string;
  gasBudgetMist: string;
  defaultNftName: string;
  defaultNftImageUrl: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  supabaseBucketName?: string;
  supabasePublicBaseUrl?: string;
  supabaseObjectPrefix: string;
  rateLimitRelaxed: boolean;
  globalLimitPerMinute: number;
  ipLimitPerMinute: number;
  senderLimitPer10Minutes: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  return value === '1' || value === 'true' || value === 'yes';
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer env: ${name}`);
  }
  return parsed;
}

function optionalTrimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function toHttpsUrlIfMissingProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

export function getConfig(): AppConfig {
  const rateLimitRelaxed = boolFromEnv('RATE_LIMIT_RELAXED', false);
  const publicBaseUrl = optionalTrimmed('PUBLIC_BASE_URL');

  const supabaseUrl = optionalTrimmed('SUPABASE_URL');
  const supabaseServiceRoleKey = optionalTrimmed('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseBucketName = optionalTrimmed('SUPABASE_BUCKET_NAME');
  const supabasePublicBaseUrl = optionalTrimmed('SUPABASE_PUBLIC_BASE_URL');
  const supabaseObjectPrefix = optionalTrimmed('SUPABASE_OBJECT_PREFIX') ?? 'coin-list';

  const hasSupabaseConfig = Boolean(
    supabaseUrl || supabaseServiceRoleKey || supabaseBucketName,
  );
  const isSupabaseConfigComplete = Boolean(
    supabaseUrl && supabaseServiceRoleKey && supabaseBucketName,
  );
  if (hasSupabaseConfig && !isSupabaseConfigComplete) {
    throw new Error(
      'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET_NAME must all be set together',
    );
  }

  return {
    port: Number(process.env.PORT ?? '3001'),
    host: process.env.HOST ?? '0.0.0.0',
    trustProxy: boolFromEnv('TRUST_PROXY', false),
    publicBaseUrl: publicBaseUrl ? publicBaseUrl.replace(/\/+$/, '') : undefined,
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS ??
      'http://localhost:5173,https://blockblock-club-fair-2026.onrender.com'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    suiRpcUrl: process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443',
    packageId: required('CONTRACT_PACKAGE_ID'),
    mintConfigObjectId: required('MINT_CONFIG_OBJECT_ID'),
    sponsorPrivateKey: required('SPONSOR_PRIVATE_KEY'),
    gasBudgetMist: process.env.GAS_BUDGET_MIST ?? '30000000',
    defaultNftName: process.env.DEFAULT_NFT_NAME ?? 'BlockBlock Booth NFT',
    defaultNftImageUrl:
      process.env.DEFAULT_NFT_IMAGE_URL ??
      'https://placehold.co/1024x1024/png?text=BlockBlock+Booth',
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseBucketName,
    supabasePublicBaseUrl: supabasePublicBaseUrl
      ? toHttpsUrlIfMissingProtocol(supabasePublicBaseUrl).replace(/\/+$/, '')
      : undefined,
    supabaseObjectPrefix: supabaseObjectPrefix.replace(/^\/+|\/+$/g, ''),
    rateLimitRelaxed,
    globalLimitPerMinute: intFromEnv(
      'RATE_LIMIT_GLOBAL_PER_MINUTE',
      rateLimitRelaxed ? 600 : 300,
    ),
    ipLimitPerMinute: intFromEnv(
      'RATE_LIMIT_IP_PER_MINUTE',
      rateLimitRelaxed ? 240 : 120,
    ),
    senderLimitPer10Minutes: intFromEnv(
      'RATE_LIMIT_SENDER_PER_10_MINUTES',
      rateLimitRelaxed ? 4 : 2,
    ),
  };
}
