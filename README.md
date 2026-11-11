# Photo Studio

의류 사진 → 상품 분석 → 촬영 기획 수정·승인 → 이미지 생성 → 원본/이전 컷 비교 → 지시 기반 컷 개선 → 다운로드를 연결하는 웹 MVP입니다. 초대 코드 없이 OpenRouter OAuth로 시작합니다. 빛과 초점의 일관성, 자연스러운 성인 인물, 의류와 주변 소재 표현을 우선합니다(ADR-019).

Astro + React Islands, Tailwind CSS v4, Headless UI로 직접 제작한 스튜디오 UI에 Pretendard와 Paperlogy를 자체 호스팅합니다. Hono API Worker, Drizzle/D1, private R2, Cloudflare Workflows를 사용합니다. 서비스 자체 결제·구독·크레딧, 팀·배치·모델 학습 기능은 없습니다.

`/studio`에서 상품을 바로 등록합니다. 프로젝트 생성 단계와 프로젝트 테이블은 제거했습니다(ADR-022). 좌측 사이드바는 최근 상품/검색, 중앙 작업대는 원본·결과 비교, 오른쪽 inspector는 기획·상품 이해·촬영 콘셉트입니다. 작은 화면에서는 메뉴와 패널 탐색을 제공합니다. 인증 확인은 skeleton, 실행 중 작업은 중앙 이미지 영역의 명확한 대기 상태로 표시하며 가짜 진행률을 만들지 않습니다.

## 실행

Node 24 LTS(최소 22.23.4), Bun 1.3.14 이상이 필요합니다.

```powershell
bun install --frozen-lockfile
bun run dev
```

웹은 [localhost:4321](http://localhost:4321), API는 [localhost:8787/health](http://localhost:8787/health)입니다. API 개발 서버는 ignored `.dev.vars`의 암호화 키를 처음에 생성하고 로컬 D1 migrations를 적용합니다. 별도 OpenRouter 운영자 키나 원격 Cloudflare 로그인이 필요하지 않습니다.

`/studio`에서 **로컬 Mock 스튜디오 열기** → 의류 사진 1–3장과 선택적 레퍼런스를 미리보기로 확인·등록 → 비용 안내 동의 후 분석 → 분석/콘셉트 수정·승인 → 별도 동의 후 생성 → 비교·컷 개선·다운로드 순서로 실행합니다. Mock 분석/기획은 합성 fixture이고 Mock 생성 이미지는 원본 복사입니다. 외부 AI를 호출하지 않으며 실제 비용이나 품질을 측정한 결과가 아닙니다. AI 점수·채택/폐기 피드백과 스튜디오/가상 로케이션 모드 선택은 제거했습니다.

JPEG/PNG/WebP, 사진당 10MB·4MP·최대 변 4096px, 상품당 의류 원본 3장과 선택적 인물/촬영감 참조 각 1장을 지원합니다. 선택할 때부터 썸네일로 사진·순서·삭제를 확인하며, 첫 의류 사진이 기본 비교 원본입니다. 실제 디코딩 후 PNG로 정규화합니다. 재생성의 이전 컷을 포함한 선택 참조 전체는 최대 6장·12MB 이하여야 합니다. 분석에는 의류 원본만 사용하며 분석한 원본을 바꾸려면 새 상품으로 등록합니다. 인물/촬영감 참조는 처음 상품 등록에 함께 넣거나 작업 중이 아닐 때 추가·삭제할 수 있습니다. 촬영감 참조를 기획에 사용하면 같은 planning 호출이 이미지에서 조명·무드·구도 등을 관찰해 `referenceNotes`를 작성합니다. 이때 별도 추출 호출은 만들지 않습니다. 기획에 연결된 참조를 생성 창에서 확인·선택하고 별도 비용 동의로 함께 전달합니다. 로고·원단의 근거를 위해 충분한 해상도와 디테일 사진을 권장합니다.

## 검증

```powershell
bun run check
bun run test:local
bun run test:oauth
bun run test:photography
bunx playwright install chromium
bun run test:e2e
```

`check`는 format/lint/typecheck/unit/build를 실행합니다. `test:local`은 격리된 workerd에서 D1/R2/Workflow binding을 확인합니다. `test:oauth`는 실제 workerd native HTTP와 로컬 합성 provider로 초대 없는 OAuth 콜백·키 상태·모델 목록·AI 어댑터·암호화·세션·재사용 거부·redirect 차단을 확인합니다. `test:photography`는 합성 촬영 지시/참조 역할 6종과 버전·해시·근사 심도를 ignored `.tmp/photography-benchmark/manifest.json`으로 생성하며 AI 호출/품질 평가는 하지 않습니다. `test:e2e`는 desktop/mobile에서 의류/인물/촬영감 업로드·사용 선택·분석·생성·원본/이전 컷 비교·개선 지시·다운로드·내보내기·삭제까지 실제 Mock Workflow를 검증합니다. 유료 테스트는 자동 실행하지 않습니다.

## production

[photo-studio.cloby.co](https://photo-studio.cloby.co) 하나의 production 환경만 사용합니다. 웹은 Custom Domain, API는 같은 origin의 `/health*`, `/auth/*`, `/api/*` Worker routes입니다. 공개 bucket이나 `workers.dev`는 사용하지 않습니다.

```powershell
bun run deploy
bun run test:production
bun run test:production:e2e
```

배포는 Cloudflare 로그인과 해당 존 권한이 필요합니다. 기존 D1/R2/Workflow를 재사용합니다. ADR-022의 프로젝트 제거 migration은 기존 studio 데이터를 초기화하므로 일반 additive migration과 구분합니다. 사용자 요청의 운영 초기화는 계정·연결·세션을 포함한 앱 DB와 private R2 데이터를 비우되 Cloudflare 리소스·도메인·AES master secret은 유지하는 범위입니다. 완료 여부와 검증은 구현 계획의 릴리스 기록을 따릅니다. 초기화 후에는 OpenRouter로 다시 연결해야 합니다. 초대를 생성하거나 검사하지 않습니다. 계정·존·DB 식별자와 secret 백업은 ignored `.wrangler/production/`에만 저장합니다. 자세한 복구·검증 방법은 [배포 가이드](docs/12-DEPLOYMENT.md)를 따릅니다.

`test:production`은 읽기 전용 공개 UI/보안 설정 검사입니다. `test:production:e2e`는 관리자 권한으로 임시 **합성 Mock 계정**을 만든 뒤 배포된 D1/R2/Workflow와 브라우저 전체 흐름 및 다른 사용자 접근 차단을 확인하고 계정·사진을 삭제합니다. production HTTP 테스트 로그인 우회 경로는 없습니다. Cloudflare 인프라 사용량은 발생하지만 유료 AI를 호출하지 않습니다.

## OpenRouter 및 비용

사용자가 OpenRouter OAuth PKCE S256으로 직접 연결합니다. 서버가 교환한 사용자별 키를 AES-GCM으로 암호화하며 브라우저에 반환하지 않습니다. **공용 운영자 추론 키는 설정하지 않습니다.** 실제 사용에는 해당 사용자 OpenRouter 계정의 크레딧이 필요합니다.

기본 모델은 분석/기획 `google/gemini-2.5-flash-lite`, 이미지 `openai/gpt-image-2`이며 API 환경 변수로 변경할 수 있습니다. 실행 전 현재 모델 capability와 실제 참조 수를 확인합니다. 사진 저장만으로 AI가 실행되지 않으며 분석/기획과 이미지 생성 각각 명시적 비용 동의를 받습니다. 이미지 생성 뒤 유료 AI 평가를 호출하지 않습니다. 과거 평가 설정/테이블은 이력 호환을 위해 보존하며, ADR-022의 사용자 요청 일회성 서비스 초기화는 별도 예외입니다.

각 호출의 모델·단계·프롬프트 버전·지연·사용량·실제 비용, 촬영 프로토콜 버전·개선 항목/지시·이전 컷 연결을 비공개 저장합니다. 비용이 제공되지 않으면 미확인으로 남기며 추정이나 Mock 0달러와 혼합하지 않습니다. 불확실한 유료 응답은 자동 재전송하지 않습니다. `generation_attempts`의 unique(job,stage) 원장과 Workflow retry=0으로 재실행을 막습니다.

초기화 전 이력에서 실제 OAuth·분석/기획 및 기존 유료 생성 5건, photo-v1 개선 1건, photo-v2 신규 생성 1건이 성공했습니다. 기존 점수의 realism=0.9 편중은 실측 품질로 해석하지 않습니다. 사용자는 v1의 일부 개선을 느꼈지만 v2에서도 얼굴/표정/피부의 AI 인상이 남는다고 확인했습니다. 현재 `studio-v7-product-title` / `photo-v3-reference`는 인물 사진과 촬영감 사진을 별도 시각 참조로 전달합니다. 상품 화면 ‘촬영 참조’에 권한 있는 사진을 등록하고 생성 창에서 사용할 사진을 선택·외부 처리와 비용에 동의합니다. 인물은 생김새, 촬영감은 톤/명암/선예도/질감의 기준이며 의류 원본이 우선입니다. 업로드만으로 AI는 실행되지 않고 웹 얼굴 자동 수집은 없습니다. v3 참조 기반 품질 효과는 실제 사용자 실행 전까지 미검증입니다. [리서치와 검증 루프](docs/14-REALISM-RESEARCH.md), [실제 계정 검증 절차](docs/13-BETA-OPERATIONS.md)를 확인하세요.

상품 삭제 시 관련 원본·참조·결과·기획·작업 기록을 삭제하며 계정 삭제는 키와 모든 세션도 삭제합니다. 삭제 중 늦은 저장을 정리하기 위한 비공개 경로 tombstone은 24시간 보관합니다. `/studio/usage`는 내 기록만 집계하고 `/studio/settings`에서 JSON 내보내기·연결 해제·계정 삭제를 제공합니다. 이미지·프롬프트·키·개인 식별자를 소스나 console/CI에 기록하지 않습니다.

## 구조

```text
apps/web          Astro 페이지 / React Studio Islands / 자체 UI와 글꼴
apps/api          인증 / 권한 / 업로드 / durable AI pipeline / 운영 API
packages/ui       Tailwind tokens / Button / Headless UI Modal·Select
packages/db       Drizzle schema / versioned D1 migrations
packages/schemas  Zod 계약 / 안전한 클라이언트 DTO
packages/ai       OpenRouter·Mock 어댑터 / 버전별 프롬프트 / capability 검사
scripts           로컬·production 배포 및 검증
tests/e2e         같은 시나리오의 local·production Mock 브라우저 검사
```

확정 결정은 [ADR](docs/02-ADR.md), 범위는 [PRD](docs/01-PRD.md), 실제 검증 상태는 [구현 계획](docs/09-IMPLEMENTATION-PLAN.md)에 기록합니다.
