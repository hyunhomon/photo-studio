# Photo Studio

의류 이미지를 업로드하면 상품을 분석하고, 시즌별 촬영 콘셉트를 추천한 뒤 AI 모델컷·로케이션컷을 제작하는 웹 MVP.

> **이 저장소는 Codex 개발 인계용 시작 패키지입니다.** 문서, 루트 설정, 빈 워크스페이스 자리만 포함합니다. 아직 실행 가능한 앱은 아니며, 의존성 설치·Astro/Hono 스캐폴딩·DB 마이그레이션은 Codex가 진행해야 합니다.

## 확정 사항

- 웹 우선: Astro + React Islands + Tailwind CSS v4 + Headless UI React
- API: Hono · Zod · Drizzle · Cloudflare Workers
- DB/파일/비동기: D1 · R2 · Cloudflare Workflows
- 리포지토리: Bun 모노레포
- AI: OpenRouter OAuth PKCE BYOK → 상품 분석/촬영 기획/이미지 생성/품질 검수
- 이미지 생성 기본 모델: `openai/gpt-image-2` (환경변수로 교체 가능)
- MVP: 초대 코드 기반 베타, **무과금(서비스 자체 청구 없음)**, 사용자의 OpenRouter 크레딧 소비
- 이미지·비용·사용성 로깅은 MVP 필수
- 정식 출시: 구독 + 추가 크레딧 (MVP 구현 제외)

## Codex로 바로 시작하기

1. ZIP 압축 해제 후 `photo-studio-starter/`로 이동.
2. Codex CLI에서 이 폴더를 작업 디렉터리로 열기.
3. `AGENTS.md`, `docs/01-PRD.md`, `docs/02-ADR.md`, `docs/09-IMPLEMENTATION-PLAN.md`를 읽도록 지시.
4. `prompts/CODEX_START.md`의 프롬프트를 Codex에 전달.
5. **Phase 0부터 순차 스캐폴딩** 후 각 단계마다 테스트 결과 확인.

## 현재 디렉터리 (스캐폴딩 전)

```text
photo-studio-starter/
├── AGENTS.md                  # Codex 상시 규칙
├── README.md                  # 진입점
├── package.json               # Bun 워크스페이스 정의(의존성 없음)
├── .env.example               # 설정 키 가이드, 비밀값 없음
├── .gitignore
├── .editorconfig
├── apps/{web,api}/            # 앱 스캐폴딩 자리
├── packages/{ui,db,schemas,ai}/
├── docs/                      # PRD/ADR/기술설계/API/데이터/테스트
└── prompts/CODEX_START.md     # Codex 첫 요청
```

## 안내

- OpenRouter 연결은 **AI 분석·기획·생성·검수 비용을 고객 계정에 청구**하지만, Cloudflare 인프라 이용료는 프로젝트 운영자가 부담합니다.
- 파일 선택/저장만으로 유료 호출하지 않습니다. `분석 시작`과 `이미지 생성` 버튼에서 각각 과금 주체를 안내하고 사용자 동의를 받습니다.
- 이미지 생성·검수는 원본 의류의 정확성을 보장하지 않으므로 결과에 대한 사용자 검수를 포함합니다.
- 실제 모델 이름, 제공 파라미터, OAuth 흐름 및 SDK 호환성은 개발 시 공식 문서로 재확인합니다.
- 제품 도메인, 계정, 배포 리소스 ID, 실제 키, 초대 코드 등은 아직 미설정 상태입니다.

## 문서 인덱스

| 파일 | 목적 |
|---|---|
| `docs/00-START-HERE.md` | 작업 순서와 우선순위 |
| `docs/01-PRD.md` | 고객 문제·기능 범위·사용자 플로우 |
| `docs/02-ADR.md` | 수용된 기술 결정 / 보류 항목 |
| `docs/03-ARCHITECTURE.md` | 시스템 경계·배포·비동기 처리 |
| `docs/04-DATA-MODEL.md` | Drizzle/D1 설계 초안 |
| `docs/05-API-CONTRACT.md` | Hono API 계약 초안 |
| `docs/06-AI-PIPELINE.md` | 모델 호출·스키마·프롬프트·평가 |
| `docs/07-UI-UX.md` | 페이지·스타일·컴포넌트 규칙 |
| `docs/08-SECURITY-AND-LOGGING.md` | OAuth·키 보호·측정·품질 정책 |
| `docs/09-IMPLEMENTATION-PLAN.md` | 단계·DoD·테스트 |
| `docs/10-DECISIONS-AND-RISKS.md` | Codex가 해결하거나 보고할 미확정 사항 |
| `docs/11-REFERENCES.md` | 공식 문서 링크 |
