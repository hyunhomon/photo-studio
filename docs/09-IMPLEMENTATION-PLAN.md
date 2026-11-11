# Implementation Plan — Codex 실행용

> 현재 상태(2026-11-11): Phase 0–5의 MVP 기능 구현 및 production 배포 완료. 실제 외부 계정 OAuth·유료 의류 품질 검증은 미실행이다. 아래 Phase 0 기록은 해당 시점의 이력이다.

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

- [x] invite code 해시 검증·만료·사용량 제한.
- [x] OpenRouter OAuth start/callback + PKCE S256 + state/browser binding.
- [x] API Key AES-GCM 암호화 저장·사용, user_id 매핑, session/logout.
- [x] 사용자별 권한 미들웨어, CORS/cookie/CSRF 테스트.
- [x] no-key/expired-key/no-credits/error handling UX.

**DoD:** 테스트 모드에서 로그인/로그아웃 및 타 계정 접근 차단 확인; key가 network JSON/log에 노출되지 않음.

Phase 1 구현(2026-11-11): SQLite/D1 계약 기반 Mock OAuth 성공·state 단일 사용·browser mismatch·TTL·user_id 누락·초대 만료/사용량·rate limit·CSRF/위조 세션·로그아웃·AES context/version 검증. 단위 테스트 9개 통과. `/beta`와 계정 설정/연결 상태 UX 및 두 자체 호스팅 글꼴 추가. 실제 외부 OAuth 로그인/유료 호출은 미검증이며 완료로 표시하지 않는다. production 암호화 secret/초대 bootstrap과 additive migration 적용은 배포 명령에 포함했다.

## Phase 2 — 프로젝트/상품 업로드

- [x] D1 migrations, data access layer, type-safe Zod DTO.
- [x] 프로젝트 CRUD, 브랜드 프리셋 CRUD.
- [x] jpeg/png/webp 업로드, signature+크기 검사, private R2 저장.
- [x] 원본 사진 조회/삭제 권한, 초대 베타 사용자 홈.

**DoD:** 사용자 A 자료가 B에게 노출되지 않으며 파일 삭제 후 접근 불가.

Phase 2(2026-11-11): 서명·10MB·4MP/4096px 제한 후 jSquash WASM 실제 디코딩/무손실 PNG 정규화로 메타데이터를 제거한다. 다른 사용자의 프로젝트/상품/이미지/프리셋 조회·삭제 차단 및 업로드 AI 미호출 테스트 통과. workerd 기반 desktop/mobile E2E에서 Mock 연결→프로젝트→실제 사진 저장→프리셋→삭제→로그아웃 4개 통과. R2 실패 시 삭제 중 상태 및 storage_cleanup tombstone으로 재시도/GC한다.

## Phase 3 — 분석/촬영 기획

- [x] ProductAnalyzer/Planner adapter, prompt versioning, validation.
- [x] 이미지/설명 기반 분석과 시즌·모델·무드 추천.
- [x] Cloudflare Workflow job 상태 저장/폴링 구현.
- [x] 분석 시작 전 고객 비용 안내/사용자 명시적 승인, 상품 분석 수정, 촬영 콘셉트 승인 화면.
- [x] AI 분석 단계 비용/지연/실패/모델 로그.

**DoD:** 파일 1장 업로드 → mock analyzer → 수정 가능한 shoot plan 생성, 에러 재현.

Phase 3 구현(2026-11-11): 분석/기획 별도 Workflow, 사용자 비용 동의, 프리셋 적용, 분석/콘셉트 수정·승인, stage 원장 및 사용자별 idempotency를 연결했다. 공식 모델 catalog 기능 확인 및 JSON Schema/Zod 검증, nullable 실제 비용을 적용했다. format/lint/typecheck/test/build 전체 통과. 단위 16개, workerd desktop/mobile E2E 4개 통과. 실제 OpenRouter OAuth/유료 분석 품질은 외부 계정 검증이 남아 있다.

## Phase 4 — 모델컷 생성/품질 검수

- [x] OpenRouter Images API(`openai/gpt-image-2`) + 입력 참조 이미지 지원.
- [x] 생성 클릭 전 사용자 비용 확인, idempotencyKey 생성.
- [x] generation_attempt ledger, Workflow 과금 호출 안전성.
- [x] 결과 R2 저장, QualityEvaluator, human accept/reject+reason.
- [x] 원본/결과 비교, 다운로드, 의도적 재생성.
- [x] 비용 원본 값/추정 비용 분리, `outcome_unknown` 상태 처리.

**DoD:** mock 전체 happy path 및 유료 API 응답 미확인 시 자동 재호출 0회; 사용자 승인을 받아 실제 paid smoke test 1회 수행 가능.

Phase 4 구현(2026-11-11): OpenRouter 공식 Images API 요청/참조·capability·usage 응답 계약을 fake transport로 검증했다. 생성/평가 별도 원장, R2 저장 실패 시 확정 비용 보존, 평가 실패 후 수동 검수, 승인된 snapshot, 원본/결과 비교·확대·PNG 다운로드, 피드백 이력·재생성 사유/연결을 구현했다. 단위 21개 및 workerd desktop/mobile E2E 4개 통과. 실제 유료 이미지 품질 검증은 사람이 funded 계정으로 실행하기 전까지 미검증이다. Mock 결과는 원본 복사 및 합성 평가라고 표시한다.

## Phase 5 — 클로즈드 베타 준비

- [x] 운영 에러/빈 상태/업로드 성능, 모바일 최소 UX.
- [x] API 사용량과 채택률 집계 대시보드(내 사용자 단위), 관리용 통계 수집 방법 정의.
- [x] 접근성 확인, rate limit, 파일 삭제/연결 해제와 데이터 보관 고지.
- [x] 배포/마이그레이션/롤백 가이드, Cloudflare 환경 변수/secret 체크리스트.
- [x] 베타 인터뷰(5~10개 고객)에 사용할 품질/비용/촬영 대체율 질문지.

**DoD:** production Cloudflare 배포(사용자 요청에 따라 staging 환경 제외), OAuth callback 정상, 사용량/품질 기록, 운영 가이드 완료.

Phase 5 구현(2026-11-11): 내 사용자별 비용 부분합/미확인 수·단계/지연/채택률·품질 집계, 최근 작업, 안전한 JSON export, 삭제 재시도·late-write purge·연결 해제, 모델/비용 동의 고지, 운영/마이그레이션/롤백/실계정 검증 및 베타 인터뷰 문서를 추가했다. 로컬 이미지 CORP 차단을 발견해 local만 same-site로 수정하고 실제 naturalWidth 검사를 E2E에 추가했다. production은 same-origin을 유지한다. production 게시·원격 검증 결과는 아래 릴리스 기록으로 구분한다.

## 테스트 매트릭스

- Unit: Zod validator, analysis JSON parsing, cost labels, ownership guard, idempotency handling.
- Integration (mock): OAuth state validation, D1 relations, image upload/download, job status transitions, R2 errors.
- Security: invalid signature, oversized upload, forged session/CSRF, cross-user asset access, key redaction.
- Workflow: API timeout before send, unknown outcome after send, evaluation fail, repeated webhook/poll, duplicated button click.
- UI/E2E: no native-looking select/dialog, keyboard accessibility, no balance, insufficient credits, successful review/download.

## 최종 릴리스 체크

- [x] 웹/API/Workflow production 배포, 실제 HTTPS UI와 D1/private R2 검증.
- [x] 초대 코드 베타 보호 (운영 invalid invite 403, 사용량/TTL은 단위 검증).
- [x] OAuth PKCE/state/browser binding와 암호화 키 저장 구현 (실제 OAuth 계정 교환은 미검증).
- [x] 사진 1장 → 분석/기획 → 수정·승인 → 생성/평가 → 검수 → 다운로드 → 삭제, local/production Mock 전체 흐름.
- [x] 스튜디오/가상 로케이션 촬영 모드, 승인된 콘셉트 snapshot.
- [x] 분석과 생성 각각 별도 비용 안내·명시적 동의 필수.
- [x] 실제 비용/미확인 수, 시간, 품질 참고값, 채택/폐기/사유, 재생성 연결 기록.
- [x] 타인 프로젝트/사진 접근 차단 (운영 A/B 검증 포함).
- [x] 중복/불확실 과금 호출 방어 (fake provider 타임아웃·재실행·R2 오류 검증).
- [x] 고객별 실제 촬영비·대체 범위 인터뷰 양식, 운영 집계 방법.
- [ ] 실제 OpenRouter 계정 OAuth 로그인 및 funded 계정으로 유료 분석·생성·평가 smoke.
- [ ] 실제 의류 보존 품질, 최대 크기/다중 업로드 부하, 키 회전·백업 복구 리허설.

### 최종 검증 기록 — 2026-11-11

- 실행: format/lint/typecheck/unit/build 전체 통과. Bun **25 pass / 0 fail**. Astro 진단 0 errors / 0 warnings / 0 hints.
- workerd binding smoke: D1 SELECT, R2 write/read/delete, durable Mock Workflow 통과.
- local desktop/mobile E2E **4 pass**. 실제 이미지 naturalWidth 디코딩도 확인한다.
- production: migrations·AES secret·제한된 초대·비공개 R2·도메인/routes·Workflow 배포 검증 완료. 공개 HTTPS/CORS/인증 게이트/폰트/반응형 검사 통과.
- production desktop/mobile Mock 전체 E2E **4 pass**: 원격 D1/R2/Workflow, 사용자 A/B 접근 차단, PKCE/callback browser 거부, 분석/기획/승인/생성/평가/채택/폐기/재생성/PNG·JSON 다운로드/삭제. 합성 계정과 사진 정리 완료. 유료 AI 호출 없음.
- 삭제 중 세션 만료 시에도 cron이 계정·키를 마무리 삭제하도록 회귀 테스트를 추가하고 재배포했다. production 최종 코드 commit: `72f0643`.
- UI는 Pretendard + Paperlogy 자체 호스팅, Headless UI Dialog/Listbox 및 Tailwind 토큰을 사용한다. 로컬 포트 분리에 따른 CORP 차단을 실제 브라우저 캡처로 발견·수정했으며 production same-origin 정책은 유지한다.
- 실제 외부 계정/유료 이미지 테스트는 자동 실행하지 않았다. 관련 준비와 사람 검증 체크리스트는 `docs/13-BETA-OPERATIONS.md`에 남긴다.

### 다크 네온 UI refine 검증 — 2026-11-11

- 사용자 첨부 레퍼런스에 따라 다크 전용 팔레트와 primary #00F59B, P/셔터 심볼·기울어진 Paperlogy 워드마크·favicon·outline SVG 3종을 추가했다(ADR-015). Pretendard 및 Headless UI를 유지한다.
- format/lint/typecheck/test/build 전체 통과: 단위 25 pass. desktop/mobile local E2E 4 pass, production Mock E2E 4 pass. OS light에서도 dark 유지, Dialog ESC/포커스 복귀와 실제 이미지 디코딩을 확인했다.
- 본문/보조 텍스트·primary/상태 대비 및 입력 경계 대비를 계산·확인했다. 사진 원본/결과에는 색상 필터를 적용하지 않았다.
- 웹 코드 88b1e05를 검증된 production 웹 Worker에만 게시했다. API/Workflow 재배포·D1 migration·secret 변경·유료 AI 호출 없음. 공개 UI/폰트/반응형 검사와 SVG 3종 HTTP 200, 합성 계정/사진 정리까지 확인했다.
- 유료 OpenRouter 및 실제 고객 품질 검증 항목은 앞서 기록한 상태를 유지한다.
