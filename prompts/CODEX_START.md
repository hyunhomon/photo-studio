# Codex에 처음 전달할 프롬프트

아래를 Codex CLI에 **그대로 복사해 붙여넣으세요.** 이 패키지는 문서만 있는 스타터이므로 Phase 0부터 구현해야 합니다.

---

Photo Studio 프로젝트 개발을 시작해 줘.

1. 현재 저장소의 `AGENTS.md`, `README.md`, `docs/00-START-HERE.md`, `docs/01-PRD.md`, `docs/02-ADR.md`, `docs/03-ARCHITECTURE.md`, `docs/09-IMPLEMENTATION-PLAN.md`를 먼저 읽고 기존 확정 의사결정을 존중해.
2. 우선 **Phase 0만** 구현해. Bun 모노레포의 Astro 웹앱(React Islands + Tailwind CSS v4 + Headless UI), Hono API Worker, Drizzle/D1, R2, Cloudflare Workflows 바인딩, 공유 packages(ui/db/schemas/ai)의 최소 기반을 실제로 스캐폴딩해.
3. 현재 공식 문서에서 호환 가능한 의존성 버전과 Cloudflare/Workflows 설정을 확인하고 적용해. 하드코딩된 비밀키나 유료 API 호출은 만들지 마.
4. 첫 결과물은 실행 가능한 랜딩, `/studio` 기본 화면, `GET /health`, mock AI adapter, 환경변수 예시, 개발 및 테스트 명령이어야 해.
5. Tailwind + Headless UI 기반의 자체 디자인 시스템을 구현하고, 브라우저 기본 스타일에 기대지 않는 세련된 화면으로 구성해. 접근성을 해치지 말아야 해.
6. 반드시 설치/타입체크/테스트/빌드까지 실행하고, 성공·실패한 명령을 요약해. 실행 환경 제약이 있으면 정확히 알려줘.
7. 완료하면 `docs/09-IMPLEMENTATION-PLAN.md`의 Phase 0 체크리스트를 업데이트하고, Phase 1에서 필요한 실제 Cloudflare 계정/도메인/secret 설정만 구체적으로 안내해.

**중요:** 이 턴에 Phase 1 이후 전체 기능을 덤으로 만들지 말고, 유지보수 가능한 Phase 0 스캐폴딩부터 완성해.

---

## 다음 요청 예시 (Phase 0 완료 후)

"`docs/09-IMPLEMENTATION-PLAN.md`의 Phase 1을 구현해. 현재 앱/DB 스키마와 문서 계약을 따르고 OAuth PKCE S256, 서버 키 암호화, 초대 코드, 세션/로그아웃, 보안 테스트까지 완료해. 실제 외부 API Key를 채팅이나 코드에 적지 마."
