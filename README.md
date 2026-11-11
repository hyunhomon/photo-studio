# Photo Studio

의류 사진 → 상품 분석 → 촬영 기획 수정·승인 → 이미지 생성 → 원본 비교·품질 검수 → 채택/폐기·재생성 → 다운로드를 연결하는 웹 MVP입니다. 초대 코드 없이 OpenRouter OAuth로 시작합니다.

Astro + React Islands, Tailwind CSS v4, Headless UI로 직접 제작한 스튜디오 UI에 Pretendard와 Paperlogy를 자체 호스팅합니다. Hono API Worker, Drizzle/D1, private R2, Cloudflare Workflows를 사용합니다. 서비스 자체 결제·구독·크레딧, 팀·배치·모델 학습 기능은 없습니다.

## 실행

Node 24 LTS(최소 22.23.4), Bun 1.3.14 이상이 필요합니다.

```powershell
bun install --frozen-lockfile
bun run dev
```

웹은 [localhost:4321](http://localhost:4321), API는 [localhost:8787/health](http://localhost:8787/health)입니다. API 개발 서버는 ignored `.dev.vars`의 암호화 키를 처음에 생성하고 로컬 D1 migrations를 적용합니다. 별도 OpenRouter 운영자 키나 원격 Cloudflare 로그인이 필요하지 않습니다.

`/studio`에서 **로컬 Mock 스튜디오 열기** → 새 프로젝트 → 사진 1장 업로드 → 비용 안내 동의 후 분석 → 분석/콘셉트 수정·승인 → 별도 동의 후 생성 → 비교·검수·다운로드 순서로 실행합니다. Mock 분석·평가는 합성 fixture이고 Mock 생성 이미지는 원본 복사입니다. 외부 AI를 호출하지 않으며 실제 비용이나 품질을 측정한 결과가 아닙니다.

JPEG/PNG/WebP, 사진당 10MB·4MP·최대 변 4096px, 상품당 참조 3장을 지원합니다. 실제 디코딩 후 PNG로 정규화합니다. AI 입력용 정규화 사진 전체는 12MB 이하여야 합니다. 분석에 사용한 사진은 고정되며 교체하려면 새 상품으로 등록합니다.

## 검증

```powershell
bun run check
bun run test:local
bun run test:oauth
bunx playwright install chromium
bun run test:e2e
```

`check`는 format/lint/typecheck/unit/build를 실행합니다. `test:local`은 격리된 workerd에서 D1/R2/Workflow binding을 확인합니다. `test:oauth`는 실제 workerd native HTTP와 로컬 합성 provider로 초대 없는 OAuth 콜백·키 상태·모델 목록·AI 어댑터·암호화·세션·재사용 거부·redirect 차단을 확인합니다. `test:e2e`는 로컬 서버를 자동 실행하고 desktop/mobile에서 업로드부터 분석·생성·피드백·재생성·다운로드·내보내기·삭제까지 실제 Mock Workflow를 검증합니다. 유료 테스트는 자동 실행하지 않습니다.

## production

[photo-studio.cloby.co](https://photo-studio.cloby.co) 하나의 production 환경만 사용합니다. 웹은 Custom Domain, API는 같은 origin의 `/health*`, `/auth/*`, `/api/*` Worker routes입니다. 공개 bucket이나 `workers.dev`는 사용하지 않습니다.

```powershell
bun run deploy
bun run test:production
bun run test:production:e2e
```

배포는 Cloudflare 로그인과 해당 존 권한이 필요합니다. 기존 D1/R2/Workflow를 재사용하고 additive migration과 최초 AES-GCM secret을 준비합니다. 초대를 생성하거나 검사하지 않습니다. 계정·존·DB 식별자와 secret 백업은 ignored `.wrangler/production/`에만 저장합니다. 자세한 복구·검증 방법은 [배포 가이드](docs/12-DEPLOYMENT.md)를 따릅니다.

`test:production`은 읽기 전용 공개 UI/보안 설정 검사입니다. `test:production:e2e`는 관리자 권한으로 임시 **합성 Mock 계정**을 만든 뒤 배포된 D1/R2/Workflow와 브라우저 전체 흐름 및 다른 사용자 접근 차단을 확인하고 계정·사진을 삭제합니다. production HTTP 테스트 로그인 우회 경로는 없습니다. Cloudflare 인프라 사용량은 발생하지만 유료 AI를 호출하지 않습니다.

## OpenRouter 및 비용

사용자가 OpenRouter OAuth PKCE S256으로 직접 연결합니다. 서버가 교환한 사용자별 키를 AES-GCM으로 암호화하며 브라우저에 반환하지 않습니다. **공용 운영자 추론 키는 설정하지 않습니다.** 실제 사용에는 해당 사용자 OpenRouter 계정의 크레딧이 필요합니다.

기본 모델은 분석/기획 `google/gemini-2.5-flash-lite`, 이미지 `openai/gpt-image-2`, 평가 `google/gemini-2.5-flash`이며 API 환경 변수로 변경할 수 있습니다. 실행 전 현재 모델 capability를 확인합니다. 사진 저장만으로 AI가 실행되지 않으며 분석/기획과 생성/평가 각각 명시적 비용 동의를 받습니다.

각 호출의 모델·단계·프롬프트 버전·지연·사용량·실제 비용을 기록합니다. 비용이 제공되지 않으면 미확인으로 남기며 추정이나 Mock 0달러와 혼합하지 않습니다. 불확실한 유료 응답은 자동 재전송하지 않습니다. `generation_attempts`의 unique(job,stage) 원장과 Workflow retry=0으로 재실행을 막습니다.

실제 OpenRouter OAuth 연결·스튜디오 진입·유료 상품 분석/촬영 기획은 2026-11-11 사용자 실행으로 확인했습니다. 유료 이미지 생성/평가·의류 보존 품질 검증은 아직 남아 있습니다. 안전하게 연결할 수 있는 stable `user_id`가 없으면 로그인을 거부합니다. [실제 계정 검증 절차와 남은 위험](docs/13-BETA-OPERATIONS.md)을 확인하세요.

프로젝트 삭제 시 관련 사진·기획·작업·피드백을 삭제하며 계정 삭제는 키와 모든 세션도 삭제합니다. 삭제 중 늦은 저장을 정리하기 위한 비공개 경로 tombstone은 24시간 보관합니다. `/studio/usage`는 내 기록만 집계하고 `/studio/settings`에서 JSON 내보내기·연결 해제·계정 삭제를 제공합니다. 이미지·프롬프트·키·개인 식별자를 소스나 console/CI에 기록하지 않습니다.

## 구조

```text
apps/web          Astro 페이지 / React Studio Islands / 자체 UI와 글꼴
apps/api          인증 / 권한 / 업로드 / durable AI pipeline / 운영 API
packages/ui       Tailwind tokens / Button / Headless UI Modal·Select
packages/db       Drizzle schema / additive D1 migrations
packages/schemas  Zod 계약 / 안전한 클라이언트 DTO
packages/ai       OpenRouter·Mock 어댑터 / 버전별 프롬프트 / capability 검사
scripts           로컬·production 배포 및 검증
tests/e2e         같은 시나리오의 local·production Mock 브라우저 검사
```

확정 결정은 [ADR](docs/02-ADR.md), 범위는 [PRD](docs/01-PRD.md), 실제 검증 상태는 [구현 계획](docs/09-IMPLEMENTATION-PLAN.md)에 기록합니다.
