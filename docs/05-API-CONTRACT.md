# Hono API Contract — v1 (ADR-022 상품 중심)

Base path: `/api/v1` (auth callback routes are `/auth/*`). JSON envelope: `{ data, error?: { code, message }, meta? }` with standard HTTP status. Response types shared via Zod; never include encrypted credentials.

| Method | Path | 목적 | 권한 |
|---|---|---|---|
| GET | `/health` | ready/liveness | public |
| GET | `/auth/openrouter/start` | PKCE/state/browser binding 생성 후 OpenRouter로 303 redirect; 활성 세션은 studio로 이동, `reconnect=1`은 재연결 | public, rate limit |
| POST | `/auth/openrouter/start` | 기존 API 호환용 authorize URL JSON, 초대 값은 사용하지 않음 | explicit Origin, rate limit |
| GET | `/auth/openrouter/callback` | code+state 교환 후 내부 세션 쿠키 발급 | OAuth callback |
| POST | `/auth/logout` | 세션 종료 | session |
| GET | `/api/v1/me` | 사용자/연결 상태 | session |
| GET | `/api/v1/products` | 내 상품 요약 목록/첫 의류 썸네일 | session |
| POST | `/api/v1/products` | 상품 직접 등록: 의류 1–3장/선택적 참조 multipart | session, Origin/CSRF |
| PATCH | `/api/v1/products/:id` | 상품 이름 수정 | owner |
| DELETE | `/api/v1/products/:id` | 상품/모든 미디어·기획·작업 삭제 | owner |
| GET | `/api/v1/products/:id` | 상품/분석 상태 | owner |
| POST | `/api/v1/products/:id/assets` | 첫 AI 작업 전 의류 원본 추가, 총 3장 | owner, Origin/CSRF |
| DELETE | `/api/v1/assets/:id` | 원본/참조/결과 삭제; 입력 불변/진행 중 제약 적용 | owner, Origin/CSRF |
| GET | `/api/v1/products/:id/pipeline` | 기획 목록과 실제 작업/호출 상태 | owner |
| POST | `/api/v1/products/:id/plan` | 상품 분석 + 콘셉트 추천 작업 시작 | owner |
| PATCH | `/api/v1/products/:id/analysis` | 상품 이해 수정; 콘셉트 재승인 필요 | owner, Origin/CSRF |
| POST | `/api/v1/products/:id/references` | 인물/촬영감 참조 1장 저장, AI 미실행 | owner, Origin/CSRF |
| PATCH | `/api/v1/plans/:id` | 사람이 촬영 계획 수정 | owner |
| POST | `/api/v1/products/:id/generate` | **비용 확인 후** 승인된 기획으로 1장 생성/컷 개선 | owner |
| GET | `/api/v1/jobs/:id` | 작업 상태/단계/결과 요약 | owner |
| POST | `/api/v1/jobs/:id/dispatch` | 기존 동일 작업 전달 상태 재확인, 새 유료 요청 생성 없음 | owner, Origin/CSRF |
| GET | `/api/v1/products/:id/results` | 결과/원본 연결·이전 컷·개선 지시·촬영 버전 (점수 없음) | owner |
| GET | `/api/v1/assets/:id/content` | private R2 이미지 보기 | owner |
| GET | `/api/v1/assets/:id/download` | 파일 다운로드 | owner |
| POST | `/api/v1/assets/:id/feedback` | 종료된 기능: owner 검사 후 410, 쓰기 없음 | owner |
| GET | `/api/v1/presets` | 내 브랜드 프리셋 | session |
| POST | `/api/v1/presets` | 프리셋 생성 | session |
| PATCH | `/api/v1/presets/:id` | 프리셋 수정 | owner |
| DELETE | `/api/v1/presets/:id` | 프리셋 삭제 | owner |
| GET | `/api/v1/usage` | 비용/생성/재생성/지연 요약 (점수·채택률 없음) | session |

## 상품 등록과 제거된 프로젝트 계약

`POST /products` multipart는 `name`, `images` 1–3장, 선택적 `lookImage`/`personImage` 각 1장을 받는다. 참조가 있으면 `rightsConfirmed="true"`가 필요하다. 유효성/정규화·저장 실패는 rollback 또는 정리 예약으로 처리하며 업로드는 AI를 호출하지 않는다. `ProductDto`에는 `projectId`가 없다. 의류 입력 순서는 생성 시각과 ID의 안정 순서이며 업로드 루프는 생성 시각을 단조 증가시켜 첫 사진을 보존한다. `/projects` 계열은 HTTP 410이며 숨은 프로젝트를 자동 생성하지 않는다.

`GET /products`의 원소는 `ProductSummaryDto { id, name, status, createdAt, thumbnail: AssetDto | null }`이다. 썸네일은 첫 input만 사용하며 전체 분석·참조·결과는 목록에 포함하지 않는다. 상세 GET/POST/PATCH 응답은 `ProductDto`이며 사진·참조와 분석을 포함한다.

## 요청 예시 (스키마 계약 개념, 실행 코드 아님)

### `POST /api/v1/products/:id/plan`

실제 요청은 `{ consent: true, idempotencyKey: UUID, presetId: UUID | null, description: string, reuseAnalysis?: boolean, lookReferenceId?: UUID | null, referenceConsent?: boolean }`이다. `reuseAnalysis` 기본값은 false(상품 분석+기획 각 1회). true는 저장된 본인 상품 분석을 snapshot으로 고정해 기획 1회만 새로 요청한다. 분석이 없으면 409, 동의가 없으면 400이며 Origin/CSRF/owner/rate limit/idempotency 검사를 유지한다. 비용 동의가 필요한 새 작업이며 이전 유료 요청을 자동 재시도하지 않는다.

ADR-022: 선택한 `lookReferenceId`는 현재 owner/상품의 look_reference여야 하며 `referenceConsent:true`가 없으면 거부한다. 의류+선택 참조 합계 12MB를 job 생성 전 검사한다. 분석은 의류만 보고, 기존 planning 호출 1회에 촬영감 사진을 추가해 조명·톤·무드·구도를 관찰한다. 별도 유료 참조 분석 단계는 없다. `PlanDto.lookReferenceId`와 `PlanDto.spec.referenceNotes`에 연결/관찰 요약을 반환한다. 관찰은 추정이며 생성 시에는 다시 확인·선택한 참조와 별도 동의가 필요하다. 서버가 기획의 연결 ID를 자동으로 생성 입력에 넣지 않는다.

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
- ADR-021: 선택적 `personReferenceId`, `lookReferenceId`는 기본 null. 선택 시 `referenceConsent:true`가 필요하다(없으면 400). ID는 현재 owner/상품/정확한 용도의 asset이어야 하며 위반은 404다. 순서는 의류→인물→촬영감→이전 컷, 총 12MB/최대 6장의 실제 수를 과금 전에 확인한다. 참조 수/크기에 따라 비용이 달라지며 이미지 호출은 여전히 1회다.

### `POST /api/v1/products/:id/references`

multipart `image`(JPEG/PNG/WebP 1장), `role`(`person_reference|look_reference`), `rightsConfirmed`(`"true"`)를 받는다. 사용 권한 및 인물 동의 확인을 요구한다. 기존 signature/decode/10MB·4MP·4096px 검사로 정규화하고 private R2에 저장한다. 용도별 상품당 1장/진행 중 작업 없음/owner 및 active user/product 조건을 원자적 INSERT에서 검사한다. 201 ProductDto, 중복/작업 경합 409. 업로드로 분석/생성을 호출하지 않는다. 삭제는 기존 `DELETE /api/v1/assets/:id`를 사용하며 진행 중에는 409다. 참조 원본 삭제 후 기존 생성 결과는 유지한다.

결과 DTO의 `personReferenceUsed`/`lookReferenceUsed`는 해당 생성 snapshot의 사용 여부이며 인물 보존/촬영감 합격 판정이 아니다.

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
- `GENERATION_OUTCOME_UNKNOWN`, `GENERATION_FAILED`, `JOB_CONFLICT`, `SOURCE_TOO_LARGE`, `FEATURE_RETIRED`, `REFERENCE_CONSENT_REQUIRED`, `REFERENCE_CONFLICT`

## 안전·성능

- 모든 owner endpoint에 `user_id` 조건 포함(404 응답으로 타인 리소스 열람 차단).
- 업로드는 MIME뿐 아니라 magic bytes 확인, 파일·이미지 디코딩 비용 제한.
- GET image는 권한 검사/`Cache-Control: private, no-store`와 적절한 다운로드 헤더 적용.
- 세션 쿠키 기반 write route는 Origin/CSRF 검증.
- 앱/CORS는 credential 포함 요청 시 특정 origin만 허용.
