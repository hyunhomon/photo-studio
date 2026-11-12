# 모델 착용컷 자동 참조 소스 조사 — 2026-11-12

## 결론과 현재 상태

사용자가 원하는 참조는 빈 공간이 아니라 사람이 옷을 입었을 때의 포즈·구도·피부의 국소 명암·원단 처짐·주름·접촉 그림자가 함께 보이는 실제 촬영 사진이다. ADR-034의 Commons 환경 사진은 보조 증거이며 이 목적을 충분히 대체하지 못한다.

**우선 검토 후보는 Shutterstock API, 다음은 Getty Images의 Creative API 계약이다.** 공개 문서에서 비학습 AI 편집의 허용 근거와 상업 사진/API를 확인했다. 다만 이 서비스의 자동 참조 추론·다중 고객·외부 모델 처리까지 현재 계약으로 승인됐다는 뜻은 아니다. Pexels는 무료 후보로 남기되 단건 추론을 학습과 혼동해서 금지로 단정하지 않는다.

이번 작업은 공식 약관/API 조사다. 개발자 계정 생성·구매·판매자 문의·사진 다운로드·새 공급자 연동·유료 AI 호출은 하지 않았다. 실제 API 키를 사용한 검색 결과와 출력 품질도 미검증이다. 운영에는 기존 Commons 환경 검색이 유지된다.

## 소스별 판단

| 소스 | 착용컷 검색과 권리 근거 | 외부 AI 참조 및 서비스 적용 판단 |
|---|---|---|
| **Shutterstock — 조건부 1순위** | 공식 이미지 검색 API의 `image_type=photo`, `license=commercial`, `people_model_released=true`, 성인 연령·인원·방향 필터와 라이선스/다운로드 API가 있다. | 현재 라이선스 Part I.2.10은 학습을 금지하고 비학습 AI 편집·파생물 게시를 허용한다. 포즈/구도 조건화로 새 상품컷을 만드는 사용, 모델 초상 변형 범위, 플랫폼 고객별 권한을 API 계약에 명시해야 한다. 일반 개인 구독으로 다중 고객 서비스를 운영하면 안 된다. |
| **Getty Images / iStock — 기업 계약 후보** | 공식 API가 Creative 검색·라이선스 다운로드를 지원한다. Editorial과 구분해야 한다. | 2026-04 EULA §3.11은 허용된 Creative 편집과 내부 검색/정리에 AI 예외를 둔다. 모델 릴리즈가 AI 용도 동의까지 보증하지는 않는다고 명시한다. 외부 참조 추론과 고객별 상업 출력은 계약 확인 대상이다. |
| **Pexels — 무료 승인 후보** | 공식 검색 API와 패션 인물 사진, 세로 프레임 검색이 있다. AI 생성물 업로드를 금지하지만 모든 이미지의 실사 여부를 보증하는 것은 아니다. | 최신 API 해설의 금지는 대규모 수집·훈련·파인튜닝·평가/모델 개발에 초점이다. 단건 참조 추론을 모두 금지했다고 해석하지 않는다. 자동 저장/외부 AI 전송 승인 범위와 개별 인물 권한을 확인할 근거가 추가로 필요하다. Photo 응답에 모델 릴리즈 증명이 없다. |
| **Adobe Stock — 별도 승인 후보** | 검색의 `has_releases=true`, 라이선스 API와 키/인증 흐름이 있다. | 2026-01-16 약관의 모델 생성/훈련/테스트/개선 금지를 모든 추론 금지로 확대하지 않는다. 하지만 외부 참조 생성과 SaaS 고객 사용권까지 허용됐다고 공개 문서만으로 확정할 수 없다. API 접근과 해당 이용 범위 승인 필요. |
| **DepositPhotos — 맞춤 API 계약 후보** | 공식 API Suite가 인원·시점·계절 등 검색, white-label 라이브러리와 AI 참조 생성의 결합을 제공한다. | 자체 AI 제품의 참조 생성 제공이 OpenRouter 같은 외부 모델 사용 허가와 같지는 않다. 일반 개인 라이선스의 양도/재허가 제한을 기업/API 계약으로 해결해야 하며 외부 추론 권한은 미확인이다. |
| **Unsplash — 일반 API 채택 보류** | 공식 검색 API와 인물 사진이 있다. | API §12가 AI 목적을 별도 Data 경로로 안내한다. 일반 API의 hotlink/download tracking 조건은 현재 private R2 복사 설계와도 다르다. 무료 API 전체의 모델 릴리즈를 보증하지 않으며 별도 데이터 계약이 필요하다. |
| **Pixabay — 승인·인물 권리 미확인** | 공식 API에 사진/패션/인물/세로 검색이 있다. | API 접근이 개별 인물의 상업/AI 사용 동의를 증명하지 않는다. 자동수집 목적 제한, 24시간 응답 캐시와 영구 hotlink 금지 등을 함께 따라야 한다. AI 업로드도 있어 실사 후보 검증이 필요하다. |
| **Magnific / 구 Freepik — 기본 약관으로 제외** | stock 검색/다운로드 API와 별도 AI 생성 API가 있다. | 2026-11 일반 약관 §8.1.7은 stock 콘텐츠의 AI 목적 사용을 제한한다. 자체 AI 도구 제공과 외부 AI 입력 권한을 동일시하지 않는다. 별도 예외 계약 없이 채택하지 않는다. |

### Shutterstock에서 먼저 확인할 계약 항목

현재 일반 라이선스의 AI 편집 예외는 유력한 근거지만 API Platform 계약을 대체하지 않는다. 공개 API 약관에는 preview watermark/출처 표시, 플랫폼 사용자 라이선스, 사용자별 라이선스 연결/식별, raw 파일의 플랫폼 밖 제공 제한 등이 있다. 공급자와 협의할 구체 용도는 다음과 같다.

- 상품 분석 후 자동 검색·후보 선택·정식 라이선스 발급·private 서버 저장.
- 라이선스된 실사 착용컷을 OpenRouter의 특정 비학습 모델에 보내 포즈·구도·직물·그림자 관찰 및 이미지 조건화.
- 고객 의류가 주인공인 파생 상품컷의 고객별 상업 사용. 참조 원본 파일 자체의 판매/다운로드는 제공하지 않음.
- 모델 얼굴의 동일인 재현을 기본 목표로 삼지 않으며, 필요한 경우 별도의 초상/AI 변형 권한 범위를 명시.
- 허용된 저장 기간·철회·재다운로드·중복 사용·출처 표시·원본 미리보기와 비용 부담 주체.

이 조건을 충족하는 API 계약/키/다운로드 라이선스가 있어야 활성화할 수 있다. 현재 Photo Studio의 OpenRouter 로그인은 stock 구매나 별도 플랫폼 이용자 식별 의무를 충족한다고 볼 수 없으므로 계약 설계 때 함께 해결한다. 가격은 공개 개인 구독을 API 서비스 비용으로 추정하지 않고 해당 사용량/계약 기준으로 확인한다.

## 무료/패션 전용 데이터셋을 바로 쓰지 않는 이유

| 후보 | 확인 결과 |
|---|---|
| Commons 인물 CC0 / Openverse | 저작권 공개·수정 가능 필터와 광고/초상/외부 AI 사용 동의는 별개다. Commons의 업로드 동의는 포괄적 모델 릴리즈가 아니며 Openverse도 원본 호스트 조건과 권리를 독립 확인하도록 한다. 환경 검색의 인물 제외 필터만 없애면 해결되지 않는다. |
| Burst by Shopify | 패션 사진과 상업 수정 허용은 있지만 공개 공식 keyword API를 확인하지 못했다. 약관은 privacy/publicity 권리를 보증하지 않는다. 별도 계약 없이 스크래핑으로 연결하지 않는다. |
| DeepFashion / ModaNet / VITON-HD | 비상업 연구용 조건 또는 CC BY-NC가 있어 현재 상업 서비스의 참조 사진 권한으로 쓸 수 없다. |
| Fashionpedia | CC BY 표시는 annotation/ontology 등에 적용된다. 이미지 저작권을 소유하지 않으며 원 소스별 조건을 따르라고 명시한다. |
| 박물관 Open Access | 일부 공개 API/CC0 이미지가 있어도 현대 쇼핑몰 모델 착용컷의 기본 공급원으로 적합하지 않다. |
| Amazon/eBay 상품 API | 제휴/상품 판매 목적의 API 이용권은 타사 생성 서비스의 이미지 재목적화 권한과 다르다. 별도 허가 없이 채택하지 않는다. |

현재 조사한 무료 후보 중 목표 사진·공식 자동 API·외부 추론·상업적 고객 사용·모델 권리까지 모두 확인된 소스는 없다. 이는 모든 무료 사진의 단건 AI 추론이 금지된다는 결론은 아니다.

## 연동 시 바꿀 촬영 참조 설계

1. 상품 분석의 카테고리·핏·원단/두께 추정과 사용자가 선택한 프레이밍·카메라 각도에서 일반 검색 조건을 만든다. 브랜드/개인정보/고객 사진을 검색 공급자에 보내지 않는다.
2. 성인·실사·상업용·모델 릴리즈 및 계약상 AI 권한이 확인된 사진만 선택한다. 단순 얼굴 사진보다 옷의 접힘과 몸/바닥/좌석의 접촉이 보이는 착용컷을 우선한다. 공급자 필터 결과를 실제 내용 검증으로 대신하지 않는다.
3. 촬영 참조에서는 자세·카메라 거리/높이·피사체 크기·부분 가림·주름 방향·빛의 방향/부드러움·접촉 그림자·피부 국소 명암을 관찰해 기획의 해당 필드에 연결한다.
4. 생성에는 관찰 문장뿐 아니라 **정식 라이선스를 받은 동일 참조 픽셀**을 전달한다. 원본 의류는 색/로고/패턴/봉제/포켓 구조의 최우선 근거다. 참조 옷의 디자인이나 모델 신원을 고객 의류/인물 대신 복제하지 않는다. 사용자가 수정한 구도와 지시를 유지한다.
5. asset/license ID·릴리즈/사용 범위·약관 버전·허용 모델·만료/철회·검색과 선택 근거를 기록한다. 현재 CC0 메타데이터 구조를 유료 stock에 그대로 적용하지 않는다. 라이선스 없는 검색 thumbnail을 먼저 유료 AI에 보내는 경로는 만들지 않는다.
6. 학습 금지 조건은 planning과 generation 양쪽, 재시도/fallback에도 강제한다. 현재 코드는 `allow_fallbacks=false`는 보내지만 비학습 정책을 요청 단위로 강제하는 필드는 없으므로 stock 연동 전에 보완해야 한다. OpenRouter의 data collection/ZDR 설정과 실제 endpoint·모델 약관을 함께 확인한다. ZDR와 비학습은 같은 개념이 아니며 특정 플래그 하나로 stock 사용권이 생기지는 않는다.

자동 검색과 함께 이용 가능한 별도 경로는 촬영자/모델과 AI 추론·서버 보관·고객별 상업 출력 권리를 확보한 착용컷 라이브러리다. 이를 내부에서 자동 검색하면 사용자가 매번 사진을 찾아 올릴 필요가 없다. 이는 현재 확보된 사진 풀이 아니라 계약을 통해 만들 수 있는 대안이다.

## 공식 근거

- Shutterstock: [현재 라이선스](https://www.shutterstock.com/license), [API Reference](https://api-reference.shutterstock.com/), [API 약관](https://www.shutterstock.com/developers/api-terms), [API Platform License](https://www.shutterstock.com/help/en/articles/10617007-what-is-the-shutterstock-api-platform-license), [라이선스/다운로드](https://www.shutterstock.com/developers/documentation/licensing-and-downloading).
- Getty: [2026-04 EULA](https://www.gettyimages.com/eula), [외부 AI 편집 FAQ](https://www.gettyimages.co.uk/ai/generation/faqs), [API](https://www.gettyimages.co.uk/api).
- Pexels: [API](https://www.pexels.com/api/documentation/), [2026-10-28 API 조건 설명](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions), [약관](https://www.pexels.com/terms-of-service/), [상업 사용](https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project).
- Adobe: [Stock 약관](https://www.adobe.com/go/stockterms), [Search API](https://developer.adobe.com/stock/docs/api/11-search-reference), [인증/라이선스 흐름](https://developer.adobe.com/stock/docs/getting-started/02-register-app).
- DepositPhotos: [API Suite](https://depositphotos.com/api-suite.html), [AI 참조 API 설명](https://depositphotos.com/faq/ai/article/36359461979154.html), [라이선스](https://depositphotos.com/license.html).
- Unsplash: [API 약관](https://unsplash.com/api-terms), [릴리즈/상표](https://help.unsplash.com/en/articles/2612329-releases-and-trademarks), [Dataset 조건](https://github.com/unsplash/datasets/blob/master/TERMS.md).
- Pixabay: [API](https://pixabay.com/api/docs/), [약관](https://pixabay.com/service/terms/).
- Magnific: [2026-11 일반 약관](https://www.magnific.com/legal/terms-of-use), [API 약관](https://www.magnific.com/legal/api-services), [Stock/AI API](https://www.freepik.com/api).
- 공개 이미지/패션 데이터: [Commons 인물](https://commons.wikimedia.org/wiki/Commons:Photographs_of_identifiable_people), [Openverse 조건](https://docs.openverse.org/terms_of_service), [Burst 조건](https://www.shopify.com/stock-photos/legal/terms), [DeepFashion 계약](https://mmlab.ie.cuhk.edu.hk/projects/DeepFashion/DeepFashionAgreement.pdf), [ModaNet](https://github.com/eBay/modanet), [VITON-HD](https://github.com/shadow2496/VITON-HD), [Fashionpedia 이미지 조건](https://fashionpedia.github.io/home/data_license.html), [Amazon 제휴 정책](https://affiliate-program.amazon.com/help/operating/policies), [eBay API 계약](https://www.developer.ebay.com/join/api-license-agreement).
- OpenRouter: [Provider routing 공식 소스](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx), [비학습과 ZDR 구분](https://openrouter.ai/blog/insights/zero-data-retention/).
