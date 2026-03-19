# TrendAnalysis.ai

Evidence-first market research built with Next.js 16, React 19, Bright Data, OpenRouter, and PostgreSQL.

The app takes a market topic or question, runs a multi-stage retrieval pipeline, and streams results into a terminal-style workspace with evidence, graph, timeline, media, and chat panels. Public report and asset pages are rendered from the same stored session data for SEO.

## Current Architecture

- Framework: Next.js App Router with `next-intl`
- Data store: PostgreSQL via `pg` and `schema.sql`
- External providers: Bright Data for SERP and page extraction, OpenRouter for LLM stages
- Deployment target: standalone Node build in Docker on a VPS
- Optional edge build: OpenNext Cloudflare output via `npm run build:cf`

Core directories:

- `src/app`: pages and route handlers
- `src/components`: terminal, dashboard, report, landing, and shared UI
- `src/lib`: provider clients, env parsing, database access, logging, typed helpers
- `src/lib/run-pipeline`: pipeline contracts, utilities, graph heuristics, and stage modules
- `src/prompts`: prompt builders for plan, summaries, artifacts, impact, and chat
- `messages`: locale dictionaries for `en`, `es`, and `zh`
- `scripts`: one-off tooling such as keyword research

## Local Development

```bash
npm install
npm run dev
```

Create local configuration from `.env.local.example`:

```bash
cp .env.local.example .env.local
```

Required variables:

- `BRIGHTDATA_API_TOKEN`
- `BRIGHTDATA_WEB_UNLOCKER_ZONE`
- `BRIGHTDATA_SERP_ZONE`
- `OPENROUTER_API_KEY`
- `DATABASE_URL`

## Validation

Use the same validation chain locally that CI should enforce:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

The test suite runs on Vitest and now covers core backend libraries plus route behavior for `run`, `chat`, `health`, and session pagination endpoints.

## Pipeline Layout

`POST /api/run` is an SSE endpoint. The route is an orchestrator; stage logic lives under `src/lib/run-pipeline/`.

- `contracts.ts`: core pipeline types and request schema
- `utils.ts`: generic helpers used across stages
- `graph-heuristics.ts`: graph normalization and fallback graph enrichment
- `stages/plan.ts`: query planning
- `stages/search.ts`: SERP execution and fallback search behavior
- `stages/evidence.ts`: markdown scrape and evidence summarization
- `stages/artifacts.ts`: artifact generation, repair, and fallback map output
- `stages/impact.ts`: graph expansion logic for deep runs

## API Surface

Important routes:

- `POST /api/run`: starts the research pipeline and returns an SSE stream
- `POST /api/chat`: grounded follow-up questions for a stored session
- `GET /api/health`: config status; add `?probe=1` to actively test DB, DB schema/indexes, AI, and Bright Data connectivity
- `GET /api/sessions`, `/api/sessions/events`, `/api/sessions/snapshot`: dashboard and replay data

## Deployment

The default production path is Docker on a VPS:

```bash
npm run build
docker compose build
docker compose up -d
```

`Dockerfile` builds a standalone Next.js server. `docker-compose.yml` expects `.env.production` and exposes the app on port `3100 -> 3000`.

Operational commands:

```bash
npm run schema:apply
npm run cleanup:sessions
```

The VPS deploy workflow now applies `schema.sql` inside the running container and installs a cron entry that runs session TTL cleanup every 30 minutes.

Recommended production verification after deploy:

```bash
docker exec market-terminal node scripts/apply-schema.mjs
docker exec market-terminal node scripts/cleanup-expired-sessions.mjs
crontab -l | grep cleanup-expired-sessions.mjs
curl "https://your-host/api/health?probe=1"
```
