# Hono API Contract — v1 (ADR-019 반영)

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
| POST | `/api/v1/products/:id/generate` | **비용 확인 후** 승인된 기획으로 1장 생성/컷 개선 | owner |
| GET | `/api/v1/jobs/:id` | 작업 상태/단계/결과 요약 | owner |
| GET | `/api/v1/products/:id/results` | 결과/원본 연결·이전 컷·개선 지시·촬영 버전 (점수 없음) | owner |
| GET | `/api/v1/assets/:id/content` | private R2 이미지 보기 | owner |
| GET | `/api/v1/assets/:id/download` | 파일 다운로드 | owner |
| POST | `/api/v1/assets/:id/feedback` | 종료된 기능: owner 검사 후 410, 쓰기 없음 | owner |
| GET | `/api/v1/presets` | 내 브랜드 프리셋 | session |
| POST | `/api/v1/presets` | 프리셋 생성 | session |
| PATCH | `/api/v1/presets/:id` | 프리셋 수정 | owner |
| DELETE | `/api/v1/presets/:id` | 프리셋 삭제 | owner |
| GET | `/api/v1/usage/summary` | 비용/생성/재생성/지연 요약 (점수·채택률 없음) | session |

## 요청 예시 (스키마 계약 개념, 실행 코드 아님)

### `POST /api/v1/products/:id/plan`

실제 요청은 `{ consent: true, idempotencyKey: UUID, presetId: UUID | null, description: string, reuseAnalysis?: boolean }`이다. `reuseAnalysis` 기본값은 false(상품 분석+기획 각 1회). true는 저장된 본인 상품 분석을 snapshot으로 고정해 기획 1회만 새로 요청한다. 분석이 없으면 409, 동의가 없으면 400이며 Origin/CSRF/owner/rate limit/idempotency 검사를 유지한다. 비용 동의가 필요한 새 작업이며 이전 유료 요청을 자동 재시도하지 않는다.

### `POST /api/v1/products/:id/generate`

```json
{
  "quality": "medium",
  "planId": "approved-plan-uuid",
  "count": 1,
  "consent": true,
  "idempotencyKey": "uuid-per-user-action",
  "regenerationOf": null,
  "regenerationReason": null,
  "adjustments": ""
}
```

- `count` MVP는 `1`만 허용.
- 비용/크레딧 안내는 확정 견적이 아니라 제공자 과금 방식에 따라 다를 수 있는 추정치로 UI 표시.
- 동일 `idempotencyKey`와 user ID 조합 재요청은 기존 job을 반환.
- `regenerationOf`/`regenerationReason`은 함께 제공한다. `adjustments`는 선택적 최대 1000자 지시이며 원본 의류 불변 조건 안에서 적용한다. 이전 컷은 같은 owner/상품의 generated asset이어야 한다.
- `202 Accepted` + `data: JobDto`. 비율은 승인된 기획의 3:4, 호출은 1장 생성만 하며 AI 평가를 호출하지 않는다.
- 기획/프리셋의 `model.appearance`/`modelAppearance`, `camera.backgroundSeparation`/`backgroundSeparation` (`gentle|balanced|separated`), `materialDirection`을 지원한다. 과거 `shootType`은 읽기 호환이며 새 provider 입력에는 사용하지 않는다.
- ADR-020: 새/누락된 배경 분리는 gentle이며 명시적 기존 값은 유지한다. 승인 시점의 상품 분석은 서버가 generation snapshot에 고정한다. 이전 컷은 인물 특징 참조로 사용하며 피부 보정·crop·노출·blur를 그대로 유지하지 않는다. 상품 가시성과 요청된 교정을 위해 구도가 바뀔 수 있다.

### `GET /api/v1/jobs/:id`

```json
{
  "data": {
    "id": "job_...",
    "kind": "generate",
    "status": "needs_review",
    "stage": "review",
    "errorCode": null,
    "attempts": []
  }
}
```

### `POST /api/v1/assets/:id/feedback`

ADR-019로 종료했다. 인증·owner 검사 후 HTTP 410 `FEATURE_RETIRED`, 타인 자원은 404. 과거 기록은 계정 JSON export에서 유지한다. 새 생성 결과 DTO에는 quality/feedback이 없다.

컷 개선의 `regenerationReason`: `lighting_focus`, `human_naturalness`, `material_rendering`, `color_change`, `logo_distortion`, `pattern_change`, `silhouette_change`, `missing_detail`, `unrealistic`, `composition`, `other`.

## 에러 코드

- `UNAUTHENTICATED`, `INVITE_REQUIRED`, `OAUTH_STATE_INVALID`, `OAUTH_CONNECT_FAILED`
- `FORBIDDEN`, `NOT_FOUND`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `VALIDATION_ERROR`
- `INSUFFICIENT_PROVIDER_CREDIT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`
- `GENERATION_OUTCOME_UNKNOWN`, `GENERATION_FAILED`, `JOB_CONFLICT`, `SOURCE_TOO_LARGE`, `FEATURE_RETIRED`

## 안전·성능

- 모든 owner endpoint에 `user_id` 조건 포함(404 응답으로 타인 리소스 열람 차단).
- 업로드는 MIME뿐 아니라 magic bytes 확인, 파일·이미지 디코딩 비용 제한.
- GET image는 권한 검사/`Cache-Control: private, no-store`와 적절한 다운로드 헤더 적용.
- 세션 쿠키 기반 write route는 Origin/CSRF 검증.
- 앱/CORS는 credential 포함 요청 시 특정 origin만 허용.
