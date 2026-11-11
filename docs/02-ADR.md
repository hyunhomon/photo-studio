# Architecture Decision Records (ADR)

**Date:** 2026-11-10 · **Version:** 0.3.0 · **Status:** Accepted baseline

각 ADR은 MVP 기술 결정이다. 구현이 불가능하거나 중대한 위험이 발견되면 변경 사유와 대안을 `10-DECISIONS-AND-RISKS.md`에 기록하고 추가 ADR로 수정할 것.

## ADR-001: Cloudflare-first 웹 아키텍처 — Accepted
- Windows 앱 대신 웹 MVP.
- Astro 웹 Worker + Hono API Worker 분리.
- Cloudflare D1, R2, Workflows 중심. 클라우드 종속성은 초기 개발 속도를 위해 수용.
- 결과: 별도 데스크톱 설치 없음, 플랫폼 종속성 증대.

## ADR-002: Bun 모노레포 — Accepted
- `apps/web`, `apps/api`, `packages/ui`, `packages/db`, `packages/schemas`, `packages/ai`.
- 타입·Zod·Drizzle 스키마 공유. 독립 배포. 코드 중복 지양.

## ADR-003: UI 디자인 시스템 — Accepted
- Astro + React Islands + Tailwind CSS v4 + `@headlessui/react` + Lucide.
- 기본 브라우저 느낌을 지양하는 직접 제작 디자인 토큰·컴포넌트.
- 의미 있는 네이티브 HTML 요소 및 접근성은 **유지**.
- 웹 랜딩은 SEO/성능, 스튜디오는 상호작용 최적화.

## ADR-004: OAuth PKCE BYOK — Accepted
- OpenRouter OAuth PKCE(S256)로 사용자 본인의 OpenRouter API Key 발급.
- 서버 콜백에서 교환한 키는 암호화 후 D1 저장; 웹 클라이언트 노출 금지.
- OpenRouter external user_id를 내부 UUID와 연관; external ID가 없거나 안전하지 않으면 자동 계정 매핑 금지.
- 별도 Photo Studio 세션 관리(서명/해시된 불투명 토큰, HttpOnly cookie).
- 고객 OpenRouter 크레딧 사용, 서비스 자체 크레딧/결제 없음.

## ADR-005: 단계별 AI 파이프라인 — Accepted
- Product Analyzer → Shoot Planner → Image Generator → Quality Evaluator.
- 각 단계의 JSON 결과는 Zod 검증; 모델/프롬프트/버전 설정 분리.
- 저가 멀티모달 분석 모델 ID는 **추후 현재 모델 기능·원가 확인 후 선택**.
- 생성 모델 기본 `openai/gpt-image-2`; Provider Adapter로 분리.
- 평가 결과는 보조이며 사용자가 최종 채택 여부 결정.

## ADR-006: 비동기 실행 / 외부 과금 보호 — Accepted
- Cloudflare Workflows + D1 상태로 장기 작업 관리.
- AI 과금 호출은 중복 실행하지 않도록 attempt ledger 기록.
- 불확실한 결과(요청 중단·응답 손실)는 자동 재호출하지 않고 재확인/사용자 승인으로 분기.
- Worker step 재시도는 provider API의 실제 멱등성 여부를 확인한 뒤 제한.

## ADR-007: 데이터 저장 — Accepted
- D1: 사용자/세션/프로젝트/상품/기획/작업/검수/피드백/로그.
- R2 private bucket: 입력/출력 이미지. 액세스는 API에서 사용자 권한 검증.
- 프로젝트 및 결과 영구 보관은 **사용자 삭제 시까지**를 기본 가설로 두고 공개 전 법적 고지/리텐션 확정.

## ADR-008: MVP 로깅 — Accepted
- 기술: 모델, 실행 단계, 실제 API 비용(존재 시), 지연, 실패/재시도, 요청 ID.
- 품질: 상품 유형, 평가 점수, 채택·폐기와 사유, 생성 횟수.
- 추정 비용과 확정 비용을 같은 필드에 혼합하지 말 것.
- 이미지/프롬프트/토큰을 디버그 로그로 유출하지 말 것.

## ADR-009: 베타 및 범위 — Accepted
- 초대 코드 기반 클로즈드 베타.
- 사진 1장으로 시작, 추가 사진 선택.
- 분석 후 콘셉트 확인 → 유료 생성 사용자 승인.
- 동일 브랜드의 모델·무드·로케이션 프리셋 저장.
- 결제·팀·배치·모델 훈련은 제외.

## ADR-010: 향후 과금 전환성 — Accepted
- 현재 사용자 Key resolver와 후속 서비스 Key resolver 추상화.
- 후속 구독 + 추가 크레딧은 현재 범위 외.
- 교체 시 기존 프로젝트·촬영 기획·프리셋·작업 기록을 유지.

## Implementation notes (ADR가 아닌 구현 제안)
- 개발 시작 시 최신 Astro/Workers 버전 호환 조합을 실제 공식 문서로 확인.
- 페이지 도메인과 API 도메인은 각각 별도 Worker. 개발 시 cross-origin cookie/CORS 테스트 필수.
- 서버 API 경로·세부 데이터 필드는 초기 초안이며 합리적 마이그레이션 가능.

## ADR-011: 초대 및 인증 구현 보완 — Accepted (2026-11-11)
- 초대 코드는 URL/query 대신 `POST /auth/openrouter/start` JSON으로 전달한다. 브라우저 Origin을 확인하고 IP 원문 대신 secret을 섞은 bucket hash로 시작 요청을 제한한다.
- 새 내부 계정 생성과 초대 소모는 D1 atomic batch로 처리한다. 이미 등록된 OpenRouter 계정의 재로그인은 초대 코드를 다시 소모하지 않는다. user_id가 없으면 신규/기존 모두 연결하지 않는다.
- OAuth flow verifier는 AES-GCM envelope로 저장하고 state/browser hash+TTL 조건의 `DELETE RETURNING`으로 한 번만 사용한다. provider key는 내부 user ID를 additional authenticated data로 바인딩한다.
- 앱 세션은 7일의 랜덤 opaque cookie와 DB hash로 관리한다. 30분 사용 후 명시적 CSRF 보호 refresh 요청으로 token/CSRF를 교체한다. production 쿠키는 __Host-/Secure/HttpOnly/SameSite=Lax이다.
- 로컬 Mock 로그인은 local 환경+ENABLE_DEMO+mock AI 세 조건에서만 허용한다. production HTTP에는 테스트 로그인 우회 경로를 열지 않는다. 운영 E2E는 관리 권한으로 만든 단기 합성 계정만 사용하고 삭제한다.

## ADR-012: 글꼴 — Accepted (사용자 지정, 2026-11-11)
- 본문/UI는 Pretendard, 브랜드 및 주요 헤드라인은 Paperlogy를 사용한다.
- 공식 저장소의 WOFF2를 자체 호스팅하고 OFL 라이선스를 함께 배포한다. 외부 폰트 CDN 요청을 만들지 않는다.

## ADR-013: 분석 모델과 과금 호출 원장 — Accepted (2026-11-11)
- 공식 `/models`의 이미지 입력·structured_outputs·response_format 메타데이터를 확인해 분석/기획 기본값은 `google/gemini-2.5-flash-lite`, 평가 기본값은 `google/gemini-2.5-flash`로 선택했다. 환경 변수로 교체 가능하며 실행 전 현재 capability를 다시 검사한다. 실제 의류 품질 및 실제 유료 호출 검증은 아직 남아 있다.
- API 요청은 사용자별 idempotency key와 변경 불가능한 입력 snapshot을 저장한다. Workflow payload에는 작업 ID만 전달하고 step 결과에는 저장 완료 여부만 남긴다. 사진/프롬프트/키를 Workflow 결과나 로그에 남기지 않는다.
- 과금 stage는 D1의 unique(job,stage) 원장을 원자적으로 선점한 뒤 호출한다. 기존 성공은 재사용하고 진행/실패/불확실 상태는 재호출하지 않는다. Workflow 유료 step 재시도는 0이다.
- 분석에 사용한 원본은 고정한다. 사진을 교체하려면 새 상품을 등록한다. 수정 가능한 분석/촬영 콘셉트와 사용자가 승인한 생성 snapshot은 구분한다.
- JSON Schema + Zod 검증을 함께 사용하며 실제 비용은 제공된 값만 저장한다. 응답 형식 실패에도 제공된 사용량/비용은 보존한다.

## ADR-014: 베타 운영·삭제의 일관성 — Accepted (2026-11-11)
- 집계는 owner 단위의 확인된 실제 비용 부분합과 미확인 호출 수를 구분한다. 사람 검수 기준 및 AI 평가 완료 기준 채택률을 각각 표시한다. 삭제된 자료는 집계에서 제외한다.
- 계정 삭제는 사용자와 프로젝트를 deleting으로 먼저 표시한다. 새 작업을 차단하고 실행 취소·비공개 R2·관계 데이터를 정리하며 실패한 삭제는 기존 세션으로 재시도한다. 종료 후 모든 앱 세션과 암호화 연결을 삭제한다.
- 이미 진행 중인 저장의 늦은 도착을 정리하기 위해 독립된 media_purges prefix tombstone을 최소 24시간 보관하고 시간별 cron에서 재정리한다. 다른 계정의 prefix를 삭제하지 않도록 범위를 검증한다.
- production E2E는 관리 권한으로 만든 임시 is_test 계정에만 Mock을 허용한다. 고객 OAuth 계정은 실제 BYOK만 사용하며 provider 미설정 시 Mock으로 위장하지 않는다. 합성 계정과 사진은 검사 후 삭제한다.

## ADR-015: 다크 전용 형광 초록 UI와 브랜드 — Accepted (사용자 지정, 2026-11-11)
- 사용자가 제공한 치지직 레퍼런스를 바탕으로 다크 전용 팔레트와 primary `#00F59B`를 적용한다. 기존 옅은 에디토리얼 색상 제안은 이 사용자 지시로 대체한다.
- Tailwind v4 semantic token에 모든 UI 배경/텍스트/포커스/상태 색을 모은다. 경고·파괴적 동작은 별도의 다크 배경/상태 토큰으로 구분한다. 사진 원본/생성 결과에는 테마 필터를 적용하지 않는다.
- Pretendard 본문, Paperlogy 주요 헤드라인을 유지한다. P/셔터를 결합한 독자적 벡터 심볼과 기울어진 워드마크를 사용하며, favicon 및 자체 완결 SVG lockup을 제공한다. Paperlogy outline은 기존 OFL 글꼴에서 추출한다.
- Headless UI Dialog/Listbox와 semantic HTML·키보드 포커스를 유지한다. 테마 전환 없이 OS가 light여도 dark로 표시한다.
- 사용자 테스트 중 API/Workflow를 재배포하지 않도록 `deploy:web`으로 검증된 production 웹 Worker만 게시한다. 계정·존·도메인 pin을 검사하고 API·DB·secret은 변경하지 않는다.

## ADR-016: 초대 없는 직접 OAuth와 콜백 오류 복구 — Accepted (사용자 지정, 2026-11-11)
- 신규/기존 사용자 모두 초대 코드 없이 연결한다. ADR-009의 클로즈드 초대 정책 및 ADR-011의 초대 전달/소모 부분만 대체한다. PKCE S256, state/browser binding, stable user_id, 서버 암호화, 별도 세션 결정은 유지한다.
- 홈페이지 버튼과 로그인하지 않은 `/studio`는 `GET /auth/openrouter/start`에서 바로 OpenRouter로 303 이동한다. cross-site 시작을 거부하고 rate limit을 유지한다. 기존 POST는 정확한 Origin 검사 후 URL을 반환하는 호환 경로로 유지한다. `/beta` 입력 화면은 제거하며 과거 링크만 `/studio` 308 redirect로 보존한다.
- 신규 user/connection은 D1 atomic batch로 저장한다. 동시 최초 로그인 충돌은 stable identity를 다시 조회해 DB 쓰기만 재시도하며 일회용 OAuth code를 다시 교환하지 않는다. 세션 저장 실패 시 재연결할 수 있다.
- 콜백 실패를 state/암호 해제/교환/응답 검증/저장/세션 단계로 구분한다. UI는 고정된 오류별 안내와 재연결 버튼을 표시하며 자동 OAuth 반복을 막는다. provider의 raw 오류 메시지를 노출하거나 기록하지 않는다.
- `auth_events`에는 고정 stage/code, HTTP status 또는 null, timestamp만 저장하고 동일 분/종류 중복은 합친다. 사용자/브라우저 식별자, code/state/verifier/key/원문 응답은 저장하지 않는다. cron에서 7일 후 삭제한다. 진단 저장 실패가 연결 복구를 막지 않게 한다.
- 공식 OAuth 가이드와 OpenAPI의 nullable user_id 계약을 확인했다. stable ID 누락은 안전하게 실패하며 키 hash로 계정을 대체하지 않는다. 기존 오류는 상세 진단이 없어 원인을 확정할 수 없으며 실제 계정 성공은 사람의 재연결로 별도 검증한다.
- 근거: https://openrouter.ai/docs/guides/overview/auth/oauth 및 https://openrouter.ai/openapi.json

### ADR-016 런타임 검증 보완
- production의 합성 invalid-code probe로 verifier 복호화 후 외부 exchange transport 단계에서 응답 없이 실패함을 확인했다. 원인은 Workers가 `redirect: "error"`를 지원하지 않아 fetch가 전송 전에 TypeError를 던지는 런타임 호환성 오류였다.
- OAuth, 키 상태 확인, 모델 catalog 및 유료 provider 요청 모두 `redirect: "manual"`로 변경한다. 3xx는 기존 `response.ok` 검사에서 거부하고 Location을 따라가지 않는다. 키/인증코드가 다른 호스트에 전달되지 않으며 자동 재시도도 하지 않는다.
- native fetch를 가짜 함수로 교체하면 이 문제를 놓친다. `test:oauth`는 실제 workerd native HTTP와 로컬 합성 provider 서버로 OAuth/키 상태/catalog/분석/기획/생성/평가를 검증한다. 합성 redirect trap에 요청이 도달하지 않는 것도 검사한다. 외부 유료 호출은 없다.
- 공식 근거: https://developers.cloudflare.com/workers/runtime-apis/request/

## ADR-017: 구조화 응답 호환성과 기획만 복구 — Accepted (2026-11-11)
- 실제 기획 호출은 Google AI Studio에서 STOP으로 정상 종료되고 비용도 반환됐지만 앱 형식 검증에 실패했다. 이전 실패 원문을 보관하지 않아 정확한 불일치 필드는 소급 확정할 수 없다. 크레딧 부족 오류와 응답 검증 실패를 구분한다.
- `studio-v2`는 provider용 출력 계약과 앱 최종 계약을 분리한다. 3:4 비율, 사람 검수 필수 true, 평가 버전 v1은 앱 정책으로 바인딩하며 모델이 결정하지 않는다. 문자열 enum은 그대로 유지하고 wire JSON Schema의 literal은 동등한 singleton enum으로 표현한다.
- 로컬에서 BOM/전체 JSON code fence/텍스트 content part만 손실 없이 해석하고 사용하지 않는 추가 metadata를 버린다. 필수 항목·타입·범위·enum은 계속 검증한다. 빠진 조명/포즈 등을 만들어 채우거나 잘못된 enum을 추측 변환하지 않는다. HTTP 사용자 수정 API의 strict 계약은 유지한다.
- 응답 잘림/차단/JSON 오류/schema 불일치를 구분한다. 실패 attempt의 기존 `output_json`에는 값·원문·모르는 속성명·Zod 메시지 없이 고정 reason/허용된 field path/issue code만 저장한다. 사용량·실제 비용·원장은 유지하며 유료 호출 자동 재시도는 없다.
- `reuseAnalysis=true`는 사용자 비용 동의를 받은 새 작업이다. 본인 상품의 저장된 분석을 요청 시 snapshot으로 고정하고 기존 analysis stage의 모델 호출을 생략한 뒤 planning 1회만 실행한다. 이전 실패 원장/비용은 변경하지 않으며 새 idempotency key와 원장을 사용한다. 기본 분석+기획 흐름은 유지한다.
- 근거: https://openrouter.ai/docs/guides/features/structured-outputs 및 https://ai.google.dev/gemini-api/docs/structured-output

## ADR-018: 작업 사이드바와 명시적 인증 pending — Accepted (사용자 지정, 2026-11-11)
- ChatGPT/Codex의 탐색 패턴을 참고해 프로젝트 목록을 전 화면 공통 좌측 사이드바로 옮긴다. 중앙 `/studio`는 이름/메모 입력으로 실제 프로젝트를 생성하는 시작 화면이다. 데이터 모델과 AI 실행 동의 단계는 유지한다.
- 최근 7일/이전 프로젝트, 현재 프로젝트 표시, Ctrl/⌘+K Headless UI Combobox 검색, 접기/펼치기 및 작은 화면 Headless UI Dialog 탐색을 제공한다. 사용자별 실제 owner 목록만 요청한다. 브라우저 저장소에는 접힘 여부 boolean만 보관하며 프로젝트/키/세션/프롬프트는 캐시하지 않는다.
- account 상태를 pending/ready/unauthenticated/redirecting/error로 구분한다. 초기 SSR와 인증 확인 중에는 ARIA skeleton을 표시한다. 명시적인 401과 공개 설정 확인 뒤에만 연결 화면 또는 기존 직접 OAuth 이동을 수행한다. 서버/네트워크 장애는 재확인 UI로 복구하며 연결 해제로 표시하지 않는다.
- Astro ClientRouter로 스튜디오 내부 링크/변경 후 이동을 수행한다. 라우트마다 실제 세션을 다시 확인하고 private 응답은 no-store를 유지한다. OAuth/키 재연결/파일 다운로드/내보내기는 native navigation으로 처리한다. 라우터 history state를 유지하며 auth_error 파라미터만 제거한다.
- dark/neon·Pretendard/Paperlogy·Headless UI·의미 있는 HTML·동작 감소 설정을 유지한다. 웹 전용 배포를 사용하며 이번 변경으로 API/Workflow/secret/D1은 변경하지 않는다.
- 근거: https://chatgpt.com, https://docs.astro.build/en/guides/view-transitions/, https://headlessui.com/react/combobox
