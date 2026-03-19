# Repository Guidelines

## Project Structure & Module Organization
This repository is a Next.js 16 App Router application for TrendAnalysis.ai. Main code lives in `src/`: routes and API handlers are in `src/app`, shared UI in `src/components`, backend integrations in `src/lib`, i18n helpers in `src/i18n`, and LLM prompt builders in `src/prompts`. Pipeline stage code lives in `src/lib/run-pipeline/`. Locale strings live in `messages/`, static assets in `public/`, database bootstrap SQL in `schema.sql`, and operational scripts in `scripts/`.

## Build, Test, and Development Commands
Use npm because the repo is checked in with `package-lock.json`.

- `npm install`: install dependencies.
- `npm run dev`: start the local Next.js app.
- `npm run lint`: run ESLint with the shared Next.js flat config.
- `npm run typecheck`: run the same TypeScript check used in CI.
- `npm run test`: run the Vitest suite.
- `npm run build`: create the production Next.js build.
- `npm run build:cf`: build the OpenNext Cloudflare target.
- `npm run schema:apply`: apply `schema.sql` against `DATABASE_URL`.
- `npm run cleanup:sessions`: delete expired unpublished sessions.
- `npm run keyword-research`: run the keyword research utility.

## Coding Style & Naming Conventions
TypeScript is strict; keep new code fully typed and prefer small helpers in `src/lib` over repeated inline logic. Match the existing style: single quotes, semicolons, trailing commas where valid, and 2-space indentation. Use `PascalCase` for React components, `camelCase` for functions and variables, and kebab-free route folders under `src/app/[locale]/...`. Keep server-only logic inside API routes or `src/lib`, and import internal modules through the `@/` alias.

## Testing Guidelines
Vitest is configured for route and library coverage. For every change, run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before opening a PR. If you touch pipeline, database, provider wiring, schema, or deploy logic, also verify `GET /api/health?probe=1` against configured credentials and include the result in your notes.

## Commit & Pull Request Guidelines
Recent history follows conventional prefixes such as `feat:`, `fix:`, `refactor:`, `ci:`, `chore:`, and `rebrand:`. Keep commits imperative and scoped to one change. PRs should summarize user-visible behavior, list validation commands run, link the related issue if there is one, and include screenshots for landing, terminal, dashboard, or report UI changes. Call out any required env, schema, Docker, or deployment updates explicitly.

## Security & Configuration Tips
Start from `.env.local.example` and never commit populated `.env*` files or provider secrets. `DATABASE_URL`, Bright Data tokens, and OpenRouter keys must stay server-side. Review changes to `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy.yml`, `schema.sql`, and `scripts/*.mjs` carefully because they affect runtime deploy, schema apply, and TTL cleanup on the VPS.
