# 보류 결정 및 리스크 레지스터

Codex는 다음 항목에 대해 개발 중 문서/실험으로 결론을 제시할 수 있다. 기존 Accepted ADR을 뒤집는 변경은 사용자 확인 후 확정한다.

| 항목 | 현재 상태 | 기본 가정 / 검증 방법 |
|---|---|---|
| 실제 도메인 | 확정 | `https://photo-studio.cloby.co`, production 한 환경만 사용 |
| 분석·검수 모델 | 미정 | OpenRouter 현재 저가 멀티모달 모델 후보 가격/비전/structured output 비교 후 결정; ID 설정 가능 |
| Cloudflare 비용 | 미측정 | D1/R2/Workflow 사용량 추정, 무료 구간 초과 비용 검증 |
| OAuth user_id null | 검증 필요 | 계정 매핑 거부·명시적 오류; 인증 혼동 방지 |
| API 경로 / 쿠키 도메인 | 경로/origin 확정, 세션 미구현 | 같은 hostname의 `/health*`, `/auth/*`, `/api/*`는 API Worker; cookie/CSRF는 Phase 1 검증 |
| 이미지 입력 3장/10MB | 제안 기본값 | Cloudflare 요청 제한·사용자 품질 실험으로 조정 |
| API 비용 표기 | 제공자 응답 가변 | `usage.cost` 유무 확인, null/estimated 분리 |
| Workflows 과금 중복 위험 | 중요 | step 재시도 정책과 OpenRouter 결과 조회/멱등성 확인, unknown 상태 처리 |
| 데이터 보관/삭제 고지 | 공개 전 확정 | 사용자 권리·해외 AI 제공자 전송·이미지 권리 정책 검토 |
| 실제 촬영비 1천만 원 | 고객 사례 가설 | 방문 인터뷰에서 고객 단위 촬영 예산, 잔여 인건비 확인 |

## 위험 우선순위

2026-11-11 구현 보완: 업로드는 10MB에 더해 400만 픽셀/긴 변 4096px으로 decode memory를 제한한다. jSquash의 공식 Workers WASM 초기화 방식을 사용해 JPEG/PNG/WebP를 실제 decode 후 lossless PNG로 정규화한다. 프로젝트 삭제는 deleting 상태→R2 삭제→DB cascade 순서이며, 중단된 R2 작업은 부모와 독립적인 cleanup tombstone으로 정리한다. 초기에 프로젝트당 최대 100상품, 계정당 200프로젝트를 허용한다.

1. **의류 디테일 왜곡:** 서비스 신뢰성/채택률의 가장 큰 리스크. 로고/무늬/버튼 테스트셋 필수.
2. **OAuth 및 개인 키 탈취:** 강한 암호화, 키 노출 없는 로깅, 연결 해제.
3. **비의도적 API 과금:** 승인 UX, 중복 방어, 불확실한 요청 자동 재시도 금지.
4. **BYOK 사용자 이탈:** OpenRouter 가입/충전 단계의 이탈과 사용성 측정.
5. **낮은 차별성:** 단순 프롬프트 대행이 아닌 자동 기획/프리셋/평가 데이터에 집중.
6. **운영비 전가 오류:** 고객 API비용은 고객 부담이나 R2/Workers/D1 비용은 서비스 부담.

## 2026-11-10 — Phase 0 구현 결정

- Accepted ADR 변경 없음. Phase 0만 구현하며 인증·프로젝트 저장·업로드·실제 AI를 완성된 기능으로 표시하지 않는다.
- Astro 7.4.8 / Cloudflare adapter 14.4.6 / React integration 7.1.5 / React 19.3.1 / Tailwind 4.3.5 / Wrangler 4.159.0을 현재 npm metadata와 공식 문서로 확인했다. TypeScript 최신 7.0.2 대신 `@astrojs/check@0.9.12`의 peer 범위(`^5 || ^6`)에 맞는 최신 6.0.3을 선택했다. React integration의 peer 범위에 맞춰 `oxc-transform-react@0.156.0`을 명시했다. 정확한 전이 의존성은 `bun.lock`으로 고정한다.
- 루트 `.env.example`은 설정 위치 안내로 정리했다. 웹 `.env`의 공개 API URL과 API `.dev.vars`의 서버 설정을 분리한다. 개발 origin은 `http://localhost:4321`, API는 `http://localhost:8787`로 통일한다. 운영 cookie/CSRF 설계는 Phase 1에서 검증한다.
- API의 D1 UUID는 로컬 전용 placeholder이며 원격 리소스가 아니다. D1/R2 remote binding은 끄고 공개 bucket을 만들지 않는다. 원격 배포와 실제 리소스 프로비저닝은 수행하지 않는다.
- Drizzle 연결 factory와 migration 생성 설정만 준비한다. 실제 인증 스키마는 Phase 1, 프로젝트/상품 스키마는 Phase 2에서 추가한다. 미구현 테이블을 가짜 migration으로 완료 처리하지 않는다.
- Mock 분석기는 합성 fixture만 반환하며 네트워크 함수를 갖지 않는다. 실제 provider 어댑터는 없고 `AI_MODE` 변경으로 활성화되지 않는다. 비용은 실제 청구가 아니므로 `actualCostUsd=null`, `costSource=unknown`으로 유지한다.
- Workflow는 인프라 검증용 Mock step만 제공하며 자동 재시도 limit은 0이다. 운영 HTTP API에는 Workflow 실행 경로가 없다. 실제 paid attempt ledger/안전성은 Phase 3~4에서 구현해야 한다.
- 테스트 전용 Worker 진입점에서만 D1/R2/Workflow를 검사한다. 사용자 UI에는 업로드/계정/결과 fixture를 노출하지 않고 빈 상태와 미구현 안내를 제공한다. 랜딩의 셔츠는 직접 작성한 벡터 일러스트로 실제 AI 생성 결과와 구분한다.
- `/health`는 liveness만 확인한다. DB/모델/인증 readiness 검사나 사용량 기록 구현으로 간주하지 않는다. 실제 사용량·품질·재생성 로그는 후속 Phase에서 저장 계층과 함께 구현한다.
- Astro 7의 `session: false`를 명시해 어댑터 기본 KV 세션을 비활성화했다. 앱 세션은 ADR대로 Phase 1의 API Worker/D1이 담당한다. 별도 KV/Cloudflare Images 리소스를 요구하지 않는다.
- 브라우저 검증에서 SSR 직후 hydration 전 클릭 유실을 발견해 React effect가 완료되기 전에는 동작 버튼을 disabled로 유지한다. Headless UI Dialog와 API 오류 복구를 실제 Chromium에서 재검증했다.

## 2026-11-10 — production 배포 결정

- 사용자 요청으로 `cloby.co`의 소유 계정에 실제 배포했다. 원격 환경은 production 하나다. Phase 5의 staging 검증 제안은 production으로 변경했으며 다른 Accepted ADR 변경은 없다.
- 웹은 `photo-studio.cloby.co` Custom Domain, API는 같은 도메인의 경로별 Worker routes를 사용한다. 두 Worker의 독립성과 기존 REST/auth 경로를 유지한다. 브라우저 origin/callback은 하나로 통일하고 별도 API DNS를 만들지 않는다.
- D1 `photo-studio-production`, private R2 `photo-studio-production-assets`, Workflow `photo-studio-production`을 생성/연결했다. R2 managed/custom public domain은 비활성화했다. APAC location hint는 물리 위치 보장이 아니다.
- 개인 계정명/email과 account/zone/database ID를 git/console에 남기지 않도록 원격 ID가 들어가는 Wrangler 설정은 `.wrangler/production/`에만 생성한다. OAuth token은 CLI 출력에서 메모리로 읽고 출력/파일 기록하지 않는다.
- `infra/production.json`과 `bun run deploy`로 설정을 재생성한다. 활성 존의 소유 계정/membership과 로컬 pin을 검증해 잘못된 계정 배포를 방지한다. 이미 존재하는 리소스는 이름으로 재사용한다.
- Wrangler의 non-interactive Custom Domain 배포는 기존 DNS overwrite를 허용할 수 있어, 게시 전 Worker domain changeset 충돌을 별도로 검사한다. 다른 Worker/도메인을 덮어쓰거나 삭제하지 않는다.
- Astro adapter의 Windows 절대 configPath는 URL scheme 오류가 나므로 앱 기준 상대 경로를 전달한다. 로컬 build와 production build를 분리하고 공개 API URL을 production 빌드 시 주입한다.
- Phase 0 Mock 상태만 배포했으며 초대 게이트/실제 고객 기능은 아직 없다. 실제 inference/사용자 키/미사용 암호화 secret은 추가하지 않았다. Phase 1 이후 migration/세션/CSRF/유료 호출 안전성은 별도 구현한다.
- 기존 존이 Cloudflare Web Analytics beacon을 자동 주입하는 것을 production 브라우저 검사에서 확인했다. 존 전체 설정은 유지하고, 검사에서는 해당 beacon의 GET 및 `/cdn-cgi/rum` POST만 명시적으로 허용한다. 제공자 호출 또는 다른 외부 요청은 허용하지 않는다.

## 2026-11-11 — 분석/기획

ADR-013을 추가했다. 분석 이후 참조 이미지는 재현 가능한 snapshot을 위해 고정하며 교체는 새 상품으로 등록한다. 모델 기능은 무료 catalog로 확인하지만 실제 의류 정확도는 funded 계정의 사람 실행 검증 전에는 주장하지 않는다. JSON 응답 실패에도 제공된 비용을 보존하고, Workflow 전달 실패와 provider 응답 미확인은 구분한다.

## 2026-11-11 — 이미지 생성/검수

Images API는 n=1, 3:4, PNG와 medium/high만 요청하며 모델의 현재 참조/출력 지원을 무료 catalog에서 확인한다. 제공된 실제 사용량은 R2 기록보다 먼저 D1에 저장한다. R2 실패는 outcome_unknown으로 끝내 재과금을 방지한다. 평가 실패는 이미지를 유지한다. 생성 결과도 실제 디코딩/PNG 정규화하며 현재 4MP/4096px, 10MB 저장 한도를 적용한다. 최대 크기 동시 업로드 부하와 실제 의류 보존 품질은 별도 베타 검증 항목이다.

## 2026-11-11 — 베타 운영

ADR-014를 추가했다. 사용자 상태를 deleting으로 고정해 계정 삭제 도중 새 작업을 차단한다. 원본/생성 파일 삭제와 시간별 만료/정리 cron을 구현했고 prefix tombstone으로 늦은 쓰기를 정리한다. 내보내기는 인증 키/세션/external identity/object key를 제외한다. 실제 최대 파일/동시 부하와 실제 OpenRouter 인증/유료 의류 품질, secret 회전·백업 복구 리허설은 자동 Mock 검사와 구별해 미검증으로 기록한다. 로컬 이미지의 Cross-Origin-Resource-Policy 차단은 실제 이미지 디코딩 E2E로 발견/수정했으며 production same-origin 정책은 유지한다.

D1 공식 limits의 Free 50 queries/invocation 및 query당 100 bound parameters를 고려해 상품/작업/결과 목록과 다건 삭제·GC를 batch로 묶었다. 61개 상품의 조회/비공개 사진 삭제를 단위 통합 검사에 추가했다. 결과 갤러리는 최근 100컷, 작업 기록은 최근 50개를 표시하며 전체 기록은 내보내기로 제공한다.

원격 Mock E2E 4개 통과 후 삭제 복구를 추가 점검했다. R2 장애 뒤 세션이 만료돼도 시간별 cleanup이 deleting 계정과 암호화 키/관계 데이터를 마무리하도록 보완하고 회귀 테스트를 추가했다.
