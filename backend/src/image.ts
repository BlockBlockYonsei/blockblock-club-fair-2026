import fs from 'node:fs';
import path from 'node:path';

export const COIN_IDS = [
  'cow',
  'dog',
  'dragon',
  'eagle',
  'horse',
  'monkey',
  'pig',
  'rabbit',
  'rat',
  'rooster',
  'sheep',
  'snake',
  'tiger',
] as const;

export type CoinId = (typeof COIN_IDS)[number];

const coinIdSet = new Set<string>(COIN_IDS);

function resolveAssetPath(relativePath: string): string {
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(process.cwd(), '..', relativePath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Missing asset: ${relativePath}`);
}

function coinIdToFilename(coinId: CoinId): string {
  return `${coinId}.png`;
}

function resolveCoinImagePath(coinId: CoinId): string {
  const coinDir = resolveAssetPath('assets/coin_list');
  const filePath = path.join(coinDir, coinIdToFilename(coinId));
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing coin image for ${coinId}: ${filePath}`);
  }
  return filePath;
}

export function normalizeCoinId(rawCoinId: string): CoinId {
  const normalized = rawCoinId.trim().toLowerCase();
  if (!coinIdSet.has(normalized)) {
    throw new Error(`Unsupported coin id: ${rawCoinId}`);
  }
  return normalized as CoinId;
}

export function coinIdToDisplayName(coinId: CoinId): string {
  return coinId.slice(0, 1).toUpperCase() + coinId.slice(1);
}

export function coinIdToNftName(coinId: CoinId): string {
  const base = `${coinIdToDisplayName(coinId)} Coin Booth NFT`;
  return base.slice(0, 48);
}

export function listCoinOptions(): Array<{
  coinId: CoinId;
  displayName: string;
  nftName: string;
}> {
  return COIN_IDS.map((coinId) => ({
    coinId,
    displayName: coinIdToDisplayName(coinId),
    nftName: coinIdToNftName(coinId),
  }));
}

export function readCoinImage(coinId: CoinId): Buffer {
  return fs.readFileSync(resolveCoinImagePath(coinId));
}
