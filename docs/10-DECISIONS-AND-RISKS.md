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
