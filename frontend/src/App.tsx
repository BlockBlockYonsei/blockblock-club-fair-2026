import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ConnectButton,
  useCurrentAccount,
  useSignTransaction,
  useSuiClient,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import {
  type CoinListItem,
  requestCoinList,
  requestSponsoredMint,
} from './api';
import logoRound from './assets/ui_assets/logo_round.png';
import headerSvg from '../../assets/ui_assets/Header.svg';
import titleSvg from '../../assets/ui_assets/Title.svg';
import nftModalTitleSvg from '../../assets/ui_assets/NFT_modal.svg';
import footerLogo from '../../assets/ui_assets/blockblock_logo.png';

type MintState =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'success'; digest: string; objectId?: string; imageUrl?: string }
  | { kind: 'error'; message: string };

type CoinState =
  | { kind: 'loading'; message: string }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

const FIXED_NFT_NAME = 'BLOCKBLOCK NFT - 2026 Spring Yonsei Club Fair';
const COIN_DISPLAY_ORDER: string[] = [
  'eagle',
  'rat',
  'cow',
  'tiger',
  'rabbit',
  'dragon',
  'snake',
  'horse',
  'sheep',
  'monkey',
  'rooster',
  'dog',
  'pig',
];
const COIN_ORDER_INDEX = new Map<string, number>(
  COIN_DISPLAY_ORDER.map((coinId, index) => [coinId, index]),
);
const COIN_NAME_KR: Record<string, string> = {
  eagle: '독수리',
  rat: '쥐',
  cow: '소',
  tiger: '호랑이',
  rabbit: '토끼',
  dragon: '용',
  snake: '뱀',
  horse: '말',
  sheep: '양',
  monkey: '원숭이',
  rooster: '닭',
  dog: '강아지',
  pig: '돼지',
};

function getCoinNameKr(coinId: string, fallbackName: string): string {
  return COIN_NAME_KR[coinId] ?? fallbackName;
}

function getSuiVisionObjectUrl(objectId: string, network: string): string {
  const encodedObjectId = encodeURIComponent(objectId);
  if (network === 'testnet') {
    return `https://testnet.suivision.xyz/object/${encodedObjectId}`;
  }
  if (network === 'devnet') {
    return `https://devnet.suivision.xyz/object/${encodedObjectId}`;
  }
  return `https://suivision.xyz/object/${encodedObjectId}`;
}

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

function toPlainString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const asRecord = value as Record<string, unknown>;
  const bytes = asRecord.bytes;
  if (typeof bytes === 'string' && bytes.length > 0) {
    return bytes;
  }

  return undefined;
}

function extractImageUrlFromObjectData(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const asRecord = data as Record<string, unknown>;
  const display = asRecord.display as { data?: Record<string, unknown> } | undefined;
  const displayImageUrl = toPlainString(display?.data?.image_url);
  if (displayImageUrl) {
    return displayImageUrl;
  }
  const displayImage = toPlainString(display?.data?.image);
  if (displayImage) {
    return displayImage;
  }

  const content = asRecord.content as { fields?: Record<string, unknown> } | undefined;
  const imageUrlFromContent = toPlainString(content?.fields?.image_url);
  if (imageUrlFromContent) {
    return imageUrlFromContent;
  }
  const imageFromContent = toPlainString(content?.fields?.image);
  if (imageFromContent) {
    return imageFromContent;
  }

  return undefined;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    image.src = src;
  });
}

async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }

  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(sourceUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      throw new Error('이미지 크기를 확인할 수 없습니다.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('이미지 변환을 시작할 수 없습니다.');
    }
    context.drawImage(image, 0, 0, width, height);

    const converted = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    if (!converted) {
      throw new Error('PNG 변환에 실패했습니다.');
    }

    return converted;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function LandingLoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <div className="loading-screen__glow" aria-hidden="true" />
      <div className="loading-screen__content">
        <img className="loading-screen__logo" src={logoRound} alt="BlockBlock 로고" />
        <p className="loading-screen__subtitle">연세대학교 블록체인 동아리,
블록블록입니다.</p>
        <div className="loading-screen__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  );
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
  const [mintState, setMintState] = useState<MintState>({ kind: 'idle' });
  const [isNftModalOpen, setIsNftModalOpen] = useState(false);
  const [isSavingNftImage, setIsSavingNftImage] = useState(false);
  const [saveNftError, setSaveNftError] = useState('');
  const [canHideLoading, setCanHideLoading] = useState(false);
  const sliderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setCanHideLoading(true);
    }, 1500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

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

        const sortedLoaded = [...loaded].sort((a, b) => {
          const aIndex = COIN_ORDER_INDEX.get(a.coinId) ?? Number.MAX_SAFE_INTEGER;
          const bIndex = COIN_ORDER_INDEX.get(b.coinId) ?? Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) {
            return aIndex - bIndex;
          }
          return a.coinId.localeCompare(b.coinId);
        });

        setCoinOptions(sortedLoaded);
        setSelectedCoinId(sortedLoaded[0].coinId);
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

  useEffect(() => {
    if (!isNftModalOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNftModalOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isNftModalOpen]);

  const selectedCoin = useMemo(() => {
    return coinOptions.find((item) => item.coinId === selectedCoinId);
  }, [coinOptions, selectedCoinId]);

  const canMint = useMemo(() => {
    return (
      Boolean(account?.address) &&
      coinState.kind === 'success' &&
      Boolean(selectedCoin) &&
      mintState.kind !== 'loading'
    );
  }, [account?.address, coinState.kind, selectedCoin, mintState.kind]);

  const onSelectCoin = (coin: CoinListItem) => {
    setSelectedCoinId(coin.coinId);
    setIsNftModalOpen(false);
    setSaveNftError('');
    if (mintState.kind !== 'loading') {
      setMintState({ kind: 'idle' });
    }
  };

  const onClickSaveNftImage = async () => {
    if (mintState.kind !== 'success' || !mintState.imageUrl) {
      setSaveNftError('저장할 NFT 이미지가 아직 준비되지 않았습니다.');
      return;
    }

    setIsSavingNftImage(true);
    setSaveNftError('');

    try {
      const response = await fetch(mintState.imageUrl, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`이미지 요청 실패 (${response.status})`);
      }

      const sourceBlob = await response.blob();
      const pngBlob = await toPngBlob(sourceBlob);

      const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
      const suffix = selectedCoin ? selectedCoin.coinId : 'nft';
      const filename = `blockblock-${suffix}-${timestamp}.png`;
      const file = new File([pngBlob], filename, { type: 'image/png' });

      // iOS/Safari 환경에서는 파일 다운로드보다 공유 시트를 통한 저장이 안정적이다.
      if (typeof navigator.share === 'function') {
        const sharePayload = {
          files: [file],
          title: 'BlockBlock NFT',
          text: '내 NFT 이미지를 저장해요.',
        };
        const canShareFiles =
          typeof navigator.canShare !== 'function' || navigator.canShare(sharePayload);

        if (canShareFiles) {
          try {
            await navigator.share(sharePayload);
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return;
            }
          }
        }
      }

      const downloadUrl = URL.createObjectURL(pngBlob);

      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1000);
    } catch (error) {
      setSaveNftError(toUserMessage(error));
    } finally {
      setIsSavingNftImage(false);
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
      setIsNftModalOpen(false);
      setMintState({ kind: 'loading', message: '가스비 대납 트랜잭션 생성 중...' });
      const sponsored = await requestSponsoredMint({
        sender: account.address,
        animal: selectedCoin.coinId,
        name: FIXED_NFT_NAME,
      });
      setMintState({ kind: 'loading', message: '지갑 서명 요청 중...' });
      const signed = await signTransaction({
        transaction: sponsored.txBytes,
      });

      setMintState({ kind: 'loading', message: '체인에 민팅 전송 중...' });
      const result = await client.executeTransactionBlock({
        transactionBlock: signed.bytes ?? sponsored.txBytes,
        signature: [signed.signature, sponsored.sponsorSignature],
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

      const objectId = createdNft && 'objectId' in createdNft ? createdNft.objectId : undefined;
      let imageUrl: string | undefined;

      if (objectId) {
        try {
          const objectResult = await client.getObject({
            id: objectId,
            options: {
              showContent: true,
              showDisplay: true,
            },
          });
          imageUrl = extractImageUrlFromObjectData(objectResult.data);
        } catch (error) {
          console.error('Failed to load minted NFT image', error);
        }
      }

      if (!imageUrl) {
        imageUrl = selectedCoin.imageUrl;
      }

      setMintState({
        kind: 'success',
        digest: result.digest,
        objectId,
        imageUrl,
      });
      setSaveNftError('');
      setIsNftModalOpen(true);
    } catch (error) {
      setMintState({
        kind: 'error',
        message: toUserMessage(error),
      });
    }
  };

  const onClickSlide = (direction: 'prev' | 'next') => {
    const slider = sliderRef.current;
    if (!slider) {
      return;
    }

    const firstCard = slider.querySelector<HTMLElement>('.coin-card');
    const cardWidth = firstCard?.getBoundingClientRect().width ?? slider.clientWidth;
    const gapPx = Number.parseFloat(window.getComputedStyle(slider).gap) || 0;
    const amount = cardWidth + gapPx;

    slider.scrollBy({
      left: direction === 'next' ? amount : -amount,
      behavior: 'smooth',
    });
  };

  const showLoadingScreen = coinState.kind === 'loading' || !canHideLoading;

  if (showLoadingScreen) {
    return <LandingLoadingScreen />;
  }

  return (
    <main className="landing-shell">
      <div className="landing-page">
        <img className="landing-header-image" src={headerSvg} alt="2026 동아리 박람회" />
        <img className="landing-title-image" src={titleSvg} alt="NFT 민팅 체험하기" />

        <section className="step-card">
          <h2 className="step-title">Step 1. Web3 지갑 로그인</h2>
          <p className="step-copy">
            이번 NFT 체험에서는 Sui 블록체인을 사용해요.
            <br />
            우선 구글 계정으로 소셜 로그인을 해주세요.
          </p>
          <div className="wallet-connect">
            <ConnectButton />
          </div>
          <p className="step-meta">
            연결 상태:{' '}
            {account?.address
              ? `로그인 완료 - ${shortAddress(account.address)}`
              : '미연결'}
          </p>
          <p className="step-meta">네트워크: {currentNetwork}</p>
        </section>

        <section className="step-card">
          <h2 className="step-title">Step 2. 좋아하는 동물 고르기</h2>
          {coinState.kind === 'error' && <p className="error">{coinState.message}</p>}

          {coinState.kind === 'success' && (
            <>
              <div className="coin-slider-shell">
                <button
                  type="button"
                  className="coin-nav coin-nav--left"
                  onClick={() => onClickSlide('prev')}
                  aria-label="이전 동물 코인"
                >
                  ‹
                </button>
                <div
                  ref={sliderRef}
                  className="coin-slider"
                  role="listbox"
                  aria-label="동물 코인 목록"
                >
                  {coinOptions.map((coin) => {
                    const selected = selectedCoinId === coin.coinId;
                    return (
                      <button
                        type="button"
                        key={coin.coinId}
                        className={`coin-card ${selected ? 'selected' : ''}`}
                        onClick={() => onSelectCoin(coin)}
                        aria-pressed={selected}
                      >
                        <img
                          src={coin.imageUrl}
                          alt={getCoinNameKr(coin.coinId, coin.displayName)}
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="coin-nav coin-nav--right"
                  onClick={() => onClickSlide('next')}
                  aria-label="다음 동물 코인"
                >
                  ›
                </button>
              </div>

              {selectedCoin && (
                <p className="selected-coin-name">
                  선택한 동물: {getCoinNameKr(selectedCoin.coinId, selectedCoin.displayName)}
                </p>
              )}
            </>
          )}
        </section>

        <section className="step-card">
          <h2 className="step-title">Step 3. NFT 민팅하기!</h2>
          <div className="panel-actions">
            <button className="mint-button" onClick={onClickMint} disabled={!canMint}>
              지갑 서명하고 민팅하기
            </button>
          </div>

          {mintState.kind === 'loading' && <p className="step-status">{mintState.message}</p>}
          {mintState.kind === 'error' && <p className="error">{mintState.message}</p>}
          {mintState.kind === 'success' && (
            <div className="success">
              <p>민팅 성공!</p>
              <p>Tx Digest: {mintState.digest}</p>
              {mintState.objectId && <p>NFT Object: {mintState.objectId}</p>}
              <div className="success-actions">
                {mintState.objectId && (
                  <a
                    className="success-link"
                    href={getSuiVisionObjectUrl(mintState.objectId, currentNetwork)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    내 NFT 확인하기
                  </a>
                )}
                <button
                  type="button"
                  className="brag-button"
                  onClick={() => setIsNftModalOpen(true)}
                >
                  내 NFT 자랑하고 치킨 응모하기
                </button>
              </div>
            </div>
          )}
        </section>

        <footer className="landing-footer">
          <img src={footerLogo} alt="BlockBlock 로고" />
        </footer>
      </div>

      {isNftModalOpen && mintState.kind === 'success' && (
        <div
          className="nft-modal"
          role="dialog"
          aria-modal="true"
          aria-label="내 NFT 자랑하기"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsNftModalOpen(false);
            }
          }}
        >
          <div className="nft-modal__panel">
            <div className="nft-modal__header">
              <button
                type="button"
                className="nft-modal__close"
                onClick={() => setIsNftModalOpen(false)}
                aria-label="모달 닫기"
              >
                ×
              </button>
            </div>
            <img className="nft-modal__title-image" src={nftModalTitleSvg} alt="NFT 민팅 완료!" />
            <div className="nft-modal__section">
              <div className="nft-modal__image-wrap">
                {mintState.imageUrl ? (
                  <img
                    className="nft-modal__image"
                    src={mintState.imageUrl}
                    alt={
                      selectedCoin
                        ? `${getCoinNameKr(selectedCoin.coinId, selectedCoin.displayName)} NFT`
                        : '민팅한 NFT'
                    }
                  />
                ) : (
                  <p className="nft-modal__empty">NFT 이미지를 불러오는 중입니다.</p>
                )}
              </div>
            </div>
            <div className="nft-modal__footer">
              <button
                type="button"
                className="nft-modal__save-button"
                onClick={onClickSaveNftImage}
                disabled={isSavingNftImage || !mintState.imageUrl}
              >
                {isSavingNftImage ? '저장 중...' : 'NFT 이미지 저장하기'}
              </button>
              {saveNftError && <p className="nft-modal__save-error">{saveNftError}</p>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
