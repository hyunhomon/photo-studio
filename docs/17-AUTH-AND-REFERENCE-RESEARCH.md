# 인증 원인 조사와 참조 증강 — 2026-11-12

## 인증 소실: 확인된 원인

Cloudflare zone HTTP analytics에서 **2026-11-12 07:34:30 KST (2026-11-11 22:34:30 UTC), POST /auth/logout, HTTP 200**을 확인했다. 같은 초 D1 Query Insights에 소유자 조건의 `DELETE FROM provider_connections WHERE user_id=?`가 있다. 쿼리 바인딩·IP·쿠키·계정 식별자는 가져오거나 출력하지 않았다. 집계는 샘플링되므로 count/rowsWritten을 실제 계정 수로 해석하지 않는다.

이 코드의 HTTP200은 인증과 CSRF 검증을 통과하고 연결·세션 atomic 삭제가 완료됐다는 뜻이다. 당시 배포는 인증 삭제를 수행하지 않았고 production E2E는 합성 계정을 DELETE했으며 로그아웃 버튼을 클릭하지 않았다. 세션 만료는 연결을 삭제하지 않는다. 따라서 원인은 배포나 만료가 아닌 **인증된 명시적 로그아웃 요청**이다. 실제 누가 클릭했는지는 로그에 없고, 사용자의 휴먼 테스트 설명은 이 증거와 일치한다. 과거 lifecycle 기록이 없어 처음에는 집계 소실만 보고했으나 이번 HTTP/SQL 증거로 원인을 좁혔다.

[HTTP analytics 공식 문서](https://developers.cloudflare.com/analytics/graphql-api/tutorials/end-customer-analytics/), [D1 Query Insights](https://developers.cloudflare.com/d1/observability/metrics-analytics/). D1은 바인딩 값을 기록하지 않는다. 민감한 OAuth query string을 남길 수 있는 일반 invocation logging은 활성화하지 않았다.

이후 lifecycle audit는 원인·실사용/합성 구분·변경 개수와 keyed pseudonymous subject를 30일 보관한다. 배포/운영 테스트는 실제 인증의 메모리 전후 비교와 별도 합성 canary의 바이트 단위 불변을 검사한다. 유효한 실사용 키를 테스트용 자격 증명으로 복원하지 않는다. 연결이 없는 계정은 사용자가 직접 OAuth로 재인증한다.

## Pinterest: 가능한 기능과 선행 조건

[공식 OpenAPI](https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.yaml)의 `/v5/search/partner/pins`는 공개 keyword 검색용이지만 제한 beta다. `/v5/search/pins`는 허가된 사용자의 핀 검색이다. [앱 연결](https://developer.pinterest.com/docs/getting-started/connect-app/) 및 [접근 등급](https://developers.pinterest.com/docs/key-concepts/access-tiers/)에 따른 앱 승인/OAuth가 필요하다.

[개발자 지침](https://policy.pinterest.com/en/developer-guidelines)과 [약관](https://developers.pinterest.com/terms/)은 자동 스크래핑·API 데이터 저장·제3자 공유 등을 제한한다. 현재 앱에는 이 사용을 승인받은 Pinterest 자격 증명이 없다. 따라서 자동 검색 결과 다운로드→R2→OpenRouter를 연결 완료로 표시하지 않는다. 향후 자동화에는 해당 기능/API 접근과 저장·외부 이미지 처리에 맞는 승인, 이미지 사용권 확인이 필요하다.

현재 구현은 외부 Pinterest 검색 → 권한 있는 원본 직접 등록 → 참조 사진 기반 기획·생성이다. 검색에는 whitelist의 일반 키워드만 사용하고 자유 지시/상품명/사진은 보내지 않는다. 사용자가 입력한 Pin URL은 출처 기록이며 라이선스 보증이나 자동 수집을 뜻하지 않는다. [Pinterest AI 설명](https://create.pinterest.com/product-features/pinterest-ai/)처럼 플랫폼에 AI 이미지도 있으므로 직접 촬영 여부/원본 출처를 확인해야 한다.

## 현실감 개선의 엔지니어링

[ImageRAG](https://arxiv.org/abs/2502.09411), [IP-Adapter](https://arxiv.org/abs/2308.06721)는 이미지 조건화의 근거이며 현재 폐쇄형 모델의 내부 기능을 구현했다는 주장은 아니다. 검색 결과를 더 붙이는 것만으로 실사가 보장되지 않는다. 원본 의류, 동의된 인물, 촬영감 사진의 역할을 구분하고 관찰을 실제 생성 입력으로 연결해야 한다.

v6는 기존 기획 호출 안에서 구도·빛·초점·표면·한계를 추출한다. 참조를 따르면서 동시에 50mm/f8/고정 거리·심도를 강제하던 충돌을 제거했다. 참조의 국소 명암·접촉 그림자·원단 결의 가시 스케일과 초점 분포를 새 의류/포즈에 맞춰 재구성한다. 얼굴이나 다른 옷은 촬영감 사진에서 복제하지 않으며, 과도한 뷰티 보정/합성 질감도 따르지 않는다. 현재 수정값이 기본값과 참조보다 우선한다.

자동 검증은 Mock adapter/합성 이미지로 참조 순서, 관찰 전달, URL 비전송, 과거 버전 호환, 호출 횟수, 불명확 결과 무재시도를 확인한다. 실제 품질은 같은 상품/성인/참조/카메라/품질로 비교해야 한다. 사용자가 앱에서 명시적으로 실행한 결과를 동일 확대율로 소재 결·주름/봉제/포켓·광원/접촉 그림자·피부 보정감·배경 초점 분포에 따라 비교한다. 자동 테스트를 품질 합격으로 표시하지 않는다.
