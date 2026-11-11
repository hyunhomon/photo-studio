# 시작 안내

1. `01-PRD.md`에서 MVP 목표와 제외 기능을 확인한다.
2. `02-ADR.md`의 **Accepted** 결정을 코드와 일치시킨다.
3. `03-ARCHITECTURE.md`, `04-DATA-MODEL.md`, `05-API-CONTRACT.md`, `06-AI-PIPELINE.md`에서 구현 계약을 확인한다.
4. `09-IMPLEMENTATION-PLAN.md`의 Phase 0부터 개발한다.
5. 처음에는 mock AI로 happy path를 뚫고, 실제 OpenRouter 테스트는 인간이 승인·설정한 계정으로만 진행한다.

## 구현 우선순위

**가장 중요한 1개 시나리오:** OpenRouter 계정 연결(초대 없음, ADR-016) → 의류 사진 → 분석/촬영 콘셉트 → 사용자가 촬영 실행 승인 → 이미지 생성 → 원본/이전 컷 비교 → 필요한 항목과 지시로 동의한 컷 개선 → 다운로드. ADR-019에서 촬영 모드·AI 점수·채택/폐기 피드백을 종료했다.

결과 이미지가 멋있어도 의류의 로고·색상·핏이 달라지면 실패로 간주한다. 빛/초점, 인물의 자연스러움, 의류·주변 소재를 일관되게 만드는 것이 우선이다. 리서치·한 항목씩 검증하는 루프는 `14-REALISM-RESEARCH.md`를 따른다.

## 현재 상태

- [x] 사업 방향, ADR, MVP 범위 합의
- [x] 문서 및 프로젝트 폴더 기본 골격
- [x] Astro/Hono 실제 스캐폴딩 (Phase 0, 로컬 Mock 전용)
- [x] Cloudflare production 리소스 프로비저닝 및 `photo-studio.cloby.co` 배포 (Phase 0 Mock)
- [x] OAuth/파이프라인 구현 및 local/production Mock 검증
- [ ] 사용자 검증

Phase 0 이후 로컬 실행/검증 명령은 루트 `README.md`를 따른다. 인증·업로드·AI 파이프라인은 구현했고 실제 유료 OpenRouter 성공/품질은 사람이 검증해야 한다. 현재 검증 기록은 `09-IMPLEMENTATION-PLAN.md`를 따른다.
