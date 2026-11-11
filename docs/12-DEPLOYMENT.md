# Cloudflare production 배포 및 복구

production 하나: https://photo-studio.cloby.co. 웹 Worker `photo-studio-web`의 Custom Domain에 API Worker `photo-studio-api`의 `/health*`, `/auth/*`, `/api/*` routes를 우선 연결한다. DB `photo-studio-production`, 비공개 R2 `photo-studio-production-assets`, Workflow `photo-studio-production`을 재사용한다. Pages/KV/Cloudflare Images, 별도 staging 및 workers.dev를 만들지 않는다.

## 배포

```powershell
bun install --frozen-lockfile
bun run deploy
bun run test:production
bun run test:production:e2e
```

`deploy`는 먼저 format/lint/typecheck/unit/build를 실행한다. 배포 스크립트는 Wrangler 로그인 membership와 cloby.co의 소유 계정을 확인하고 최초 pin과 비교한다. account/zone/DB ID는 `.wrangler/production/`의 ignored 설정에만 저장한다. OAuth 관리 token은 메모리에서만 사용한다. 다른 계정·DNS·Worker 소유 도메인과 충돌하면 중단한다.

기존 리소스와 private R2 설정을 확인한 뒤 additive D1 migrations를 적용한다. 최초에만 32-byte AES-GCM secret을 만들고 API Worker에 stdin으로 설정한다. 기존 secret을 덮어쓰지 않는다. ADR-016에 따라 초대 bootstrap 및 초대 검증을 제거했다. 기존 초대 테이블/ignored 백업은 삭제하지 않지만 인증에 사용하지 않는다.

production용 Astro를 다시 빌드해 공개 API URL을 같은 origin으로 지정하고 웹/API/Workflow를 게시한다. D1 읽기 probe와 Workflow/R2 설정, public health를 확인한다. DNS/TLS 반영이 늦다고 리소스를 다시 생성하거나 다른 DNS를 삭제하지 않는다.

## 환경 설정

UI만 변경할 때는 기존 production 설정을 준비한 머신에서 `bun run deploy:web`을 사용한다. 검사를 거쳐 웹 Worker만 빌드·게시하며 API 배포, D1 migration, secret 및 진행 중 Workflow는 변경하지 않는다. 새 머신이나 인프라 변경은 전체 `deploy` 절차를 먼저 따른다.

| 설정 | production |
|---|---|
| APP_ENV | production |
| ENABLE_DEMO | false (production에서는 true여도 HTTP 우회 로그인 거부) |
| AI_MODE | openrouter; 내부 합성 테스트 계정은 Mock adapter만 사용 |
| ALLOWED_WEB_ORIGINS | https://photo-studio.cloby.co |
| OPENROUTER_CALLBACK_URL | https://photo-studio.cloby.co/auth/openrouter/callback |
| OPENROUTER_BASE_URL | https://openrouter.ai/api/v1 |
| OPENROUTER_IMAGE_MODEL | openai/gpt-image-2 |
| OPENROUTER_ANALYSIS_MODEL | google/gemini-2.5-flash-lite |
| OPENROUTER_EVALUATION_MODEL | google/gemini-2.5-flash |
| APP_ENCRYPTION_KEY_B64 | Worker secret, 32 random bytes base64 |
| APP_ENCRYPTION_KEY_VERSION | v1; 회전 시 새 버전 |

공용 OpenRouter 추론 키는 없다. 실제 사용자가 OAuth로 연결하고 자신의 크레딧으로 비용을 부담한다. 모델 catalog는 비용 없이 현재 capabilities를 확인하며, 유료 요청은 사용자에게 모델·단계·횟수와 비용 미확정 사실을 안내한 뒤 실행한다.

`.wrangler/production/encryption-key.json`은 복호화에 필요한 비밀이다. 배포 머신 외 별도의 안전한 보관소에 백업하고 git/채팅에 넣지 않는다. 이 파일이 없고 Worker secret만 존재하는 다른 머신에서는 배포 시 secret을 재생성하지 않는다. DB만 복구하고 암호화 키를 잃으면 기존 OpenRouter 키를 사용할 수 없어 재연결이 필요하다.

키 회전 시 기존 키를 `APP_ENCRYPTION_KEY_PREVIOUS_B64`와 이전 버전에 보관하고 새 키/version을 함께 적용한다. 앱은 두 버전의 복호화를 지원하며 새 OAuth 연결은 현재 버전으로 암호화한다. 기존 envelope를 전부 재암호화하거나 재연결하기 전에는 이전 키를 제거하지 않는다. 실제 production 키 회전·복구 리허설은 미실행이다.

## 확인 범위

`test:production`은 public HTTPS·정확한 CORS·로그인 전 API 401·HTTP Mock 우회 404·초대 없는 직접 OAuth·오류 복구 UI·자체 호스팅 글꼴·반응형 레이아웃을 확인한다.

`test:production:e2e`는 관리자 D1 권한으로 두 개의 임시 is_test 합성 계정과 별도 해시 세션을 준비한다. 일반 production 인증을 우회하는 HTTP API는 추가하지 않는다. 실제 private R2 업로드·durable Workflow의 Mock 분석/기획·수정·승인·생성/평가·채택·폐기·재생성·다운로드·집계·내보내기·삭제를 desktop/mobile에서 검증한다. 사용자 B의 A 상품/사진 접근 404도 확인한다. 마지막에 합성 계정과 사진을 삭제한다. OAuth start의 S256·callback origin·Secure/HttpOnly cookie와 browser-binding 거부는 확인하되 실제 외부 계정 로그인/키 교환 성공을 주장하지 않는다.

검사에는 Cloudflare D1/R2/Workflow 인프라 사용량이 발생한다. 유료 AI는 호출하지 않는다. 기존 존의 Cloudflare Analytics beacon GET 및 `/cdn-cgi/rum` POST만 외부 브라우저 네트워크 예외로 허용한다. 존 설정은 변경하지 않는다. 캡처와 trace는 ignored `.tmp/`, `test-results/`에만 보관한다.

## 데이터와 운영 복구

- 모든 사용자 자료 쿼리는 내부 owner ID로 제한한다. private R2는 API 인증을 거쳐서만 읽는다. 연결 키·사진·프롬프트·OAuth code·개인 식별자를 console/CI 로그에 넣지 않는다. Worker observability/access logging은 비활성화한다.
- 입력은 실제 디코딩/PNG 재인코딩, 크기·서명·픽셀 제한을 적용한다. 분석 후 원본은 고정된다. 출력도 검증 후 private PNG로 저장한다.
- 과금 원장은 unique(job,stage)이다. Workflow paid step retries=0. 응답 미확인/5xx/저장 실패는 자동 재호출하지 않는다. 운영자가 ledger를 지워서 재실행해서는 안 된다.
- ADR-019 이후 새 AI 평가/점수/피드백 호출은 없다. 생성 결과는 직접 원본과 비교/다운로드하며, 새 생성이나 지시 기반 개선은 다시 비용 동의를 받아 새 요청으로 기록한다.
- 10분 넘게 active인 작업은 조회 시 Workflow terminal 상태와 대조한다. 선점된 응답이 없으면 outcome_unknown으로 끝낸다. 제어 API 장애를 이유로 AI를 다시 호출하지 않는다. queued dispatch 재확인은 같은 instance ID만 사용한다.
- 삭제는 상품/계정을 deleting으로 먼저 바꾸고 작업을 취소한 뒤 R2와 DB를 정리한다. 실패하면 재시도할 수 있고 접근·새 작업은 차단한다. 계정 삭제 중 세션이 만료되어도 cron이 사진 정리 성공 후 계정·키·관계 데이터를 마무리 삭제한다. 시간별 cron은 만료 세션/flow/제한 기록, object tombstone 및 계정 삭제 중 늦은 쓰기를 정리한다. 삭제된 저장소 prefix의 tombstone은 최소 24시간 유지한다. 최소 보관 기간 후에도 정리 완료 및 다음 cron 시점까지 식별자가 남을 수 있다.
- 계정 설정에서 기록 JSON을 내보낼 수 있다. 사진은 각 상품에서 별도로 다운로드한다. 연결 해제는 키/세션만 삭제하고 상품은 유지한다. OpenRouter 키 자체의 폐기와 외부 제공자의 보관 기록은 제공자 정책을 따른다.

## 마이그레이션 및 롤백

Drizzle 변경은 `bun run --filter @photo-studio/db generate`로 SQL/snapshot을 함께 생성한다. 먼저 로컬 migration·권한·실패 복구 테스트를 통과시킨 뒤 production에 적용한다. ADR-022의 0009는 사용자 승인 초기화와 프로젝트 제거를 수행하는 파괴적 예외다. `docs/15-DATA-RESET.md`의 전체 서비스 초기화/R2 정리를 먼저 실행하고 새 web/API/Workflow를 함께 배포한다. 과거 데이터 복구본을 만드는 작업은 이번 삭제 요청에 포함하지 않는다. 이후 일반 배포에서 전체 초기화를 반복하지 않는다.

Worker 문제는 현재 DB와 호환되는 버전만 사용해 두 서비스를 일관되게 복구한다. 설치 CLI의 `rollback --help`로 실제 옵션을 확인한 뒤 ignored production config를 사용한다. Worker rollback은 DB/R2 또는 실행 중인 Workflow를 되돌리지 않는다. 0009 이후 프로젝트를 요구하는 이전 앱 버전으로 단순 rollback할 수 없으므로 상품 중심 구조에서 forward fix한다. 배포 전 버전과 migration 적용 이력을 확인하고 호환성을 먼저 판단한다.

급한 유료 호출 차단은 API의 `AI_MODE`를 openrouter가 아닌 값으로 바꾸어 새 실제 호출을 거부하는 방식으로 한다. 일반 사용자에게 Mock을 실제 결과처럼 제공하지 않는다. 이미 시작된 외부 호출의 취소/환불은 보장할 수 없다. 복구 과정에서 ledger 삭제, uncertain paid step restart, bucket/DB 재생성은 하지 않는다.

## 공식 근거

- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#interaction-with-routes
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/
- https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- https://openrouter.ai/openapi.json
- https://openrouter.ai/docs/guides/features/structured-outputs
