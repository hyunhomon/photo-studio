# D1 / Drizzle 데이터 모델 초안

데이터베이스 생성 전 타입/관계/인덱스/삭제 정책을 확정하고 Drizzle migration으로 반영한다. ID는 내부 랜덤 UUID/ULID, 시간은 일관된 UTC 타임스탬프. 소유권은 모든 데이터 조회에 강제.

| Table | 주요 필드 | 핵심 제약 |
|---|---|---|
| `users` | id, openrouter_user_id, created_at, last_login_at | `openrouter_user_id` unique; null 거부/연결 실패 처리 |
| `provider_connections` | id, user_id, provider, external_user_id, key_ciphertext, iv, key_version, linked_at, revoked_at | user+provider unique, encrypted only |
| `sessions` | id, user_id, token_hash, expires_at, created_at | token_hash unique, expiry index |
| `oauth_flows` | id, state_hash, verifier_secret, browser_binding_hash, expires_at | single-use; TTL cleanup |
| `invite_codes` | id, code_hash, max_uses, used_count, expires_at, created_at | ADR-016 이후 사용하지 않는 과거 테이블; 기존 데이터 보존 |
| `invite_redemptions` | id, invite_id, user_id, redeemed_at | ADR-016 이후 신규 기록 없음; 기존 이력 보존 |
| `auth_events` | id, stage, code, http_status, created_at | 고정 오류 종류/단계만; 같은 분/종류 중복 합침, 7일 TTL, 식별자/키/원문 없음 |
| `projects` | id, user_id, name, description, created_at, updated_at | user index |
| `products` | id, project_id, name, category, analysis_json, analysis_version, created_at | project index; user through project |
| `assets` | id, user_id, product_id, job_id, kind, r2_key, mime_type, size_bytes, width, height, checksum, created_at | private R2 key; unique r2_key |
| `shoot_plans` | id, product_id, version, season, mood, model_spec_json, location_spec_json, prompt_spec_json, status | product index |
| `brand_presets` | id, user_id, name, model_spec_json, mood_spec_json, location_spec_json, updated_at | user index |
| `generation_jobs` | id, user_id, product_id, shoot_plan_id, job_type, status, workflow_instance_id, idempotency_key, stage, error_code, started_at, finished_at | unique user+idempotency_key |
| `generation_attempts` | id, job_id, stage, model, provider, provider_request_id, request_hash, status, started_at, finished_at, tokens_in, tokens_out, actual_cost_usd, estimated_cost_usd, cost_source, error_type | index(job_id,stage); cost_source enum |
| `evaluations` | id, asset_id, attempt_id, evaluation_model, scores_json, violations_json, summary, status, created_at | asset index |
| `asset_feedback` | id, asset_id, user_id, decision, reason_code, notes, created_at | one current decision per user+asset (or history rows, decide implementation) |

## JSON 스키마와 의미

ADR-019: `evaluations`와 `asset_feedback`는 과거 이력 보존/내보내기용이며 신규 쓰기를 종료했다. 새 결과 DTO/usage에 점수·채택률을 포함하지 않는다. 기획 JSON에 `model.appearance`, `camera.backgroundSeparation`, `materialDirection`을 추가하고 기존 행에는 기본값을 적용한다. `shootType`은 읽기 호환만 남긴다. job request snapshot에 `captureVersion`, `reviewMode=manual`, `adjustments`, `regenerationReason`, `regenerationOf`를 비공개 저장한다. additive/파괴적 schema migration은 필요하지 않다.

ADR-020: generation snapshot의 선택적 `analysisSnapshot`에 승인 시점 상품 분석/소재 추정/불확실성을 보관한다. 이후 상품 변경이 이미 요청된 촬영의 근거를 바꾸지 않게 하며 이전 분석이 없는 legacy snapshot도 지원한다. 새 배경 분리 기본은 gentle이고 이미 저장된 명시적 값은 변경하지 않는다.

- JSON은 `packages/schemas`의 Zod로 parse + validation. 구조 변경 시 `schema_version` 또는 version 필드.
- `analysis_json`: garment_type, colors, material_guess, pattern, silhouette, season_guess, preservation_points[], uncertainty[]; **시각적 추정과 실제 소재 정보는 구분**.
- `model_spec_json`: 성인 모델의 스타일, 포즈, 카메라 앵글 등의 비식별 설정. 실제 개인 신원 추정/보존 금지.
- `location_spec_json`: 장소 타입, 계절, 시간대, 조명, 분위기.
- `scores_json`: garment_fidelity, photorealism, composition + confidence; 검수는 **자동 판정 아님**.

## 비용 필드 규칙

- `actual_cost_usd`: API 응답의 실제 값을 받은 경우에만 기록. 없으면 NULL.
- `estimated_cost_usd`: 내부 단가 모델 사용 시 별도로 기록. 추정 여부 라벨 표시.
- `cost_source`: `provider_reported | estimated | unknown`.
- 전체 누적금액은 확정 비용과 추정 비용을 별도 합산해야 한다.

## 삭제 정책

- 프로젝트 삭제 요청 시 R2 오브젝트 삭제 → 종속 메타데이터 삭제 또는 비식별 통계만 남기는 방식 검토.
- 사용자의 OAuth 연결 해제는 발급된 API Key의 **서비스 측 사용 중단**을 보장하고, OpenRouter 측 폐기 안내/지원 기능을 검토한다.
- 세션/PKCE 임시 데이터는 만료 후 주기적 정리, 접근 로그에서 민감값 제거.

## 기본 인덱스

- users.openrouter_user_id(unique), sessions.token_hash(unique)
- projects.user_id, products.project_id, assets.product_id, assets.user_id
- generation_jobs.user_id/status, generation_attempts.job_id/stage
- evaluations.asset_id, feedback.asset_id
