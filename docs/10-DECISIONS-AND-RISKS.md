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

## 2026-11-11 — 다크 네온 UI refine

사용자 첨부 레퍼런스에 따라 다크 전용·형광 초록 primary(#00F59B)로 전환했다(ADR-015). 기존 Headless UI Dialog/Listbox와 Pretendard/Paperlogy, 비용 동의·인증·작업 로직을 유지한다. 모든 상태/포커스 색상을 semantic token으로 옮기고 자체 P/셔터 심볼·기울어진 워드마크·SVG outline 및 favicon을 추가했다. 고객 사진에는 반전/색 필터를 적용하지 않는다. 주요 텍스트 대비 6.74:1 이상, primary 버튼 텍스트 13.08:1, 입력 경계 3.27:1을 확인했다. OS light에서도 dark 유지, Dialog ESC/포커스 복귀 및 desktop/mobile 전체 Mock E2E 4개 통과. 사용자 실제 테스트를 보호하기 위해 웹 Worker만 배포하는 명령을 추가했다.

## 2026-11-11 — 직접 OAuth 및 연결 오류 진단

사용자 지시로 초대 정책을 제거하고 ADR-016을 추가했다. beta 화면은 없애고 과거 링크만 studio redirect로 보존한다. 최초 계정/키 저장은 atomic batch, 동시 최초 연결은 DB 쓰기만 복구하며 OAuth code 교환은 재시도하지 않는다. 신규 `auth_events`는 고정 오류 종류/단계/HTTP status만 최대 7일 보관하며 민감정보를 담지 않는다. 기존 generic 오류 당시 실사용자/연결/세션은 저장되지 않았지만 이전 상세 진단이 없어 정확한 실패 단계는 확정할 수 없다. 실제 OAuth 재연결 성공은 Mock 테스트와 구분해 검증한다. user_id 누락 시 계정 혼동 방지 정책은 유지한다.

후속 production 진단에서 실제 실패를 재현했다. OAuth의 `redirect: "error"`는 Workers에서 지원하지 않아 전송 전에 TypeError가 발생한다. 공식 Workers Request 문서를 확인하고 OAuth/키 상태/모델 목록/AI 요청 6곳 모두 `manual` + non-2xx 거부로 수정했다. native fetch를 가짜 함수로 바꾸지 않고 실제 workerd가 로컬 합성 HTTP provider에 접속하는 회귀 검사로 보완했다. 외부 redirect로 code/key를 넘기지 않는 정책을 유지한다. 첫 production 브라우저의 unauth redirect 검사도 Playwright의 redirect-chain intercept 제약을 수정했으며 실제 Mock 사용자 흐름은 통과했고 합성 사용자 잔여 0을 읽기 전용 집계로 재확인했다. 실제 유료 inference/사용자 OAuth 성공은 별도 확인한다.

`8b2f245` 재배포 후 실제 exchange HTTP 400 합성 거부 응답과 사용자의 실제 OAuth/스튜디오 진입 성공을 확인했다. 운영 Mock 모바일에서 일시적 Workflow dispatch 실패가 나타나 기존 ID 재확인 경로를 테스트에 포함하고 desktop/mobile 2/2를 다시 통과했다. local/production Playwright artifact 경로도 분리했다. 실제 유료 inference와 의류 품질은 미검증으로 유지한다.

## 2026-11-11 — 실제 기획 응답 형식 실패

읽기 전용 진단에서 실제 planning은 Google AI Studio/`google/gemini-2.5-flash-lite`, STOP, 출력 198 tokens, 비용 $0.0000965로 정상 종료했으나 앱 validation에서 거부됐다. 원문은 저장하지 않아 정확한 필드는 소급 확인할 수 없다. ADR-017로 provider/App 계약을 분리하고 앱 정책 상수·singleton enum·JSON formatting 호환·값 없는 validation 진단을 추가했다. 성급하게 필수 항목/enum 검증을 없애거나 유료 자동 repair를 하지 않는다. 성공한 분석을 재사용하는 동의 기반 기획 1회 복구를 구현한다. 실제 사용자 기획 재검증은 배포 후 UI에서 실행해야 한다.

재배포 후 실제 사용자 기획 성공 및 콘셉트 표시를 확인했다. studio-v2 planning/job 완료, 실제 비용 $0.0001081와 기존 실패 비용 보존을 읽기 전용 지표로 검증했다. 이는 분석+기획 경로의 실제 성공이며 기획만 복구는 합성 테스트로 구분한다. 실제 이미지 생성·평가/의류 품질은 미검증이다.

## 2026-11-11 — 탐색/인증 pending UX

사용자 요청으로 ChatGPT/Codex 패턴의 프로젝트 사이드바와 중앙 생성 composer를 구현했다(ADR-018). 기존 me=null 조건은 인증 요청 전에도 연결 폼을 표시하므로 명시적 pending/unauthenticated/error 상태로 분리했다. 화면 이동은 Astro ClientRouter를 사용하고 인증 응답·개인 목록은 브라우저 저장소에 캐시하지 않는다. 접힘 boolean만 sessionStorage에 보관한다. Headless UI 검색/모바일 탐색·키보드·skeleton 및 503 재확인 경로를 검증한다. 유료 실행/서비스 인증 정책은 유지하고 웹만 배포한다.

운영 지연에서 같은 프로젝트 검색 선택의 불필요한 재탐색이 새 Upload Dialog를 초기화하는 경합을 발견했다. 이미 열린 프로젝트는 검색/메뉴를 닫고 현재 화면을 유지하도록 고쳤다. API/Workflow 재실행이나 입력 자료 변경은 필요 없다. 첫 운영 결과는 5/6 통과였으며 수정 후 다시 검증한다.

`f81cd8f` 재배포 후 local/production 브라우저 각 6/6과 public smoke를 통과했다. production wrapper의 정리 후 관리 D1 조회가 실패해 exit 1이었으나 독립 읽기 전용 조회로 합성 계정 0과 실제 계정 보존을 확인했다. 앱 브라우저 결과와 관리 검증의 일시 오류를 구분하며 전체 명령 exit 0으로 표시하지 않는다. 웹만 배포했고 유료 AI 호출은 하지 않았다.

## 2026-11-12 — 촬영 현실감과 복잡성 축소

사용자 요청을 ADR-019로 확정했다. 실제 출력 5건의 realism=0.9 편중과 비공개 원본/출력 비교를 확인했다. 스튜디오/가상 로케이션 모드·AI 점수·채택/폐기·신규 유료 평가를 제거하며 과거 데이터/비용은 보존한다. 새 prompt compiler에 한 카메라/조명의 일관성, 인물 부위간 현실감, 관찰된 소재와 주변 반응을 분리했다. 외모/배경 분리/소재 지시와 이전 생성 컷 연속성 참조·비교를 추가했다. 기록만 하던 재생성 사유가 실제 프롬프트에 사용되지 않던 점을 발견해 항목별 교정 및 자유 지시 전달로 수정했다.

광학 수치/심도는 프롬프트의 일관성 근사이며 실제 렌더러·깊이 추정·품질 측정 기능은 아니다. 얼굴 묘사와 이전 프레임도 동일인/로고 보존을 보장하지 않는다. 원본 해상도가 낮으면 디테일 복원 근거가 부족하므로 근접 사진을 권장한다. 무작위 블러/노이즈로 오류를 덮지 않는다. 실제 얼굴 전용 업로드/웹 얼굴 수집은 미구현이다. 원본+이전 참조의 총 12MB와 실제 참조 수 capability를 과금 전 검사한다. 리서치와 인간 승인 단일 축 검증 루프는 `14-REALISM-RESEARCH.md`에 정리했다. 자동 검증 통과를 새 프로토콜의 실제 품질 향상으로 표시하지 않는다.

최종 앱 `5b533c8` production 배포 후 공개 smoke, local/production desktop/mobile 각 6/6, unit 37/37 및 format/lint/typecheck/build 통과. legacy preset의 shootType이 provider data에 남는 경로도 제거하고 가짜 transport로 검사했다. wrapper exit 0과 합성 계정 0을 독립 확인했다. 이후 사용자 실행의 photo-v1 컷 개선 1건을 관찰해 추가 AI 호출 없이 완료/원장/이미지 비교를 확인했다. 새 generation만 1회, 평가 0회, 실제 비용 반환. 기존 인물/구도 연속성은 관찰됐지만 피부 보정감·작은 상품 표식 차이는 남았다. 단일 저해상도 사례의 관찰을 실사 품질 개선의 입증으로 과장하지 않는다. 실제 원본/결과/지시·식별자는 저장소/로그에 넣지 않는다.

사용자는 v1의 일부 개선과 남은 AI 인상을 확인했다. ADR-020으로 공식 상품 게시 사진의 시각적 기준을 비교하고 상품보다 큰 얼굴/반복된 표정/강한 흐림/직전 피부 보정의 고정 가능성을 작업 가설로 기록했다. v2에서 기본 상품 프레이밍·거리 연결·gentle 기본값·승인된 분석 snapshot·이전 인물 특징과 렌더링 결함 분리를 구현했다. 명시적 사용자 선택과 접사는 유지한다. 공개 사진을 실사 provenance가 증명된 원본으로 간주하거나 얼굴 identity 입력으로 전송하지 않는다. v1의 한 컷 성공은 v2 품질 성과가 아니다. 충분한 원본과 새 인간 승인 결과로 다시 비교해야 한다.

v2 앱 `1382f82` commit/push 및 production web/API/Workflow 배포 완료. format/lint/typecheck/unit/build 39/39, native HTTP OAuth/provider 계약·오프라인 합성 지시, local/production desktop/mobile 각 6/6, 공개 smoke 통과. production wrapper exit 0, 합성 계정 잔여 0 및 실제 계정/연결/세션 보존 확인. 자동 유료 AI 호출은 없으며 v2의 실제 출력 개선 효과는 미검증으로 유지한다. 사용자가 콘셉트의 상품 전체 프레이밍/배경 분리를 직접 수정·승인한 뒤 비용 동의로 비교할 수 있도록 안내했다.

v2의 사용자 실행 신규 이미지가 성공했고 evaluation 없이 실제 비용이 반환됐다. 사용자는 얼굴/표정/피부가 여전히 AI 같다고 확인했다. 사용자 무신사 비교 이미지는 얼굴이 더 크게 보여도 자연스러워 보였으므로 구도/얼굴 비중 개선을 주요 실사 해결로 삼은 판단을 수정했다. 원본 대비 주머니 패널 차이도 발견해 상품 보존 실패로 기록한다. v1과 다른 상품/장소라 제어된 버전 비교 실험이 아니다.

ADR-021은 인물/촬영감의 역할을 분리한 실제 visual reference 입력을 구현한다. 기존 private assets/정규화/owner/CSRF/삭제 정책을 재사용하고 사용 선택/외부 처리 동의/과금 전 검사로 제한한다. 인물 신원/학습 데이터 수집이나 native face-swap/MTF 보정 기능으로 과장하지 않는다. 코드/합성 transport의 역할 분리와 실제 모델이 이를 지키는 품질은 별개이며 원치 않는 인물·의류 혼합도 실제 검증 항목으로 남긴다. 새 모델 단계나 자동 유료 호출은 없다. 사용자 첨부 비교 사진을 자동으로 provider에 보내지 않았다.

최종 앱 `b07cb46` commit/push 및 production web/API/Workflow 배포 완료. format/lint/typecheck/unit/build 44/44, native provider/OAuth 계약·합성 manifest 6종, local/production desktop/mobile 각 6/6, 공개 smoke 통과. 운영 wrapper exit 0과 참조/동의 UI를 확인했고 합성 계정 0, 실제 계정/연결/세션과 기존 실제 이미지 7건/평가 5건 보존을 독립 확인했다. 실제 인물/촬영감 참조를 선택한 v3 품질 효과는 아직 미검증이다. 폰트·다크 토큰·Headless UI·BYOK와 1회 생성/무평가/무자동재시도 정책을 유지한다.

## 2026-11-12 — 프로젝트 제거와 상품 작업대

사용자 지시를 ADR-022로 확정했다. 숨은 프로젝트를 만들지 않고 products가 user_id에 직접 속하도록 바꾼다. 사이드바는 분석/모든 asset을 내려받는 대신 owner 상품 요약만 조회한다. 최초 다중 업로드는 staging 상태에서 사진과 선택 참조를 함께 저장하고 실패 시 rollback하며, 삭제 상태를 다시 ready로 되살리지 않는다. 의류 순서와 대표 사진은 저장 시각/ID 정렬로 일관되게 유지한다.

중앙 비교와 오른쪽 기획 inspector를 분리하고, 1024px에서도 패널만 스크롤할 수 있게 했다. 기존 생성 결과는 새 기획/생성 중에도 비교의 근거로 남고 큰 대기 상태는 실제 job에서만 표시한다. 인증 pending은 OAuth 실패로 표시하지 않는다. Toss의 공식 Product Principles/Design System을 참고해 다음 행동과 컨트롤 수를 줄였고 다크 네온·폰트·Tailwind/Headless UI 스택은 유지한다.

선택한 촬영감 이미지를 기존 planning 호출에 전달하는 studio-v6-planning-reference를 적용했다. 의류 분석은 여전히 의류만 받으며 referenceNotes는 관찰 요약이다. 기획 결과가 특정 얼굴/조명/소재를 정확히 재현했다는 검증값이 아니다. 생성은 기획에 사용한 참조를 미리 선택하되 사용자가 제외할 수 있고, 외부 처리와 이미지 1회 비용에 다시 동의한다. 새 AI 추출 단계/무단 유료 호출은 없다.

사용자가 서비스 DB 초기화를 명시해 기존 계정·연결·세션·작업/비용/과거 평가 이력·private R2 미디어까지 삭제하는 일회성 절차를 준비했다. 이는 일반 배포/보존 정책 변경이 아니며 OpenRouter 측 계정/크레딧과 Cloudflare 리소스·master secret은 보존한다. 스크립트는 고정 production 대상 확인, 접근 차단, 활성 Workflow 종료, 객체별 삭제 후 행 삭제, FK/원장/빈 상태 확인을 수행한다. 읽기 전용 사전 확인에서 활성 작업/Workflow가 각 1개라 실행 전 종료 확인이 필요하다. 실제 실행·배포 결과는 후속 기록하며 완료로 미리 표시하지 않는다.

초기화 실행 결과: 전체 앱 테이블 0, private R2 객체 10개 삭제 후 0, FK 오류 0, 스키마/마이그레이션 원장 보존을 확인했다. 사전 조회의 활성 1건은 실제 실행 직전 완료되어 취소/종료 대상은 없었고 실행/최종 확인 모두 active job/Workflow 0이었다. 이전 실제 생성/과거 평가 기록과 연결 정보도 사용자 요청 범위로 삭제했다. 추가 유료 호출은 없으며 다음 사용 시 OpenRouter 재연결이 필요하다. 최종 코드 전체 check(53/53, lint 경고 0, Astro 진단 0)와 local E2E6/6도 통과했다. 배포 및 운영 회귀는 아직 후속 검증 중이다.

앱 86a2c30을 main에 commit/push하고 migration0009, web/API/Workflow를 production에 게시했다. 공개 smoke와 과거 프로젝트 URL308 복귀, production Mock desktop/mobile6/6 및 wrapper exit0을 확인했다. 운영 캡처에서 중앙 비교 유지·축소한 썸네일/버튼·단일 열 설정 패널을 점검했다. 테스트 계정/사진 삭제 후 별도 전체 초기화로 테스트 OAuthflow/운영 이벤트/rate limit/정리 큐도 비웠다. 최종 전체 앱 행0, R2객체0, activejob/Workflow0, FK오류0, schema와 migration원장 보존이다. OpenRouter 재연결과 새 참조의 실제 유료 품질 검증은 사람이 수행해야 하며 이번 Mock 성공으로 완료 표시하지 않는다. 실제 AI를 자동 호출하지 않았다.

## 2026-11-12 — 프레임 경계와 상품 이름

사용자 제보의 대기 UI 넘침은 작업대 기준 absolute 좌표와 최소 높이가 실제 결과 프레임 크기와 분리된 문제였다. 결과 figure를 위치 기준으로 바꾸고 inset/overflow로 경계를 고정한다. 상세 중복 헤더/장수/제목은 시각적으로 제거하고, 상품 행의 제목 수정·삭제 액션을 hover/focus와 터치에서 접근 가능하게 제공한다. 의류 아이콘은 제거한다.

ADR-023에 따라 파일명 대신 동의된 기존 상품 분석의 suggestedTitle을 사용한다. 입력하지 않으면 분석 전에는 ‘새 상품’이며, 기존 분석에 제목 필드를 추가할 뿐 새 유료 단계를 만들지 않는다. name_source는 수동 이름과 자동 이름을 구별하고 조건부 UPDATE로 분석 중 수동 수정도 보호한다. 0010은 additive이며 이전 사용자 자료/연결/작업 원장은 보존한다. 실제 제목 품질은 합성 검사로 주장하지 않는다.

4821554를 commit/push하고 migration0010/web/API/Workflow를 production에 게시했다. 전체 format/lint/typecheck/build, 단위55/55, local/production 브라우저 각6/6(wrapper exit0), 공개 smoke를 통과했다. 운영 대기/비교 캡처에서 부모 경계를 확인하고 브라우저 좌표 assertion과 사이드바 제목 수정/삭제를 검증했다. 실제 사용자 자료/연결은 유지했고 테스트 계정/사진은 정리했다. 새 제목의 실제 유료 응답 품질은 미검증이며 자동 비용 발생 호출은 수행하지 않았다.

## 2026-11-12 — 생성 실행과 편집 저장 통합

ADR-024에 따라 생성 확인/비용 동의를 유일한 촬영 실행 승인으로 삼고 별도 저장/승인 버튼을 제거했다. 편집은 화면 메모리에 두고 생성 창에서 고정한다. 새 분석/기획은 새 서버 결과를 사용하며 단순 polling/탭 전환으로 draft를 잃지 않는다. 페이지를 떠나면 생성 전 편집은 저장되지 않고, ‘저장된 분석으로 기획 다시 만들기’는 기존 서버 분석을 사용한다.

생성 job 등록과 분석/계획 저장은 공식 D1 batch의 rollback 보장을 사용하며, 신규 job ID가 실제 생성된 때만 설정을 갱신한다. 동의/소유권/유효성 오류는 저장 전 거부하고 idempotent replay는 나중에 변경된 저장값을 덮지 않는다. 실제 Workflow에는 같은 요청의 고정 snapshot을 넘긴다. 내부 approved 및 기존 PATCH는 호환 이력이며 UI 단계가 아니다. 유료 자동 실행/재시도나 데이터 초기화는 없다.

앱 df345fb commit/push 및 web/API/Workflow production 배포 완료. format/lint/typecheck/build, 단위57/57, 최신 local/production desktop/mobile 각6/6 및 wrapper exit0, 공개 smoke를 통과했다. 실제 D1/Workflow Mock 흐름에서 수정값 저장+생성 연결을 확인했고 UI 캡처에 저장/승인 버튼이 없는 것을 확인했다. 합성 계정/사진 정리 완료, 실제 사용자 연결/자료 보존. 새 흐름의 실제 유료 생성은 자동으로 수행하지 않았으며 미검증으로 남긴다.

## 2026-11-12 — 장식 없는 사진 작업대

ADR-025는 사용자 요청의 라벨/버튼/사진 탐색/포커스/사이드바 변경이다. 전역 장식 kicker와 특수 danger 버튼 variant를 제거하고 solid 기본 스타일을 사용한다. 각 원본/결과 프레임의 하단 가로 filmstrip이 표시 사진을 선택하며 확대 버튼은 오른쪽에 둔다. 프레임 폭을 채우되 사진 비율을 보존하고, 큰 사진은 내부 스크롤한다. 확대는 viewport 크기에 가까우며 sr-only 접근성 이름, ESC/닫기·포커스 복귀, 화면 맞춤/원본 픽셀 크기를 제공한다. 실제 Mock 결과 고지와 비용/오류/필드 라벨은 유지한다.

사용자 지정으로 전역 버튼/링크 focus ring을 없애고 텍스트 입력에만 남긴다. 이는 시각 스타일의 명시적 변경이며 키보드/ARIA/선택 상태 제어는 유지한다. 참조 이미지 삭제는 hover/focus overlay, 터치는 상시 노출이다. 사이드바 접기와 최근 날짜 구분을 없애고 내 상품/작은 검색 아이콘을 사용한다. API/DB/AI 요청 변경이나 사용자 자료 초기화는 없다.

6174d28 commit/push 후 웹 Worker만 production에 배포했다. 최종 format/lint/typecheck/build와 단위57/57, local/production 브라우저 각6/6 및 wrapper exit0, 공개 smoke를 통과했다. 모달 접근성 루트가 fixed viewport를 차지하도록 보완했고, 참조 삭제 검사는 초기 계획 로딩 완료 후 탭을 선택해 비동기 탭 전환과의 경합을 제거했다. 확대/썸네일 전환·입력만 ring·solid 확인 버튼·hover 삭제를 실제 운영 Mock 흐름에서 검증했다. 합성 계정/사진을 정리했고 실제 연결/자료를 유지한다. API/Workflow 배포나 D1 migration, secret 변경, 유료 AI 호출은 없다.

## 2026-11-12 — 참조 역할 충돌과 실행 UX

ADR-026으로 실행 클릭을 동의로 통합하고 간단 비용/전송 안내만 남긴다. 서버 검증/권한 및 업로드 무AI 정책은 유지한다. 감사에서 촬영감 톤-only/포즈 금지, 기획의 인물 이미지 제외, 고정 전체 의류·머리 비중, 개선 중 재구도 지시, 저장된 분석만 재사용하는 경로를 확인했다. 기획 인물/구도 동시 전달 및 편집 분석 snapshot, 구도 match/inspire와 표준 프레이밍/시점 선택, 최신 편집 우선으로 교정한다. 원본 의류와 인물 신원은 분리하고 실제 유사도 보장으로 표현하지 않는다. 프로토콜 studio-v8/photo-v4, JSON 기본값 호환, 데이터 초기화/새 유료 단계 없음. 브라우저가 새 plan 필드를 보내기 전에 호환 API를 게시하도록 배포 순서를 조정한다.

추가 확인: 결과 썸네일을 수동 선택한 상태에서 새 생성/개선을 마쳐도 selected ID가 이전 컷으로 남는 UI 경로가 있었다. 최신 asset이 추가될 때 그 결과를 한 번 선택하고, 새 결과가 없는 polling에서는 사용자 선택을 보존한다. refresh 순번으로 늦은 응답이 이전 목록/선택을 덮지 않게 했다. 기존 컷 수동 선택 후 2차 생성의 표시 asset ID 및 새 프레이밍/각도/지시 전송을 브라우저 회귀에 포함한다. 이것은 모델의 얼굴/구도 불일치 원인과 구별되는 표시 오류다.

b9abd66 commit/push, API/Workflow 우선→웹 배포 완료. format/lint/typecheck/build 및 단위59/59, native workerd 합성 HTTP 계약, 최신 local/production desktop/mobile 각6/6(wrapper exit0), 공개 smoke 통과. 실제 운영 Mock에서 실행 체크 제거·바스트/버드아이→미디엄/로우 수정 payload·새 결과 자동 표시·썸네일/확대/삭제·hover 색상과 명확한 Mock/provider 상태를 확인했다. 합성 계정/사진 정리와 실제 계정/연결/세션 유지도 읽기 전용 집계로 재확인했다. D1 migration/사용자 초기화/secret 변경이나 자동 유료 추론은 없다. 얼굴/구도 준수의 실제 개선은 아직 사람의 유료 결과 비교 전이며 검증 완료로 표시하지 않는다.


## 2026-11-12 — 중앙 업로드와 시각적 크롬 정리

ADR-027로 초기 상품명 입력·공통 상단 헤더를 제거한다. 사진 입력 3개를 중앙 같은 행에 배치하고 박스 내 캐러셀, 하단 등록 버튼을 제공한다. 이름은 기존 분석 명명 경로를 유지한다. 사용자 지시로 모든 scrollbar/focus ring을 숨기며 입력 ring을 남긴 ADR-025 예외를 대체한다. 의미적 버튼·탭 이동·Dialog 초점 복귀·실제 스크롤은 보존하지만 시각적 초점/스크롤 단서는 약해진다. 랜딩은 제공한 Chainly의 중앙 CTA와 주변 카드 구도를 직접 확인해 자체 벡터와 기존 다크/네온 톤으로 적용한다. 실제 촬영 결과·고객 사례로 가장하지 않는다. 이번 변경은 웹 전용이며 DB/사용자 연결/이미지/AI 프롬프트를 수정하거나 초기화하지 않는다.


c62ef8d commit/push 후 웹 Worker만 배포했다. 최종 format/lint/typecheck/test/build 통과(타입 진단/린트 경고 0, 단위59/59), 최신 local/production desktop/mobile 각각6/6 및 운영 wrapper exit0. 운영 HTTPS/CORS/무초대 OAuth/폰트/반응형 smoke와 화면 캡처를 확인했다. 이름 없는 등록·3종 가로 입력·프리뷰 경계/캐러셀 append/삭제·인물 입력·전체 헤더 없음·입력 ring 없음·내부 스크롤 유지·생성/개선/삭제를 검증했다. 360~1440px 랜딩 overflow와 CTA 줄바꿈도 점검했다. 합성 계정/사진 정리 후 실사용 계정/연결/세션은 그대로이며 API/Workflow 배포나 D1 migration/초기화, secret 변경, 유료 추론은 수행하지 않았다.


## 2026-11-12 — 설명 최소화·계정 의존 관계·소재 재조명

ADR-028은 사용자 지시로 실행 옆 비용/전송 문구까지 제거한다. 비용 정보는 privacy/사용 기록, 실행 동의는 기존 server snapshot으로 유지한다. 단일 로그아웃은 stored key와 모든 앱 세션을 atomic하게 지우며 소유 작업을 취소한다. 발급 키 원격 폐기는 별개이며 provider 폐기를 주장하지 않는다. desktop min-height/grid row를 제약하고 탭 콘텐츠 한 곳에서만 스크롤해 긴 콘셉트가 바깥 문서를 밀지 않게 한다. 물리 지시에서 큰 처짐·국소 주름/봉제·직물 결과 원본 조명을 구분하고 계단/벽 접촉과 고정 배경거리 충돌을 해소했다. 참조/사용자 수정 우선과 1회 실행·불명확 과금 무재시도 원칙은 그대로다. 사용자 사진/키/프롬프트를 저장소에 복사하거나 유료 자동 비교를 수행하지 않는다.


1fd2d12 commit/push 후 API/Workflow를 먼저, 웹을 이어서 배포했다. 최종 format/lint/typecheck/test/build 통과(진단/린트 경고0, 단위66/66), 최신 local/production desktop/mobile 각각6/6 및 운영 wrapper exit0. 공개 smoke 및 운영 캡처에서 SVG/필드 간격·설명/실행 비용 문구 제거·단일 계정 행동·수평 재기획·1440x1000/1024x768/1440x640의 고정 탭/외부 스크롤 없음/독립 내부 스크롤을 확인했다. 테스트의 사진 삭제 후 Blob 미리보기 갱신을 기다리도록 보완해 모바일 검사 경합을 제거했다. 구버전 큐의 성공 attempt에는 실제 실행 captureVersion을 기록하고, 기존 성공 기록의 누락 버전은 null로 유지한다. 합성 계정/사진 정리와 실제 계정/연결/세션 보존을 읽기 전용 집계로 확인했다. 새 DB migration·초기화·secret 변경이나 유료 AI 호출은 없다. v5 소재/그림자의 실제 생성 품질은 같은 입력의 사용자 실행 비교 전까지 미검증이다.


## 2026-11-12 — 랜딩 톤 전환과 제품 중심 서사

ADR-029는 기존 랜딩의 SVG 카드/다크 네온을 대체한다. 12개 공식 SaaS와 앱의 실제 기능을 조사해 아이보리·잉크/올리브와 큰 제품 데모를 선택했다. 앱의 다크·네온은 유지한다. 공개 데모는 별도 제작한 허구 인물/의류 사진과 state 기반 인터랙션이며 실제 고객 화면/생성 성공 사례로 표시하지 않는다. image_gen 내장 도구를 썼고 고객 OpenRouter 자격 증명/사진은 쓰지 않았다. 표준 아이콘/브랜드 외 SVG 그림과 과장된 성과/후기는 제거한다. 테마 전환·기능 데모·CTA·FAQ·이미지 용량/출처/반응형 검증을 추가한다. 자산 소스와 근거는 `16-LANDING-DESIGN-RESEARCH.md`를 따른다.


8fa9a20 및 데모 비저장 문구를 분명히 한 53738e7 commit/push 후 웹 전용 배포 완료. 최종 format/lint/typecheck/test/build와 단위66/66, local/production desktop/mobile 각각8/8(wrapper exit0) 및 공개 smoke 통과. 랜딩 테마/데모 상태/장면 전환·확대/FAQ·앵커·public WebP 경로·반응형·실제 스튜디오의 다크 유지와 기존 Mock 흐름을 검증했다. 운영 HTML/캡처에서 최신 예시 문구와 커스텀 SVG 그림 제거를 확인했다. 실제 앱 설정이 저장/생성됐다는 표현을 쓰지 않으며 데모 조작은 API를 호출하지 않는다. 공개 사진은 별도 내장 image_gen 제작물이고 실제 서비스 결과가 아니다. 합성 테스트 계정/사진은 정리했고 기존 계정/연결/세션을 읽기 전용 집계로 재확인했다. API/Workflow/D1/secret/사용자 자료 변경과 자동 유료 OpenRouter 호출은 없다.


## 2026-11-12 — 직접 입력 후속 제보와 DS 정합성

ADR-030에서 직접 입력 동시 조건을 회귀에 추가하고 min-content 크기 제약을 보강한다. 초기 정적 크기/글꼴 조사로는 재현되지 않았지만, 실제 앱의 1440×900→1024×640 축소와 직접 입력 포커스 순서에서 document690/body640을 재현했다. 숨김 sr-only span의 absolute containing block이 viewport여서 패널 밖 문서 스크롤에 기여했다. label relative로 묶은 뒤640/640을 확인한다. 별도로 직접 입력값이 프리셋과 같아지는 순간 창이 사라지는 분기 문제를 수정한다. 사용자 편집 모드/값을 유지하고 의도적으로 옵션을 바꿀 때만 닫는다. 기획 버튼은 재분석 포함 여부를 이름으로 드러낸다. 선택 테두리 2px와 랜딩의 앱 공통 다크/네온/radius로 일관성을 맞추며, 색 토큰을 별도로 재정의하지 않는다. 새 사진/AI 호출이나 고객 자료/계정 변경은 없다.


ebbcd99 commit/push 및 웹 전용 배포 완료. 최종 format/lint/typecheck/test/build 통과(진단/린트 경고0, 단위66/66), local/production desktop/mobile 각각8/8과 공개 smoke 통과. 두 직접 입력/긴 무공백 값/선택지와 같은 값도 수동 유지/resize·focus·tab 왕복/320~1440px 경계/문서 스크롤 없음/내부 스크롤/2px/다크 DS를 검증했다. 신규 회귀가 원래 690px 문서 높이를 실패로 검출했고, 실제 label 위치 static 해제/relative 복원으로 fixed640→unanchored690→restored640을 확인했다. 실패를 무시하거나 검사 기준을 완화하지 않고 배치 원인을 수정했다. 운영 합성 계정/사진 정리와 실제 연결·세션 보존도 재확인했다. API/Workflow/D1/secret/사용자 자료 변경 및 유료 OpenRouter 호출은 없다.

## 2026-11-12 — 기획 후 원본 append와 진행 단계

ADR-031은 이력이 있으면 원본 추가를 막던 정책을 제한적으로 변경한다. 총 3장 한도로 기존 파일은 유지하고 원본 프레임 +에서 추가한다. 기존 기획/생성 sourceIds를 소급 변경하지 않으며 새 사진은 다음 상품 재분석·기획에서 반영한다. 업로드만으로 AI 호출은 없다. 조건부 uploading 상태와 enqueue의 ready 조건으로 작업 시작 경합을 막고, 정상/검증 실패 시 복구한다. 정리 실패는 기존 안전 정책대로 미완료 상태와 cleanup queue를 유지한다. 진행 UI는 완료·현재 단계의 색과 실제 job 상태만 표시하며 경과 시간/칩/스피너 박스를 제거한다. 실제 고객 자료/연결을 초기화하지 않으며 DB migration/추가 유료 API 호출은 필요 없다.

7409eaf API/Workflow→웹 배포와 83f1a51 모바일 갤러리 웹 보완 배포를 완료했다. 최종 format/lint/typecheck/test/build(단위69/69, 타입 진단0), local/production desktop/mobile 각각8/8 및 공개 smoke가 통과했다. 추가된 확대 버튼 경계 검사는 모바일 right215px/frame202px 실패를 검출했다. fieldset 내부 스크롤 분리만으로는 부족했고 프레임 열을 minmax(0,1fr)로 고정한 뒤 같은 검사와 실제 운영 캡처에서 버튼이 프레임 안에 남는 것을 확인했다. 반복 운영 검사는 테스트 IP의 OAuth 10회/10분 한도에 걸려 6/8이 된 적이 있다. 제한을 수정하거나 테스트를 완화하지 않고 다음 구간에서 전체8/8(wrapper exit0)을 재확인했다. 합성 계정0, 실사용 계정은 남아 있으며 새 migration/자료 초기화/secret 변경/유료 AI 호출은 없다. 다만 초기 읽기 집계에서 존재하던 실사용 연결/세션은 최종 집계에서 없다. 원인은 확인하지 못했고 연결 보존을 주장하지 않는다. 테스트 세션은 별도 is_test 계정에만 발급·삭제하며 실제 계정 재인증은 사용자 작업으로 남긴다.

## 2026-11-12 — 인증 소실의 실증과 참조 증강

ADR-032에서 이전 원인 미확인 보고를 바로잡는다. 07:34:30 KST의 인증된 POST /auth/logout200과 동일 초 소유자 조건 D1 연결 삭제가 일치한다. 자동 E2E는 이 경로를 호출하지 않고 배포/만료는 키를 삭제하지 않는다. 인간 클릭 주체는 식별하지 않지만 휴먼 테스트 설명과 부합한다. 반복 질문 대신 lifecycle audit와 인증 보존 guard/canary를 구현해 이후 변화를 설명 가능하게 한다. ADR-033에서 Pinterest 외부 발견과 권한 있는 원본의 실제 이미지 조건화를 구현한다. 제한 beta API의 미승인 자동 수집/저장/외부 AI 공유는 연결된 것처럼 표시하지 않는다. 생성 프로토콜은 사진 관찰과 충돌하던 고정 optics를 제거한다. 근거와 실제 비교 절차는 17-AUTH-AND-REFERENCE-RESEARCH.md. 과거 사진/계정 초기화나 유료 자동 실험은 수행하지 않는다.

최종 구현3b0891f 및 참조 교체 보완25cfd3d를 commit/push하고 additive migration0011/0012, API/Workflow→웹을 배포했다. format/lint/typecheck/test/build(79/79, 타입 진단0), local/production desktop/mobile 각각8/8, native workerd OAuth/합성 provider HTTP, 합성 촬영6종을 통과했다. 참조 교체/미선택 snapshot에서만 오래된 관찰을 제거하고 원래 기획·수동 수정은 보존하는 회귀도 검사했다. 두 실제 배포에서 non-empty 합성 canary의 연결·세션 바이트 불변을 확인했고, 전체 운영 테스트 중 별도 untouched sentinel과 실제 계정 인증 상태도 불변이었다. 최종 standalone canary verify 후 자기 계정만 cleanup했고 합성 계정0, 실제 OpenRouter 연결/세션이 유지된 것을 읽기 전용으로 확인했다. 운영 E2E wrapper exit0와 공개 HTTPS/CORS/OAuth/폰트/반응형 smoke, 화면 확인을 완료했다. 사용자 자료 초기화·master secret 교체·유료 inference는 없다. Pinterest 공식 자동 API 검색/수집은 승인·해당 사용 조건/자격 증명 미준비로 미연동이며, v6의 실제 실사 효과는 인간의 같은 입력 비교 전 미검증으로 남긴다.

## 2026-11-12 — 수동 발견에서 분석 후 자동 참조로 변경

사용자 지시를 ADR-034로 반영한다. 기본은 공식 Commons API의 CC0 환경 사진 자동 검색이며 수동 Pinterest 검색을 요구하지 않는다. 분석에서 일반 카테고리만 뽑고 source 선언/카메라 metadata/범위 제한을 검사한다. 자동 사진은 개인 모델의 신원 근거가 아니라 실제 환경의 빛·소재·초점 기준이다. job별 claim/provenance와 private asset으로 snapshot 변조·반복 검색을 막고, 기획 및 생성에 실제 픽셀을 전달한다. 적합 사진을 얻지 못하면 분석을 남기고 유료 기획 전에 실패하며, 성공을 꾸며내거나 숨은 fallback을 하지 않는다. 별도 자격 증명이 필요한 stock API보다 현재 실제로 실행 가능한 keyless CC0 경로를 선택했다. 운영 source-only probe는 AI 연결 없이 실 다운로드/R2와 AI attempt0을 검증한다.

85b9b01/b5754f3/f050792를 commit/push하고 additive0013 및 API/Workflow→웹을 배포했다. 첫 운영 probe는 REST Workflow의 JSON 문자열 payload 차이로 검색 전에 실패했다. object/string 공통 Zod 검증으로 고친 뒤 최종 배포에서도 같은 probe가 실제 CC0 검색/JPEG 디코딩/출처 보관/private R2 읽기·AI attempt0으로 통과했다. 자기 합성 자료만 정리했다. Commons CDN이1024 요청에1280px 사진을 돌려주는 경우를 실제 디코딩으로 발견해768 요청과 실제1024 상한 검사를 사용한다. 저장 batch의 부분 실패·커밋 응답 유실·DB 상태 불명확 시 삭제 범위를 소유 자동 asset으로 제한하고, 확인할 수 없는 media는 cleanup intent와 함께 보존한다. live probe는 캐시 조회/작업 변경 전에 합성 계정과 전용 표식을 검사한다. 배포마다 기존 실제 인증과 non-empty canary의 연결·세션 원문 불변을 확인했다. 고객 자료 초기화·master secret 교체·자동 유료 inference는 없다.

최종 format/lint/typecheck/test/build93/93, local/production desktop/mobile Mock 각각10/10, native workerd OAuth/합성 provider HTTP 및 공개 운영 smoke를 통과했다. 선택한 자동 사진의 asset ID가 generation snapshot·소유권 검사·private R2·실제 provider 입력 순서까지 일치함을 계약과 브라우저 검사로 확인했다. 운영 캡처의 desktop/mobile 프레임/참조/패널도 점검했다. 전체 운영 테스트 중 untouched sentinel과 실제 인증은 불변이었으며, standalone canary를 다시 검증한 뒤 자기 합성 계정만 정리했다. 최종 읽기 집계는 합성 계정0, 실제 계정1/연결1/세션2였다. Commons는 패션 모델 사진 전용 라이브러리가 아니며 자동 경로는 환경/광원/소재 범위다. 실제 생성 이미지의 실사 품질 개선은 사용자 실행 비교 전 미검증으로 남긴다.

## 2026-11-12 — 실제 모델 착용컷 소스 조사

사용자가 요구한 증거는 사람이 옷을 입은 자세·구도·피부·직물·그림자가 함께 있는 실제 사진이다. 현재 환경 사진은 보조 역할만 하며 목표 전체를 대체하지 않는다. Shutterstock의 비학습 AI 편집 예외/모델 릴리즈 필터, Getty Creative의 허용 편집 예외를 확인해 계약 후보로 추렸다. 개인 구독이나 검색 API 접근만으로 다중 고객의 외부 이미지 참조 생성까지 허가됐다고 보지 않는다. 무료 소스/패션 연구 데이터는 모델 권리나 상업/API 사용 범위가 완결되지 않으며 단건 추론 금지 여부와 구분한다. `19-MODEL-SHOT-REFERENCE-SOURCES.md`의 조건부 추천/연동 설계를 기록했고 코드·배포·사용자 자료는 바꾸지 않았다. 계약/키 확보·실제 API 검색과 유료 출력 품질은 미검증이다. stock 연동 전 planning/generation 양쪽의 비학습 처리 강제와 고객별 라이선스 ledger도 필요하다.

## 2026-11-12 — Shutterstock 커넥터와 설정 도구 준비

사용자 선택을 ADR-035로 반영해 `a067246`을 commit/push하고 API/Workflow→웹에 배포했다. 실제 vendor 계약/키는 아직 없으며 source를 임의 활성화하지 않았다. 서버의 Access Token·고정 구독·platform 권한·계약 승인을 확인해 실사/성인/모델 릴리즈 검색, 라이선스 직전 durable claim과 다운로드 전 grant 저장, private 동일 픽셀의 기획/생성 연결을 구현했다. 사진/권한 문제를 환경 참조로 숨겨 대체하지 않는다. 공식 예제에 없는 optional boolean/medium metadata를 필수로 가정하던 초기 조건을 바로잡았고 실제 스키마 생략 응답 회귀를 추가했다. 전체 검색/발급/다운로드 fetch를70초로 제한해3분 planning step의 시간을 확보한다.

기획은 비학습 data policy를 강제하고 Images는 지원되는 OpenAI 고정 라우팅을 사용한다. 미지원 data_collection/ZDR 필드로 비학습을 보증하지 않는다. stock 파생 결과 개선도 원래 계약/비학습 제약을 상속한다. 라이선스 응답 유실은 stock 전용 outcome_unknown으로 보존하고, 발급 후 디코딩/저장 실패는 grant/미확인 비용을 남겨 불필요한 재발급을 막는다. root failure/reconciliation도 미완료 stock claim을 확인한다. 참조 원본 다운로드는403이며 고객 생성물 다운로드는 유지한다. 별도 결제 기능이나 운영자 공용 AI 키를 만들지 않는다.

`bun run setup:shutterstock`는 운영 대상/기존 master secret을 확인하고 계약 버전·구독ID·native Wrangler 숨김 token 입력과5개 정책값의 atomic secret bulk를 제공한다. 실제 설정 도구는 계약 미확보 상태에서 실행하지 않았고 --help/도구 타입 검사만 수행했다. 무료 공개 한도와 유료 견적·일반 구독/API 차이, vendor에 보낼 미전송 문의 초안은 `20-SHUTTERSTOCK-SETUP.md`에 기록했다. 설정이 외부 승인을 취득하는 것은 아니다. 실제 API/라이선스/출력 품질은 사람의 승인된 계정 실행 전 미검증이다.

최종 format/lint/typecheck/unit/build117/117(진단0), local/production desktop/mobile Mock 각10/10, native workerd OAuth/합성 provider HTTP와 공개 운영 smoke가 통과했다. 운영 E2E wrapper exit0, 기존 실제 인증/untouched sentinel 불변 및 standalone canary 원문 보존→자기 정리를 확인했다. 마지막 읽기 집계는 합성 계정0, 실제 계정1/연결1/세션2다. Wrangler secret 이름 검사에서 Shutterstock 설정이 아직 없음을 확인했다. 새 DB migration·고객 자료 초기화·master secret 교체·실제 stock/유료 AI 호출은 없다. 최신 운영 UI는 현재 기본 경로와 Mock 브라우저를 검증한 것이며, 실제 Shutterstock 인증/사진/발급/출력 검증으로 계산하지 않는다.
