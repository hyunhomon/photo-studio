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
