# 보안·개인정보·측정 설계

## OAuth & 세션

- `/auth/openrouter/start`: 서버에서 PKCE verifier + random state + 브라우저 바인딩 생성.
- authorize URL은 `https://openrouter.ai/auth`에서 문서화된 `callback_url`, `code_challenge`, `code_challenge_method=S256` 사용.
- `/auth/openrouter/callback`: state, TTL, 브라우저 매칭을 확인하고 서버에서 `POST /api/v1/auth/keys`로 code 교환.
- `{ key, user_id }`의 `user_id`가 없으면 계정 자동 매핑하지 않음.
- Key는 WebCrypto AES-256-GCM으로 암호화/버전 저장, 앱 API는 평문 키 절대 응답하지 않음.
- HttpOnly/Secure/SameSite 쿠키로 자체 session 발급. `sessions.token_hash`만 D1 저장.
- 세션 종료/연결 해제 시 서버 키 사용 중지, 가능한 제공자 폐기 기능 검증 및 안내.
- 브라우저 `localStorage`/URL query에 user API Key 영구 저장 금지.

## 직접 OAuth와 권한

- 초대 코드는 ADR-016으로 종료했다. 직접 OAuth start의 Origin/browser binding/rate limit을 유지한다.
- 모든 D1 row와 R2 image는 현재 인증 주체에 매핑 후 접근; 누락된 auth 필터가 없는지 테스트.
- 수정 API는 Origin/CSRF 확인; rate-limit과 request size 제한.
- CORS는 웹 호스트 정확한 origin allowlist만 허용. credentials 요청에서 와일드카드 금지.

## 업로드 / 이미지

ADR-021의 인물/촬영감 참조도 같은 private R2/signature/decode/크기/owner/CSRF 정책을 적용한다. 상품별/용도별 1장, 작업 중 변경 차단을 원자적 SQL로 검사한다. 생성 요청은 selected ID의 owner/상품/용도를 확인하고 `referenceConsent` 없이는 과금 전에 거부한다. 임의 외부 이미지 URL은 받지 않는다. 의류 분석에는 참조 인물/촬영감 사진을 포함하지 않으며 업로드로 AI를 호출하지 않는다. job snapshot에는 선택/동의와 버전만 비공개 추적하고 사진·지시·식별자를 로그에 넣지 않는다. 원본 참조 삭제 후 생성된 이미지가 자동 삭제되는 것으로 안내하지 않는다.

- 원본과 생성 이미지를 공개 R2 URL로 보관하지 말 것.
- 파일 최대 10MB, JPEG/PNG/WebP, 최대 3장(제안 기본값).
- Content-Type 헤더만 믿지 않고 바이너리 서명 및 이미지 디코딩 결과 검증.
- 이미지 응답에 최소한의 메타데이터만 제공하고 외부 EXIF/위치정보 제거 검토.
- 사용자에게 권리 보유한 의류·모델 사진만 업로드하도록 안내; 타인 초상·브랜드 표시 악용 제한.

## 상품 중심 기획 참조 — ADR-022

프로젝트 테이블/권한 연결을 제거하고 products.user_id와 active user/product를 모든 원자적 저장·작업 선점·미디어 처리에 확인한다. GET 상품 목록은 owner별 요약과 첫 의류 썸네일만 반환하고 분석/참조/결과 전체 payload를 탐색에 포함하지 않는다. 업로드 multipart의 선택적 참조도 권리/성인 동의와 같은 비공개 파일 검증을 거친다.

기획 참조는 사용자 선택+referenceConsent를 job snapshot에 고정한다. 본인 상품의 look_reference만 허용하고 의류+선택 참조 12MB를 작업 생성 전 검사한다. 분석은 의류만, 기존 planning 호출은 선택한 촬영감 사진만 추가한다. 외부 처리 고지는 비용 동의 위치에 둔다. 인물/배경 복제나 웹 사진 자동 수집은 하지 않는다. 생성에는 별도 참조 확인/동의가 필요하며 기획 ID만으로 참조를 자동 전송하지 않는다.

## 생성 비용/품질 로깅

| 필드 | 목적 | 주의 |
|---|---|---|
| job_id/attempt_id | 작업 추적 | user 권한 연결 |
| stage/model/prompt_version | 재현성 | 프롬프트 원문 무분별 로그 금지 |
| duration_ms/status/error_type | 성능/오류 | 사용자에게 raw upstream response 노출 금지 |
| provider_request_id | 비용·장애 조사 | 민감 request dump 지양 |
| cost_actual_usd | 실제 API 원가 | 제공자 응답 값이 있을 때만 |
| cost_estimated_usd | 예상 비용 | 별도 표시, 확정 비용 아님 |
| capture_version | 촬영 프로토콜 재현 | 모델의 실제 물리 시뮬레이션 보장 아님 |
| regeneration_reason/adjustments | 개선 항목과 지시 | owner snapshot에 비공개 저장, console/CI에 원문 금지 |
| regeneration_of | 재시도 원가 | 중복/의도적 수정 구분 |

## 주요 KPI SQL 집계 개념

- ADR-019로 점수/채택률 수집을 종료했다. 과거 평가·피드백 및 비용은 보존/내보낸다. 신규 비용·생성/재생성·지연·미확인 응답을 집계한다.
- 생성당 원가는 실제 확인된 비용 부분합과 미확인 수를 함께 제시한다. 채택 1장당 원가는 별도 고객 인터뷰 자료가 있을 때만 계산한다.
- 일부 비용이 NULL이면 '부분 관측' 경고; 분모에 미관측 호출을 무시해 저비용으로 오해하지 말 것.
- 빛·초점/인물/소재 및 상품 오류 항목별 개선 빈도, 원본→이전 컷 연결을 확인한다. 품질 합격 판정으로 해석하지 않는다.

## 일회성 서비스 초기화의 예외

통상 삭제/보존 정책은 유지한다. 이번 ADR-022 사용자 요청은 기존 앱 DB(계정/세션/연결·과거 비용/품질 이력 포함)와 private R2 자료를 비우는 명시적 예외다. 실행 중 Workflow를 먼저 취소·차단하고 미디어/행 잔여를 확인한다. Cloudflare 리소스·바인딩·도메인·master encryption secret은 보존한다. 초기화 이후 OAuth 재연결이 필요하며 OpenRouter 측 계정·키·청구·크레딧을 변경하는 작업은 아니다. 실행 여부와 검증은 구현 계획에 따로 기록하며 일반 배포에 자동 초기화를 포함하지 않는다.

## 외부 모델 사용 고지

- 원본 상품 사진 및 생성 지시가 OpenRouter 및 모델 제공업체로 전달될 수 있음.
- 고객에게 외부 처리, 과금 주체, 결과 품질 한계, 삭제/보관 정책을 명확히 안내.
- 프롬프트·업로드 이미지·API Key와 기타 계정 정보의 기록/제3자 전송 범위를 최소화.

## 외부 API 에러 정책

- 잔액 부족, 토큰 폐기, rate limit, provider outage, timeout을 구분.
- timeout이 유료 호출 이후 발생하면 `outcome_unknown`으로 마킹, **자동 재요청 X**.
- 사용자 요청당 idempotencyKey를 두고 전송 중복 방지.
- 테스트에서는 stub으로 재시도/실패 시나리오 재현.
