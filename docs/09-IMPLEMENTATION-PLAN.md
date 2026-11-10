# Implementation Plan — Codex 실행용

**원칙:** 각 Phase는 작동하는 결과, 테스트, 문서 업데이트까지 완료한다. 외부 유료 AI 실제 호출은 사용자가 명시적으로 승인하기 전에는 실행하지 않는다.

## Phase 0 — 모노레포/도구/인프라 로컬 기반

- [ ] Astro web + React Islands, Tailwind CSS v4, Headless UI, lucide-react 스캐폴딩.
- [ ] Hono API Worker + TypeScript + Zod, Drizzle/D1, R2, Workflows 바인딩.
- [ ] Bun workspaces로 packages(ui/db/schemas/ai) 연결.
- [ ] Wrangler local development 설정, `.dev.vars.example`, `.env.example` 정합성 확인.
- [ ] formatter/linter/typecheck/test runner/build scripts 설치 및 실행.
- [ ] 웹 초기 랜딩 + `/studio` 빈 화면, API `/health` 동작.
- [ ] stub AI adapter & test fixture 생성. 운영 키 없어도 로컬 UI/테스트 가능.

**DoD:** README 명령으로 웹/API 로컬 부팅, `/health` 200, 타입/테스트/빌드 통과. 실제 외부 API 호출 없음.

## Phase 1 — 초대/인증/보안

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

**DoD:** staging Cloudflare 배포, OAuth callback 정상, 사용량/품질 기록, 운영 가이드 완료.

## 테스트 매트릭스

- Unit: Zod validator, analysis JSON parsing, cost labels, ownership guard, idempotency handling.
- Integration (mock): OAuth state validation, D1 relations, image upload/download, job status transitions, R2 errors.
- Security: invalid signature, oversized upload, forged session/CSRF, cross-user asset access, key redaction.
- Workflow: API timeout before send, unknown outcome after send, evaluation fail, repeated webhook/poll, duplicated button click.
- UI/E2E: no native-looking select/dialog, keyboard accessibility, no balance, insufficient credits, successful review/download.

## 최종 릴리스 체크

- [ ] 웹과 API 모두 배포 가능
- [ ] 초대 코드 베타 보호
- [ ] OAuth PKCE와 암호화 키 저장
- [ ] 사진 1장으로 처음부터 끝까지 동작
- [ ] 모델컷/가상 로케이션컷 사용 시나리오
- [ ] 유료 AI 분석 및 이미지 생성 호출 모두 사용자 확인 필수
- [ ] 비용·시간·채택/폐기/사유 로그 확인
- [ ] 타인 프로젝트/이미지 접근 차단
- [ ] 중복 유료 호출 방어
- [ ] 고객의 실제 촬영비 및 절감액 기록 양식 준비
