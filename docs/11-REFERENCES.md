# 검증한 공식 문서 (2026-11-10 기준)

외부 API·프레임워크 문서는 변경되므로 Codex가 구현 직전에 재확인해야 한다. 이 문서는 API 본문을 복제하지 않고 링크와 핵심만 남긴다.

- OpenRouter OAuth PKCE: https://openrouter.ai/docs/guides/overview/auth/oauth
  - `/auth` redirect + `callback_url` + PKCE S256, server-side code exchange.
- OpenRouter auth code exchange: https://openrouter.ai/docs/api/api-reference/o-auth/exchange-auth-code-for-api-key
  - `POST /api/v1/auth/keys`; 응답 `key`와 optional `user_id`.
- OpenRouter Image API tutorial: https://openrouter.ai/blog/tutorials/image-generation/
  - `POST /api/v1/images`; `input_references`; output base64; optional `usage.cost`.
- GPT Image 2 model: https://openrouter.ai/openai/gpt-image-2
  - `openai/gpt-image-2`; 파라미터/모델 availability 확인.
- Cloudflare Workflows: https://developers.cloudflare.com/workflows/get-started/guide/
  - durable multi-step state; Worker binding.
- Cloudflare Workflows idempotency: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
  - steps may retry. Paid external calls need defensive design.
- Astro Cloudflare adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Cloudflare Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- Codex AGENTS.md usage: https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex

## 구현 시 체크

- 모델 slug가 유효하고 이미지 API 참조이미지를 지원하는지 확인.
- Cloudflare와 Astro의 현재 릴리스 호환성을 확인하고 정확한 버전/명령어를 기록.
- OpenRouter OAuth가 `user_id`를 돌려주지 않는 케이스 등 실패 동작을 재현.
- 제공자 API `usage.cost` 누락을 정상적인 '미확인'으로 처리.

## Phase 0 스캐폴딩 시 재확인 (2026-11-10)

- Astro Cloudflare adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
  - 현재 어댑터는 Cloudflare Vite plugin 기반. `@astrojs/cloudflare/entrypoints/server`를 진입점으로 사용하며 `astro build`로 Worker를 만든다. R2 이미지 저장과 무관한 Images 서비스를 추가하지 않도록 `imageService: passthrough`를 선택했다.
- Astro React: https://docs.astro.build/en/guides/integrations-guide/react/
  - `react()` integration과 `client:load`로 스튜디오 island를 hydrate한다.
- Tailwind Astro: https://tailwindcss.com/docs/installation/framework-guides/astro
  - Tailwind v4는 `@tailwindcss/vite`와 CSS import로 설정. UI 공유 패키지는 명시적 `@source`로 탐색한다.
- Bun workspaces: https://bun.sh/docs/pm/workspaces
  - `workspace:*` 공유 패키지 연결 및 filter 기반 workspace script 실행.
- Hono Worker: https://hono.dev/docs/getting-started/cloudflare-workers
- Drizzle D1: https://orm.drizzle.team/docs/get-started/d1-new
- Workflows local development: https://developers.cloudflare.com/workflows/build/local-development/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Headless UI Dialog: https://headlessui.com/react/dialog
  - Dialog focus trap, ESC 및 포커스 복귀 사용. 스타일은 직접 작성.
- 버전: npm registry의 각 package `latest` metadata와 peerDependencies를 확인하고 호환 조합을 고정했다. Astro 7.4.8 / adapter 14.4.6 / React integration 7.1.5 / React 19.3.1 / Tailwind 4.3.5 / Hono 4.13.17 / Drizzle 0.45.4 / Zod 4.6.7 / Wrangler 4.159.0 / TypeScript 6.0.3. TypeScript 및 React transform 버전 선택 사유는 `10-DECISIONS-AND-RISKS.md` 참조.
- OpenRouter 실제 OAuth/API capability, 모델 availability/단가 확인은 Phase 1/3/4의 실제 어댑터 구현 직전에 다시 수행한다. Phase 0은 유료 요청을 전혀 하지 않는다.

## MVP 구현 시 공식 계약 확인 (2026-11-11)

- https://openrouter.ai/openapi.json — OAuth user_id nullable, Images API input_references/b64_json/media_type/usage 및 provider allow_fallbacks 계약.
- https://openrouter.ai/api/v1/models — vision 입력 및 structured_outputs/response_format 지원을 확인해 분석·평가 모델 선택.
- https://openrouter.ai/api/v1/images/models — gpt-image-2의 참조 이미지, n=1, 3:4, PNG, medium/high 지원 확인.
- https://openrouter.ai/docs/guides/features/structured-outputs — JSON Schema strict 및 require_parameters.
- https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/ — 기본 재시도 대신 paid step limit=0 지정.
- https://github.com/jamsinclair/jSquash/tree/main/examples/cloudflare-worker-esm-format — Workers 사전 컴파일 WASM 모듈 import.
- https://github.com/orioncactus/pretendard / https://github.com/Freesentation/paperlogy — 자체 호스팅 폰트 및 포함된 OFL 라이선스.

## 촬영 현실감 리서치 (2026-11-12)

광학/초점은 Nikon 공식 촬영 가이드, 인물의 현실감 불일치는 Chattopadhyay/MacDorman의 원 연구, 소재 반응은 Cornell CT cloth 연구를 참고했다. AI 평가의 한계는 해당 연구의 시험 모델·시점 범위를 구분한다. 원문 링크·관찰과 추론·구현 범위·인간 승인 검증 루프는 `14-REALISM-RESEARCH.md`에 기록한다. 공식 `/images/models`의 현재 참조 최대 16장 및 `input_references` 계약도 확인했으며 실제 호출 전 capability 검사를 유지한다.
