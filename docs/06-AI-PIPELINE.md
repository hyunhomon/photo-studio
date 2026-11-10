# AI Pipeline — Implementation Contract

## 단계

1. **ProductAnalyzer**: 시각적 상품 특징 추출. 불확실한 소재/브랜드/사이즈 단정 금지.
2. **ShootPlanner**: 계절·브랜드 프리셋·상품 특성을 기반으로 모델, 포즈, 구도, 로케이션, 조명 추천.
3. **ImageGenerator**: 승인된 촬영 계획 + 원본 참조 이미지를 이미지 모델에 전달.
4. **QualityEvaluator**: 원본 vs 결과의 변형 위험 탐지·근거 제시. 승인·폐기는 사용자 결정.

단계 1-2는 사용자의 **분석 시작** 승인 후 분석/기획 Workflow, 단계 3-4는 사용자의 **이미지 생성** 승인 후 생성 Workflow. **사진 업로드만으로 유료 API 호출 금지.**

## ModelAdapter 인터페이스 설계 의도

- `analyzeProduct({imageRefs, locale}) → ProductAnalysis`
- `planShoot({productAnalysis, brandPreset, userOverrides}) → ShootPlan`
- `generateImage({imageRefs, shootPlan, quality, aspectRatio}) → GeneratedImage + Usage`
- `evaluateImage({sourceRefs, resultRef, preservationPoints}) → QualityEvaluation + Usage`
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
  "shootType": "model_location",
  "model": {"style": "adult commercial fashion model", "pose": "standing relaxed"},
  "camera": {"framing": "full body", "angle": "eye-level"},
  "location": {"type": "minimal bright courtyard", "time": "morning"},
  "lighting": "soft natural sunlight",
  "mustPreserve": ["product shape", "color", "logos and print"],
  "aspectRatio": "3:4"
}
```

## 이미지 생성 OpenRouter 계약

- 기본 slug: `openai/gpt-image-2` (이 모델을 유지; 다른 신모델로 임의 교체 금지).
- 전용 API: `POST https://openrouter.ai/api/v1/images`.
- `input_references`: 원본 의류 이미지 data URL을 문서화된 `type: image_url` 형식으로 포함.
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

## 평가 스키마 (개념)

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

- 자동 재생성은 MVP에서 **하지 않는다**. 사용자는 AI 점수와 이미지 비교를 본 뒤 직접 다시 생성.
- 평가 실패는 이미지 생성 성공을 무효화하지 않는다; `evaluation_failed`로 표시하고 수동 검수 허용.

## 실제 API 비용의 신뢰성

- 이미지 생성 비용이 장당 고정이라는 가정을 하지 않는다.
- 각 stage는 실제 제공 비용(있을 경우)과 fallback 추정치를 분리.
- 리트라이로 두 번 호출되면 실제 두 번 과금될 수 있으므로 자동 재요청 방어.
- 사용자에게 과금 안내 문구: 'OpenRouter 계정의 크레딧으로 생성 비용이 청구됩니다. 사용량과 모델 설정에 따라 실제 비용은 달라질 수 있습니다.'

## 테스트 케이스

- 무지 티셔츠, 로고 티셔츠, 스트라이프 셔츠, 니트, 코트, 프린트 의류.
- 로고 왜곡/색상 변화/단추 누락/소매 길이 변화/배경 오인식 검출.
- 유료 호출 이전 실패/유료 호출 중 타임아웃/성공 뒤 R2 실패/검수 API 실패.
