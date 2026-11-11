# Implementation Plan — Codex 실행용

**원칙:** 각 Phase는 작동하는 결과, 테스트, 문서 업데이트까지 완료한다. 외부 유료 AI 실제 호출은 사용자가 명시적으로 승인하기 전에는 실행하지 않는다.

## Phase 0 — 모노레포/도구/인프라 로컬 기반

- [x] Astro web + React Islands, Tailwind CSS v4, Headless UI, lucide-react 스캐폴딩.
- [x] Hono API Worker + TypeScript + Zod, Drizzle/D1, R2, Workflows 바인딩.
- [x] Bun workspaces로 packages(ui/db/schemas/ai) 연결.
- [x] Wrangler local development 설정, `.dev.vars.example`, `.env.example` 정합성 확인.
- [x] formatter/linter/typecheck/test runner/build scripts 설치 및 실행.
- [x] 웹 초기 랜딩 + `/studio` 빈 화면, API `/health` 동작.
- [x] stub AI adapter & test fixture 생성. 운영 키 없어도 로컬 UI/테스트 가능.

**DoD:** README 명령으로 웹/API 로컬 부팅, `/health` 200, 타입/테스트/빌드 통과. 실제 외부 API 호출 없음.

### Phase 0 완료 기록 — 2026-11-10

- 상태: **로컬 기반 완료. Phase 1 이후 미착수.** Accepted ADR 변경 없음.
- 랜딩은 Astro, 스튜디오는 React island. 자체 Tailwind 토큰/Button/Headless UI Dialog를 공유 UI 패키지로 분리했다. 데스크톱/모바일 레이아웃을 브라우저에서 확인했다. 일러스트는 실제 AI 결과가 아니라고 표시한다.
- `/health`는 liveness 200이며 실제 provider·DB readiness를 주장하지 않는다. 스튜디오의 수동 연결 확인은 CORS를 포함해 이 API만 호출한다.
- D1/R2는 Wrangler 로컬 binding, Workflow는 무통신 Mock step만 제공한다. Drizzle factory와 migration 생성 설정을 준비했으며 도메인 테이블/migration/attempt ledger는 아직 없다.
- Mock 분석 fixture와 모델/단계/버전/usage/cost 계약을 검증한다. 실제 비용은 null/unknown이며 추정 필드와 분리한다. 실행 가능한 provider adapter나 유료 요청 경로는 없다.
- `bun install --frozen-lockfile`: 재설치 검증 완료. `bun run dev`: 웹/API 동시 부팅 및 HTTP 응답 확인.
- `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`: 통과. Astro 진단 0 errors / 0 warnings / 0 hints, Bun unit **5 pass / 0 fail**.
- `bun run test:local`: workerd `/health`, 실제 로컬 Drizzle/D1 SELECT, R2 쓰기/읽기/삭제, durable Mock Workflow 완료 검증 통과.
- `bun run test:e2e`: 데스크톱/모바일 Chromium **4 pass**. 랜딩→스튜디오, 명확한 미구현 안내, Dialog 키보드 focus trap/ESC/포커스 복귀, API 정상/연결 실패/복구, 외부 HTTP 요청 없음, 가로 넘침 없음, 브라우저 JS 오류 없음을 검증했다.
- 최종 소스 기준 `bun run check` 전체 통과. 기존 개발 서버를 종료한 상태에서도 E2E가 웹/API를 직접 부팅하여 **4 pass (36.0s)**를 재확인했다.
- 초기 검증에서 Bun fetch 타입, Biome Tailwind 파서, JSONC 파싱과 workspace 의존성 경계를 수정했다. 브라우저에서는 hydration 이전 첫 클릭 유실을 disabled 상태로 방지하고 Dialog 루트의 viewport 크기를 보장했다. 해당 검사를 다시 실행해 통과했다.
- 실 OpenRouter 호출, Cloudflare 로그인/프로비저닝/배포는 수행하지 않았다. 분석/평가 모델 capability·비용·OAuth user_id는 후속 Phase 검증 대상이다.

### 다음 작업 및 외부 준비

Phase 1은 초대 코드·PKCE S256/state/browser binding·서버 콜백·버전별 AES-GCM 키 저장·내부 세션/로그아웃·사용자별 권한/CORS/CSRF 테스트 순서로 구현한다. 실제 DB 스키마와 migration을 함께 추가한다.

로컬 Phase 0은 추가 설정이 필요 없다. 원격 인증 검증 전에 사람이 Cloudflare 계정/D1/private R2/환경별 Workflow 이름과 실제 웹·API 도메인을 준비하고, 정확한 허용 origin/callback URL 및 서버 암호화 secret을 설정해야 한다. 현재 DB UUID는 로컬용 placeholder이다. 구체적인 위치와 준비 방법은 루트 README의 “Phase 1 준비”를 따른다. 실제 키/초대 코드를 채팅·소스·로그에 넣지 않는다.

## Phase 1 — 초대/인증/보안

> 배포 인프라 후속 요청(2026-11-10): `https://photo-studio.cloby.co`에 production 한 환경으로 Phase 0 Mock을 배포했다. D1/private R2/Workflow와 웹/API routes를 연결했으며, 기존 리소스를 재사용하는 재배포도 통과했다. `bun run deploy`의 format/lint/typecheck/unit/build 검증, unit 5 pass, local binding smoke, local E2E 4 pass, production desktop/mobile HTTPS·API·CORS·Dialog 검증을 통과했다. 실제 AI/고객 인증은 실행하지 않았다. 기존 Cloudflare Web Analytics beacon만 production 네트워크 검사에서 허용하며 존 설정은 변경하지 않았다. 세부 구성과 명령은 `docs/12-DEPLOYMENT.md` 참조. 아래 Phase 1 기능은 여전히 미구현이다.

- [ ] invite code 해시 검증·만료·사용량 제한.
- [ ] OpenRouter OAuth start/callback + PKCE S256 + state/browser binding.
- [ ] API Key AES-GCM 암호화 저장·사용, user_id 매핑, session/logout.
- [ ] 사용자별 권한 미들웨어, CORS/cookie/CSRF 테스트.
- [ ] no-key/expired-key/no-credits/error handling UX.

**DoD:** 테스트 모드에서 로그인/로그아웃 및 타 계정 접근 차단 확인; key가 network JSON/log에 노출되지 않음.

## Phase 2 — 프로젝트/상품 업로드

- [ ] D1 migrations, data access layer, type-safe Zod DTO.
- [ ] 프로젝트 CRUD, 브랜드 프리셋 CRUD.
- [ ] jpeg/png/webp 업로드, signature+크기 검사, private R2 저장.
- [ ] 원본 사진 조회/삭제 권한, 초대 베타 사용자 홈.

**DoD:** 사용자 A 자료가 B에게 노출되지 않으며 파일 삭제 후 접근 불가.

## Phase 3 — 분석/촬영 기획

- [ ] ProductAnalyzer/Planner adapter, prompt versioning, validation.
- [ ] 이미지/설명 기반 분석과 시즌·모델·무드 추천.
- [ ] Cloudflare Workflow job 상태 저장/폴링 구현.
- [ ] 분석 시작 전 고객 비용 안내/사용자 명시적 승인, 상품 분석 수정, 촬영 콘셉트 승인 화면.
- [ ] AI 분석 단계 비용/지연/실패/모델 로그.

**DoD:** 파일 1장 업로드 → mock analyzer → 수정 가능한 shoot plan 생성, 에러 재현.

## Phase 4 — 모델컷 생성/품질 검수

- [ ] OpenRouter Images API(`openai/gpt-image-2`) + 입력 참조 이미지 지원.
- [ ] 생성 클릭 전 사용자 비용 확인, idempotencyKey 생성.
- [ ] generation_attempt ledger, Workflow 과금 호출 안전성.
- [ ] 결과 R2 저장, QualityEvaluator, human accept/reject+reason.
- [ ] 원본/결과 비교, 다운로드, 의도적 재생성.
- [ ] 비용 원본 값/추정 비용 분리, `outcome_unknown` 상태 처리.

**DoD:** mock 전체 happy path 및 유료 API 응답 미확인 시 자동 재호출 0회; 사용자 승인을 받아 실제 paid smoke test 1회 수행 가능.

## Phase 5 — 클로즈드 베타 준비

- [ ] 운영 에러/빈 상태/업로드 성능, 모바일 최소 UX.
- [ ] API 사용량과 채택률 집계 대시보드(내 사용자 단위), 관리용 통계 수집 방법 정의.
- [ ] 접근성 확인, rate limit, 파일 삭제/연결 해제와 데이터 보관 고지.
- [ ] 배포/마이그레이션/롤백 가이드, Cloudflare 환경 변수/secret 체크리스트.
- [ ] 베타 인터뷰(5~10개 고객)에 사용할 품질/비용/촬영 대체율 질문지.

**DoD:** production Cloudflare 배포(사용자 요청에 따라 staging 환경 제외), OAuth callback 정상, 사용량/품질 기록, 운영 가이드 완료.

## 테스트 매트릭스

- Unit: Zod validator, analysis JSON parsing, cost labels, ownership guard, idempotency handling.
- Integration (mock): OAuth state validation, D1 relations, image upload/download, job status transitions, R2 errors.
- Security: invalid signature, oversized upload, forged session/CSRF, cross-user asset access, key redaction.
- Workflow: API timeout before send, unknown outcome after send, evaluation fail, repeated webhook/poll, duplicated button click.
- UI/E2E: no native-looking select/dialog, keyboard accessibility, no balance, insufficient credits, successful review/download.

## 최종 릴리스 체크

- [x] 웹과 API 모두 배포 가능 (production Phase 0 Mock 배포 검증)
- [ ] 초대 코드 베타 보호
- [ ] OAuth PKCE와 암호화 키 저장
- [ ] 사진 1장으로 처음부터 끝까지 동작
- [ ] 모델컷/가상 로케이션컷 사용 시나리오
- [ ] 유료 AI 분석 및 이미지 생성 호출 모두 사용자 확인 필수
- [ ] 비용·시간·채택/폐기/사유 로그 확인
- [ ] 타인 프로젝트/이미지 접근 차단
- [ ] 중복 유료 호출 방어
- [ ] 고객의 실제 촬영비 및 절감액 기록 양식 준비
