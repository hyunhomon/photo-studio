# Photo Studio

의류 사진을 상품 분석 → 촬영 기획 → 사용자 승인 → 이미지 생성 → 품질 검수로 연결하는 웹 MVP입니다.

**현재: Phase 0 기반 + production 배포.** [photo-studio.cloby.co](https://photo-studio.cloby.co)에 랜딩, `/studio` 빈 상태, Headless UI 안내 Dialog, 수동 API 연결 확인과 `/health`를 배포했습니다. Mock 분석 어댑터와 D1/R2/Workflows 기반을 제공합니다. 인증·프로젝트 저장·업로드·실제 AI·검수·다운로드는 아직 구현하지 않았습니다. 완성된 MVP 또는 공개 베타가 아닙니다.

## 시작

필수: **Node.js 22.23.4 이상(권장 24 LTS)**, **Bun 1.3.14 이상**. 현재 실행 환경은 Node 24.16.0 / Bun 1.3.14입니다. Bun은 의존성·워크스페이스·단위 테스트를 담당하고, Astro/Wrangler CLI는 Node를 사용합니다.

```powershell
bun install --frozen-lockfile
bun run dev
```

- 웹: [http://localhost:4321](http://localhost:4321)
- 스튜디오: [http://localhost:4321/studio](http://localhost:4321/studio)
- API: [http://localhost:8787/health](http://localhost:8787/health)
- 개별 실행: `bun run dev:web`, `bun run dev:api`
- 종료: 실행 터미널에서 `Ctrl+C`

기본 실행에 `.env`, `.dev.vars`, OpenRouter Key, Cloudflare 로그인이나 원격 리소스가 필요하지 않습니다. 로컬 D1/R2/Workflow 상태는 무시된 `.wrangler/`에 보관합니다. 포트를 변경하면 웹의 API URL과 API의 허용 origin도 함께 변경해야 합니다.

`/health` 응답:

```json
{
  "data": {
    "status": "ok",
    "service": "photo-studio-api",
    "phase": 0,
    "aiMode": "mock"
  }
}
```

이 응답은 liveness이며 DB/인증/실제 모델 가용성을 보장하지 않습니다. 스튜디오의 연결 확인 버튼은 이 엔드포인트만 호출합니다. 다른 API는 아직 404입니다.

## 검증 명령

```powershell
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:local
bunx playwright install chromium
bun run test:e2e
```

- `bun run check`: format → lint → typecheck → unit test → build. `test:local`과 `test:e2e`는 별도입니다.
- `bun run format`: Prettier + Astro plugin으로 소스/설정을 정리합니다. 기존 설계 문서는 자동 재포맷에서 제외합니다.
- `lint`: Biome의 JS/TS/TSX/JSON 정적 검사. Astro 템플릿은 `astro check`와 빌드에서 검사합니다.
- `typecheck`: 도구 스크립트와 6개 워크스페이스. Worker 타입은 `wrangler types`로 먼저 생성하며 생성 파일은 git에 넣지 않습니다.
- `test`: Bun 단위 테스트. API 계약·정확한 CORS origin·미구현 경로·Mock 무통신/fixture 격리/미확인 비용을 검증합니다.
- `test:local`: 별도 **8790** 포트의 workerd에서 실제 로컬 Drizzle/D1 조회, R2 쓰기/읽기/삭제, durable Mock Workflow를 검증합니다. 테스트 전용 진입점은 운영 Worker에 포함하지 않으며 상태는 `.tmp/local-smoke/`에 격리합니다.
- `test:e2e`: 4321/8787 서버를 필요시 시작하고 데스크톱/모바일 Chromium에서 랜딩 이동, 빈 상태, Dialog/ESC/포커스 복귀, API 성공 및 오류 복구, 외부 통신·가로 넘침·브라우저 오류 부재를 검증합니다. 같은 포트에 다른 앱을 실행하지 마세요.
- `build`: API는 `wrangler deploy --dry-run`, 웹은 `astro build`. 원격 배포/리소스 생성은 수행하지 않습니다.

## 구조 및 확정 기술

원격 환경은 **production 하나**입니다. 다음 명령은 검사 → 리소스 조회/필요시 생성 → production 빌드 → 웹/API 배포 → 읽기 전용 검증을 수행합니다. 지정 도메인의 소유 계정을 자동 확인하며 계정/존/DB ID는 git에서 제외된 `.wrangler/production/`에만 보관합니다.

```powershell
bun run deploy
bun run test:production
```

웹은 Custom Domain, API는 같은 도메인의 `/health*`, `/auth/*`, `/api/*` 경로로 연결합니다. `workers.dev`와 preview URL은 끕니다. 자세한 구성, 재배포와 롤백은 [배포 가이드](docs/12-DEPLOYMENT.md)를 참조하세요. `test:production`에는 설치된 Playwright Chromium이 필요하며 이미지/인증/AI 작업을 실행하지 않습니다.

```text
apps/web          Astro + React Islands + Tailwind CSS v4 + Headless UI + Lucide
apps/api          Hono Worker + Zod + private R2/D1/Workflows 바인딩
packages/ui       자체 Button / Headless UI Modal / Tailwind 디자인 토큰
packages/db       Drizzle D1 factory / 스키마 및 migration 생성 설정
packages/schemas  Zod 분석·health·사용량/비용 계약
packages/ai       무통신 Mock 분석 어댑터와 합성 fixture
scripts           로컬 Cloudflare 바인딩 smoke test
tests/e2e         Playwright 브라우저 검증
```

도메인 테이블이나 migration은 아직 없습니다. Phase 1에서 인증, Phase 2에서 프로젝트/상품 스키마와 migration을 추가합니다. Phase 0 Workflow는 Mock 인프라 검사이며 실제 분석/생성 파이프라인은 후속 단계입니다.

## 설정과 비용

- 루트 `.env.example`은 설정 위치 안내입니다. 루트 파일을 앱들이 자동 공유하지 않습니다.
- 웹: `apps/web/.env.example` → 필요시 `apps/web/.env`. `PUBLIC_API_URL`만 브라우저에 공개됩니다.
- API: 기본값은 `apps/api/wrangler.jsonc`. 필요시 `apps/api/.dev.vars.example` → `.dev.vars`로 덮어씁니다. 운영 secrets는 `wrangler secret put`으로 설정합니다.
- 실제 provider 어댑터가 없으므로 `AI_MODE`를 바꿔도 실 API가 활성화되지 않습니다.
- 생성 모델 기본값은 `openai/gpt-image-2`. 분석/평가 모델은 미선정입니다.
- 향후 비용은 **사용자 본인의 OpenRouter 크레딧**으로 부담합니다. 분석과 생성 각각 별도 비용 안내 및 실행 승인이 필요합니다. 파일 선택은 AI를 호출하지 않습니다.
- 실제 비용 미제공 시 `null/unknown`입니다. Mock 비용을 실제 0달러 청구로 기록하지 않습니다.
- 사진·프롬프트·개인 식별자·API Key를 소스, console/CI 또는 git에 저장하지 않습니다. 화면의 셔츠는 직접 작성한 벡터 콘셉트이며 AI 생성 결과가 아닙니다.

## Phase 1 준비 — 사람이 설정할 항목

로컬 Phase 0에는 필요하지 않습니다. 원격 인증 테스트/배포 전에 진행합니다.

1. Cloudflare production D1·private R2·Workflow 및 웹/API Worker는 생성·연결했습니다. 추가 원격 환경은 만들지 않습니다. `bun run deploy`가 리소스를 재사용하며 로컬 Wrangler 파일의 placeholder를 직접 교체할 필요가 없습니다.
2. 도메인은 `https://photo-studio.cloby.co`로 확정했습니다. API는 같은 origin을 쓰며 배포 시 CORS·공개 API URL·OAuth callback URL을 설정합니다. `/auth/*` 라우팅은 연결했지만 OAuth 콜백 handler는 Phase 1에서 구현합니다.
3. Phase 1 암호화 구현에 맞춰 **32 random bytes의 base64**인 `APP_ENCRYPTION_KEY_B64`를 로컬 `.dev.vars` 또는 API Worker secret에 비공개 설정합니다. 키 버전/회전, 세션 및 초대 코드 bootstrap은 Phase 1에서 확정합니다. 채팅에 키나 실제 초대 코드를 보내지 마세요.
4. OpenRouter 테스트 계정과 소액 크레딧 준비. 서버 콜백 PKCE S256으로 사용자 키를 발급/암호화하며 공용 운영자 추론 키는 사용하지 않습니다. 실제 유료 검증은 후속 구현 완료 후 **사람이 명시적으로 실행**합니다.

Cloudflare 인프라 이용료는 운영자 부담입니다. 자체 결제·구독·크레딧, 팀·배치·모델 학습은 MVP에서 제외합니다.

## 문서

개발 전 `AGENTS.md`, `prompts/CODEX_START.md`, `docs/` 전체를 확인합니다. 목적과 범위는 `docs/01-PRD.md`, 확정 결정은 `docs/02-ADR.md`, 완료 항목/검증 결과는 `docs/09-IMPLEMENTATION-PLAN.md`, 미확정 사항은 `docs/10-DECISIONS-AND-RISKS.md`, 공식 문서와 버전 근거는 `docs/11-REFERENCES.md`에 기록합니다.
