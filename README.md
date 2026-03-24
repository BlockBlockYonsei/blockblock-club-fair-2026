# BlockBlock Sui Booth (Testnet Default)

Sui Testnet 기본 설정의 부스용 NFT 민팅 웹앱입니다.

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

사전 준비: Sui CLI 설치, Testnet 계정/가스 확보

```bash
cd move
sui client switch --env testnet
sui client active-address
sui move build
sui client publish --gas-budget 200000000
```

배포 결과에서 `packageId`를 기록합니다.
현재 저장소의 최근 testnet 배포 패키지 ID는 `move/Published.toml`의
`0x45cef0805b9170e86ebe8a5472385ec53f6bf5bdd2d3899feefdfae35338491d` 입니다.

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
- `SUI_NETWORK`: `testnet`(기본), `mainnet`, `devnet`
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
- `VITE_SUI_NETWORK`: `testnet`(기본), `mainnet`, `devnet`
- `VITE_SUI_RPC_URL`: 선택 네트워크 RPC URL (미설정 시 네트워크 기본 URL 사용)
- `VITE_DAPP_NAME`: Slush Wallet 표시용 앱 이름
- `VITE_API_TIMEOUT_MS`: API 요청 타임아웃(ms, 기본 `15000`)
- `VITE_COIN_LIST_MAX_RETRIES`: 초기 코인 목록 재시도 횟수(기본 `2`)

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

## 50명/분 안정성 체크리스트

- 전용 RPC 사용(공용 fullnode는 혼잡/제한 가능)
- 스폰서 지갑 SUI 잔액 모니터링
- 백엔드 rate-limit 유지(기본: 전역 300/min, IP 120/min, sender 2/10min)
- 백엔드/프론트를 서로 다른 인스턴스로 분리 배포

## 배포 권장

- Frontend: Render (Static/Web Service 모두 가능)
- Backend: Render/Fly.io/Railway
- RPC: 신뢰 가능한 제공자(유료 플랜 권장)

## Render 전환 체크

저장소 루트의 `render.yaml`로 Frontend/Backend 기본 배포 설정을 관리합니다.
기존 Render 서비스에 붙이려면 `render.yaml`의 `name`이 현재 Render 서비스 이름과 정확히 같아야 합니다.

`render.yaml`이 직접 관리하는 값:
- Backend: `NODE_VERSION`, `TRUST_PROXY`, `SUI_NETWORK`, `SUI_RPC_URL`, `CONTRACT_PACKAGE_ID`
- Frontend: `NODE_VERSION`, `VITE_SUI_NETWORK`, `VITE_SUI_RPC_URL`

Render 콘솔에서 직접 넣어야 하는 값(`sync: false`):
- Backend: `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`, `MINT_CONFIG_OBJECT_ID`, `SPONSOR_PRIVATE_KEY`
- Frontend: `VITE_BACKEND_URL`

Supabase를 쓰는 경우만 추가:
- Backend: `SUPABASE_URL`, `SUPABASE_BUCKET_NAME`, `SUPABASE_PUBLIC_BASE_URL`, `SUPABASE_OBJECT_PREFIX`

튜닝값을 기본값 대신 직접 쓰는 경우만 추가:
- Backend: `GAS_BUDGET_MIST`, `DEFAULT_NFT_NAME`, `DEFAULT_NFT_IMAGE_URL`
- Backend: `RATE_LIMIT_RELAXED`, `RATE_LIMIT_GLOBAL_PER_MINUTE`, `RATE_LIMIT_IP_PER_MINUTE`, `RATE_LIMIT_SENDER_PER_10_MINUTES`
- Backend: `TARGET_CONCURRENT_MINTS`, `GAS_COIN_LOCK_MS`, `GAS_COIN_FETCH_LIMIT`, `GAS_COIN_RESERVE_RETRIES`, `GAS_COIN_RESERVE_RETRY_DELAY_MS`, `GAS_COIN_MIN_BALANCE_BPS`
- Frontend: `VITE_DAPP_NAME`, `VITE_API_TIMEOUT_MS`, `VITE_COIN_LIST_MAX_RETRIES`

Render 콘솔에서 삭제해도 되는 값:
- Backend의 기존 mainnet 값들: `SUI_NETWORK=mainnet`, `SUI_RPC_URL=https://fullnode.mainnet.sui.io:443`, mainnet용 `CONTRACT_PACKAGE_ID`, mainnet용 `MINT_CONFIG_OBJECT_ID`
- Runtime에서 읽지 않는 값: `SUPABASE_SERVICE_ROLE_KEY`, `KEEPALIVE_KEY`

Render 콘솔에서 삭제하지 말아야 하는 값:
- `SPONSOR_PRIVATE_KEY`
- testnet용 `MINT_CONFIG_OBJECT_ID`
- 실제 배포 URL이 들어간 `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`, `VITE_BACKEND_URL`

주의:
- sponsor wallet private key는 그대로 써도 주소가 동일합니다. 대신 testnet SUI를 다시 받아서 가스 코인을 준비해야 합니다.
- mainnet의 `MINT_CONFIG_OBJECT_ID`는 testnet에서 절대 재사용할 수 없습니다.
- 환경변수 변경 뒤 Frontend/Backend 둘 다 재배포해야 합니다.

## 주의

- `SPONSOR_PRIVATE_KEY`는 서버에만 보관
- 운영 전 `max_supply`와 부스 동선 리허설 필수
