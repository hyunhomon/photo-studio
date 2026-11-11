# 시스템 아키텍처 — 상품 중심 작업 공간

ADR-022가 프로젝트 컨테이너·프로젝트별 탐색을 대체한다. 기술 스택과 BYOK/과금 보호는 유지한다.

```text
Browser: Astro + React Islands / Tailwind v4 / Headless UI
  /studio: 의류 여러 장 + 선택적 참조의 미리보기/상품 등록
  sidebar: owner 상품 요약/검색
  /studio/products/:id: 중앙 원본/결과 + 오른쪽 기획 inspector
       ↓ credentials / explicit Origin + CSRF
Hono API Worker
  OAuth PKCE + separate app session + owner scope
  direct product / private media / plan / result / usage routes
  Drizzle + D1 / private R2 / AES-GCM user key resolver
       ↓ job ID only
Cloudflare Workflows
  analyze garment images → plan (+ selected consented look image)
  human plan approval + separate charge consent → generate 1 image
       ↓
  R2 result / D1 attempts + actual or unknown cost → human comparison
```

## 데이터 경계

- products는 user_id에 직접 속한다. project_id와 projects 테이블은 없다. 목록은 상품 요약과 첫 의류 썸네일만 반환하며 전체 분석/참조/결과 목록을 탐색 요청에 싣지 않는다.
- assets는 상품·owner에 속한다. input, person_reference, look_reference, generated 용도를 분리한다. 첫 업로드 의류가 비교 기준이 되도록 생성 순서를 안정적으로 보관한다.
- 상품 분석에는 의류 원본만 사용한다. 선택한 촬영감 참조는 기존 planning 요청의 시각 입력이다. 별도 AI 추출 단계나 업로드 자동 호출은 없다.
- 기획에는 look_reference_id와 관찰 요약 referenceNotes를 저장한다. 생성 때는 현재 선택·외부 처리 동의한 참조만 전송하며 저장된 ID를 서버가 몰래 추가하지 않는다.
- 촬영 기획 수정/원본·이전 컷 선택은 중앙 캔버스를 교체하지 않는다. 비동기 상태는 실제 job/stage에 연결하고 완료 전 가짜 결과를 표시하지 않는다.

## 작업과 과금 경계

- PlanProduct: 파일 저장 → 사용자의 분석/기획·참조 처리 동의 → garment analysis 1회 + planning 1회. reuseAnalysis는 저장된 분석을 고정해 planning만 1회 실행한다.
- GenerateShot: 승인된 콘셉트 + 별도 이미지 비용/참조 동의 → Images API 1회 → 결과 저장 → 수동 원본/이전 비교. AI 평가 단계는 없다.
- planner가 본 참조는 PlanDto에 연결된다. UI에서 같은 사진을 생성 참조로 확인·선택하며 명시적으로 제외할 수 있다. 삭제된/타인/다른 용도의 ID는 전송하지 않는다.
- unique(user,idempotency) 요청 및 unique(job,stage) 선점 원장이 중복 과금을 막는다. 유료 step retry는 0이다. outcome_unknown은 재전송하지 않고 사용자 확인으로 남긴다.
- 상태는 queued/running/completed/needs_review/failed/outcome_unknown/cancelled다. 늦은 저장은 active product/user/job 조건과 삭제 tombstone으로 차단/정리한다.

## 운영/로컬

production은 https://photo-studio.cloby.co 한 환경이다. web Custom Domain과 동일 origin API/health/auth Worker routes, DB/ASSETS/STUDIO_WORKFLOW 바인딩을 사용한다. 공개 bucket과 workers.dev는 사용하지 않는다. local은 localhost:4321/8787, 명시적 CORS와 실제 workerd/D1/R2/Mock Workflow로 검증한다.

ADR-022의 일회성 초기화는 기존 운영 DB/auth/media를 제거하는 사용자 승인 작업이며 통상 배포와 구분한다. Cloudflare 리소스/도메인/master secret은 유지하고 실행·검증 상태는 구현 계획에 기록한다. 새 실제 유료 품질 검증은 인간의 UI 동의로만 수행한다.
