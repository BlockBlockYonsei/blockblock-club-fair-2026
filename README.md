# BlockBlock Sui Booth (Mainnet)

Sui Mainnet 부스용 NFT 민팅 웹앱입니다.

## 기능

- Slush 지갑 기반 Web3 로그인
- `assets/coin_list`의 13개 동물 코인 중 선택
- 선택한 동물 코인 이미지로 NFT 민팅
- Sponsored Transaction(가스비 대납)
- 이미지 저장소: Supabase Storage(선택)

실행 환경:
- Node.js 22 이상 (`@mysten/sui` v2 요구사항)

## 구조

- `frontend`: React + Vite + `@mysten/dapp-kit`
- `backend`: Fastify + Sui SDK (스폰서 트랜잭션 생성)
- `move`: Sui Move NFT 민팅 모듈
- `assets/coin_list`: 사전 생성된 동물 코인 PNG 13종

## 1) Move 배포

사전 준비: Sui CLI 설치, Mainnet 계정/가스 확보

```bash
cd move
sui client switch --env mainnet
sui client active-address
sui move build
sui client publish --gas-budget 200000000
```

배포 결과에서 `packageId`를 기록합니다.

그 다음 `MintConfig` shared object를 1회 생성:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module booth_nft \
  --function create_mint_config \
  --args 500 \
  --gas-budget 30000000
```

결과에서 생성된 `MintConfig` object id를 기록합니다.

## 2) Supabase Storage 준비 (선택)

Supabase를 쓰지 않으면 백엔드가 로컬 이미지 라우트(`/api/coin/image/:coinId`)를 직접 서빙합니다.
Supabase를 쓰면 백엔드는 **미리 업로드된 파일의 public URL만 사용**합니다.

1. Supabase 프로젝트 생성
2. Storage Bucket 생성 (예: `coin-images`)
3. Bucket을 Public으로 설정
4. 프로젝트 Settings에서 다음 값 확보
- `Project URL` (`SUPABASE_URL`)

사전 업로드 경로 규칙:
- 버킷 경로: `<SUPABASE_OBJECT_PREFIX>/<animal>.png`
- 기본 prefix: `coin-list`
- 예: `coin-list/eagle.png`, `coin-list/tiger.png`

사전 업로드 방법(스크립트):

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SECRET_KEY="<sb_secret_... or service_role>"
export SUPABASE_BUCKET_NAME="coin-images"
export SUPABASE_OBJECT_PREFIX="coin-list"

bash backend/scripts/upload-coin-list-to-supabase.sh
```

## 3) 백엔드 설정

```bash
cd backend
cp .env.example .env
```

`.env` 필수 값:
- `CONTRACT_PACKAGE_ID`: Move 배포 패키지 ID
- `MINT_CONFIG_OBJECT_ID`: `create_mint_config`로 만든 shared object ID
- `SPONSOR_PRIVATE_KEY`: 가스비 대납 지갑의 `suiprivkey...` (ED25519)

선택 값:
- `SUI_NETWORK`: `mainnet`(기본), `testnet`, `devnet`
- `SUI_RPC_URL`: 네트워크별 RPC URL (미설정 시 `SUI_NETWORK` 기본 URL 사용)
- `ALLOWED_ORIGINS`: 프론트 도메인 (콤마 구분)
- `PUBLIC_BASE_URL`: 프록시/CDN 뒤 배포 시 백엔드 공개 베이스 URL
- `SUPABASE_URL`
- `SUPABASE_BUCKET_NAME`
- `SUPABASE_PUBLIC_BASE_URL`: 커스텀 public base URL이 있을 때만 사용
- `SUPABASE_OBJECT_PREFIX`: 이미지 prefix (기본 `coin-list`)
- `DEFAULT_NFT_NAME`, `DEFAULT_NFT_IMAGE_URL`
- `TRUST_PROXY`: 리버스 프록시 뒤 배포 시 `true` 권장
- `RATE_LIMIT_GLOBAL_PER_MINUTE`: 전역 요청 제한 (기본 300)
- `RATE_LIMIT_IP_PER_MINUTE`: IP 기준 제한 (기본 120)
- `RATE_LIMIT_SENDER_PER_10_MINUTES`: 주소 기준 제한 (기본 2)
- `RATE_LIMIT_RELAXED`: 현장 대응용 완화 모드 (`true`면 기본 한도 상향)

실행:

```bash
npm install
npm run dev
```

헬스체크:

```bash
curl http://localhost:3001/health
```

## 4) 프론트 설정

```bash
cd frontend
cp .env.example .env
```

`.env` 값:
- `VITE_BACKEND_URL`: 백엔드 주소
- `VITE_SUI_NETWORK`: `mainnet`(기본), `testnet`, `devnet`
- `VITE_SUI_RPC_URL`: 선택 네트워크 RPC URL (미설정 시 네트워크 기본 URL 사용)
- `VITE_DAPP_NAME`: Slush Wallet 표시용 앱 이름

실행:

```bash
npm install
npm run dev
```

## 5) 루트에서 동시 실행

```bash
npm install
npm run dev
```

## API

### `GET /api/coins`

민팅 가능한 동물 코인 목록과 이미지 URL을 반환합니다.

응답 예시:

```json
{
  "coins": [
    {
      "coinId": "tiger",
      "displayName": "Tiger",
      "nftName": "Tiger Coin Booth NFT",
      "imageUrl": "https://.../tiger.png"
    }
  ]
}
```

### `GET /api/coin/image/:coinId`

- `coinId`에 해당하는 PNG를 반환합니다.
- Supabase 미설정 시 프론트 이미지 미리보기에 사용됩니다.

### `POST /api/sponsor/mint`

요청:

```json
{
  "sender": "0x...",
  "animal": "tiger",
  "name": "Tiger Coin Booth NFT"
}
```

응답:

```json
{
  "txBytes": "base64",
  "sponsorSignature": "base64 signature",
  "gasOwner": "0x..."
}
```

### `GET /api/keepalive`

- Render 슬립 방지용 주기 호출 엔드포인트입니다.
- 응답: `{ "ok": true }`
- 서버 로그에는 요청당 짧은 로그(`ka`) 1줄만 남깁니다.
- `KEEPALIVE_KEY`가 설정된 경우 `x-keepalive-key` 헤더가 일치해야 호출됩니다.

## Render Keepalive (5분 주기)

이 저장소에는 GitHub Actions 스케줄러가 포함되어 있습니다:
- 파일: `.github/workflows/render-keepalive.yml`
- 주기: `*/5 * * * *` (5분마다)

GitHub 저장소 Secrets 설정:
1. `RENDER_KEEPALIVE_URL`: `https://<your-render-service>/api/keepalive`
2. `RENDER_KEEPALIVE_KEY`: `KEEPALIVE_KEY`와 동일한 값 (선택이지만 권장)

Render Backend 환경변수:
1. `KEEPALIVE_KEY`를 임의의 긴 랜덤 문자열로 설정

## 50명/분 안정성 체크리스트

- 전용 RPC 사용(공용 fullnode는 혼잡/제한 가능)
- 스폰서 지갑 SUI 잔액 모니터링
- 백엔드 rate-limit 유지(기본: 전역 300/min, IP 120/min, sender 2/10min)
- 백엔드/프론트를 서로 다른 인스턴스로 분리 배포

## 배포 권장

- Frontend: Render (Static/Web Service 모두 가능)
- Backend: Render/Fly.io/Railway
- RPC: 신뢰 가능한 제공자(유료 플랜 권장)

## 주의

- `SPONSOR_PRIVATE_KEY`는 서버에만 보관
- 운영 전 `max_supply`와 부스 동선 리허설 필수
