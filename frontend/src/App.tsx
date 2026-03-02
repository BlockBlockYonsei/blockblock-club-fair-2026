import { useEffect, useMemo, useState } from 'react';
import {
  ConnectButton,
  useCurrentAccount,
  useSignTransaction,
  useSuiClient,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import {
  type CoinListItem,
  type SponsoredMintResponse,
  requestCoinList,
  requestSponsoredMint,
} from './api';

type MintState =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'ready'; message: string }
  | { kind: 'success'; digest: string; objectId?: string }
  | { kind: 'error'; message: string };

type CoinState =
  | { kind: 'loading'; message: string }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

function toUserMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('Failed to open new window')) {
    return '브라우저 팝업이 차단되었습니다. 사이트 팝업 허용 후 "지갑 서명하고 민팅하기" 버튼을 다시 눌러 주세요.';
  }
  if (raw.includes('), 3)')) {
    return '민팅 수량이 모두 소진되었습니다.';
  }
  if (raw.includes('), 4)')) {
    return '현재 민팅이 일시 중지 상태입니다.';
  }
  return raw;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function compactText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export default function App() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { network: currentNetwork } = useSuiClientContext();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const [coinOptions, setCoinOptions] = useState<CoinListItem[]>([]);
  const [coinState, setCoinState] = useState<CoinState>({
    kind: 'loading',
    message: '동물 코인 목록을 불러오는 중...',
  });
  const [selectedCoinId, setSelectedCoinId] = useState('');
  const [mintName, setMintName] = useState('');
  const [mintState, setMintState] = useState<MintState>({ kind: 'idle' });
  const [preparedTx, setPreparedTx] = useState<SponsoredMintResponse | null>(null);

  useEffect(() => {
    let active = true;

    const loadCoins = async () => {
      try {
        const loaded = await requestCoinList();
        if (!active) {
          return;
        }

        if (loaded.length === 0) {
          setCoinOptions([]);
          setCoinState({ kind: 'error', message: '사용 가능한 동물 코인이 없습니다.' });
          return;
        }

        setCoinOptions(loaded);
        setSelectedCoinId(loaded[0].coinId);
        setMintName(loaded[0].nftName);
        setCoinState({ kind: 'success' });
      } catch (error) {
        if (!active) {
          return;
        }
        setCoinState({
          kind: 'error',
          message: toUserMessage(error),
        });
      }
    };

    loadCoins().catch(() => {
      // noop: handled in loadCoins
    });

    return () => {
      active = false;
    };
  }, []);

  const selectedCoin = useMemo(() => {
    return coinOptions.find((item) => item.coinId === selectedCoinId);
  }, [coinOptions, selectedCoinId]);

  const canPrepareMint = useMemo(() => {
    return (
      Boolean(account?.address) &&
      coinState.kind === 'success' &&
      Boolean(selectedCoin) &&
      mintState.kind !== 'loading'
    );
  }, [account?.address, coinState.kind, selectedCoin, mintState.kind]);

  const canSignMint = useMemo(() => {
    return Boolean(account?.address) && Boolean(preparedTx) && mintState.kind !== 'loading';
  }, [account?.address, preparedTx, mintState.kind]);

  const onSelectCoin = (coin: CoinListItem) => {
    setSelectedCoinId(coin.coinId);
    setMintName(coin.nftName);
    setPreparedTx(null);
    if (mintState.kind !== 'loading') {
      setMintState({ kind: 'idle' });
    }
  };

  const onClickMint = async () => {
    if (!account?.address) {
      setMintState({ kind: 'error', message: '먼저 Slush 지갑을 연결해 주세요.' });
      return;
    }

    if (!selectedCoin) {
      setMintState({ kind: 'error', message: '민팅할 동물을 먼저 선택해 주세요.' });
      return;
    }

    try {
      setPreparedTx(null);
      setMintState({ kind: 'loading', message: '가스비 대납 트랜잭션 생성 중...' });
      const sponsored = await requestSponsoredMint({
        sender: account.address,
        animal: selectedCoin.coinId,
        name: compactText(mintName) || undefined,
      });
      setPreparedTx(sponsored);
      setMintState({
        kind: 'ready',
        message: '트랜잭션 준비 완료. 아래 버튼을 눌러 지갑 서명을 진행해 주세요.',
      });
    } catch (error) {
      setMintState({
        kind: 'error',
        message: toUserMessage(error),
      });
    }
  };

  const onClickSignAndExecute = async () => {
    if (!account?.address) {
      setMintState({ kind: 'error', message: '먼저 Slush 지갑을 연결해 주세요.' });
      return;
    }
    if (!preparedTx) {
      setMintState({
        kind: 'error',
        message: '먼저 "민팅 트랜잭션 준비하기"를 실행해 주세요.',
      });
      return;
    }

    try {
      setMintState({ kind: 'loading', message: '지갑 서명 요청 중...' });
      const signed = await signTransaction({
        transaction: preparedTx.txBytes,
      });

      setMintState({ kind: 'loading', message: '체인에 민팅 전송 중...' });
      const result = await client.executeTransactionBlock({
        transactionBlock: signed.bytes ?? preparedTx.txBytes,
        signature: [signed.signature, preparedTx.sponsorSignature],
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (result.effects?.status.status !== 'success') {
        throw new Error(result.effects?.status.error ?? 'Mint failed');
      }

      const createdNft = result.objectChanges?.find((change) => {
        return (
          change.type === 'created' &&
          'objectType' in change &&
          String(change.objectType).includes('::booth_nft::BoothNFT')
        );
      });

      setMintState({
        kind: 'success',
        digest: result.digest,
        objectId: createdNft && 'objectId' in createdNft ? createdNft.objectId : undefined,
      });
      setPreparedTx(null);
    } catch (error) {
      setMintState({
        kind: 'error',
        message: toUserMessage(error),
      });
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="tag">Sui Testnet Booth</p>
        <h1>동물 코인 NFT 빠른 민팅</h1>
        <p className="description">
          동물 코인을 고르고, 스폰서드 트랜잭션으로 바로 NFT를 민팅합니다.
        </p>
        <ConnectButton />
      </section>

      <section className="panel">
        <h2>1) Web3 로그인 (Slush Wallet)</h2>
        <p>
          연결 상태:{' '}
          {account?.address
            ? `로그인 완료 - ${shortAddress(account.address)}`
            : '미연결'}
        </p>
        <p>네트워크: {currentNetwork}</p>
      </section>

      <section className="panel">
        <h2>2) 동물 코인 선택</h2>
        {coinState.kind === 'loading' && <p>{coinState.message}</p>}
        {coinState.kind === 'error' && <p className="error">{coinState.message}</p>}

        {coinState.kind === 'success' && (
          <>
            <div className="coin-grid">
              {coinOptions.map((coin) => {
                const selected = selectedCoinId === coin.coinId;
                return (
                  <button
                    type="button"
                    key={coin.coinId}
                    className={`coin-card ${selected ? 'selected' : ''}`}
                    onClick={() => onSelectCoin(coin)}
                  >
                    <img src={coin.imageUrl} alt={coin.displayName} loading="lazy" />
                    <span className="coin-name">{coin.displayName}</span>
                  </button>
                );
              })}
            </div>

            {selectedCoin && (
              <>
                <p className="helper">선택된 코인: {selectedCoin.displayName}</p>
                <img className="preview-image" src={selectedCoin.imageUrl} alt="NFT preview" />
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>3) NFT 민팅</h2>
        <label>
          NFT 이름
          <input
            value={mintName}
            onChange={(event) => setMintName(event.target.value)}
            maxLength={48}
          />
        </label>

        <div className="panel-actions">
          <button onClick={onClickMint} disabled={!canPrepareMint}>
            민팅 트랜잭션 준비하기
          </button>
          <button onClick={onClickSignAndExecute} disabled={!canSignMint}>
            지갑 서명하고 민팅하기
          </button>
        </div>

        {mintState.kind === 'loading' && <p>{mintState.message}</p>}
        {mintState.kind === 'ready' && <p className="helper">{mintState.message}</p>}
        {mintState.kind === 'error' && <p className="error">{mintState.message}</p>}
        {mintState.kind === 'success' && (
          <div className="success">
            <p>민팅 성공</p>
            <p>Tx Digest: {mintState.digest}</p>
            {mintState.objectId && <p>NFT Object: {mintState.objectId}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
