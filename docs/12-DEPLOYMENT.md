# Cloudflare production 배포

## 현재 배포

- 기준일: 2026-11-10.
- 웹: https://photo-studio.cloby.co
- 스튜디오: https://photo-studio.cloby.co/studio
- API liveness: https://photo-studio.cloby.co/health
- 원격 환경: **production 하나**. staging/preview 환경, `workers.dev`와 preview URL은 사용하지 않는다.
- `cloby.co`의 소유 계정과 Wrangler 로그인 membership을 확인해 배포했다. 최초 선택한 계정/존은 로컬에서 pin한다. 계정 이메일·account/zone/database UUID·로그인 토큰은 git에 저장하지 않는다.

현재 공개된 것은 **Phase 0 Mock 미리보기**다. 초대·OAuth·업로드·실제 AI·사용량 저장·다운로드는 아직 없다. API 미구현 경로는 JSON 404를 반환하며 실제 고객 데이터나 키를 입력받지 않는다.

## 연결 구조

| 리소스/경로 | 대상 |
|---|---|
| 웹 Custom Domain `photo-studio.cloby.co` | Worker `photo-studio-web` |
| `/health*`, `/auth/*`, `/api/*` | 별도 Worker `photo-studio-api` |
| API `DB` | D1 `photo-studio-production` |
| API `ASSETS` | R2 `photo-studio-production-assets` |
| API `STUDIO_WORKFLOW` | Workflow `photo-studio-production`, class `StudioWorkflow` |

Cloudflare에서 경로 Worker가 Custom Domain origin보다 먼저 실행되는 기능을 사용한다. 웹/API Worker의 독립 배포를 유지하면서 브라우저는 한 origin만 사용한다. `/api/v1/*`는 그대로 API에 도달하므로 path rewrite/proxy 코드는 없다. CORS allowlist는 production origin 하나다. 세션/CSRF는 Phase 1에서 별도로 구현해야 한다.

Cloudflare가 지정 hostname의 DNS와 TLS를 관리한다. 다른 `cloby.co` DNS 레코드는 변경하지 않는다. R2는 `r2.dev` 공개 접근이 꺼져 있고 custom domain이 없다. D1/R2 생성 시 APAC location hint를 사용했으며 이는 위치 보장이 아니다. KV/Images/Pages 리소스는 추가하지 않았다.

## 재배포

```powershell
bun install --frozen-lockfile
bun run deploy
```

`deploy`는 먼저 format/lint/typecheck/unit test/local build를 실행한다. 이후 `scripts/deploy-production.ts`가 다음 작업을 수행한다.

1. 설치된 Wrangler 4.159.0 CLI로 현재 로그인과 OAuth token을 확인한다. token 출력은 메모리에서만 사용하고 console/파일에 기록하지 않는다.
2. `infra/production.json`에 지정된 활성 존의 소유 계정과 현재 로그인 membership을 확인한다. `.wrangler/production/identity.json`의 기존 pin과 다르면 중단한다.
3. 이름으로 D1/R2를 조회해 재사용하고, 없을 때만 생성한다. 이미 존재하는 R2가 공개 상태이면 중단한다. 기존 도메인/route가 다른 Worker 소유이면 덮어쓰지 않는다.
4. account/zone/DB ID를 포함한 실제 설정을 gitignored `.wrangler/production/{api,web}.json`에 생성한다. 원격 resource ID를 소스에 하드코딩하지 않는다. `resources.json`은 해당 머신의 비밀이 아닌 인프라 식별자 목록이다.
5. production 설정으로 Astro를 **다시 빌드**한다. `PUBLIC_API_URL=https://photo-studio.cloby.co`, `PUBLIC_DEPLOYMENT_ENV=production`을 빌드 시 주입한다. 기본 `bun run build`의 로컬 산출물을 그대로 배포하지 않는다.
6. 처음에는 웹 origin만 업로드하고 Custom Domain changeset에서 DNS/domain 충돌을 확인한 뒤 연결한다. 재배포 시에는 기존 Custom Domain을 유지한다. API routes와 Workflow를 배포한다.
7. D1 `SELECT 1`, R2 공개 접근 상태, Workflow 존재, HTTPS `/health`를 검증한다. 실제 AI/사용자 세션/이미지/작업은 만들지 않는다.

원격 설정은 Wrangler named environment 없이 default production service를 사용한다. 로컬 `apps/*/wrangler.jsonc`는 개발용이며 원격 환경 하나라는 결정과 무관하게 유지한다. `bun run dev`는 여전히 로컬 D1/R2/Workflow만 사용한다. 운영 API 기본 vars는 Git에 있는 로컬 기본값에서 생성하되 origin/callback/resources를 production 값으로 교체한다.

생성 설정은 버전 관리하지 않으므로 다른 머신에서는 해당 존에 권한이 있는 Wrangler 로그인 후 같은 명령으로 재발견한다. 계정/존 pin이 의도치 않게 바뀌었다는 오류를 무시해서는 안 된다. `.wrangler`를 지워도 원격 데이터는 삭제되지 않는다. 이 배포 명령은 DB/bucket/오브젝트 삭제를 수행하지 않는다.

## 검증

```powershell
bun run test:local
bun run test:e2e
bunx playwright install chromium
bun run test:production
```

`test:production`은 HTTPS 응답, API JSON route, 정확한 CORS allowlist, desktop/mobile React hydration, Dialog와 수동 API 연결을 확인한다. 기존 `cloby.co` zone이 자동 주입하는 Cloudflare Web Analytics의 beacon GET 및 `/cdn-cgi/rum` POST만 예외로 허용한다. 그 외 localhost/외부 origin 또는 GET 외 요청은 실패한다. 기존 존의 Analytics 설정은 변경하지 않았다. 검사는 Node에서 실행하며 캡처는 gitignored `.tmp/production/`에 저장한다. 로컬 E2E는 개발 서버를 자동 시작/종료한다.

`/health`는 liveness이며 인증·모델 capability·DB readiness를 보장하지 않는다. 배포 스크립트의 별도 D1 읽기와 Workflow/R2 설정 검증을 혼동하지 않는다. Workflow는 아직 무통신 Mock 인프라 검사뿐이며 실제 파이프라인이 아니다.

## Phase 1 이후

2026-11-10 검증 결과: `bun run deploy` 전체 검사·게시·원격 probe 통과, 기존 리소스 재사용 재배포 통과, unit 5 pass, local binding smoke 통과, local E2E 4 pass, production desktop/mobile smoke 통과. 최초 Windows configPath 오류는 상대 경로로 수정했고, 브라우저 검사는 Node로 실행한다. production 검사에서 확인한 기존 Cloudflare RUM 주입은 문서화된 예외로 구분했다.

- `OPENROUTER_CALLBACK_URL=https://photo-studio.cloby.co/auth/openrouter/callback`을 이미 지정했다. 현재 handler는 404이며 Phase 1 구현 후 사용한다.
- `AI_MODE=mock`. 실제 provider adapter/공용 추론 키는 없다. 모델 기본값 `openai/gpt-image-2`는 유지하지만 실제 요청은 실행하지 않는다.
- Phase 0에는 secret이 필요하지 않다. Phase 1에서 버전/회전 정책을 확정한 뒤 API Worker에 AES-GCM key secret을 넣는다. 현재 미사용 secret을 임의 생성하거나 OpenRouter key를 공용 환경 변수로 설정하지 않는다.
- D1은 아직 domain table/migration이 없는 상태다. Phase 1부터 migration을 생성하고 적용 순서·호환성을 배포 절차에 추가해야 한다. 현재 `deploy`는 migration을 자동 적용하지 않는다.
- Cloudflare 인프라 사용료는 이 계정에 집계된다. 사용자의 AI 호출 비용은 향후 BYOK 계정으로만 부담하며 단계별 실행 승인·비용 안내를 구현한 뒤에 활성화한다.

## 롤백

재배포 전후 Worker 버전은 Cloudflare에서 관리한다. 필요시 설치된 CLI로 이전 버전을 확인해 지정한다. 예시 명령은 **실행 지시가 아니며** 현재 배포에서 롤백을 수행하지 않았다.

```powershell
node apps/api/node_modules/wrangler/bin/wrangler.js rollback --config .wrangler/production/api.json
node apps/api/node_modules/wrangler/bin/wrangler.js rollback --config .wrangler/production/web.json
```

Worker 롤백은 D1 migration/R2 데이터를 되돌리지 않는다. Phase 1 이후에는 데이터 호환성 및 Workflow 실행 중 버전 영향을 먼저 확인해야 한다. DNS/TLS 반영 대기만으로 리소스를 다시 생성하거나 bucket/DB를 삭제하지 않는다.

## 공식 근거

- Custom Domains와 route 우선 실행: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#interaction-with-routes
- Wrangler 설정: https://developers.cloudflare.com/workers/wrangler/configuration/
- Astro Cloudflare build/deploy: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- R2 공개 접근 상태: https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/managed/methods/list/
