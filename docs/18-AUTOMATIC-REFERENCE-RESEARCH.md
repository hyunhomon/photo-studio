# 자동 촬영 참조 검색 소스 — 2026-11-12

## 채택: Wikimedia Commons의 CC0 촬영 사진

분석 후 서버가 공식 API로 검색하고 사진을 받아 기획·생성에 전달한다. 수동 검색 링크는 이 자동 경로를 대체하지 않는다. 기본 소스는 인증 키 없이 호출할 수 있는 Commons Action API이며, CC0 조건을 개별 파일 metadata에서 확인한다. CC0는 복사·수정·배포 및 상업적 사용을 허용하지만 초상권·상표권까지 허가하지는 않는다. 자동 검색은 배경·광원·물성용 비인물 사진으로 제한하며 인물의 신원이나 상품 디자인의 근거로 삼지 않는다.

공식 근거: [Commons 재사용](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [CC0](https://creativecommons.org/publicdomain/zero/1.0/), [Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo).

API 검색은 파일 namespace6, bitmap, CC-Zero category를 사용한다. 검색 category만으로 허가를 추정하지 않고 `imageinfo.extmetadata.LicenseShortName`과 `LicenseUrl`을 확인한다. 허용한 CC0와 모순되는 제한 표기·불확실한 라이선스는 제외한다. metadata는 HTML이므로 단순 텍스트로 처리하고 HTML로 렌더링하지 않는다. AI·일러스트·작품·인물 관련 표기와 비사진 후보를 제외하고 촬영 metadata를 활용하되, 자동 필터가 모든 내용이나 권리를 확정한다고 주장하지 않는다.

원본은 해상도가 크므로 `iiurlwidth=768&iiurlheight=768`의 bounded thumbnail을 요청한다. CDN 응답 크기는 요청값과 다를 수 있으므로 실제 디코딩 후에도 양변1024px 상한을 검사한다. 다운로드는 허용된 Wikimedia media host의 HTTPS 주소로 한정하고 크기·signature·디코딩 검사를 수행한다. 사진은 private R2에 저장하고 출처 페이지·작가·CC0 URL·선택 시각을 보관한다. 원본 의류·성인 인물 참조와 자동 배경/촬영감 증거의 역할을 구분한다.

[User-Agent 정책](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy/en)에 따라 서비스 이름과 연락 가능한 URL을 명시하고 브라우저를 사칭하지 않는다. [API 이용 정책](https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy), [rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)을 준수하며 429/503의 지연 요구를 우회하지 않는다. 불필요한 반복·대량 수집을 하지 않고 한 작업의 선택 결과를 재사용한다. Wikimedia가 서비스를 보증하거나 제휴했다는 표현은 하지 않는다.

## 실제 공개 검색·다운로드 확인

개발 환경에서 공식 Commons API를 키 없이 호출해 HTTP200 검색 응답과 CC0 metadata를 확인했다. 예시 쿼리 `concrete stairs filetype:bitmap incategory:CC-Zero`는 실제 계단 사진을 반환했다. `File:Stairs with weed.jpg`는 CC0이며 bounding thumbnail767×1024, image/jpeg,616,360bytes, JPEG signature로 다운로드됐다. 원본2643×3529는 기존4MP 제한을 넘으므로 thumbnail 사용이 필요하다.

해당 파일에는 카메라 metadata가 없었다. `File:Concrete stairs in Fiskebäcksvik 1.jpg`는 Panasonic Make/Model, 촬영 노출 정보와 Taken-with category를 포함했다. 촬영 metadata는 유용한 필터지만 위조·누락 가능성이 있어 진짜 촬영이나 권리를 보증하지는 않는다. Photoshop 편집 표기만으로 AI 이미지로 판단해서는 안 된다.

이 확인은 공개 API/다운로드 접근 검증이며 배포된 Cloudflare의 실제 egress나 생성 품질 검증과 다르다. 운영 경로는 `bun run scripts/reference-search-live-smoke.ts`로 별도 합성 계정·reference-only Workflow를 만들어 검사한다. 이 검사는 provider connection을 생성하지 않고 AI attempt0, 라이선스 출처 및 private R2 read를 확인한 뒤 자기 테스트 자료만 삭제한다. 중단 시 ignored state로 `... cleanup`을 재실행한다. 성공 로그 없이 운영 실검색 완료로 표시하지 않는다.

## 비교한 대안

| 소스 | 판단 |
|---|---|
| Openverse | 익명 공식 API에 CC0/사진 필터가 있다. 다만 검색 metadata의 라이선스를 보증하지 않고 원본 호스팅 소스 약관을 따라야 한다. 같은 Commons+CC0 계단 쿼리는 실제 HTTP200이었지만 결과0건이었다. 현재는 직접 Commons로 검색·검증 경로를 단순화한다. |
| Unsplash | 공식 API 약관은 API 이미지의 AI 목적 사용을 별도 Data 경로로 안내한다. 키·승인 조건이 확보되지 않은 현재 기본 소스로 쓰지 않는다. |
| Pexels | API 키가 필요하고 API attribution·서비스 복제·데이터셋/ML 목적 수집 조건을 검토해야 한다. 일부 AI 학습 제한을 모든 개별 추론 사용 금지로 확대해석하지 않지만, 현재 조건이 확인된 CC0 경로를 우선한다. |
| Pixabay | API 키와 플랫폼 약관 조건이 필요하며 AI 생성 업로드도 허용한다. 실제 촬영 증거라는 목표와 권리 확인 경로의 명확성을 위해 기본 소스로 선택하지 않는다. |
| Shutterstock/Adobe Stock | 유료 API/자산 라이선스와 third-party provider의 처리 조건이 필요하다. Shutterstock은 학습하지 않는 AI 편집 기능을 허용하는 조항도 있으므로 모든 stock inference가 금지됐다고 단정하지 않는다. 현재 자격 증명·구매 라이선스 없이 임의 사용하지 않는다. |

공식 출처: [Openverse API](https://api.openverse.org/v1/), [Openverse 조건](https://docs.openverse.org/terms_of_service), [Unsplash API 조건](https://unsplash.com/api-terms), [Pexels API](https://www.pexels.com/api/documentation/), [Pexels API 조건 설명](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions), [Pixabay API](https://pixabay.com/api/docs/), [Pixabay 조건](https://pixabay.com/service/terms/), [Shutterstock license](https://www.shutterstock.com/license?date=2025-04-16&type=standard), [API Platform license](https://www.shutterstock.com/help/en/articles/10617007-what-is-the-shutterstock-api-platform-license), [Adobe Stock 고객 라이선스](https://helpx.adobe.com/in/stock/contributor/get-started/manage-your-account/customer-licensing-terms.html).

참조 검색·이미지 전송 검증과 결과의 실제 촬영 현실감은 별개다. 자동 유료 생성을 하지 않으며, 실제 실사 효과는 같은 상품/인물/프레이밍의 사용자 실행 비교 전 미검증이다.

구현 경로의 추가 실제 디코딩에서, 1024 양방향 요청에도 CDN이 실제1280×853 JPEG를 반환하는 후보를 확인했다. API의 thumbwidth/height만 신뢰하지 않고 실제 디코딩 후에도 상한을 검사한다. 요청은768 양방향으로 낮춰 현재960×640 실제 사진/PNG변환1,640,149bytes를 검증했다. 앞으로도 CDN 크기 정책이 바뀌면 실제1024 상한을 넘는 이미지는 유료 기획 전에 거부한다. 검색/저장 실패·부분 D1 쓰기·커밋 응답 유실·DB 상태 불명확 시 참조 원문과 ledger가 어긋나지 않는 회귀도 포함한다.

## 운영 Cloudflare 실검색 검증

`85b9b01`의 첫 배포 후 reference-only probe는 검색 전 `Missing operation`으로 실패했다. binding 호출과 달리 REST Workflow API의 payload가 JSON 문자열로 전달되는 차이가 원인이었다. `b5754f3`에서 두 형태를 공통 Zod 검증으로 정규화한 뒤 같은 검사를 통과했다. 실패한 probe 자료도 별도 cleanup으로 정리했으며, 이 실패를 검색 성공이나 생성 검증으로 계산하지 않는다.

`f050792`에서 live probe의 합성 계정·전용 표식 검사를 캐시 반환과 작업 변경보다 앞에 두었다. 해당 버전을 production API/Workflow·웹에 배포한 뒤 `bun run scripts/reference-search-live-smoke.ts`가 다시 exit0으로 통과했다. 실제 Commons API 검색→CC0/촬영 metadata 확인→JPEG 다운로드/디코딩→private R2 저장→인증된 이미지 읽기와 출처 보관을 확인했다. probe에는 provider connection이 없었고 AI attempt는 **0회**였다. 자기 합성 계정·사진·진단 이력만 정리했으며 기존 실제 계정 인증은 전후 불변이었다.

이 검사는 외부 검색 공급자와 운영 Cloudflare의 통신을 실제로 확인한 것이다. 기획/생성의 참조 픽셀 전달은 가짜 provider 응답을 사용한 계약·브라우저 검사로 검증하며, 유료 모델 출력의 실사 품질 향상을 증명한 것은 아니다.

최종 format/lint/typecheck/test/build 단위93/93, local/production desktop/mobile Mock 각10/10 및 native workerd OAuth/합성 provider 계약을 통과했다. 운영 전체 검사 후 기존 실제 인증·별도 untouched sentinel·standalone canary 원문 불변을 확인했다. 테스트/검색 probe/canary 자기 자료를 정리한 뒤 합성 계정0, 실제 계정1/연결1/세션2를 읽기 전용 집계로 확인했다. 고객 사진·계정/연결 초기화와 secret 교체는 없었다.
