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
