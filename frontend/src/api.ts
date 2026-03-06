const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';
const requestTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? '15000');
const coinListMaxRetries = Number(import.meta.env.VITE_COIN_LIST_MAX_RETRIES ?? '2');

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isRetryableFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, requestTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Request timeout (${requestTimeoutMs}ms)`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export type SponsoredMintResponse = {
  txBytes: string;
  sponsorSignature: string;
  gasOwner: string;
};

export type CoinListItem = {
  coinId: string;
  displayName: string;
  nftName: string;
  imageUrl: string;
};

export async function requestSponsoredMint(params: {
  sender: string;
  animal: string;
  name?: string;
}): Promise<SponsoredMintResponse> {
  const response = await fetchWithTimeout(`${backendUrl}/api/sponsor/mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sponsor API error (${response.status}): ${text}`);
  }

  return (await response.json()) as SponsoredMintResponse;
}

export async function requestCoinList(): Promise<CoinListItem[]> {
  const maxAttempts = Math.max(1, coinListMaxRetries + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${backendUrl}/api/coins`);

      if (!response.ok) {
        const text = await response.text();
        const statusError = new Error(`Coin API error (${response.status}): ${text}`);
        const canRetry = response.status >= 500 && attempt < maxAttempts;

        if (canRetry) {
          lastError = statusError;
          await delay(600 * attempt);
          continue;
        }

        throw statusError;
      }

      const data = (await response.json()) as { coins: CoinListItem[] };
      return data.coins;
    } catch (error) {
      const canRetry = attempt < maxAttempts && isRetryableFetchError(error);
      if (canRetry) {
        lastError = error;
        await delay(600 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to load coins');
}
