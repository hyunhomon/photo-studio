# Architecture Decision Records (ADR)

**Date:** 2026-11-10 · **Version:** 0.3.0 · **Status:** Accepted baseline

각 ADR은 MVP 기술 결정이다. 아래 기록은 시간순 이력이며 후속 ADR의 명시적 대체 범위를 우선한다. ADR-022는 프로젝트 계층/화면 및 이번 사용자 요청 초기화 범위를 대체한다. ADR-016의 초대 제거, ADR-019의 평가 종료도 이전 기록을 대체한다. 구현이 불가능하거나 중대한 위험이 발견되면 변경 사유와 대안을 `10-DECISIONS-AND-RISKS.md`에 기록하고 추가 ADR로 수정할 것.

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

## ADR-019: 촬영 일관성 중심의 생성·수동 비교 — Accepted (사용자 지정, 2026-11-12)

- 목적은 빛/초점의 일관성, 자연스러운 성인 인물, 의류와 주변 소재 표현이다. 구별하기 어려운 스튜디오/가상 로케이션 모드 선택을 제거하고 하나의 촬영 기획으로 통합한다. 실제 장소·시간·조명·구도 설정은 유지한다. 과거 `shootType`은 읽기 호환만 유지하며 새 provider 기획/이미지 프롬프트에 사용하지 않는다.
- AI 수치 점수와 채택/폐기·피드백 UI 및 신규 저장을 종료한다. 기존 실제 5건의 realism=0.9 편중은 검증된 품질 지표가 아니었다. ProductAnalyzer → ShootPlanner → ImageGenerator → 사람의 원본/이전 컷 비교로 변경한다. ADR-005의 평가 단계, ADR-008의 점수/채택 로깅, ADR-013의 평가 모델 사용, ADR-014의 채택률 집계 부분을 대체하며 다른 보안·삭제·과금 결정은 유지한다.
- 새 Workflow는 generation 1단계만 수행한다. 구버전 evaluation 단계 진입도 새 런타임에서는 무과금 no-op이다. 이미 구버전으로 실행 중인 Workflow에 대한 소급 중단은 보장하지 않는다. 평가 실패를 생성 실패로 바꾸거나 비용을 숨기지 않는다. `evaluations`/`asset_feedback` 및 과거 비용은 보존·내보내며 결과 DTO/화면에는 점수를 반환하지 않는다. 기존 feedback endpoint는 owner 검사 후 410, 타인 자원은 404다.
- `studio-v3-photography` / `photo-v1`: 촬영 프롬프트 컴파일러를 분리한다. 초점·배경 거리·조리개를 일관된 근사 프로필로 연결하고 눈과 상품 디테일이 읽히는 심도를 우선한다. 광원 방향/크기·접촉 그림자·반사광, 피부/눈/머리카락의 현실감 일관성, 중력에 따른 원단 주름·주변 표면의 서로 다른 반응을 명시한다. 임의 노이즈·블러 후처리로 의류 오류를 감추지 않는다. 광학 계산은 지시의 일관성 검사이며 생성 모델이 실제 카메라를 시뮬레이션한다는 주장은 아니다.
- 외모 묘사, 배경 분리 정도, 소재 표현 지시를 기획/프리셋에 추가한다. 실제 인물 얼굴 업로드나 웹 수집은 이번에 구현하지 않는다. 묘사만으로 신원을 고정한다고 보장하지 않는다. 컷 개선은 같은 상품/owner의 이전 생성 컷을 추가 참조해 가상의 성인·구도 연속성을 유도하며 의류 근거는 항상 원본이 우선이다.
- 개선 항목/자유 지시가 실제 생성 입력에 반영되도록 하고 snapshot에 촬영 버전/원본/이전 컷 연결과 함께 비공개 저장한다. 실제 참조 수 capability 및 원본+이전 컷 총 12MB를 과금 선점 전에 검사한다. 자동 재생성/유료 평가/자동 유료 벤치마크는 없다.
- trade-off: 검증되지 않은 숫자 대신 사람이 비교할 부담을 수용한다. 긴 지시와 참조는 품질/동일인/로고를 보장하지 않으며 이전 오류가 전파될 수 있다. 새 출력의 실제 개선 여부는 동일 입력의 한 항목씩 비교하는 인간 승인 실험으로 검증한다. 낮은 원본 해상도는 복원 근거가 부족하므로 안내하되 업로드를 무조건 거부하지 않는다.
- 근거와 실행 루프: `14-REALISM-RESEARCH.md`. 기존 ADR 본문은 당시 결정 이력으로 유지한다.

## ADR-020: 상품 사진의 프레이밍과 이전 컷 결함의 분리 — Accepted (2026-11-12)

- 사용자는 photo-v1의 개선을 느꼈지만 여전히 AI 인상이 남는다고 확인했다. 공식 쇼핑몰 게시 사진과 비교해 상품보다 큰 얼굴, 반복된 미소/머리 기울임, 강한 배경 흐림, 피부 보정감이 남는 것을 작업 가설로 삼는다. 사진 출처와 관찰의 한계는 `14-REALISM-RESEARCH.md`의 두 번째 루프에 기록한다. 게시 이미지의 촬영/보정/생성 이력은 확인하지 못했으며 이들을 절대적 실사 정답으로 취급하지 않는다.
- `studio-v4-retail` / `photo-v2-retail`은 기존 하나의 파이프라인을 유지한다. 새 모드 선택을 추가하지 않고 의류의 핏/구조가 주제인 상품 촬영을 기본으로 한다. 일반 구도에는 의류 전체·밑단·소매(하의는 허리/다리/밑단)를 보여주고 얼굴 비중을 줄이도록 지시한다. 명시적 전신/클로즈업은 존중한다. 모호한 3/4 portrait는 얼굴 클로즈업으로 해석하지 않는다.
- 프레이밍의 근사 수직 화각과 3:4 crop의 active sensor 24×32mm, 초점거리로 촬영 거리를 연결한다. 눈/상품의 초점 조건과 모순되는 임의 숫자 조합을 줄이기 위한 제어이며 생성 결과를 측정/보장하지 않는다. 인체 비율을 바꿔 얼굴을 작게 만들지 않는다.
- 새/누락된 배경 분리 기본값은 gentle로 변경한다. 명시적으로 저장된 balanced/separated와 사용자의 장소·조명·구도는 유지한다. planner는 보편적 미형 얼굴/미소/머리 기울임을 자동 추가하지 않으며 승인된 외모·표정을 존중한다. 랜덤 하자/일괄 노이즈 후처리는 하지 않는다.
- 이전 컷은 가상 성인의 얼굴 구조·머리·몸 특징을 위한 참조로 한정한다. 기존 crop/정확한 표정/피부 retouch/노출/bokeh까지 복제하라는 지시는 제거한다. 의류 가시성과 요청된 교정을 위해 다시 프레이밍할 수 있음을 비용 동의 UI에 알린다. 동일인 보존을 보장하지 않는다.
- 생성 시 승인 시점의 분석을 job snapshot에 고정해 원본과 함께 전달한다. 소재 추정/불확실성은 확정 사실로 승격하지 않으며, 모든 옷을 기모/벨벳처럼 만드는 경향·로고 선 굵기/채움 변경을 억제한다. 이전 분석이 없는 legacy 작업도 계속 지원한다.
- 외부 쇼핑몰의 얼굴/이미지를 provider 참조로 자동 전송하지 않는다. 이번 작업은 시각 비교에서 얻은 촬영 규칙을 코드로 구현한 것이며 실제 얼굴 reference 기능이나 style-transfer 모델 구현이 아니다. 평가·추가 유료 단계·자동 재생성도 없다.
- trade-off: 기본 구도가 상품 중심으로 달라질 수 있다. 기존 사용자 선택은 보존하고 수정/승인을 통해 새 기획을 사용할 수 있다. 직전 컷의 결함 전파를 줄이는 지시가 실제로 얼마나 효과적인지는 새 인간 승인 출력 비교로 별도 검증한다. photo-v1의 1건 성공을 v2 실사 품질 검증으로 재사용하지 않는다.

## ADR-021: 인물과 촬영감의 선택적 시각 참조 — Accepted (2026-11-12)

- v2의 실제 생성 1건은 성공했지만 사용자는 얼굴/표정/피부의 AI 인상이 남는다고 확인했다. 제공한 무신사 참고 사진은 얼굴이 더 크게 보여도 자연스러워 보였으므로 얼굴 비중 축소만으로 원인을 설명하지 않는다. 피부의 국소 명암/색 변화, 경계 선예도와 미세 질감의 분포, 전체 광량/명암의 통일감이 주요 작업 가설이다. 입력 사진의 압축/축소/후처리가 다른 만큼 실제 카메라 설정·원인을 단정하지 않는다.
- `studio-v5-reference` / `photo-v3-reference`: 기존 1회 이미지 생성에 선택적 인물 참조와 촬영감 참조를 추가한다. 인물은 동의받은 성인 얼굴 구조/특징/자연스러운 피부의 증거, 촬영감은 톤/명암/edge acutance/질감 대역의 기준으로 구분한다. 촬영감 사진의 인물·의류·로고·사물을 복제하지 않도록 지시하고 의류 원본을 최우선으로 둔다. provider의 별도 native identity/style 기능이 아니라 문서화된 `input_references`와 명시적 역할 지시다.
- 입력 순서는 의류 1–3장 → 선택한 인물 1장 → 선택한 촬영감 1장 → 선택한 이전 컷 1장이다. 실제 수(최대 6장)의 capability와 전체 12MB를 과금 전 검사한다. 인물 참조가 있으면 직전 생성 얼굴보다 우선하며, 없으면 기존 가상 성인 흐름을 유지한다. 얼굴 동일성/실사 품질과 상품 구조 보존은 보장하지 않는다.
- 원본과 참조의 asset kind를 `input`, `person_reference`, `look_reference`로 구분한다. 상품 분석에는 `input`만 사용한다. 참조는 상품별/용도별 1장을 원자적 조건부 INSERT로 제한한다. 기존 assets의 text kind를 활용하며 새 Cloudflare 리소스나 파괴적 migration은 필요 없다. 별도 얼굴 embedding/인물 식별/학습 데이터 수집은 하지 않는다.
- 사용 권한/인물 동의를 확인한 JPEG/PNG/WebP만 기존 signature/실제 decode/10MB·4MP·4096px 정규화 경로로 비공개 R2에 보관한다. 업로드는 AI를 실행하지 않는다. 생성 창의 사용 여부 선택·외부 전달 고지·비용 동의와 요청의 `referenceConsent`가 있어야 선택된 참조를 사용한다. 구버전 요청은 ID가 null이므로 자동으로 참조를 사용하지 않는다.
- `personReferenceId`/`lookReferenceId`는 현재 owner/상품/용도가 맞는 asset이어야 한다. job snapshot에 선택 ID·동의·상품 분석을 고정하고 원문/사진/식별자는 console/CI에 남기지 않는다. 임의 외부 URL을 받거나 공개 웹 얼굴을 자동 수집·전송하지 않는다. 사용자 첨부 비교 사진도 자동으로 외부 추론에 보내지 않는다.
- 실행 중 참조 추가/삭제를 차단하며, 삭제와 새 job 경합으로 참조가 사라지면 과금 전 안전하게 실패한다. 참조 원본 삭제는 기존 생성 결과까지 지우지는 않으므로 UI/개인정보 안내에 구분한다. 상품/프로젝트/계정 삭제는 모든 참조도 정리한다. 결과 DTO에는 참조 사용 여부만 표시하고 과거 점수/피드백은 계속 보존만 한다.
- v2에서 관찰한 주머니 구조 변형은 품질 실패로 기록한다. 분석/생성 지시에 관찰된 포켓 개수·입구 방향·웰트 경계·패널 보존을 강화하고 일반적인 후드티 캥거루 포켓으로 치환하지 않게 한다. 이는 구조 고정 renderer나 pixel 보존 기능을 구현한 것이 아니다.
- trade-off: 선택적 참조 입력/동의 UI와 사용자 데이터가 늘고 입력 크기에 따라 비용이 달라진다. 새 AI 단계/평가 호출/자동 유료 재생성은 추가하지 않는다. 합성 참조의 전송·권한·동의·삭제 검사와 실제 참조를 사용한 품질 효과를 분리한다. 후자는 사용자가 권한 있는 사진을 선택하고 비용에 동의한 실행으로 검증한다.

## ADR-022: 상품 직접 작업 공간과 참조 기반 기획 — Accepted (사용자 지정, 2026-11-12)

- 사용자는 프로젝트 생성을 제거하고 상품 업로드부터 촬영 기획/생성까지 진행하도록 요청했다. products는 user_id에 직접 속하고 projects 테이블·project_id·프로젝트 생성/목록 UI를 제거한다. 과거 프로젝트 URL은 studio로 복귀하고 API는 410을 반환한다. 숨은 default project는 만들지 않는다. ADR-007의 프로젝트 저장 계층과 ADR-018의 프로젝트 사이드바/생성 화면을 대체하며 다른 스택·세션·BYOK 결정은 유지한다.
- /studio의 시작 화면은 의류 1–3장 직접 등록 폼이다. 선택 사진/순서/삭제를 미리보기로 확인하고 첫 의류가 기본 비교 원본이다. 사이드바는 owner 상품 요약/검색이다. 중앙에 원본/AI 결과·이전 컷 비교를 계속 유지하고 오른쪽 inspector에 기획·상품 이해·촬영 콘셉트를 둔다. 작은 화면의 패널/탐색과 키보드·스크린리더 동작도 유지한다.
- 인증 확인은 skeleton, 분석/기획/생성은 중앙 이미지 영역의 뚜렷한 대기 상태와 실제 job/stage로 표시한다. 가짜 진행률/예상 완료 시간/새 결과를 만들지 않고 결과 불명확 시 자동 유료 재요청을 하지 않는다. 랜딩은 하나의 다음 행동과 짧은 설명으로 줄인다. Toss 공식 Product Principles와 Design System의 단순성/명확한 행동/일관된 접근성을 참고하되 기존 Tailwind/Headless UI 커스텀 구현, 다크·형광 초록·Pretendard/Paperlogy를 유지한다.
- 최초 상품 등록에서 선택적 personImage/lookImage 각 1장도 권리·성인 동의와 함께 저장할 수 있다. 업로드는 계속 무과금이다. 의류 분석은 input만 사용한다. 기획 요청에서 선택·동의한 look_reference를 기존 planning 호출 1회에 추가해 빛·톤·구도·초점·표면 반응을 관찰한다. 새 유료 참조 분석 단계를 만들지 않는다. 기획의 referenceNotes는 관찰 요약이며 실제 EXIF/카메라 추론이나 적용 성공이 아니다.
- 현재 prompt_version은 studio-v6-planning-reference, generation capture_version은 photo-v3-reference다. 기획 job은 lookReferenceId/referenceConsent를 owner·상품·용도 검사 후 snapshot에 고정하고 의류+선택 참조 총 12MB를 작업 생성 전 검사한다. PlanDto.lookReferenceId로 사용 사진을 연결한다. 생성 창에서 같은 참조를 확인·선택하고 별도 외부 처리/이미지 비용에 동의해야 하며 서버가 연결 ID만으로 참조를 몰래 전송하지 않는다. ADR-021의 별도 의류/인물/촬영감 역할·최대 6장/12MB·capability 검사·보안 정책은 유지한다.
- 사용자는 기존 서비스 DB 초기화도 명시적으로 요청했다. 이번 일회성 운영 작업에 한해 기존 앱 데이터·계정·세션·암호화 연결·과거 비용/품질 이력과 private R2 미디어를 제거한다. ADR-007/019/021의 통상 보존 원칙에 대한 사용자 승인 예외이며 향후 배포의 기본 동작은 아니다. 0009 migration은 studio 데이터·프리셋 초기화/프로젝트 제거만 수행하고, 전체 운영 초기화는 실행 중 작업 취소·미디어 정리·잔여 검증을 포함하는 별도 절차다. Cloudflare D1/R2/Workflows 리소스·바인딩·도메인·master secret은 보존한다. 초기화 후 OAuth 재연결이 필요하며 OpenRouter 측 계정/키/청구/크레딧에는 손대지 않는다. 완료 여부는 실행 기록으로 확인한다.
- trade-off: 과거 프로젝트 구조와 이번 요청의 서비스 이력을 복구하지 않는 파괴적 변경이다. 사용자 승인된 범위로 한정하고 기존 ADR 이력은 지우지 않는다. 선택 참조의 입력 크기로 비용이 달라질 수 있으며 사람의 실사/상품 정확도 비교는 여전히 필요하다. UI·전송/권한·Mock 검증을 실제 참조 기반 품질 검증으로 표시하지 않는다.
- 근거: https://toss.im/tossfeed/article/tossproductprinciples 및 https://toss.tech/article/toss-design-system

## ADR-023: 프레임 안의 대기 상태와 사이드바 상품 액션 — Accepted (사용자 지정, 2026-11-12)

- 대기 UI는 좌표/최소 높이로 작업대 위에 띄우지 않고 실제 결과 figure 안에 inset 0으로 배치한다. 부모 안에서만 스크롤하며 원본과 결과 컨트롤은 유지한다. 고정 최소 너비/높이 때문에 부모를 넘어가지 않는다.
- 상세 화면의 제목 헤더/사진과 데이터 링크/의류 원본 장수/원본과 결과 제목을 시각적으로 제거한다. 의미 있는 접근성 제목과 비교 사진의 라벨은 유지한다. 삭제·제목 수정은 의류 아이콘 없는 사이드바 상품 행의 hover/focus 액션이다. 터치에서는 액션을 항상 표시하고 Headless UI Dialog에서 제목 입력·삭제 확인·오류 복구를 제공한다.
- 이름 미입력 상품은 파일명을 쓰지 않고 ‘새 상품’으로 등록한다. 업로드로 AI를 호출하지 않는다. 비용 동의한 기존 analysis 호출에서 suggestedTitle을 함께 요청하고, 없는 경우 AI가 분석한 색상/의류 종류로 짧은 제목을 만든다. 별도 제목 생성 호출/과금은 없다. 최초 등록 안내에 분석 후 자동 명명을 명시한다.
- additive migration 0010은 name_source(default manual)를 추가한다. 새 빈 제목만 auto로 저장하고 수동 등록/제목 변경은 manual이다. 분석 결과 저장 후 owner/ready/auto 조건부 UPDATE로 동시 수동 수정과 기존 제목을 보호한다. 기존 상품 제목/파일/연결·비용 기록은 초기화하거나 소급 변경하지 않는다. prompt_version은 studio-v7-product-title이다.
- trade-off: 사용자가 분석을 승인하기 전에는 임시 제목이 보인다. 분석 실패 시에도 임시 제목을 유지하며 자동 재시도나 업로드 즉시 유료 제목 호출을 하지 않는다.

## ADR-024: 생성 실행에 편집 저장과 승인을 통합 — Accepted (사용자 지정, 2026-11-12)

- 상품 이해/촬영 콘셉트의 별도 수정 저장 및 콘셉트 승인 버튼을 제거한다. 기획이 있으면 생성할 수 있고, 생성 확인/비용 동의가 촬영 지시의 승인이다. 업로드/편집/기획 완료가 자동으로 이미지를 생성하지는 않는다.
- 편집값은 상품 화면의 공유 메모리에 유지한다. 탭 전환/동일 자료의 상태 polling으로 덮지 않으며 새 분석/새 기획은 해당 서버 결과로 갱신한다. 생성 확인 창을 열 때 현재 편집값을 고정해 요약하고, 비용 동의 요청에 editedAnalysis/editedPlan을 함께 보낸다. 생성 전 페이지 이탈 시 저장되지 않은 편집은 보존하지 않는다. 별도 기획 재요청의 ‘저장된 분석 재사용’은 마지막 저장값을 의미한다.
- generate는 draft/approved 계획 모두 허용하되 consent=true, 전체 Zod 검증, owner/원본/참조 검사를 통과해야 한다. 생성 job INSERT와 상품 분석/계획 저장은 D1 batch 트랜잭션에서 처리하고 성공 후 Workflow를 dispatch한다. 새 job이 실제 INSERT된 ID 조건으로만 업데이트해 active-job 충돌이나 idempotent replay가 저장값을 덮지 않는다. job에는 편집된 분석/계획 snapshot을 고정한다.
- 내부 approved 상태 및 이전 PATCH 엔드포인트는 이력/구버전 호환으로 남기며 현재 UI의 선행 단계가 아니다. 과거 비용/원장은 보존하고 실패·불명확한 유료 호출은 자동 반복하지 않는다. 저장 실패 시 job/분석/계획을 함께 rollback하고 생성 요청/비용 동의 없이 쓰지 않는다. DB 스키마 변경은 없다.
- 근거: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
