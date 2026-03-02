const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

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
  const response = await fetch(`${backendUrl}/api/sponsor/mint`, {
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
  const response = await fetch(`${backendUrl}/api/coins`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Coin API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { coins: CoinListItem[] };
  return data.coins;
}
