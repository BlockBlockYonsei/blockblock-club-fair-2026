import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { getConfig } from './config.js';
import { FixedWindowLimiter } from './limiter.js';
import {
  coinIdToDisplayName,
  listCoinOptions,
  normalizeCoinId,
  readCoinImage,
  type CoinId,
} from './image.js';
import { SupabaseImageStore } from './supabase.js';

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, 'Invalid Sui address format');

const mintRequestSchema = z.object({
  sender: addressSchema,
  animal: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(48).optional(),
});

const coinIdParamsSchema = z.object({
  coinId: z.string().trim().min(1).max(32),
});

const config = getConfig();
const decoded = decodeSuiPrivateKey(config.sponsorPrivateKey);
if (decoded.scheme !== 'ED25519') {
  throw new Error('SPONSOR_PRIVATE_KEY must be an ED25519 Sui private key');
}

const sponsorKeypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
const sponsorAddress = sponsorKeypair.toSuiAddress();
const client = new SuiJsonRpcClient({
  url: config.suiRpcUrl,
  network: 'testnet',
});
const ipLimiter = new FixedWindowLimiter();
const senderLimiter = new FixedWindowLimiter();
const lockedGasCoins = new Map<string, number>();
const GAS_COIN_LOCK_MS = config.gasCoinLockMs;
const supabaseImageStore =
  config.supabaseUrl && config.supabaseBucketName
    ? new SupabaseImageStore({
        url: config.supabaseUrl,
        bucketName: config.supabaseBucketName,
        objectPrefix: config.supabaseObjectPrefix,
        publicBaseUrl: config.supabasePublicBaseUrl,
      })
    : null;

type MintTxInput = {
  sender: string;
  name?: string;
  imageUrl?: string;
  animalTrait?: string;
  attributes?: string;
};

function toBytes(input: Uint8Array | string): Uint8Array {
  return typeof input === 'string' ? fromBase64(input) : input;
}

function toB64(input: Uint8Array | string): string {
  return typeof input === 'string' ? input : toBase64(input);
}

function resolvePublicBaseUrl(request: FastifyRequest): string {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl;
  }

  const forwardedHost = request.headers['x-forwarded-host'];
  const hostHeader =
    typeof forwardedHost === 'string' ? forwardedHost : request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protoHeader =
    typeof forwardedProto === 'string' ? forwardedProto : request.protocol;
  const protocol = protoHeader?.split(',')[0]?.trim() || 'http';
  const host = hostHeader?.split(',')[0]?.trim() || `localhost:${config.port}`;

  return `${protocol}://${host}`;
}

function hasValidKeepaliveKey(request: FastifyRequest): boolean {
  if (!config.keepaliveKey) {
    return true;
  }

  const rawHeader = request.headers['x-keepalive-key'];
  const provided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  return typeof provided === 'string' && provided.trim() === config.keepaliveKey;
}

async function getGasPayment() {
  const coins = await client.getCoins({
    owner: sponsorAddress,
    coinType: '0x2::sui::SUI',
    limit: config.gasCoinFetchLimit,
  });

  const now = Date.now();
  for (const [objectId, lockUntil] of lockedGasCoins.entries()) {
    if (lockUntil <= now) {
      lockedGasCoins.delete(objectId);
    }
  }

  const minRequired =
    (BigInt(config.gasBudgetMist) * BigInt(config.gasCoinMinBalanceBps) + 9999n) / 10000n;
  const candidates = coins.data.filter(
    (item: { balance: string; coinObjectId: string }) =>
      BigInt(item.balance) > minRequired && !lockedGasCoins.has(item.coinObjectId),
  );

  if (candidates.length === 0) {
    throw new Error(
      `No available sponsor gas coin. Ensure at least ${config.targetConcurrentMints} SUI coin objects each above ${minRequired.toString()} MIST and wait for lock release (${GAS_COIN_LOCK_MS}ms).`,
    );
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  const coin = candidates[randomIndex];

  if (!coin) {
    throw new Error('Sponsor wallet has no gas coin with enough balance');
  }

  lockedGasCoins.set(coin.coinObjectId, now + GAS_COIN_LOCK_MS);

  return [
    {
      objectId: coin.coinObjectId,
      version: coin.version,
      digest: coin.digest,
    },
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function reserveGasPaymentWithRetry() {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= config.gasCoinReserveRetries; attempt += 1) {
    try {
      return await getGasPayment();
    } catch (error) {
      lastError = error;
      if (attempt === config.gasCoinReserveRetries) {
        break;
      }
      await sleep(config.gasCoinReserveRetryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function resolveCoinImageUrl(coinId: CoinId, request: FastifyRequest): Promise<string> {
  if (supabaseImageStore) {
    return supabaseImageStore.getCoinImageUrl(coinId);
  }

  const baseUrl = resolvePublicBaseUrl(request);
  return `${baseUrl}/api/coin/image/${encodeURIComponent(coinId)}`;
}

function buildAnimalAttributes(animalTrait: string): string {
  return JSON.stringify([{ trait_type: 'Animal', value: animalTrait }]);
}

async function buildSponsoredMintTx(input: MintTxInput) {
  const mintTx = new Transaction();
  mintTx.moveCall({
    target: `${config.packageId}::booth_nft::mint`,
    arguments: [
      mintTx.object(config.mintConfigObjectId),
      mintTx.pure.string(input.name ?? config.defaultNftName),
      mintTx.pure.string(input.imageUrl ?? config.defaultNftImageUrl),
      mintTx.pure.string(input.animalTrait ?? ''),
      mintTx.pure.string(input.attributes ?? '[]'),
    ],
  });
  mintTx.setSender(input.sender);

  const txKind = await mintTx.build({
    client,
    onlyTransactionKind: true,
  });

  const sponsoredTx = Transaction.fromKind(toBytes(txKind));
  sponsoredTx.setSender(input.sender);
  sponsoredTx.setGasOwner(sponsorAddress);
  sponsoredTx.setGasBudget(BigInt(config.gasBudgetMist));
  sponsoredTx.setExpiration({ None: true });
  sponsoredTx.setGasPayment(await reserveGasPaymentWithRetry());

  const txBytes = await sponsoredTx.build({ client });
  const { signature } = await sponsorKeypair.signTransaction(toBytes(txBytes));

  return {
    txBytes: toB64(txBytes),
    sponsorSignature: signature,
  };
}

async function main() {
  const app = Fastify({
    logger: true,
    trustProxy: config.trustProxy,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'), false);
    },
  });

  await app.register(rateLimit, {
    global: true,
    max: config.globalLimitPerMinute,
    timeWindow: '1 minute',
    keyGenerator: () => 'global',
  });

  app.get('/health', async () => {
    return {
      ok: true,
      sponsorAddress,
      packageId: config.packageId,
      mintConfigObjectId: config.mintConfigObjectId,
      supabaseEnabled: Boolean(supabaseImageStore),
      targetConcurrentMints: config.targetConcurrentMints,
      gasCoinLockMs: config.gasCoinLockMs,
      gasCoinFetchLimit: config.gasCoinFetchLimit,
      lockedGasCoins: lockedGasCoins.size,
    };
  });

  app.get('/api/keepalive', { logLevel: 'silent' }, async (request, reply) => {
    if (!hasValidKeepaliveKey(request)) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    app.log.info('ka');
    return { ok: true };
  });

  app.get('/api/coins', async (request, reply) => {
    try {
      const options = listCoinOptions();
      const coins = await Promise.all(
        options.map(async (option) => ({
          ...option,
          imageUrl: await resolveCoinImageUrl(option.coinId, request),
        })),
      );
      return { coins };
    } catch (error) {
      request.log.error({ error }, 'Failed to list coin options');
      reply.code(500);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  app.get('/api/coin/image/:coinId', async (request, reply) => {
    const parsed = coinIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: 'Invalid coinId',
        issues: parsed.error.issues,
      };
    }

    try {
      const coinId = normalizeCoinId(parsed.data.coinId);
      const png = readCoinImage(coinId);
      reply
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'public, max-age=31536000, immutable');
      return png;
    } catch (error) {
      reply.code(404);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  app.post('/api/sponsor/mint', async (request, reply) => {
    const ipLimit = ipLimiter.consume(`ip:${request.ip}`, config.ipLimitPerMinute, 60_000);
    if (!ipLimit.allowed) {
      reply.code(429);
      return {
        error: 'Rate limit exceeded (ip)',
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      };
    }

    const parsed = mintRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: 'Invalid request body',
        issues: parsed.error.issues,
      };
    }

    const senderLimit = senderLimiter.consume(
      `sender:${parsed.data.sender.toLowerCase()}`,
      config.senderLimitPer10Minutes,
      10 * 60_000,
    );
    if (!senderLimit.allowed) {
      reply.code(429);
      return {
        error: 'Rate limit exceeded (sender)',
        retryAfterSeconds: senderLimit.retryAfterSeconds,
      };
    }

    let coinId: CoinId;
    try {
      coinId = normalizeCoinId(parsed.data.animal);
    } catch (error) {
      reply.code(400);
      return {
        error: error instanceof Error ? error.message : 'Unsupported coin id',
      };
    }

    try {
      const imageUrl = await resolveCoinImageUrl(coinId, request);
      const animalTrait = coinIdToDisplayName(coinId);
      const sponsored = await buildSponsoredMintTx({
        sender: parsed.data.sender,
        name: parsed.data.name ?? config.defaultNftName,
        imageUrl,
        animalTrait,
        attributes: buildAnimalAttributes(animalTrait),
      });

      return {
        ...sponsored,
        gasOwner: sponsorAddress,
      };
    } catch (error) {
      request.log.error({ error }, 'Failed to build sponsored mint tx');
      reply.code(500);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
