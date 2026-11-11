# AI Pipeline — Implementation Contract

## 단계

1. **ProductAnalyzer**: 시각적 상품 특징 추출. 불확실한 소재/브랜드/사이즈 단정 금지.
2. **ShootPlanner**: 계절·브랜드 프리셋·상품 특성을 기반으로 모델, 포즈, 구도, 로케이션, 조명 추천.
3. **ImageGenerator**: 승인된 촬영 계획 + 원본 참조 이미지를 이미지 모델에 전달.
4. **사람의 비교**: 원본/이전 컷과 빛·초점/인물/소재를 직접 비교. ADR-019에서 QualityEvaluator와 점수·채택/폐기 피드백은 종료했다.

단계 1-2는 사용자의 **분석 시작** 승인 후 분석/기획 Workflow, 단계 3은 사용자의 **이미지 생성** 승인 후 generation 1단계 Workflow. **사진 업로드만으로 유료 API 호출 금지.** 사람 비교에는 AI 호출이 없으며 컷 개선은 새 1장 비용 동의를 받는다.

## ModelAdapter 인터페이스 설계 의도

- `analyzeProduct({imageRefs, locale}) → ProductAnalysis`
- `planShoot({productAnalysis, brandPreset, userOverrides}) → ShootPlan`
- `generate(model, sources, plan, quality, {captureVersion, reason, adjustments, previousImage, garmentAnalysis}) → GeneratedImage + Usage`
- 평가 메서드는 어댑터에서 제거했다. 기존 Workflow evaluation step은 새 런타임에서 no-op이며 과거 평가 데이터/비용은 보존한다.
- Provider 파라미터/응답은 이 계층에서만 노출, 서비스 내부는 정규화된 DTO 사용.
- 모든 결과에 `model_id`, `prompt_version`, `provider_request_id?`, `usage?`, `cost_actual_usd?`, `duration_ms` 기록.

## ProductAnalysis JSON 계약 (개념)

```json
{
  "garmentType": "shirt",
  "colors": ["off-white"],
  "pattern": "solid",
  "materialGuess": {"value": "linen-like", "confidence": 0.65},
  "silhouette": "relaxed fit",
  "seasonGuess": ["spring", "summer"],
  "preservationPoints": ["collar shape", "button positions", "original color"],
  "uncertainties": ["material not verifiable from photo"]
}
```

## ShootPlan JSON 계약 (개념)

```json
{
  "season": "spring-summer",
  "mood": "clean editorial",
  "model": {"style": "adult commercial fashion model", "pose": "standing relaxed", "appearance": "fictional adult, relaxed individual expression"},
  "camera": {"framing": "full body", "angle": "eye-level", "backgroundSeparation": "balanced"},
  "location": {"type": "minimal bright courtyard", "time": "morning"},
  "lighting": "soft natural sunlight",
  "mustPreserve": ["product shape", "color", "logos and print"],
  "materialDirection": "observed matte fabric, distinguish surrounding stone roughness",
  "aspectRatio": "3:4"
}
```

## 이미지 생성 OpenRouter 계약

- 기본 slug: `openai/gpt-image-2` (이 모델을 유지; 다른 신모델로 임의 교체 금지).
- 전용 API: `POST https://openrouter.ai/api/v1/images`.
- `input_references`: 원본 의류 1–3장 뒤에 개선할 이전 생성 컷을 선택적으로 추가한다. `type: image_url` 형식의 data URL. 실제 참조 수 capability와 전체 12MB를 과금 전 검사한다. 원본은 의류 증거, 이전 컷은 가상 성인/구도 연속성만 담당한다.
- 응답 `data[].b64_json`을 바로 R2에 바이너리로 저장; `media_type`에 맞는 MIME/확장자 사용.
- `usage.cost`는 있을 때만 확정 비용으로 저장; 없으면 null(또는 별도 가정치).
- `n`, `quality`, `aspect_ratio`, 참조 이미지 제한 등 모델 capabilities를 런타임/부트스트랩 시 검증.
- 분석 시작 및 이미지 생성 전 각각 외부 API 비용 발생 안내. API 크레딧 부족/권한 실패는 사용자에게 연결/충전 안내.

## 프롬프트 전략

- 시스템 지침: 상품을 실제와 다르게 재설계하지 않는다. 색상/패턴/브랜드 표식/단추/실루엣의 보존을 명시한다.
- 제품 설명에 추정 단어와 확정 단어 분리: 사진만으로 소재를 단정하지 않는다.
- 촬영 컨셉 지시와 상품 불변사항을 별도 필드로 보관.
- 일부 실패·재시도 사례만 보고 프롬프트를 과적합하지 말 것; 버전을 로그와 함께 기록.
- 위험: 멀티모달 검수는 이상을 놓칠 수 있으며 디테일 재구성 정확성 보장 불가.

## 종료된 평가 스키마 (과거 데이터 호환만 유지)

```json
{
  "garmentFidelityScore": 0.75,
  "realismScore": 0.9,
  "compositionScore": 0.92,
  "flaggedIssues": [
    {"code": "logo_distortion", "severity": "high", "reason": "원본 대비 로고 형태가 달라 보임"}
  ],
  "needsHumanReview": true,
  "evaluationVersion": "v1"
}
```

- 새 평가 생성·점수 노출·피드백 쓰기는 하지 않는다. 기존 데이터는 삭제하지 않는다. 자동 재생성도 하지 않는다.
- 새 결과는 저장 완료 후 `needs_review`/`review`. 수동 비교 안내와 원본/이전 컷 확대를 제공한다.

## 촬영 프로토콜과 개선 지시

`studio-v3-photography` / `photo-v1`부터 광학 근사 프로필·일관된 주광원과 접촉 그림자·눈/피부/머리카락 현실감·관찰된 직물과 주변 표면 반응을 컴파일한다. 얼굴 외모/배경 분리/소재 지시를 승인된 기획에 담는다. 컷 개선 항목과 자유 지시는 snapshot에서 실제 프롬프트로 전달한다. 무작위 블러/노이즈 후처리를 적용하지 않는다. 이전 컷 참조가 얼굴·로고 보존을 보장하지 않으며 실사 개선 효과는 별도 인간 검증이 필요하다. 근거·제어·검증 루프는 `14-REALISM-RESEARCH.md`를 따른다.

ADR-020의 현재 `studio-v4-retail` / `photo-v2-retail`은 상품 전체/명시적 전신/명시적 접사에 맞춰 근사 화각과 거리를 연결한다. 새 배경 분리 기본값은 gentle이며 기존 명시적 값은 유지한다. 상품 분석을 생성 job의 `analysisSnapshot`에 고정하고 소재 추정/불확실성을 그대로 전달한다. 이전 컷은 가상 인물의 특징용이며 crop/피부 보정/노출/blur를 그대로 복제하지 않는다. 요청한 교정과 상품 가시성을 위해 재프레이밍할 수 있다. 외부 쇼핑몰 사진은 시각 비교 근거일 뿐 provider 입력이나 배포 자산으로 사용하지 않는다.

## 실제 API 비용의 신뢰성

- 이미지 생성 비용이 장당 고정이라는 가정을 하지 않는다.
- 각 stage는 실제 제공 비용(있을 경우)과 fallback 추정치를 분리.
- 리트라이로 두 번 호출되면 실제 두 번 과금될 수 있으므로 자동 재요청 방어.
- 사용자에게 과금 안내 문구: 'OpenRouter 계정의 크레딧으로 생성 비용이 청구됩니다. 사용량과 모델 설정에 따라 실제 비용은 달라질 수 있습니다.'

## 테스트 케이스

### 응답 호환 및 기획만 복구 (ADR-017)

`studio-v2`부터 모델이 판단할 필드와 앱 정책을 분리한다. provider용 기획에는 aspectRatio를 요구하지 않고 최종 앱 DTO에 3:4를 설정한다. v3는 shootType도 provider 계약에서 제거한다. 사용자 수정 API의 strict DTO는 유지한다. BOM/전체 JSON fence/텍스트 content part는 로컬에서만 해석하고 추가 metadata는 버린다. 누락된 필수 내용이나 잘못된 enum은 그대로 실패 처리한다. 잘림/차단과 JSON/schema 오류도 구분한다.

실패 attempt의 output_json에는 원문 대신 `{validation:{reason,issues:[{field,code}]}}`만 보관한다. field는 사전 정의한 경로 또는 response이고 값/모르는 키/오류 원문은 저장하지 않는다. provider가 반환한 비용·사용량은 실패해도 유지한다. JSON repair를 위한 추가 유료 호출이나 자동 재시도는 없다.

사용자가 `reuseAnalysis=true`와 비용 동의를 보내면 본인 상품의 현재 분석을 새 작업 snapshot으로 고정하고 기획 1회만 호출한다. analysis step은 provider 호출/attempt 추가 없이 건너뛴다. 이전 실패 비용과 원장은 보존하며 별도 사용자 요청·idempotency key로 기록한다.

- 무지 티셔츠, 로고 티셔츠, 스트라이프 셔츠, 니트, 코트, 프린트 의류.
- 로고 왜곡/색상 변화/단추 누락/소매 길이 변화/배경 오인식 검출.
- 유료 호출 이전 실패/유료 호출 중 타임아웃/성공 뒤 R2 실패/종료된 평가 단계 무호출.
