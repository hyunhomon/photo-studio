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

## 초대 코드와 권한

- 초대 코드 해시를 D1에 저장하며 사용 횟수/만료 검사 및 brute-force rate-limit.
- 모든 D1 row와 R2 image는 현재 인증 주체에 매핑 후 접근; 누락된 auth 필터가 없는지 테스트.
- 수정 API는 Origin/CSRF 확인; rate-limit과 request size 제한.
- CORS는 웹 호스트 정확한 origin allowlist만 허용. credentials 요청에서 와일드카드 금지.

## 업로드 / 이미지

- 원본과 생성 이미지를 공개 R2 URL로 보관하지 말 것.
- 파일 최대 10MB, JPEG/PNG/WebP, 최대 3장(제안 기본값).
- Content-Type 헤더만 믿지 않고 바이너리 서명 및 이미지 디코딩 결과 검증.
- 이미지 응답에 최소한의 메타데이터만 제공하고 외부 EXIF/위치정보 제거 검토.
- 사용자에게 권리 보유한 의류·모델 사진만 업로드하도록 안내; 타인 초상·브랜드 표시 악용 제한.

## 생성 비용/품질 로깅

| 필드 | 목적 | 주의 |
|---|---|---|
| job_id/attempt_id | 작업 추적 | user 권한 연결 |
| stage/model/prompt_version | 재현성 | 프롬프트 원문 무분별 로그 금지 |
| duration_ms/status/error_type | 성능/오류 | 사용자에게 raw upstream response 노출 금지 |
| provider_request_id | 비용·장애 조사 | 민감 request dump 지양 |
| cost_actual_usd | 실제 API 원가 | 제공자 응답 값이 있을 때만 |
| cost_estimated_usd | 예상 비용 | 별도 표시, 확정 비용 아님 |
| image_quality_scores | 자동 검수 | 모델 판단은 오류 가능 |
| decision/reject_reason | 채택률 개선 | 사용자 개별 피드백 |
| regeneration_of | 재시도 원가 | 중복/의도적 수정 구분 |

## 주요 KPI SQL 집계 개념

- `attempts / accepted assets` = 채택 1장당 시도 수.
- `SUM(actual_cost_usd) / COUNT(accepted assets)` = 비용 데이터가 완전할 때의 채택 1장당 측정 원가.
- 일부 비용이 NULL이면 '부분 관측' 경고; 분모에 미관측 호출을 무시해 저비용으로 오해하지 말 것.
- 로고 왜곡/색상 변형 등 사유별 빈도, 상품군별 평균 생성 시도, 최초 채택 시간.

## 외부 모델 사용 고지

- 원본 상품 사진 및 생성 지시가 OpenRouter 및 모델 제공업체로 전달될 수 있음.
- 고객에게 외부 처리, 과금 주체, 결과 품질 한계, 삭제/보관 정책을 명확히 안내.
- 프롬프트·업로드 이미지·API Key와 기타 계정 정보의 기록/제3자 전송 범위를 최소화.

## 외부 API 에러 정책

- 잔액 부족, 토큰 폐기, rate limit, provider outage, timeout을 구분.
- timeout이 유료 호출 이후 발생하면 `outcome_unknown`으로 마킹, **자동 재요청 X**.
- 사용자 요청당 idempotencyKey를 두고 전송 중복 방지.
- 테스트에서는 stub으로 재시도/실패 시나리오 재현.
