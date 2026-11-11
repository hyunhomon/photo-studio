# 시스템 아키텍처

## 논리 구성

```text
Browser
  Astro pages + React Studio Islands (Tailwind / Headless UI)
  ├─ OAuth start redirect → OpenRouter auth UI
  └─ API requests (credentials included)
        ↓
Hono API Worker [Cloudflare]
  ├─ direct OAuth / callback / session / authz
  ├─ project/product/shoot plan REST routes
  ├─ R2 upload/download broker
  ├─ D1 via Drizzle
  ├─ AES-GCM encrypted user key store
  └─ Cloudflare Workflow binding
       ├─ Product Analyzer (OpenRouter, multimodal)
       ├─ Shoot Planner (OpenRouter, structured JSON)
       ├─ Image Generator (OpenRouter Images API)
       └─ Quality Evaluator (OpenRouter, multimodal)
           ↓
      D1 job/attempt/eval & R2 results
```

## 배포 (제안)

- `apps/web`: Cloudflare Workers에 Astro 배포, SEO 랜딩 + CSR/Islands studio.
- `apps/api`: 독립 Hono Worker, `/auth/*`, `/api/v1/*`, Workflow entrypoint.
- 실제 도메인은 미정. 예: `studio.<domain>`, `api.<domain>` (예시일 뿐 현재 도메인 아님).
- 공개 API 도메인은 동일 사이트의 서브도메인으로 설정하거나 web Worker proxy로 same-origin화 가능.
- CORS 허용 origin 명시, 쿠키 `credentials: include`, CSRF 방어 및 local dev 검증.

## 리소스 바인딩 이름 제안

| 구분 | Binding | 비고 |
|---|---|---|
| D1 | `DB` | Drizzle |
| R2 | `ASSETS` | private image bucket |
| Workflow | `STUDIO_WORKFLOW` | workflow name / class configured in API Worker |
| AES secret | `APP_ENCRYPTION_KEY_B64` | Worker secret, per environment |

## Workflow 경계

- `PlanProduct` 작업: 업로드 검증 완료 → **사용자가 분석 시작 및 OpenRouter 비용 안내 승인** → 상품 분석 → 기획 JSON → 저장 → 사용자 확인 대기.
- `GenerateShot` 작업: 사용자 비용 승인 → OpenRouter Images API → R2 저장 → AI 품질 평가 → 사용자 채택 대기.
- 두 작업 사이에는 반드시 UI에서 명시적 확인이 있어야 한다.
- 작업 상태: `queued | running | needs_review | completed | failed | outcome_unknown | cancelled`.
- paid external call 시작 전 attempt row를 `started`로 쓰고, 성공 응답/결과 asset 저장 뒤 `succeeded` 확정.
- 결과 불명확 시 `outcome_unknown`으로 두고 **자동 과금 재호출 금지**. 회수 가능할 때만 제공자 request ID로 결과 조회.
- 데이터 저장 및 R2 업로드는 멱등화한다. 특정 단계 재시도 가능 여부는 docs 확인/테스트.

## API 응답과 프론트 상태

- 클라이언트는 job ID를 수신하고 GET status를 폴링 (MVP는 SSE/WebSocket 불필요).
- 폴링은 화면 비가시/종료 시 간격 완화.
- 응답에는 상태·진행 단계·에러 요약만 담고 내부 API Key 및 raw error 응답은 담지 않는다.
- 결과 이미지 API는 세션 검사 후 private R2를 프록시/단기 서명으로 제공.

## 개발 환경

- Bun workspaces; `apps/web` Astro, `apps/api` Hono, `packages/*` 공유 패키지.
- 로컬 D1/R2/workflow 테스트는 Wrangler의 local bindings 및 fake adapters 우선.
- OAuth callback은 `localhost` 개발 URL을 사용하도록 명확히 환경 분리.
- 실제 OpenRouter 테스트는 별도 테스트 계정과 소액 크레딧으로 명시적 실행.
