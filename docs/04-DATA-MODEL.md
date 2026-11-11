# D1 / Drizzle 데이터 모델 — ADR-022

현재 schema는 packages/db/src/schema.ts가 기준이다. 내부 ID는 UUID, 시간은 UTC epoch milliseconds이며 모든 읽기/쓰기는 owner 조건을 갖는다. 프로젝트 계층과 project_id는 제거했다.

| Table | 현재 역할 | 핵심 제약 |
|---|---|---|
| users | OpenRouter stable identity / test flag / 계정 상태 | stable identity unique, active/deleting |
| provider_connections | 사용자별 암호화 key envelope | key 평문/브라우저 노출 없음 |
| sessions / oauth_flows | opaque session hash / 단일 사용 PKCE | TTL, browser binding, CSRF |
| rate_limits / auth_events | 제한·고정 오류 진단 | raw prompt/key/identifier 없는 진단 |
| products | user_id, name, status, analysis_json/version, created_at | user FK, owner/created index, project FK 없음 |
| assets | user_id, product_id, job_id, kind, private R2 key, 크기/치수/시각 | product/user FK, key unique |
| brand_presets | owner별 무드·모델·장소 JSON | owner scope |
| shoot_plans | product/user, version, status, spec_json, source_ids_json, look_reference_id | owner/product index, 승인 snapshot과 분리 |
| generation_jobs | owner/product, kind/status/stage, request_json/hash, idempotency_key | unique user+idempotency |
| generation_attempts | model/stage/status/prompt version/usage/nullable cost | unique job+stage |
| quality_evaluations / asset_feedback | 과거 형식의 보존/내보내기 호환 | ADR-019 이후 신규 평가·피드백 없음 |
| storage_cleanup / media_purges | 실패 삭제/늦은 저장 정리 | private owner/product prefix로 제한 |

초대 관련 과거 테이블은 신규 사용하지 않는다. projects는 ADR-022 migration에서 삭제하며 숨은 default project를 만들지 않는다.

## 사진/기획의 의미

- input: 의류 정면/후면/디테일 최대 3장. 정상화 후 asset.created_at을 단조 증가시키고 created_at/id 순서로 첫 사진을 유지한다. 분석 sourceSnapshot에는 input만 포함한다.
- person_reference / look_reference: 상품별 용도당 1장. 조건부 INSERT로 동시 중복/작업 중 변경을 막는다. 실제 decode/서명/용량 검사와 private R2 정책을 공유한다. 업로드 자체는 AI 호출이 아니다.
- 기획은 선택한 lookReferenceId/referenceConsent를 job request에 고정한다. 기존 planning 호출이 사진의 조명/톤/무드/구도를 관찰해 referenceNotes를 반환한다. 관찰은 추정이며 사용자 수정과 상품 보존이 우선이다.
- shoot_plans.look_reference_id는 계획에 사용한 사진을 추적한다. 참조 원본이 삭제돼도 역사적 ID는 남을 수 있으나 현재 asset 검증/새 동의 없이 생성 입력으로 사용하지 않는다.
- 생성 snapshot은 의류 IDs/승인 분석/기획, 선택한 person/look IDs·동의, 이전 컷·개선 항목/지시, captureVersion을 고정한다. 결과 DTO의 참조 사용 여부는 품질 합격 지표가 아니다.

## 비용/삭제

actual_cost_usd는 제공자가 반환한 값만 기록하고 없으면 NULL이다. 추정은 estimated_cost_usd로 분리한다. 합계는 확인된 부분합과 미확인 호출 수를 함께 표시한다. 원문 사진·지시·키·식별자를 console/CI에 기록하지 않는다.

상품 삭제는 원본·모든 참조·결과와 종속 기획/작업을 삭제한다. 계정 삭제는 연결/세션도 정리한다. 참조 원본만 삭제하면 기존 생성 결과는 남는다고 UI에 안내한다. 실패한 R2 삭제와 late write는 queue/tombstone으로 재정리한다.

## 사용자 승인 초기화

0009 migration은 기존 studio 데이터/프리셋을 비우고 프로젝트 계층을 제거한다. migration 자체는 인증 자료를 보존한다. 별도 운영 초기화는 이번 사용자 요청에 따라 계정/연결/세션을 포함한 앱 DB와 private R2 데이터까지 제거하는 범위다. 실행 중 작업 취소·미디어 정리·잔여 검증 후 적용하며 Cloudflare 바인딩/도메인/master secret은 유지한다. 완료 여부는 09-IMPLEMENTATION-PLAN.md의 실행 기록으로 판단한다. 일반 배포마다 데이터를 초기화하는 정책은 아니다.
