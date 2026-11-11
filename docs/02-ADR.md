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
