# CLAUDE.md

This file gives repository-specific guidance for coding agents working in this project.

## Commands

```bash
npm run dev              # Start Next.js locally
npm run lint             # ESLint
npm run typecheck        # TypeScript type check
npm run test             # Vitest route/unit suite
npm run build            # Production standalone build
npm run schema:apply     # Apply schema.sql against DATABASE_URL
npm run cleanup:sessions # Delete expired unpublished sessions
```

## Architecture

TrendAnalysis.ai is an evidence-first market research app built on Next.js 16, PostgreSQL, Bright Data, and OpenRouter.

### Backend shape

- `src/app/api/run/route.ts`: thin SSE orchestrator for the research pipeline
- `src/lib/run-pipeline/`: stage implementations and graph heuristics
- `src/lib/brightdata.ts`: Bright Data SERP + markdown extraction with retry/cache
- `src/lib/ai.ts`: OpenRouter client, cached chat completions, JSON parsing helpers
- `src/lib/db.ts`: PostgreSQL access, cursor pagination, schema probe, TTL cleanup
- `src/app/api/sessions*`: dashboard/session history endpoints
- `src/app/api/chat/route.ts`: grounded Q&A against stored session artifacts
- `src/app/api/health/route.ts`: config and active dependency probe, including DB schema/index verification

### Pipeline stages

`POST /api/run` emits an SSE stream and executes:

1. `plan`
2. `search`
3. `scrape`
4. `extract`
5. `summaries`
6. `artifacts`
7. `impact/link`
8. `cluster/render/ready`

The route must preserve current SSE event names and additive compatibility. Stage logic belongs in `src/lib/run-pipeline/`, not in route handlers.

### Storage model

PostgreSQL schema lives in `schema.sql`.

- `market_signal.sessions`
- `market_signal.session_events`

The app uses:

- cursor pagination for session list and event history
- schema probe via `probeDbSchema()`
- TTL cleanup for unpublished sessions older than 24 hours

### Deployment

Production runs as a Docker container on a VPS.

- `Dockerfile` builds the standalone runtime image
- `docker-compose.yml` runs the app on `3100 -> 3000`
- `.github/workflows/deploy.yml` runs lint/typecheck/test/build, deploys, applies schema, and installs cleanup cron

Runtime scripts shipped in the image:

- `scripts/apply-schema.mjs`
- `scripts/cleanup-expired-sessions.mjs`
- `scripts/install-cleanup-cron.sh`

## Working rules

- Prefer editing backend logic under `src/lib/` instead of expanding route handlers.
- Keep provider access behind internal wrappers/helpers, not raw route-local fetch logic.
- Preserve existing request/response contracts and SSE event names unless explicitly asked to change them.
- For backend work, validate with `lint`, `typecheck`, `test`, and `build`.
- If you touch schema, deploy, or TTL behavior, also verify `GET /api/health?probe=1`.
