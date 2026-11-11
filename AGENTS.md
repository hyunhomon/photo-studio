# Repository Instructions — Photo Studio

## Mission
Build the smallest reliable web MVP that turns clothing photos into AI-planned fashion studio shots. Read `docs/00-START-HERE.md`, `docs/01-PRD.md`, `docs/02-ADR.md`, and `docs/09-IMPLEMENTATION-PLAN.md` before writing code.

## Binding decisions
- Bun workspace monorepo; Astro web with React Islands, Tailwind CSS v4 and `@headlessui/react`; no pre-styled UI kits.
- Hono API Worker, Zod contracts, Drizzle + D1, R2, Cloudflare Workflows.
- OpenRouter OAuth **PKCE S256** for MVP BYOK; the user pays OpenRouter directly. Never use a shared operator API key for customer inference.
- Image model defaults to `openai/gpt-image-2`, configurable. Analysis model remains configurable and must be capability-checked.
- MVP has direct OpenRouter OAuth without invite codes (ADR-016), project/product/asset management, analyse+plan flow, user-approved generation, original/previous-frame comparison, directed revisions, usage/cost logging, and download. ADR-019 retires shoot modes, numeric AI evaluation and feedback controls; prioritize coherent light/focus, natural adults, and material appearance. ADR-020 makes garment visibility primary and separates prior identity cues from prior retouching/crop defects. ADR-021 adds optional consented adult-person and photographic-look references, always separate from authoritative garment evidence and never automatically scraped or inferred on upload.
- Do **not** implement payments, subscriptions, credit balances, batch generation, teams or training models now.

## Execution
1. Start with **Phase 0** of `docs/09-IMPLEMENTATION-PLAN.md` (scaffold and make dev/typecheck/test runnable). Then implement phases in order.
2. Maintain `docs/09-IMPLEMENTATION-PLAN.md` checkboxes/status and record decisions in `docs/10-DECISIONS-AND-RISKS.md` when assumptions change.
3. Do not remove or silently override accepted ADRs; for necessary deviations, append a new ADR with trade-offs.
4. Prefer small, functional vertical slices with tests and explicit commands, rather than broad placeholder scaffolding.
5. Before claiming completion, run lint/format/typecheck/test/build that are applicable and report failures honestly.
6. Keep secrets, images, identifiers, API keys and user prompts out of console/CI logs and git.
7. Any external cost-incurring call requires a user action **and visible notice**: upload alone must not trigger AI; separately confirm analysis/planning and image generation. Tests must use mocked AI adapters and fake provider responses.
8. Use supported, latest compatible versions **at scaffold time**, verify current official docs; avoid guessed flags/SDK APIs.

## Design & UX
- Editorial, minimal, polished desktop-first studio, accessible responsive fallback.
- Use Headless UI for dialogs, listboxes, menus; build styled Button/Input/Card/Upload yourself with Tailwind tokens.
- Do not confuse 'no native-looking components' with removing semantic HTML. Keep labels, focus, keyboard navigation and ARIA.
- Clear costs, progress, uncertain results, error recovery. Do not auto-retry paid image calls when outcome is ambiguous.

## Security & identity
- Server-side OAuth callback exchanges code using PKCE verifier; protect `state` and the initiating browser; issue separate app session cookie.
- Encrypt OpenRouter keys server-side with versioned AES-GCM key; never return them to browser. No browser localStorage for keys.
- Scope every project, product, asset, feedback and job query to current internal user ID.
- Validate file type by signature and size; authorize R2 reads and uploads; avoid public buckets.
- SameSite and CORS allowed origin must be explicit; no `*` with credentials.
- When OpenRouter does not return a stable `user_id`, fail safely rather than merging unrelated accounts.

## Core metrics
Capture API call model/stage/latency/outcome/usage/actual cost or null, capture protocol/prompt versions, revision axis/instructions and regeneration linkage. Preserve legacy quality/feedback history but do not create or display new ratings (ADR-019). Never fabricate cost when provider omits it: mark `unknown` and optionally store separately identified estimate.

## Working definition of done
- End-to-end scenario documented in `docs/09-IMPLEMENTATION-PLAN.md` works with a mock adapter and then (by explicit human invocation) with a funded test OpenRouter account.
- Secure upload → plan → manual generate → original/previous comparison → consented directed revision → download → deletion.
- An unrelated user cannot read another user's data or media.
- Durable workflow does not blindly repeat uncertain paid calls.
