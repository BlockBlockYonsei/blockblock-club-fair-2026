import 'dotenv/config';

export type AppConfig = {
  port: number;
  host: string;
  trustProxy: boolean;
  publicBaseUrl?: string;
  s3BucketName?: string;
  s3Region?: string;
  s3PublicBaseUrl?: string;
  s3ObjectPrefix: string;
  allowedOrigins: string[];
  suiRpcUrl: string;
  packageId: string;
  mintConfigObjectId: string;
  sponsorPrivateKey: string;
  gasBudgetMist: string;
  defaultNftName: string;
  defaultNftImageUrl: string;
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
  const s3BucketName = optionalTrimmed('S3_BUCKET_NAME');
  const s3PublicBaseUrl = optionalTrimmed('S3_PUBLIC_BASE_URL');
  const s3Region = optionalTrimmed('S3_REGION') ?? optionalTrimmed('AWS_REGION');
  const s3ObjectPrefix = optionalTrimmed('S3_OBJECT_PREFIX') ?? 'generated';

  if (s3BucketName && !s3Region) {
    throw new Error('S3_REGION (or AWS_REGION) is required when S3_BUCKET_NAME is set');
  }

  return {
    port: Number(process.env.PORT ?? '3001'),
    host: process.env.HOST ?? '0.0.0.0',
    trustProxy: boolFromEnv('TRUST_PROXY', false),
    publicBaseUrl: publicBaseUrl ? publicBaseUrl.replace(/\/+$/, '') : undefined,
    s3BucketName,
    s3Region,
    s3PublicBaseUrl: s3PublicBaseUrl
      ? toHttpsUrlIfMissingProtocol(s3PublicBaseUrl).replace(/\/+$/, '')
      : undefined,
    s3ObjectPrefix: s3ObjectPrefix.replace(/^\/+|\/+$/g, ''),
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
