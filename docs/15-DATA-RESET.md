# 서비스 데이터 초기화

ADR-022의 프로젝트 제거에 맞춘 일회성 초기화다. 사용자 요청은 기존 서비스 데이터 전체 삭제를 포함한다. 운영자만 로컬에서 실행하며 공개 API나 웹 관리 기능은 추가하지 않는다.

```powershell
# 읽기 전용: 연결 대상 검증, 고정 테이블별 건수·R2 객체 수·활성 작업 수 확인
bun run scripts/reset-production-data.ts

# 위 결과와 사용자 승인 범위를 확인한 뒤 실제 초기화
bun run scripts/reset-production-data.ts --execute --confirm-photo-studio-reset
```

운영 계정·도메인·Worker·D1·R2·Workflow는 `infra/production.json`과 무시된 `.wrangler/production/` 설정 및 실제 Cloudflare 리소스를 교차 확인한다. 다른 대상을 인자로 지정할 수 없다. Wrangler의 현재 OAuth 토큰은 메모리에서만 사용한다. 출력은 집계 건수와 고정 상태만 포함하며 이미지, 사용자/리소스 식별자, 객체 경로, 키, SQL 결과 본문을 출력하지 않는다.

실행은 기존 사용자를 삭제 상태로 바꾸고 세션·미완료 OAuth를 만료시키며 대기/진행 작업을 취소한다. 해당 서비스 Workflow의 활성 인스턴스만 종료하고 종료를 확인한 뒤, 해당 서비스의 비공개 R2 버킷 안에서 개별 객체를 페이지 단위로 조회·삭제한다. Workflow 종료나 객체 목록 검증이 실패하면 행 삭제를 진행하지 않는다. 이미 시작된 외부 제공자의 청구를 취소하는 기능은 아니다. AI 호출을 새로 수행하지 않는다.

그 후 고정 허용 목록의 스튜디오 데이터·사용자·암호화된 OpenRouter 연결·세션·초대 코드·운영 이벤트·정리 큐를 지운다. 다시 사용하려면 OpenRouter 연결이 필요하다. D1 스키마와 마이그레이션 원장, Cloudflare Worker/D1/R2/Workflow/DNS 리소스, 암호화 마스터 Secret은 유지한다. 종료된 Workflow의 Cloudflare 실행 기록도 유지한다. 마지막에 모든 대상 행/객체가 0이고 외래키 오류가 없으며 스키마/원장이 동일한지 확인한다. 동시 접속으로 새 데이터가 들어오면 성공으로 표시하지 않으며 읽기 전용 확인 후 재실행한다.

`0009_hesitant_maelstrom.sql`은 별도로 스튜디오 데이터와 기존 프로젝트/프리셋을 초기화하고 프로젝트 없는 상품 스키마로 전환한다. 계정·연결은 마이그레이션 자체에서 지우지 않는다. **R2 정리·활성 Workflow 종료를 포함하는 위 초기화를 먼저 수행하고 마이그레이션을 적용**하면 옛 객체가 고아로 남지 않는다. 배포 시 연결 계정까지 비우는 전체 초기화와 스키마 마이그레이션은 구분해서 수행한다.

공식 API 계약: [R2 목록](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list/), [R2 개별 삭제](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/delete/), [Workflow 목록](https://developers.cloudflare.com/api/resources/workflows/subresources/instances/methods/list/), [Workflow 종료](https://developers.cloudflare.com/api/resources/workflows/subresources/instances/subresources/status/methods/edit/).
