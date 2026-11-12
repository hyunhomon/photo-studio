# Shutterstock 자동 착용컷 참조 설정 — 2026-11-12

## 용도와 활성화 조건

Photo Studio는 상품 분석 후 실사 착용컷을 검색·선택하고, 정식 라이선스를 받은 같은 사진을 기획과 이미지 생성에 전달한다. 참고 범위는 포즈·구도·원단 처짐·접촉 그림자·피부와 직물의 명암이다. 원본 의류의 색·로고·봉제·포켓 구조와 사용자가 제공한 인물 참조가 우선한다. 참조 모델의 동일 얼굴 복제를 기본 목표로 삼지 않는다.

이 문서는 **발급·계약·설정 안내**다. 공식 문서 조사만으로 Photo Studio의 자동 선택·외부 AI 처리·고객별 상업 출력이 승인됐다고 표시하지 않는다. 계약과 자격 증명이 준비되기 전 기본 소스는 `wikimedia_commons`이며, Shutterstock 검색·라이선스 발급·실제 생성 품질은 별도 검증이 필요하다. 관련 범위와 대안은 [모델 착용컷 조사](19-MODEL-SHOT-REFERENCE-SOURCES.md)를 따른다.

Shutterstock 자격 증명은 사진 검색·라이선스용이다. 고객 AI 추론은 계속 고객별 OpenRouter BYOK로 실행하며 공용 운영자 AI 키를 만들지 않는다.

## 가격·무료 계정과 문서 날짜

2026-11-12에 확인한 공식 공개 자료는 다음과 같다. 페이지의 확인 날짜·검색 엔진 수집 날짜를 약관 발효일로 바꾸어 쓰지 않는다.

| 공식 자료 | 문서 날짜 | 확인한 내용과 적용 |
|---|---|---|
| [API Pricing](https://www.shutterstock.com/api/pricing/), [공식 독일어 가격 페이지](https://www.shutterstock.com/de/api/pricing) | 발행·최종수정일 미표시. 영어 본문에는 오래된 전체 자산 수/푸터가 남아 있다. | Free Test는 제한된 약300만 이미지 컬렉션, 월500건 라이선스/다운로드, 시간100 API 요청을 안내한다. Unlimited와 Pay Per Use는 판매팀 견적이며 공개 USD 단가가 없다. |
| [현재 API Reference의 Subscriptions](https://api-reference.shutterstock.com/#subscriptions) | 발행·최종수정일 미표시 | 무료 컬렉션의 라이선스·다운로드 및 워터마크 없는 파일을 지원한다고 명시한다. 전체 유료 라이브러리 접근과 구별한다. 실제 권한은 해당 계정 구독으로 확인한다. |
| [API Platform License 해설](https://www.shutterstock.com/help/en/articles/10617007-what-is-the-shutterstock-api-platform-license) | 2025-08-13 | API를 통한 앱 내 콘텐츠 이용권과 raw 파일의 별도 제공 제한을 설명한다. Free 테스트 시작과 상용 API 계획을 안내하지만 우리 AI 용도의 개별 승인을 대신하지 않는다. |
| [API Platform Integration Agreement](https://www.shutterstock.com/developers/api-terms) | 2019-03-26 발효로 표시 | 플랫폼·사용자 라이선스/식별·표시·원본 제공 제한의 계약 근거다. 계약 때 현재 개별 주문서/부속 약정과의 우선순위를 확인한다. |
| [현재 일반 라이선스](https://www.shutterstock.com/license) | 2026-10-05 발효 | 비학습 AI 편집의 예외와 일반 단일 좌석 제한을 확인한다. 일반 개인 구독을 SaaS API 계약으로 대체하지 않는다. |

과거 무료 API를 검색 전용/다운로드 불가로 설명한 자료와 현재 무료 컬렉션의 다운로드 허용은 구별해야 한다. 공개 공식 페이지에서 그 정책의 정확한 변경일은 확인하지 못했다. 현재 Reference와 Pricing은 제한 컬렉션 다운로드 지원에 일치하므로 **무료 계정은 무조건 다운로드 불가**라고 안내하지 않는다. 반대로 Free Test를 받았다는 이유만으로 전체 컬렉션·모든 고객·외부 AI 상업 처리가 승인됐다고 판단하지 않는다. 신청 화면의 실제 제공 조건과 구독 응답을 우선 확인한다.

일반 이미지 구독의 웹사이트 가격을 API 비용으로 옮겨 적지 않는다. 검색·다운로드 한도, 라이선스 1건의 요금/월정액 차감, 동일 사진 재사용/재다운로드, 고객별 재라이선스, 최소 약정과 세금은 견적서에서 확정한다. Free Test만으로 적합한 착용컷이 충분한지도 실제 검색 전 미검증이다.

## 발급 절차와 서로 다른 자격 증명

1. 운영자가 [Shutterstock 계정](https://www.shutterstock.com/)으로 로그인하고 [My Apps](https://www.shutterstock.com/account/developers/apps)에서 앱을 만든다. 웹사이트는 `https://photo-studio.cloby.co`, 설명에는 아래 문의 초안의 자동 검색·비학습 외부 참조 용도를 정확히 기재한다. 개인 프로젝트나 단순 이미지 갤러리로 축소해 신청하지 않는다.
2. 필요하면 무료 API 구독을 선택해 제한 컬렉션에서 기술 검사를 준비한다. API 구독은 웹사이트 이미지 구독과 별개다. 앱에 허용된 API product도 확인한다.
3. 앱의 Consumer Key/Consumer Secret을 안전하게 보관한다. 서버에서 Basic 인증 검색이나 OAuth 발급에 쓰는 앱 자격 증명이다. 현재 연동은 Bearer token으로 검색과 라이선스를 모두 수행하므로 Consumer Secret을 런타임에 추가할 필요는 없다.
4. 앱 상세의 Token → Generate token에서 `licenses.create`, `licenses.view`, `purchases.view`를 포함한 필요한 최소 scope로 Access Token을 발급한다. 한 번 표시되는 토큰은 즉시 안전하게 보관한다. 계정 이메일/비밀번호 변경으로 무효화될 수 있다. Consumer Key만 붙여 넣어 라이선스 발급을 시도하지 않는다.
5. 서버의 `GET /v2/user/subscriptions`로 허용 구독의 ID·라이선스·포맷·요구 metadata를 확인한다. 여러 구독 중 임의 선택을 막기 위해 사용할 Subscription ID를 고정한다. 사진 ID나 라이선스 ID와 다른 값이다.
6. 사용 범위·보관·고객 식별·비학습 외부 추론 계약을 확정한 뒤 아래 서버 설정을 적용한다. 형식 검증이나 API200이 계약 승인을 의미하지 않는다.

| 값 | 의미 | Photo Studio에서의 취급 |
|---|---|---|
| Consumer Key | 앱 식별/Basic 인증의 key, OAuth의 client ID | Token 발급 준비용. 고객 OpenRouter 키와 무관 |
| Consumer Secret | 앱 비밀/Basic 인증 또는 OAuth 교환 | 외부에 노출 금지. 현재 Bearer 기반 런타임에는 불필요 |
| Access Token | 계정·scope·구독에 접근하는 Bearer 비밀 | 서버의 `SHUTTERSTOCK_ACCESS_TOKEN` secret |
| Subscription ID | 라이선스 발급에 사용할 API 구독 | 서버의 `SHUTTERSTOCK_SUBSCRIPTION_ID` |
| Image ID / License ID | 검색 이미지/발급된 이용권의 ID | 작업별 provenance·중복/불확실 결과 처리용. Token 대체 불가 |

[공식 인증 문서](https://www.shutterstock.com/developers/documentation/authentication)는 앱 화면에서의 Token 생성과 OAuth 코드 발급을 모두 설명한다. 앱 폼의 Callback은 공식 Reference 기준 host/path 형식이며 필요하면 `photo-studio.cloby.co`를 사용한다. 현재 고객용 Shutterstock OAuth callback 라우트는 구현됐다고 가정하지 않는다. 서버 전용 발급 토큰을 쓰는 이번 경로에 임의 callback URL을 새로 안내하지 않는다. Referrer는 브라우저 위젯용이며 서버 비밀을 브라우저에 보내기 위한 수단으로 쓰지 않는다.

## 계약에 명시할 사용 범위

현재 일반 라이선스 Part I.2.10은 학습을 금지하면서 비학습 AI 편집/파생물 게시의 예외를 둔다. 그것만으로 자동 참조 조건화·고객별 생성·플랫폼 저장을 허가받았다고 단정하지 않는다. 공급자에게 다음을 문서로 확정받고 계약 버전/승인 범위를 내부 보관한다.

- 상품 분석의 일반 카테고리로 API 검색 후 서버가 자동 선택·라이선스 발급하는 SaaS 흐름. 검색에는 고객 원본 사진·브랜드·자유 지시를 보내지 않음.
- 정식 라이선스 실사 착용컷을 private Cloudflare R2에 보관하고, OpenRouter를 거쳐 명시한 모델/제공자의 **단건 기획 관찰과 이미지 참조 추론**에 전송하는 권한. 학습·fine-tuning·평가/모델 개발에는 쓰지 않음.
- 고객 의류가 주인공인 파생 출력의 다운로드·상업 사용, 해당 사진의 고객별/작업별 라이선스 기준, 재사용·철회·삭제·저장 기간.
- 실제 성인 모델의 release 및 AI 편집/합성 범위. 얼굴을 다른 장면/옷에 재현하는 신원 사용까지 포괄한다고 추정하지 않음.
- 사용자에게 raw 참조 파일을 별도 다운로드/내보내기하지 않는 방식, licensed reference 표시 크기·워터마크/출처 규칙, 공급자 원본과 고객 결과의 구분.
- 고객별 Platform User License와 식별 요건. 현재 가명 OpenRouter 기반 계정/내부 customer ID가 충분한지, 추가 실명·이메일/계약 동의가 필요한지 공급자에게 확인. 임의 개인정보를 만들거나 동의 없이 제공하지 않음.

공개 [API 약관](https://www.shutterstock.com/developers/api-terms)은 preview watermark·Powered by Shutterstock, 플랫폼 사용자 계약, 사용자 식별/권한, raw 파일의 플랫폼 밖 제공 제한 등을 요구한다. [라이선스 API 문서](https://www.shutterstock.com/developers/documentation/licensing-and-downloading)는 `metadata.customer_id`와 `price` 규칙을 설명한다. 비재판매일 때 `price=0`이 가능하다는 설명은 실제 공급자 비용이0이라는 뜻이 아니다. 계약은 이 서비스의 재판매 여부와 사용자 식별 방식을 먼저 확정해야 한다.

## 서버 설정과 비밀 보관

### 무료 컬렉션의 읽기 전용 검색 확인

검색만 확인할 때는 전체 운영 활성화 도구를 사용하지 않는다. 고정된 ignored 파일 `apps/api/.dev.vars`의 기존 내용을 유지하고 `SHUTTERSTOCK_ACCESS_TOKEN=발급받은토큰` 한 줄을 추가한다. 토큰 생성 전이면 `SHUTTERSTOCK_CONSUMER_KEY`와 `SHUTTERSTOCK_CONSUMER_SECRET` 두 값을 대신 설정해 Basic 인증 검색을 할 수 있다. Access Token이 있으면 우선 사용한다. 인증값은 채팅/명령 인자/Git에 붙이지 않는다. 이 단계에서 계약 승인 플래그나 `REFERENCE_SOURCE`를 바꿀 필요는 없다.

```powershell
bun run shutterstock:search
```

이 도구는 후드/셔츠/코트 착용컷의 검색·상세를 GET으로만 조회한다. Bearer token이 있을 때만 구독 정보를 조회하며 Basic 모드에서는 구독/라이선스 권한을 확인한 것으로 표시하지 않는다. 라이선스 발급·다운로드·OpenRouter·운영 DB/설정은 호출하지 않는다. 콘솔에는 집계만 남기고 표본의 공개 출처/워터마크 preview와 반환 metadata는 ignored `.tmp/shutterstock-search-report.json`에 기록한다. 검색 결과/릴리즈 metadata 확인은 AI 사용권 승인이나 실제 생성 품질 검증과 구별한다. HTTP429는 즉시 중단하며 자동 재시도하지 않는다.

2026-11-12 사용자가 로컬에 저장한 Consumer Key/Secret으로 실제 Basic 인증 검색을 확인했다. 현재 production 검색어와 실사/commercial/성인20s/인원1/모델 릴리즈 필터에서 후드261건·셔츠386건·코트376건이 반환됐다. 각 검색의 상위2개 상세만 검사해 메타데이터 통과는 각각1/1/0건이었다. 최초9GET 검사 뒤 거절 사유 계측을 추가한9GET 진단을 수행했으며 합계18GET이다. HTTP 오류나 유료 요청은 없었고 라이선스 발급/정식 원본 다운로드/OpenRouter 호출은0회다. Basic 모드의 구독 권한은 미확인으로 남긴다.

공식 워터마크 미리보기를 브라우저에서 열어 후드 표본의 실제 모델 착용을 육안 확인했다. 모델 릴리즈 metadata 통과가 의류/포즈 적합성을 보장하지는 않는다. 거절된 표본4개는 모두 `girl/boy` 같은 모호한 연령 태그 조건에 걸렸고 코트의 검사 표본2개가 여기에 해당한다. 실제 미성년이라고 판정한 것이 아니며, 현재 보수적 선별의 오탐 가능성을 확인한 것이다. 이번 읽기 검사에서 운영 필터/소스/계약 승인 설정을 바꾸지 않았고 추가 후보 전체의 품질이나 AI 사용권을 검증한 것으로 표시하지 않는다.

### 실제 기획·생성 활성화

운영값은 승인된 계약과 계정에서 얻는다. 샘플 자격 증명·실제 ID·토큰은 Git, CI 출력, 채팅, `.env.example`, 브라우저에 넣지 않는다.

| 설정 | 값/역할 |
|---|---|
| `REFERENCE_SOURCE` | 준비 전 `wikimedia_commons`, 승인 후 `shutterstock` |
| `SHUTTERSTOCK_ACCESS_TOKEN` | Cloudflare Worker secret. 콘솔/URL/log에 출력 금지 |
| `SHUTTERSTOCK_SUBSCRIPTION_ID` | 확인한 API 구독 ID. 서버 설정으로만 사용 |
| `SHUTTERSTOCK_LICENSE` | 승인된 platform 계약에 대해 `platform` |
| `SHUTTERSTOCK_AI_REFERENCE_APPROVED` | 아래 사용 범위가 확정된 뒤에만 `true` |
| `SHUTTERSTOCK_AGREEMENT_VERSION` | 내부 계약/주문서 버전 식별자. 고객 화면에 노출하지 않음 |

기존 production 구성이 생성된 작업 공간에서 토큰을 설정할 때는 대화형 secret 입력을 쓴다. 명령 인자·PowerShell 변수 할당·파이프라인에 실제 토큰을 쓰면 히스토리/로그에 남을 수 있으므로 넣지 않는다.

```powershell
bun run setup:shutterstock
```

도구는 고정된 production 계정/Worker/DB와 기존 암호화 키를 확인하고 Subscription ID·계약 버전·승인된 계약 범위 확인을 받는다. 토큰은 Wrangler의 숨김 프롬프트에 직접 입력하며 도구가 읽거나 파일로 저장하지 않는다. 나머지5개 값은 stdin JSON의 단일 secret bulk로 적용한다. 현재 준비 상태의 Commons 경로는 이 마지막 적용 전까지 유지되며, 적용 후에는 새 배포 없이 Shutterstock를 선택한다. 여섯 값 모두 Worker secret으로 저장해 이후 일반 배포에도 보존한다. 실제 구독/라이선스 권한은 실행 시 다시 검증하며 설정 도구가 구매나 외부 승인을 수행하지 않는다.

`bun run setup:shutterstock --help`는 변경/로그인 없이 사용법을 출력한다. 실제 설정은 로컬 대화형 터미널에서만 가능하다. OpenRouter 연결·세션 전후 보존과 선택적 합성 canary를 확인하고 기존 master secret을 변경 대상으로 삼지 않는다. `.wrangler/production/`과 로컬 `.dev.vars`는 계속 ignored로 유지한다. 이미 토큰을 등록한 경우 직접 갱신하는 명령은 `bunx wrangler secret put SHUTTERSTOCK_ACCESS_TOKEN --config .wrangler/production/api.json`이며 키 값은 인자에 쓰지 않는다.

`SHUTTERSTOCK_AI_REFERENCE_APPROVED=true`는 외부 승인을 자동 취득하는 플래그가 아니다. 승인 근거가 없는 상태에서 켜지 않는다. 실제 참조를 전달하는 기획/생성 모델 양쪽에 비학습 정책과 허용 endpoint를 강제하고, fallback으로 다른 모델/수집 허용 제공자에 넘어가지 않게 한다. ZDR·비학습·stock 사용권은 서로 다른 조건이다.

현재 구현은 기획의 지원되는 `data_collection=deny`, 이미지 생성의 검토된 `openai/gpt-image-2`와 `provider.only=[openai]`/fallback 금지를 사용한다. Images API가 지원하지 않는 data_collection/ZDR 옵션을 보내고 정책이 적용됐다고 주장하지 않는다. 다른 이미지 모델은 stock 참조/파생 개선에서 호출 전에 거부한다. 비학습 기본 정책은 저장이 전혀 없다는 보증과 다르며, 정확한 모델/경유 제공자/보관 조건을 계약에 명시해야 한다.

비용량을 계산할 때는 새 자동 기획마다 최대1건의 stock 라이선스 발급이 있다는 점을 포함한다. 같은 기획의 생성/개선은 private 저장 참조를 재사용하며 새 stock 발급을 하지 않는다. 새 재기획은 새 발급이 될 수 있고 고객별 재사용/수정 허용 범위는 계약에 따라야 한다. 한 작업의 응답 유실은 `outcome_unknown`으로 남기며, 이미 발급한 후 디코딩/저장에 실패한 경우도 사용권 원장을 보존하고 운영자 확인을 요구한다. 실제 stock 비용은 응답에 없으면 미확인으로 남긴다.

## 활성화 전 검증과 중단 조건

1. 가짜 adapter/응답으로 검색 필터·scope·구독·200 내부 오류·라이선스 원장·원본 다운로드 차단·타 계정 격리·재시도 경계를 검사한다. 테스트에서 실제 stock 라이선스/AI 비용을 쓰지 않는다.
2. 운영자가 직접 실행한 읽기 검사로 token/scope/구독/검색 컬렉션·모델 release·실사·성인 조건과 rate limit을 확인한다. 제한 정보는 실제 응답을 우선하며 429를 우회하지 않는다.
3. 필요한 경우 [공식 licensing sandbox](https://www.shutterstock.com/developers/documentation/licensing-and-downloading#licensing-sandbox)에서 계약 응답 처리를 확인한다. Sandbox는 차감도 실제 권리 부여도 하지 않으며 워터마크 preview/샘플을 반환한다. 이를 실사 착용컷의 정식 라이선스로 표시하거나 고객 생성에 쓰지 않는다.
4. 계약 후 운영자의 명시적 테스트 실행으로 정식 라이선스 1건을 발급·저장·출처/이용권·허용된 표시를 확인한다. 그 뒤 사람이 실행한 유료 AI 비교에서 동일 참조 픽셀·구도·옷 보존·주름/그림자 효과를 검증한다. 라이선스 다운로드와 유료 생성은 각각 실제 실행/차감 결과를 기록한다.
5. 발급 요청의 결과가 불명확하면 자동으로 재발급하지 않는다. 상태/이력을 대조한 뒤 복구한다. 오류 응답 원문에 고객/토큰/download URL이 섞여 있을 수 있으므로 로그에 남기지 않는다.

계약/토큰/구독/허용 모델이 없으면 활성화하지 않는다. 검색 실패·모델 release 누락·라이선스 실패·허용 범위 불명확 시 분석을 남기고 유료 기획 전에 중단한다. Shutterstock 모드에서 Commons 환경 사진으로 조용히 대체해 착용컷 검색 성공처럼 보이게 하지 않는다.

## 구현·검증 기록

`a067246`을 commit/push하고 API/Workflow·웹에 배포했다. 최종 타입/린트/포맷/빌드와 단위117/117, local/production desktop/mobile Mock 각10/10, native workerd 합성 OAuth/provider와 공개 운영 smoke가 통과했다. Shutterstock 가짜 API 검사에는 adapter13개와 파이프라인7개가 포함된다. 발급 전 claim/다운로드 전 grant, 동일 참조 픽셀, 알려진 발급 후 실패와 불명확 응답의 구분, 자동 재발급0, 소유권·파생 개선·계약 철회·raw 다운로드 차단을 검증했다.

설정 도구는 --help/도구 타입 검사를 통과했다. 실제 token 입력/secret 설정·Shutterstock 검색/라이선스·유료 AI 생성은 수행하지 않았다. 운영 secret 이름 검사에서 Shutterstock 설정이 없는 상태를 확인했고 현재 Commons 기본을 유지한다. 운영 배포/테스트 전후 실제 인증과 별도 canary가 보존됐으며, 테스트 자료 정리 후 합성 계정0·실제 계정1/연결1/세션2를 확인했다. 기존 CF 리소스·master secret과 고객 사진/작업은 유지했다.

## 영문 문의 초안 — 작성만 했으며 전송하지 않음

To: Shutterstock API partnerships / assigned account manager  
Subject: API platform approval for non-training fashion reference inference

Hello Shutterstock API team,

We operate Photo Studio at https://photo-studio.cloby.co, a clothing photography application. After a customer explicitly starts analysis, our server would search for commercial, real photographic images of consenting adult models wearing garments, automatically select one suitable reference, license it through the API, and store it privately.

We would use the licensed image as visual input to two per-request inference tasks: planning a fashion photograph and generating a new photograph featuring the customer's own garment. The reference guides composition, pose, fabric drape, lighting and contact shadows. Reproducing the reference model's identity is not the default objective. Customer garment evidence remains authoritative.

Inference would run through OpenRouter on specifically approved non-training model/provider endpoints. We do not train, fine-tune, benchmark, evaluate or improve models with the licensed assets or outputs. We would not offer raw reference-file downloads or operate a stock-image gallery. Customers would download their resulting garment photographs for commercial use.

Please confirm the API plan and written license terms covering automatic server-side selection, third-party inference, private R2 retention, model-release/AI alteration scope, customer output rights, asset reuse/redownload, attribution and deletion. Please also specify the platform user agreement and identification requirements. Our current customer accounts use a pseudonymous OpenRouter identity; can this and an internal customer ID satisfy your requirements, or is additional verified identity/contact information required?

Please quote the suitable collection, API request allowance, licensing charges, minimum commitment and any pilot option. We have not enabled this use pending confirmation. We can provide the exact model/provider list and data-handling policy for review.

Thank you.

## 공식 근거

- [Authentication](https://www.shutterstock.com/developers/documentation/authentication), [My Apps](https://www.shutterstock.com/account/developers/apps), [Getting Started](https://www.shutterstock.com/developers/documentation/getting-started).
- [Licensing and Downloading / sandbox / metadata](https://www.shutterstock.com/developers/documentation/licensing-and-downloading), [API Reference](https://api-reference.shutterstock.com/).
- [API Pricing](https://www.shutterstock.com/api/pricing/), [공식 독일어 Pricing](https://www.shutterstock.com/de/api/pricing), [Enterprise 안내](https://www.shutterstock.com/help/en/articles/10617114-what-is-shutterstock-s-enterprise-platform).
- [API Platform License 설명](https://www.shutterstock.com/help/en/articles/10617007-what-is-the-shutterstock-api-platform-license), [API 약관](https://www.shutterstock.com/developers/api-terms), [2026-10-05 일반 라이선스](https://www.shutterstock.com/license).
- [Cloudflare secret bulk의 stdin 입력](https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret-bulk), [OpenAI API 입력의 비학습 기본 정책](https://developers.openai.com/api/docs/guides/your-data), [OpenRouter Images 모델 endpoint](https://openrouter.ai/api/v1/models/openai/gpt-image-2/endpoints).

## 무료 파일럿 구현 — ADR-036

사용자가 무료 컬렉션을 선택했으며 실제 토큰 발급은 보류하고 구현·자동 검증만 요청했다. `SHUTTERSTOCK_COLLECTION=free`는 실제 무료 product 설명·0원 명시 가격·월500 이하 할당과 나머지 platform/만료/format/metadata 조건을 함께 검사한다. 공식 Subscription 스키마의 `price_per_download`는 optional이다. 생략을 무료로 오해하지 않으므로 실제 응답에 없으면 `SHUTTERSTOCK_FREE_SUBSCRIPTION_REQUIRED`로 멈추고 별도 근거를 확인해야 한다. 가짜 응답 통과를 실제 무료 라이선스 검증으로 표시하지 않는다.

```powershell
bun run shutterstock:preflight
bun run setup:shutterstock --free
```

첫 명령은 Access Token이 있을 때만 subscriptions GET1회를 수행한다. 토큰이 없으면 `token_required`와 종료코드2로 끝나며 API 요청은0회다. 응답 원문·토큰·구독ID는 출력하지 않는다. 읽기 검사 보고서는 ignored `.tmp/shutterstock-preflight.json`에 저장된다. 두 번째 명령은 실제 사용 범위/구독을 확인한 운영자의 수동 활성화 도구이며 이번 작업에서는 실행하지 않는다. 공용 AI 키·새 결제·공급자 연락·라이선스 발급·실제 AI 실험도 수행하지 않는다.

검색은 최대2개의 짧은 일반 의류 query를 사용하고 각 검색의12후보를 metadata 순위로 정렬해 상위4개까지 상세 검사한다. 최대14 네트워크 요청 예산을 예약하며 앱 전체 UTC 시간 버킷90 요청으로 제한한다(최대6 신규 검색 작업/시간, 실패 작업도 예약을 환불하지 않는 보수적 정책). 공급자 자체 한도와 별도로 적용하며429는 자동 재시도하지 않는다. 수동 점검 등 앱 밖 요청도 공급자 한도에 포함되므로 여유 예산이 전체429 방지를 보장하지는 않는다.

실제 발급 전에는 위4개 전체 라이브러리 샘플이 무료 API에서403이고 기존 무료 대조군만200인 결과도 유념한다. 전체 라이브러리 사진으로 자동 확대하지 않으며 적합한 무료 사진이 없으면 분석을 보존한 채 기획 전에 오류를 표시한다. 무료여도 외부 AI 입력/고객 출력 권한 확인은 별개이고 기존 승인·버전 guard를 자동 해제하지 않는다.
