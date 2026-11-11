# Implementation Plan — Codex 실행용

> 현재 상태(2026-11-12): Phase 0–5 및 ADR-019/020/021 이후 ADR-022에 따라 프로젝트 없는 상품 작업 공간, 다중 사진 미리보기, 참조 기반 기획과 중앙 비교/오른쪽 inspector를 구현하고 통합 검증 중이다. 사용자 요청의 서비스 데이터 전체 초기화와 production 재배포는 아래 완료 기록으로 구분한다. 이전 실제 생성 7건은 당시 실행 이력이며 초기화 이후 보존을 주장하지 않는다. photo-v3-reference의 실제 참조 기반 품질 효과는 아직 미검증이다. 아래 날짜별 기록은 해당 시점의 이력이다.

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

## Phase 1 — 인증/보안 (초대 정책은 ADR-016으로 대체)

> 배포 인프라 후속 요청(2026-11-10): `https://photo-studio.cloby.co`에 production 한 환경으로 Phase 0 Mock을 배포했다. D1/private R2/Workflow와 웹/API routes를 연결했으며, 기존 리소스를 재사용하는 재배포도 통과했다. `bun run deploy`의 format/lint/typecheck/unit/build 검증, unit 5 pass, local binding smoke, local E2E 4 pass, production desktop/mobile HTTPS·API·CORS·Dialog 검증을 통과했다. 실제 AI/고객 인증은 실행하지 않았다. 기존 Cloudflare Web Analytics beacon만 production 네트워크 검사에서 허용하며 존 설정은 변경하지 않았다. 세부 구성과 명령은 `docs/12-DEPLOYMENT.md` 참조. 아래 Phase 1 기능은 여전히 미구현이다.

- [x] 과거 invite 검증 구현; ADR-016에서 신규/재로그인 모두 초대 없이 직접 OAuth로 변경.
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
- [x] 결과 R2 저장, 원본/이전 컷 수동 비교 및 지시 기반 개선. QualityEvaluator와 accept/reject는 ADR-019로 종료(과거 데이터 보존).
- [x] 원본/결과 비교, 다운로드, 의도적 재생성.
- [x] 비용 원본 값/추정 비용 분리, `outcome_unknown` 상태 처리.

**DoD:** mock 전체 happy path 및 유료 API 응답 미확인 시 자동 재호출 0회; 사용자 승인을 받아 실제 paid smoke test 1회 수행 가능.

Phase 4 구현(2026-11-11): OpenRouter 공식 Images API 요청/참조·capability·usage 응답 계약을 fake transport로 검증했다. 생성/평가 별도 원장, R2 저장 실패 시 확정 비용 보존, 평가 실패 후 수동 검수, 승인된 snapshot, 원본/결과 비교·확대·PNG 다운로드, 피드백 이력·재생성 사유/연결을 구현했다. 단위 21개 및 workerd desktop/mobile E2E 4개 통과. 실제 유료 이미지 품질 검증은 사람이 funded 계정으로 실행하기 전까지 미검증이다. Mock 결과는 원본 복사 및 합성 평가라고 표시한다.

## Phase 5 — 클로즈드 베타 준비

- [x] 운영 에러/빈 상태/업로드 성능, 모바일 최소 UX.
- [x] API 사용량·생성/재생성·지연 집계 대시보드(내 사용자 단위), 관리용 통계 수집 방법 정의. ADR-019로 점수/채택률 집계 종료.
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
- [x] 초대 없는 공개 연결 + PKCE/browser binding/Origin/rate limit 보호(ADR-016).
- [x] OAuth PKCE/state/browser binding와 암호화 키 저장 구현 및 실제 사용자 로그인 확인.
- [x] 사진 → 분석/기획 → 수정·승인 → 생성 → 원본/이전 비교 → 동의 기반 컷 개선 → 다운로드 → 삭제, local Mock 전체 흐름. 새 production 회귀는 아래 후속 기록.
- [x] 승인된 콘셉트 snapshot과 하나의 촬영 파이프라인. 스튜디오/가상 로케이션 모드는 ADR-019로 제거.
- [x] 분석과 생성 각각 별도 비용 안내·명시적 동의 필수.
- [x] 실제 비용/미확인 수, 시간, 촬영 버전, 개선 항목/지시, 재생성 연결 기록. 기존 점수/피드백 이력 보존.
- [x] 타인 프로젝트/사진 접근 차단 (운영 A/B 검증 포함).
- [x] 중복/불확실 과금 호출 방어 (fake provider 타임아웃·재실행·R2 오류 검증).
- [x] 고객별 실제 촬영비·대체 범위 인터뷰 양식, 운영 집계 방법.
- [x] 실제 OpenRouter 계정 OAuth 로그인/스튜디오 진입(런타임 수정 후 사용자 재검증).
- [x] funded 계정으로 유료 상품 분석·촬영 기획(실제 사용자 실행, studio-v2 기획 성공).
- [x] 기존 funded 계정 이미지 생성 5건 확인. 과거 AI 점수는 실측 품질이 아니며 ADR-019로 종료.
- [x] 새 photo-v1 촬영 프로토콜의 인간 승인 이미지 생성/컷 개선 1건 성공, 유료 평가 0회.
- [ ] 새 프로토콜의 3축 실사 개선 효과와 상품군별 의류 보존 성능 확인.
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

### 초대 없는 OAuth 및 콜백 복구 — 2026-11-11

- ADR-016: 초대 입력/검증/bootstrap 제거. 홈페이지/로그인 전 studio에서 바로 GET OAuth 시작, `/beta`는 기존 링크 호환 redirect만 유지한다. PKCE S256·browser binding·단일 사용·CSRF·서버 암호화·stable identity를 유지한다.
- 최초 user/connection atomic 저장, 동시 최초 로그인 DB 충돌 복구, 세션 실패 후 재연결을 검증했다. 교환/응답/식별/저장/세션 오류를 구분하고 오류 복구 UI에서 자동 OAuth 반복을 막는다. 식별자/키/원문 없는 auth_events는 7일 후 정리한다.
- format/lint/typecheck/unit/build 전체 통과: **29 pass / 0 fail**, Astro 진단 0 errors/warnings/hints. local desktop/mobile Mock E2E **4 pass**.
- `test:oauth`: 격리된 실제 workerd/D1에서 verifier 복호화→fake provider 교환→암호화 연결/세션→state 재사용 거부→연결 해제 통과. 유료/실제 provider 성공을 의미하지 않는다.
- production 배포 및 검증 결과는 후속 기록으로 남긴다. 이전 generic 콜백 오류는 상세 진단이 없어 원인을 확정하지 않았으며 실제 계정 재연결 성공을 별도 확인해야 한다.

후속 런타임 수정: production에서 합성 code를 사용해 exchange 전송 실패를 재현했고, Workers 미지원 `redirect: "error"`가 원인임을 확인했다. OAuth·키 상태·모델 catalog·AI 호출 6곳을 `manual`로 바꾸고 3xx 거부 정책을 유지한다. native workerd HTTP→로컬 합성 provider로 OAuth/상태/catalog/분석/기획/생성/평가와 redirect trap 차단 검증 통과. 최종 format/lint/typecheck/unit/build **30 pass / 0 fail**, Astro 진단 0, local desktop/mobile E2E **4 pass**. 실제 유료 AI 호출 없음.

production 재배포 `8b2f245` 후 같은 합성 invalid-code probe가 실제 OpenRouter exchange의 **HTTP 400**으로 안전하게 거부됨을 확인했다(수정 전: transport 실패, HTTP status null). 원격 verifier 복호화 및 외부 교환 통신 복구를 확인한 것이며 실제 사용자 키 교환 성공을 대신하지 않는다. 공개 HTTPS/CORS/초대 없는 직접 S256 redirect/오류 복구/글꼴/반응형 검사 통과. 실제 유료 추론은 실행하지 않았다.

최종 운영 확인:
- 사용자가 새 연결로 **실제 OpenRouter OAuth 성공 및 스튜디오 진입**을 확인했다. 식별자를 출력하지 않는 집계에서 real user/connection/session 각 1개를 확인했다.
- production 전체 회귀 첫 실행은 3/4 통과, 모바일 Mock 생성 1건은 `DISPATCH_PENDING`으로 멈췄다. 기존 작업 ID를 재확인하는 사용자 복구 동작을 브라우저 검사에 포함했다. 새 과금 작업 제출이나 provider 재시도는 하지 않는다.
- 복구 경로 포함 production Mock 전체 시나리오를 desktop/mobile로 별도 재검증해 **2/2 통과**, 임시 계정/사진 삭제 완료. 미인증 직접 OAuth desktop/mobile 검사는 앞선 실행에서 **2/2 통과**했고 공개 smoke도 통과했다. 잦은 OAuth 검사로 시작 rate limit에 도달한 동안에는 OAuth를 다시 호출하지 않는 격리 runner로 Mock 시나리오만 실행했다.
- 병렬 local/production Playwright의 기본 결과 폴더 충돌은 환경별 outputDir로 분리했다. 분리 후 local desktop/mobile **4/4 재검증 통과**. 프로덕션 애플리케이션 변경이 아닌 테스트 보완이다.
- funded 유료 분석/이미지/평가와 의류 보존 품질, 키 회전/복구는 여전히 별도 검증 대상이다. 이번 자동 검증에는 외부 유료 AI 호출이 없다.

### 실제 촬영 기획 형식 오류 보완 — 2026-11-11

- 실제 planning 응답은 STOP/198 output tokens/실제 비용 $0.0000965로 종료됐으나 앱 validation 실패였다. 원문을 저장하지 않아 정확한 불일치 필드는 미확정이다. 크레딧 부족과 구분하며 기존 분석·과금 원장을 유지한다.
- ADR-017 및 studio-v2: provider 출력과 앱 정책 상수 분리, singleton enum, 손실 없는 JSON 포맷 처리, 추가 metadata 제거, 필수 내용 검증·안전한 실패 진단. 유료 repair/자동 재시도 없음.
- 동의 기반 ‘이 분석으로 기획 다시 만들기’: 저장된 owner 분석 snapshot으로 기획 1회만 요청한다. 별도 key/원장을 사용하고 analysis 모델 호출이 없는 것을 검증했다.
- format/lint/typecheck/unit/build 통과: **33 pass / 0 fail**, Astro 진단 0. local desktop/mobile E2E **4/4 통과**(기획만 복구의 동의·분석 보존·attempt planning 1개 포함). 실제 workerd native HTTP의 합성 JSON fence/앱 상수 없는 기획·평가 응답도 통과했다.
- 기존 실제 실패 요청은 재실행하거나 자료를 수정하지 않았다. production 재배포/Mock 회귀 및 사용자의 실제 기획 재검증 결과는 후속 기록한다.

재배포 `aaf29b6` 후 사용자가 실제 촬영 콘셉트 표시 성공을 확인했다. 식별자/원문 없는 읽기 전용 지표에서 studio-v2 planning succeeded, job completed, 실제 비용 $0.0001081, 출력 209 tokens를 확인했다. 해당 실제 실행은 분석+기획 경로였으며 기획만 복구는 별도의 Mock/원장 검사로 구분한다. 기존 studio-v1 실패와 비용은 그대로 보존됐다. 공개 production smoke도 통과했다. 실제 이미지 생성/평가·의류 품질 검증은 아직 남아 있다.

production desktop/mobile 전체 Mock E2E **4/4 통과**: 저장된 분석 재사용 동의, 기획 attempt 1개/분석 값 보존, 기획 승인→생성/평가/검수/재생성/다운로드/삭제 및 타 계정 권한 차단까지 확인했다. 임시 합성 계정과 사진을 정리했다. 자동 테스트는 모두 Mock이며 실제 유료 실행은 사용자가 UI에서 수행한 별도 검증이다.

### 작업 사이드바 및 인증 pending UX — 2026-11-11

- ADR-018: 중앙 프로젝트 카드 목록을 최근 작업 사이드바로 전환했다. 프로젝트 생성 composer, 최근/이전 목록, 현재 프로젝트 표시, 접기/펼치기, Ctrl/⌘+K 검색, 모바일 Dialog 메뉴와 공통 계정 탐색을 구현했다.
- account pending/ready/unauthenticated/redirecting/error를 구분한다. SSR와 me 응답 대기는 skeleton, 503/네트워크 실패는 재확인 UI로 표시한다. 실제 401 확인 전 연결 폼을 표시하지 않는다. 인증/개인 목록은 캐시하지 않고 접힘 boolean만 sessionStorage에 보관한다.
- Astro ClientRouter 내부 이동, 네이티브 OAuth/다운로드/내보내기를 연결했다. 모바일 메뉴 닫기로 링크가 먼저 제거돼 라우터가 건너뛰는 경합을 발견해 명시적 navigate로 수정했다. desktop/mobile 모두 링크 이동 전후 performance.timeOrigin이 유지됨을 검증했다.
- format/lint/typecheck/unit/build 통과: 단위 **33/33**, Astro 진단 0. local E2E **6/6**: 4개 화면의 인증 대기/503 재확인, 유효 세션 지연 중 연결 폼 없음, 검색 방향키/Enter, 메뉴 ESC/포커스 복귀, 기존 Mock 촬영·기획 복구·검수·다운로드·삭제까지 통과했다.
- 합성 프로젝트만 사용한 desktop/mobile/search/drawer 캡처를 시각 점검하고 preview 계정/자료를 정리했다. 웹 전용 production 배포 후 검증 결과를 후속 기록한다. 실제 고객 AI 호출이나 API/Workflow/D1/secret 변경 없음.

첫 운영 검사 5/6 통과: desktop에서 검색으로 이미 열린 프로젝트를 다시 선택한 뒤 뒤늦은 동일 URL 이동이 새로 연 업로드 Dialog를 초기화하는 경합을 발견했다. 같은 프로젝트 선택 시 이동을 생략하고 검색/메뉴만 닫도록 수정했다. 테스트를 단순 지연시키거나 실패를 숨기지 않고 실제 탐색 동작을 보완했다. 재배포 후 전체 운영 검사를 다시 실행한다.

최종 `f81cd8f` 웹 전용 재배포 후 로컬/운영 브라우저 각각 **6/6 통과**, 공개 HTTPS/CORS/OAuth 오류 복구/폰트/반응형 smoke 통과. 운영에서 느린 me 응답·503 재확인, 유효 세션 전환 중 연결 폼 없음, 동일 프로젝트 검색 후 업로드, desktop/mobile ClientRouter 이동, 전체 Mock 촬영·기획 복구·다운로드·삭제를 검증했다. 단위 **33/33**, lint/format/typecheck/build 통과를 유지한다.

운영 E2E의 브라우저 6개는 모두 통과했으나 wrapper의 후속 D1 관리 API 조회가 일시 실패해 명령 종료 코드는 1이었다. 별도 fresh credential의 읽기 전용 집계로 synthetic_users=0 및 실제 계정/연결/세션 보존을 확인했다. 브라우저 계정 삭제 완료와 독립 검증으로 합성 사진/계정 정리를 재확인했으며 이 wrapper 오류를 애플리케이션 검사 성공과 구분해 기록한다. API/Workflow/D1/secret 배포 및 실제 고객 AI 호출은 없었다.

### 촬영 현실감 중심 개선 — 2026-11-12 (ADR-019)

- [x] 스튜디오/가상 로케이션 선택과 provider mode 입력 제거. 기존 기획/프리셋 읽기 호환 및 장소/조명/구도 유지.
- [x] AI 점수·채택/폐기·신규 피드백 쓰기·유료 평가 호출 제거. 과거 기록/비용과 계정 export 보존.
- [x] `studio-v3-photography` / `photo-v1`: 버전별 촬영 컴파일러, 광학 근사 프로필/빛·접촉 그림자·초점/인물 부위간 현실감/소재별 반응 지시.
- [x] 가상 성인 외모, 배경 분리, 소재 지시 편집·프리셋 재사용. 낮은 해상도 안내. 실제 얼굴 전용 업로드/웹 수집은 구현하지 않음.
- [x] 개선 항목과 자유 지시가 실제 생성에 반영. owner/상품 범위의 이전 생성 컷 참조·비교, 원본 상품 근거 우선. 실제 참조 수/총 12MB 과금 전 검사.
- [x] 리서치 근거·한계·인간 승인 단일 항목 검증 루프 문서화(`14-REALISM-RESEARCH.md`), 유료 호출 없는 합성 지시 4종/해시 manifest 생성.
- [x] 최종 로컬 format/lint/typecheck/unit/build 통과: **37/37**, Astro 진단 0. native workerd HTTP OAuth/provider 계약과 D1/R2/Workflow binding smoke 통과. local desktop/mobile 브라우저 **6/6** 통과. 이력 보존·비용 집계·feedback 종료·구버전 프리셋 모드 전송 제외도 회귀 검증했다.
- [x] 새 production API/Workflow/web 배포 및 공개/Mock 회귀. 앱 commit `5b533c8`(주 구현 `ec8392a`). 공개 HTTPS/CORS/PKCE/보호 API/폰트/반응형 smoke 통과, production desktop/mobile **6/6** 통과 및 wrapper exit 0. 원본/이전 컷 실제 디코딩·개선 지시·내보내기/다운로드·타인 접근 차단·삭제를 확인했다. 합성 계정 잔여 0과 기존 실제 계정/연결/세션 보존을 읽기 전용 집계로 재확인했다.
- [x] 새 프로토콜의 사람 승인 컷 개선 1건 성공. `needs_review`/`review`, `generation:succeeded:studio-v3-photography`, 실제 비용 반환, evaluation attempt 0개. 실행 중 작업을 발견해 추가 호출/재배포 없이 완료를 읽기 전용 확인하고 원본/직전 참조 컷/새 결과를 비공개 비교했다. 자동 유료 호출은 0이다.
- [ ] 충분한 디테일 원본과 상품군별 단일 축 비교로 실제 개선 효과 검증. 한 컷에서 연속성은 관찰했지만 피부 보정감·작은 디테일 차이는 남아 있으며 촬영 현실감 달성으로 판정하지 않는다.

사전 읽기 전용 확인: 실제 실행 중 작업 0, 합성 계정 0, 기존 실제 생성/평가 각각 5건 보존. 공식 이미지 catalog에서 현재 기본 모델의 참조 최대 16장을 확인해 원본 3장+이전 컷 1장 지원 범위 안임을 확인했다. 장기적인 capability 보장은 아니므로 실행 전 검사도 유지한다.

### 공식 쇼핑몰 비교 후 두 번째 루프 — 2026-11-12 (ADR-020)

- [x] 사용자의 photo-v1 부분 개선/남은 AI 인상 의견 반영. UNIQLO/COS 상품과 UNIQLO 공식 야외 게시 사진 4장을 직접 시각 비교하고 출처·관찰·provenance 한계를 기록했다. 외부 이미지를 생성 참조/저장소/배포 자산으로 복제하지 않았다.
- [x] `studio-v4-retail` / `photo-v2-retail`: 의류 전체·밑단·소매가 읽히는 기본 프레이밍, 전신/명시적 접사 존중, 근사 화각→촬영 거리 연결, 새 기본 gentle 배경 분리. 인체 비율로 얼굴 크기를 바꾸지 않는다.
- [x] 이전 인물 특징과 crop/표정/보정/노출/blur 분리, 승인된 상품 분석/소재 불확실성 snapshot 전달, 자동 미형화/미소/기울임·모든 옷의 기모화·로고 선 굵기/채움 변형 억제. 비용 동의에서 구도 변경 가능성 고지.
- [x] format/lint/typecheck/unit/build 통과: **39/39**, Astro 진단 0. native workerd HTTP의 OAuth/provider 계약과 합성 촬영 지시 4종 manifest 통과. local desktop/mobile **6/6** 통과. 프레이밍에 맞춘 거리/명시적 접사 보존/일반 portrait 해석/직전 피부 보정·crop 분리/소재 불확실성 전달을 검사했다. 최신 문서 format 및 diff check도 통과했다.
- [x] 앱 `1382f82`의 production web/API/Workflow 재배포 통과. 공개 HTTPS/CORS/PKCE/폰트/반응형 smoke 통과. production desktop/mobile **6/6**, wrapper exit 0. 실제 배포 D1/R2/Workflow의 개선 지시·원본/이전 컷 비교·다운로드/내보내기·타인 차단·삭제를 검증했다. 합성 계정 0과 실제 계정/연결/세션 보존을 독립 읽기 전용 집계로 재확인했다.
- [x] v2 사용자 실행 신규 생성 1건 성공, generation 1회/evaluation 0회 및 실제 비용 반환 확인. 원본/결과를 비공개 비교했고 사용자는 얼굴/표정/피부가 여전히 AI 같다고 확인했다. v1과 상품/장소가 달라 동일 조건의 개선 성과로 판정하지 않는다. 후속 사용자 무신사 참고 이미지에서 얼굴이 더 크게 보여도 자연스럽다는 점을 반영해 다음 루프로 이동했다. 자동 유료 호출은 하지 않았다.

### 인물·촬영감 시각 참조의 세 번째 루프 — 2026-11-12 (ADR-021)

- [x] ‘얼굴 비중 축소’가 핵심 해결이라는 판단 수정. 피부 국소 명암/미세한 색 변화/경계 선예도/디테일 분포를 비교하되 카메라/압축/후처리 원인을 단정하지 않는다.
- [x] private 인물/촬영감 업로드 각 1장, signature/decode/10MB·4MP·4096px 검사, 권리/인물 동의, 작업 중 변경 차단 및 동시성 보호. 의류 분석에 포함하지 않으며 업로드 AI 0회.
- [x] 선택·외부 처리/비용 안내·snapshot 동의, owner/상품/용도 검증, 의류→인물→촬영감→이전 컷 순서, 최대 6장/12MB 과금 전 검사. 인물 특징/촬영감 역할 분리와 의류 우선. `studio-v5-reference` / `photo-v3-reference`.
- [x] 참조 원본 삭제/기존 결과 보존/전체 삭제 구분, 결과 사용 여부, 이전 얼굴보다 선택한 인물 우선, 포켓 구조 보존 지시 보강. 자동 외부 사진 수집·face embedding·학습·새 AI 단계 없음.
- [x] 최종 format/lint/typecheck/unit/build 통과: **44/44**, Astro 진단 0. native workerd HTTP OAuth/provider 계약 및 합성 manifest 6종 통과. local desktop/mobile **6/6**: 두 참조 등록/권리 동의/선택·미선택/실제 이미지 디코딩/생성 결과 사용 여부/원본·이전 비교/삭제까지 검사했다. owner·동의 누락 무과금·분석 제외·역할 순서·동시 업로드·진행 중 삭제 차단과 저장 실패 rollback 단위 검사를 포함한다. 합성 참조·동의 Dialog를 시각 점검했다.
- [x] 앱 `b07cb46` commit/push 및 production web/API/Workflow 배포 완료. 공개 HTTPS/CORS/PKCE/폰트/반응형 smoke 통과. production desktop/mobile **6/6**, wrapper exit 0. 배포된 private R2/D1/Workflow에서 두 참조의 등록/선택·제외/사용 여부/원본·이전 컷 비교/다운로드/내보내기/삭제를 검증했다. 참조·동의 UI를 시각 점검했다. 합성 계정 0, 실제 계정/연결/세션 보존, 기존 실제 결과 7건·과거 평가 5건 보존을 독립 읽기 전용 집계로 확인했다. 새 Cloudflare 리소스/파괴적 migration/자동 유료 AI 호출은 없다.
- [ ] 권한 있는 실제 참조의 인간 승인 생성/확대 비교. 합성 계약 검사를 얼굴/질감 품질 합격으로 표시하지 않는다.

### 상품 직접 작업 공간과 참조 기획 — 2026-11-12 (ADR-022)

- [x] 프로젝트 생성·목록·DB 계층 제거. `/studio` 직접 업로드와 상품 사이드바/검색, 이전 프로젝트 URL 복귀 및 API 410.
- [x] 의류 1–3장 선택/추가/삭제 미리보기, 최초 등록 시 선택적 촬영감·성인 인물 참조와 권리 동의. 여러 사진은 한 상품이며 한 번 등록한다고 여러 컷을 생성하지 않는다.
- [x] 중앙 원본/결과·이전 컷 비교, 원본 선택/확대/다운로드, 오른쪽 Headless UI 기획·상품 이해·촬영 콘셉트. 데스크톱 패널 독립 스크롤과 작은 화면 fallback, 상단 컨트롤 압축.
- [x] 중앙의 큰 실제 job/stage 대기 표시, 경과 시간·기존 작업 연결 복구. 가짜 진행률/자동 유료 재요청 없음. 인증 확인 skeleton 유지.
- [x] 선택한 촬영감 참조를 기존 planning 1회에 전송하고 관찰 요약/asset ID snapshot 저장. 의류 분석은 참조 제외, 생성은 별도 선택/동의. 기획 전 owner·용도·12MB 검사.
- [x] Toss 공식 원칙의 단순성/하나의 다음 행동/일관성을 참고해 랜딩과 작업 흐름을 정리했다. 랜딩 예시는 코드로 그린 설명용 일러스트이며 실제 생성 사진으로 표시하지 않는다.
- [x] format/lint/typecheck/unit/build 통과: 53/53, Astro 진단 0. native workerd OAuth/provider HTTP 계약, 로컬 D1/R2/Workflow, 오프라인 합성 촬영 지시 6종 통과. 최신 목록 DTO 보완 후 자원/초기화 경계 8개와 API typecheck도 재검증했다.
- [x] 최종 local desktop/mobile **6/6**. 3장 추가/삭제 미리보기·참조 기획·사용 선택·동의·분석 재사용·생성·수정·원본/이전 비교·다운로드·내보내기·삭제·타 계정 404·인증 pending/503 회복을 검증했다. 1440/1024px에서 inspector 스크롤 중 원본 좌표 변화 1px 미만, 모바일 패널 fallback과 가로 넘침 없음을 확인했다. 합성 사진 캡처도 시각 점검했다.
- [x] 사용자 승인 전체 운영 초기화 실행 완료: 기존 계정·연결·세션·과거 비용/품질 이력·private R2 사진 10개 삭제. 사전 dry-run의 active 1건은 실행 시점에 종료되어 실제 실행 시 active job/Workflow는 0이었다. 전체 앱 행/객체 0, FK 오류 0, 스키마·migration 원장 동일을 확인했다. CF 리소스/master secret/OpenRouter 측 계정·크레딧은 유지하며 재연결이 필요하다. `docs/15-DATA-RESET.md` 절차를 사용했다.
- [ ] commit/push, migration 0009 및 web/API/Workflow production 배포, 실제 URL의 public/Mock 전체 회귀와 합성 자료 정리 검증.
- [ ] 실제 사용자 재연결 및 권한 있는 참조로 동의한 유료 생성의 실사·상품 보존 효과. 자동 Mock 검증과 구별한다.
