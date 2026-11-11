# Hono API Contract — Draft v1

Base path: `/api/v1` (auth callback routes are `/auth/*`). JSON envelope: `{ data, error?: { code, message }, meta? }` with standard HTTP status. Response types shared via Zod; never include encrypted credentials.

| Method | Path | 목적 | 권한 |
|---|---|---|---|
| GET | `/health` | ready/liveness | public |
| GET | `/auth/openrouter/start` | PKCE/state/browser binding 생성 후 OpenRouter로 303 redirect; 활성 세션은 studio로 이동, `reconnect=1`은 재연결 | public, rate limit |
| POST | `/auth/openrouter/start` | 기존 API 호환용 authorize URL JSON, 초대 값은 사용하지 않음 | explicit Origin, rate limit |
| GET | `/auth/openrouter/callback` | code+state 교환 후 내부 세션 쿠키 발급 | OAuth callback |
| POST | `/auth/logout` | 세션 종료 | session |
| GET | `/api/v1/me` | 사용자/연결 상태 | session |
| POST | `/api/v1/projects` | 프로젝트 생성 | session |
| GET | `/api/v1/projects` | 내 프로젝트 목록 | session |
| GET | `/api/v1/projects/:id` | 프로젝트+상품 조회 | owner |
| DELETE | `/api/v1/projects/:id` | 프로젝트/파일 삭제 작업 | owner |
| POST | `/api/v1/projects/:id/products` | 의류 파일 업로드 (multipart) | owner |
| GET | `/api/v1/products/:id` | 상품/분석 상태 | owner |
| POST | `/api/v1/products/:id/plan` | 상품 분석 + 콘셉트 추천 작업 시작 | owner |
| PATCH | `/api/v1/shoot-plans/:id` | 사람이 촬영 계획 수정 | owner |
| POST | `/api/v1/shoot-plans/:id/generations` | **비용 확인 후** 1장 생성 작업 시작 | owner |
| GET | `/api/v1/jobs/:id` | 작업 상태/단계/결과 요약 | owner |
| GET | `/api/v1/products/:id/assets` | 생성/원본 목록 | owner |
| GET | `/api/v1/assets/:id/content` | private R2 이미지 보기 | owner |
| GET | `/api/v1/assets/:id/download` | 파일 다운로드 | owner |
| POST | `/api/v1/assets/:id/feedback` | accept/reject + reason | owner |
| GET | `/api/v1/presets` | 내 브랜드 프리셋 | session |
| POST | `/api/v1/presets` | 프리셋 생성 | session |
| PATCH | `/api/v1/presets/:id` | 프리셋 수정 | owner |
| DELETE | `/api/v1/presets/:id` | 프리셋 삭제 | owner |
| GET | `/api/v1/usage/summary` | 비용/생성/채택 요약 | session |

## 요청 예시 (스키마 계약 개념, 실행 코드 아님)

### `POST /api/v1/products/:id/plan`

실제 요청은 `{ consent: true, idempotencyKey: UUID, presetId: UUID | null, description: string, reuseAnalysis?: boolean }`이다. `reuseAnalysis` 기본값은 false(상품 분석+기획 각 1회). true는 저장된 본인 상품 분석을 snapshot으로 고정해 기획 1회만 새로 요청한다. 분석이 없으면 409, 동의가 없으면 400이며 Origin/CSRF/owner/rate limit/idempotency 검사를 유지한다. 비용 동의가 필요한 새 작업이며 이전 유료 요청을 자동 재시도하지 않는다.

### `POST /api/v1/shoot-plans/:id/generations`

```json
{
  "quality": "medium",
  "aspectRatio": "3:4",
  "count": 1,
  "consentToProviderCharges": true,
  "idempotencyKey": "uuid-per-user-action"
}
```

- `count` MVP는 `1`만 허용.
- 비용/크레딧 안내는 확정 견적이 아니라 제공자 과금 방식에 따라 다를 수 있는 추정치로 UI 표시.
- 동일 `idempotencyKey`와 user ID 조합 재요청은 기존 job을 반환.
- `202 Accepted` + `data: { jobId, status }`.

### `GET /api/v1/jobs/:id`

```json
{
  "data": {
    "id": "job_...",
    "type": "generate",
    "status": "needs_review",
    "stage": "evaluation_completed",
    "assetIds": ["asset_..."],
    "error": null
  }
}
```

### `POST /api/v1/assets/:id/feedback`

```json
{ "decision": "reject", "reason": "logo_distortion", "notes": "가슴 프린트 왜곡" }
```

Allowed reasons: `color_mismatch`, `logo_distortion`, `pattern_distortion`, `shape_mismatch`, `bad_fit`, `anatomy_issue`, `background_issue`, `other`.

## 에러 코드

- `UNAUTHENTICATED`, `INVITE_REQUIRED`, `OAUTH_STATE_INVALID`, `OAUTH_CONNECT_FAILED`
- `FORBIDDEN`, `NOT_FOUND`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `VALIDATION_ERROR`
- `INSUFFICIENT_PROVIDER_CREDIT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`
- `GENERATION_OUTCOME_UNKNOWN`, `GENERATION_FAILED`, `JOB_CONFLICT`

## 안전·성능

- 모든 owner endpoint에 `user_id` 조건 포함(404 응답으로 타인 리소스 열람 차단).
- 업로드는 MIME뿐 아니라 magic bytes 확인, 파일·이미지 디코딩 비용 제한.
- GET image는 권한 검사/`Cache-Control: private, no-store`와 적절한 다운로드 헤더 적용.
- 세션 쿠키 기반 write route는 Origin/CSRF 검증.
- 앱/CORS는 credential 포함 요청 시 특정 origin만 허용.
