# UI/UX Specification

## 스타일 방향

- 패션 에디토리얼 + 전문 촬영 툴 느낌. 기능 밀도를 유지하되 복잡한 대시보드 느낌 지양.
- 기본 테마: **다크 전용**. 검정/차콜 배경, 밝은 텍스트, 형광 초록 primary `#00F59B`. 사용자 제공 치지직 레퍼런스의 대비와 각진 리듬을 반영한다. 라이트 모드 토큰/테마 전환은 제공하지 않는다 (ADR-015).
- Tailwind CSS v4 토큰으로 배경/텍스트/보더/포커스/간격/반경/타이포 정의.
- Headless UI로 `Dialog`, `Listbox`, `Menu`, `Combobox` 등 접근성 확보, 직접 스타일링.
- `<button>`, `<input>`, `<label>` 등 시맨틱 HTML 사용(브라우저 기본 모양이 드러나지 않게 커스텀 CSS).
- React Islands와 Headless UI는 사용자 상호작용이 필요한 스튜디오 화면에 집중.

## 페이지

| Route | 주요 구성 |
|---|---|
| `/` | 한 문장 가치 제안, 실제 사용 흐름, 베타 참여 CTA |
| `/beta` | 과거 링크 호환용 `/studio` 308 redirect; 입력 화면 없음 |
| `/studio` | 중앙 프로젝트 생성 composer, 공통 사이드바의 최근 프로젝트/검색 |
| `/studio/projects/:id` | 제품/프리셋/결과물 목록 |
| `/studio/products/:id` | 분석 → 기획 → 생성 → 검수의 메인 작업 화면 |
| `/studio/settings` | OpenRouter 연결 상태, 연결 해제, 개인정보 삭제/내보내기 안내 |

## 핵심 작업 화면 (desktop)

ADR-018: 좌측 264px 공통 사이드바에 최근 작업을 표시하며 64px rail로 접을 수 있다. 프로젝트·상품·프리셋·기록·계정 화면에서 같은 탐색을 제공한다. 프로젝트 검색은 Ctrl/⌘+K, 방향키/Enter/ESC를 지원한다. 모바일은 메뉴 Dialog로 열며 포커스 복귀를 유지한다. `/studio` 본문의 프로젝트 카드 grid는 제거한다. 새 프로젝트 생성은 AI가 호출되지 않으며 실제 촬영 실행은 기존 비용 동의 흐름을 따른다.

- 왼쪽: 업로드한 제품 이미지, 보존 포인트, 모델·무드·로케이션 설정.
- 중앙: 생성 이미지 큰 프리뷰, 원본과 나란히 비교.
- 오른쪽/하단: 작업 상태, AI 검수 사유, 사용자 채택/폐기 및 원가 정보.
- 3-step 진행 표시: `상품 분석` → `촬영 기획` → `이미지 생성·검수`.
- 분석 시작 버튼과 생성 버튼 옆에 각각 *고객 OpenRouter 크레딧 사용* 문구와 가능할 경우 예상 비용 범위.
- 초기에 사진 1장만으로도 플로우 시작, 디테일 사진 추가는 선택.

## UI 컴포넌트

`Button`, `IconButton`, `Input`, `Field`, `Select`, `Modal`, `Toast`, `Progress`, `ImageUploadDropzone`, `PhotoPreview`, `ReferenceComparison`, `ShotSettingsPanel`, `JobStatus`, `QualityFlags`, `FeedbackControls`, `ApiCostNotice`.

## 상태별 사용성

- 인증 확인 중: 초기 HTML부터 skeleton/ARIA status. 연결 안내를 먼저 표시하지 않는다.
- 인증/네트워크 장애: 연결 해제로 간주하지 않고 오류와 다시 확인 액션을 표시한다.

- 비연결: OpenRouter 연결 필요 설명 + 연결 CTA.
- 잔액 부족: OpenRouter 충전 안내, 비밀키 입력 요구 금지.
- 계획 분석 중: 단계/진행률(정확히 알 수 없으면 가짜 % 금지).
- API 비용 청구 후 결과 알 수 없음: '처리 결과 확인 필요'로 표시, 자동 재실행 금지.
- 상품 변형 발견: 원본 비교 + 플래그 + '수정해서 재생성' 액션(클릭 시 별도 비용 안내).
- 업로드 오류: 파일 타입·용량 등 해결 가능한 메시지.

## 접근성 / 반응형

- 색상 대비와 명확한 focus-visible, 키보드로 모든 인터랙션 사용 가능.
- Dialog focus trap / ESC / 복귀 포커스, 라벨 연계, 로딩 상태 ARIA.
- 작은 화면에서는 패널 세로 스택. 대용량 편집은 데스크톱 권장 고지 가능.
