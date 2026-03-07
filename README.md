<div align="center">

<img src="https://proxyway.com/wp-content/uploads/2022/05/bright-data-logo.png?ver=1704718964" height="40" alt="Bright Data" />
&nbsp;&nbsp;&nbsp;&nbsp;
<span style="font-size:22px; color:#555">×</span>
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://www.convex.dev/_next/static/media/logoColor.172b29ec.svg" height="36" alt="Convex" />

<br /><br />

# Market Signal Terminal

**Ask one market question. Get a live-scraped evidence graph.**

An AI research terminal that plans queries, scrapes the web in real time via Bright Data,
and builds a linked knowledge graph — streamed live to a map-first workspace.

<br />

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Convex](https://img.shields.io/badge/Convex-realtime-F3B01C?style=flat-square)](https://convex.dev)
[![Bright Data](https://img.shields.io/badge/Bright%20Data-SERP%20%2B%20Unlocker-0066FF?style=flat-square)](https://brightdata.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>
<div align="center">
           
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Click%20Here-brightgreen?style=flat-square)](https://demos.brightdata.com/market-terminal)

</div>
---

## What It Does

You type a market question — _"Why is BTC down today?"_ or _"NVDA post-earnings: what's the evidence?"_ — and the terminal:

1. **Plans** 4–6 targeted search queries using an LLM
2. **Searches** Google SERP concurrently via Bright Data (news + web verticals)
3. **Scrapes** the top source pages for full-text markdown via Bright Data Web Unlocker _(deep mode)_
4. **Extracts** structured evidence: titles, excerpts, entities, catalysts, sentiment
5. **Builds** a knowledge graph — assets, events, sources, entities — linked with typed, confidence-scored edges
6. **Streams** everything live to a map-first workspace via Server-Sent Events
7. **Answers** follow-up questions grounded strictly in the collected evidence

No static datasets. No hallucinated sources. Every answer traces back to a scraped URL.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                          Browser  (SSE)                           │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐ │
│  │  Evidence Map  │  │    Timeline      │  │  Chat (grounded)   │ │
│  │  (graph viz)   │  │  (tape + events) │  │  /api/chat         │ │
│  └───────┬────────┘  └────────┬─────────┘  └─────────┬──────────┘ │
└──────────┼───────────────────┼──────────────────────┼────────────┘
           │                   │   SSE stream          │
           ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    /api/run  — 8-stage pipeline                     │
│                                                                     │
│   plan → search → scrape → extract → summaries → artifacts         │
│                                     → link → render → ready        │
└──────────┬─────────────────┬──────────────────────┬────────────────┘
           │                 │                      │
           ▼                 ▼                      ▼
   ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐
   │  Bright Data │  │  LLM             │  │    Convex     │
   │  SERP +      │  │  OpenAI /        │  │  session DB + │
   │  Unlocker    │  │  OpenRouter      │  │  event log    │
   └──────────────┘  └──────────────────┘  └───────────────┘
```

### Pipeline Stages

| Stage | What Happens |
|---|---|
| **plan** | LLM generates 4–6 targeted search queries from your topic |
| **search** | 4–6 concurrent Bright Data SERP requests (news → web fallback) |
| **scrape** | Top 4 URLs extracted to markdown via Bright Data Web Unlocker _(deep mode)_ |
| **extract** | SERP snippets + markdown merged into structured evidence items |
| **summaries** | LLM extracts bullets, entities, catalysts, sentiment per item _(deep mode)_ |
| **artifacts** | LLM builds knowledge graph nodes + edges with confidence scores |
| **link** | Heuristic enrichment: connectivity repair, domain tagging, tape events |
| **render → ready** | Final artifacts streamed to client, session persisted to Convex |

---

## The Evidence Graph

The core output is a **typed knowledge graph** — not a flat list of links.

**Node types**

| Type | Examples |
|---|---|
| `asset` | `BITCOIN`, `NVDA`, `DXY` |
| `entity` | `Federal Reserve`, `BlackRock`, `MicroStrategy` |
| `event` | `ETF Approval`, `Fed Rate Hike`, `Earnings Miss` |
| `source` | `reuters.com`, `bloomberg.com`, `coindesk.com`, `forexfactory.com` |

**Edge types**

| Type | Meaning |
|---|---|
| `hypothesis` | Event → Asset _(this catalyst may explain this move)_ |
| `mentions` | Source → Event _(this outlet covered this catalyst)_ |
| `co_moves` | Entity ↔ Asset _(correlated in the evidence)_ |
| `same_story` | Event ↔ Event _(same narrative, different angles)_ |

Every edge carries a `confidence` score `[0, 1]` and cites the evidence IDs that support it.

---

## Evidence Views

The terminal offers four ways to explore the same underlying data:

| View | Description |
|---|---|
| **Graph** | Interactive force-directed knowledge graph — drag, zoom, click nodes |
| **Flow** | Directional flow diagram showing causal chains |
| **Mind Map** | Hierarchical view radiating from the primary asset |
| **Timeline** | Chronological tape of events ordered by publish date |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **Styling** | Tailwind CSS 4 |
| **Realtime DB** | [Convex](https://convex.dev) — sessions, event log, TTL cleanup |
| **Web Data** | [Bright Data](https://brightdata.com) — SERP + Web Unlocker |
| **AI** | OpenAI / OpenRouter (configurable per pipeline stage) |
| **Graph Viz** | `react-force-graph-2d` |
| **Validation** | Zod |
| **Icons** | lucide-react |

---

## Project Structure

```
market-terminal/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── run/              # Main pipeline — SSE orchestrator
│   │   │   ├── chat/             # Evidence-grounded Q&A
│   │   │   ├── sessions/         # Listing, event trace, snapshots
│   │   │   ├── health/           # Config check + live dependency probes
│   │   │   └── serp/             # Direct SERP search (debug/test)
│   │   ├── terminal/             # Interactive evidence workspace
│   │   ├── dashboard/            # Session history + event replay
│   │   └── how-it-works/         # Architecture documentation page
│   ├── components/
│   │   ├── terminal/
│   │   │   ├── Terminal.tsx          # Workspace orchestrator
│   │   │   ├── EvidenceGraph.tsx     # Force-directed graph
│   │   │   ├── EvidenceFlow.tsx      # Flow diagram
│   │   │   ├── EvidenceMindMap.tsx   # Mind map
│   │   │   ├── EvidenceTimeline.tsx  # Chronological tape
│   │   │   └── PipelineTimeline.tsx  # Live pipeline progress bar
│   │   └── dashboard/
│   │       └── SessionDashboard.tsx  # History + replay UI
│   ├── lib/
│   │   ├── brightdata.ts         # SERP + Web Unlocker client
│   │   ├── ai.ts                 # LLM client + JSON parsing utilities
│   │   ├── modelRouting.ts       # Provider/model selection per stage
│   │   └── env.ts                # Typed environment configuration
│   └── prompts/                  # Multi-stage LLM prompt templates
│       ├── signalTerminalPlan.ts
│       ├── signalTerminalSummaries.ts
│       ├── signalTerminalArtifacts.ts
│       ├── signalTerminalImpact.ts
│       └── signalTerminalChat.ts
├── convex/
│   ├── schema.ts                 # sessions + sessionEvents table definitions
│   ├── sessions.ts               # CRUD, search, 24h TTL cleanup
│   └── sessionEvents.ts          # Event log insert + query
└── public/
    ├── brightdata.svg
    └── convex.svg
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Bright Data](https://brightdata.com) account with **SERP** and **Web Unlocker** zones configured
- An [OpenAI](https://platform.openai.com) or [OpenRouter](https://openrouter.ai) API key
- A [Convex](https://convex.dev) project (free tier works)

### 1. Install dependencies

```bash
cd market-terminal
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

```env
# Bright Data
BRIGHTDATA_API_TOKEN=your_token_here
BRIGHTDATA_WEB_UNLOCKER_ZONE=unblocker
BRIGHTDATA_SERP_ZONE=serp

# AI — OpenRouter or OpenAI
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemini-2-flash-preview

# Convex
CONVEX_DEPLOYMENT=prod:your-deployment-slug
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

### 3. Deploy Convex schema

```bash
npx convex dev
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000/market-terminal](http://localhost:3000/market-terminal)

---

## API Reference

### `POST /api/run`

Starts the research pipeline. Returns a **Server-Sent Events** stream.

```json
{
  "topic": "Bitcoin",
  "question": "Why is BTC down today?",
  "mode": "fast"
}
```

| Mode | Behavior |
|---|---|
| `fast` | SERP only, broad time window, lighter AI model — ~3–5s |
| `deep` | SERP + full-page markdown extraction, richer AI summaries — ~8–15s |

**SSE event types:** `session` · `plan` · `search.partial` · `search` · `scrape.page` · `data` · `step` · `warn` · `perf.mark` · `perf.summary` · `ai.usage`

```bash
# Example curl
curl -N -X POST http://localhost:3000/market-terminal/api/run \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Bitcoin","mode":"fast"}'
```

---

### `POST /api/chat`

Answer a follow-up question grounded in a session's collected evidence.

```json
{
  "sessionId": "uuid",
  "message": "What is the strongest bullish signal?",
  "focusEvidenceIds": ["ev_1", "ev_2"]
}
```

---

### `GET /api/sessions`

List sessions with artifact counts and narrative map tags.

```
GET /api/sessions?limit=50&q=bitcoin&status=ready
```

---

### `GET /api/health?probe=1`

Live health check — actively tests Bright Data SERP, Web Unlocker, AI model, and Convex connectivity.

---

## How Bright Data Powers This

Bright Data is the data backbone of every run:

- **SERP** — Concurrent multi-query Google search with news/web vertical routing, domain diversity scoring, and automatic staleness filtering. Results are scored for editorial authority and catalyst-signal density before being fed to the LLM.
- **Web Unlocker** — Full-page markdown extraction from any URL, bypassing bot detection to deliver clean, readable content for deep-mode evidence enrichment.
- **Resilience** — Exponential backoff on 429/5xx responses, news→web fallback on empty verticals, best-effort scrape failures so the pipeline always completes and streams a result.

---

## How Convex Powers This

Convex is the persistent backbone behind each research session:

- **Session records** — Full metadata, pipeline progress, and final artifacts (`evidence`, `tape`, `nodes`, `edges`, `clusters`) stored in `meta.artifacts`
- **Event log** — Every SSE event is persisted to `sessionEvents`, enabling full replay, debugging, and performance analysis from the Dashboard
- **Auto-expiry** — Sessions are cleaned up after 24 hours via a Convex scheduled mutation
- **Non-blocking writes** — Convex persistence is fire-and-forget; the pipeline streams to the client regardless of DB latency

---

## Dashboard & Replay

Every run is logged. The `/dashboard` page shows all sessions with:

- Topic, status, mode, model used
- Artifact counts (evidence items, graph nodes/edges, narrative clusters)
- Map tags (top entities, catalysts, narrative themes extracted automatically)
- Full event trace with per-stage timing breakdowns

Click any session to re-open its evidence workspace — no re-run required.

---

## Observability

The pipeline emits granular `perf.mark` events for every sub-operation:

```
plan           →   450ms
serp[0]        →   820ms
serp[1]        →   790ms
scrape[0]      →  1240ms
ai.summaries   →  2100ms
ai.artifacts   →  3300ms
──────────────────────────
total          →   ~6.1s
```

`ai.usage` events log input/output token counts per LLM call. The `/api/health?probe=1` endpoint actively probes all external dependencies and reports configuration status.

---

<div align="center">

<br />

Built with &nbsp;<a href="https://brightdata.com"><img src="https://proxyway.com/wp-content/uploads/2022/05/bright-data-logo.png?ver=1704718964" height="18" alt="Bright Data" style="vertical-align:middle"/></a>&nbsp; and &nbsp;<a href="https://convex.dev"><img src="https://www.convex.dev/_next/static/media/logoColor.172b29ec.svg" height="16" alt="Convex" style="vertical-align:middle"/></a>

</div>
