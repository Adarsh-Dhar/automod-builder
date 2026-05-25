# AutoMod Builder (RuleStage)

> An AI-powered AutoModerator rule builder, debugger, and simulator — deployed as a native Reddit app via [Devvit](https://developers.reddit.com/).

AutoMod Builder gives subreddit moderators a full-featured workbench for creating, testing, and deploying Reddit AutoModerator YAML rules — entirely inside Reddit. It combines a YAML code editor, a conversational AI rule builder, a real-post debugger, a spam-obfuscation decoder, and a TypeScript escape hatch for logic that YAML simply can't express.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Core concepts](#core-concepts)
  - [Modes](#modes)
  - [Rule lifecycle](#rule-lifecycle)
  - [Blast radius](#blast-radius)
  - [Community ranking](#community-ranking)
- [API routes](#api-routes)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Feature | Description |
|---|---|
| **Code mode** | Full YAML editor with live parse/validate feedback |
| **Chat mode** | Describe a rule in plain English; Gemini generates valid AutoMod YAML |
| **Debugger** | Test any real Reddit post URL or a fully synthetic mock post against your rule |
| **Decoder** | Analyse Unicode-obfuscated spam campaigns across 3 examples and generate a matching YAML rule |
| **Escape hatch** | Detect YAML limitations (external APIs, database checks, complex logic) and auto-generate a Devvit TypeScript trigger instead |
| **Test matrix** | Run every saved rule snapshot × saved mock test in a colour-coded grid |
| **Blast radius** | Simulate your rule against recent real posts in the subreddit and see what percentage it would catch |
| **History snapshots** | Every save creates a named snapshot; one-click restore to any prior state |
| **Community ranking** | Engagement-based flair system (Newcomer → Verified → Silver → Gold → Platinum) tied to time in app, posts viewed, and comments |
| **Wiki sync** | Rules are persisted to the subreddit's live AutoModerator wiki page automatically |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Client (React iFrame)                      │
│  Code · Chat · Debugger · Decoder · Escape Hatch · Matrix   │
└───────────────────────┬─────────────────────────────────────┘
                        │ fetch /api/…
┌───────────────────────▼─────────────────────────────────────┐
│              Server (Hono · Devvit serverless)               │
│  rule-stage · api · rank · triggers · forms · menu          │
│                                                              │
│  Services                                                    │
│  automod · debugger · blast-radius · model-proxy            │
│  escape-hatch · rank · gemini-key                           │
└──────┬──────────────┬────────────────────┬──────────────────┘
       │              │                    │
  Reddit API     Gemini API          Devvit Redis
  (posts/wiki/   (YAML gen /         (rule drafts /
   flair/events)  decode / TS gen)    blast cache / rank)
```

The client runs in a sandboxed iFrame on Reddit.com. The server executes in Devvit's Node.js serverless environment and has direct access to Reddit context, Redis, and the Reddit API via `@devvit/web/server`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, Vite 6 |
| Backend | Node.js 22, Hono, Devvit Web |
| AI | Google Gemini API (`gemini-2.0-flash-exp` default) |
| Storage | Devvit Redis (key-value) |
| Platform | Reddit Devvit |
| Testing | Vitest |
| Language | TypeScript 5 (strict) |
| Linting | ESLint 9 (flat config) |

---

## Prerequisites

- **Node.js 22+** — required by Devvit Web
- **npm 10+** (or pnpm 9+)
- **A Reddit account** connected to [Reddit developers](https://developers.reddit.com/)
- **Devvit CLI** installed globally:

```bash
npm install -g devvit
```

- **A Gemini API key** — obtain one free at [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/automod-builder.git
cd automod-builder
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:

```env
GEMINI_API_KEY=your_key_here
```

See [Environment variables](#environment-variables) for the full list.

### 4. Log in to Devvit

```bash
npm run login
```

Follow the browser prompt to authorise your Reddit account.

### 5. Start the development server

```bash
npm run dev
```

Devvit will give you a URL to open your app live on Reddit in playtest mode. Any code change triggers a hot rebuild.

> **Playtest note:** If the playtest connection drops, run `npm run dev:fixplaytest` to reset the socket.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (production) | Google Gemini API key for all AI features |
| `GITHUB_MODEL_ENDPOINT` | No | Alternative LLM endpoint for local development |
| `GITHUB_API_KEY` | No | API key for the GitHub model endpoint |
| `GITHUB_MODEL_ID` | No | Model ID for the GitHub endpoint (default: `gpt-4o`) |
| `NODE_ENV` | No | `development` or `production` (default: `development`) |

In production, `GEMINI_API_KEY` is stored as a Devvit secret via `devvit settings set GEMINI_API_KEY` and resolved server-side by `gemini-key.service.ts`. It is never exposed to the client.

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start live playtest on Reddit (hot reload) |
| `npm run build` | Build client and server for production |
| `npm run deploy` | Type-check → lint → test → upload to Devvit |
| `npm run launch` | Deploy and publish app for Reddit review |
| `npm run test` | Run unit tests with Vitest |
| `npm run test:all` | Run full integration test suite |
| `npm run type-check` | TypeScript type check (all workspaces) |
| `npm run lint` | ESLint across `src/client`, `src/server`, `src/shared` |
| `npm run prettier` | Format all files with Prettier |
| `npm run login` | Log in to Devvit CLI |

---

## Project structure

```
automod-builder/
├── src/
│   ├── client/                   # React frontend (iFrame)
│   │   ├── components/
│   │   │   ├── ChatMode.tsx        # AI chat interface
│   │   │   ├── CodeMode.tsx        # YAML editor
│   │   │   ├── DebuggerMode.tsx    # Post tester
│   │   │   ├── DebugResultCard.tsx # Per-condition debug output
│   │   │   ├── HistoryPanel.tsx    # Snapshot restore
│   │   │   ├── TestMatrixView.tsx  # Rule × test grid
│   │   │   ├── layout/             # Shell, tabs, topbar, right panel
│   │   │   └── ui/                 # shadcn/ui primitives
│   │   ├── pages/
│   │   │   ├── RuleStagePage.tsx   # Main workspace (all modes)
│   │   │   ├── HubPage.tsx         # Community hub
│   │   │   ├── FeedPage.tsx        # Post feed
│   │   │   ├── ChatPage.tsx        # Messaging
│   │   │   └── ProfilePage.tsx     # User profile & rank
│   │   ├── contexts/               # React context (init, theme)
│   │   ├── hooks/                  # Custom hooks
│   │   ├── lib/                    # Shared utils, types, Devvit helpers
│   │   └── utils/                  # debug, gemini, history, test-matrix, yaml-ast
│   │
│   ├── server/                   # Hono backend (Devvit serverless)
│   │   ├── routes/
│   │   │   ├── rule-stage.ts       # CRUD + AI chat for rules
│   │   │   ├── api.ts              # General API endpoints
│   │   │   ├── rank.ts             # Rank/XP/flair endpoints
│   │   │   ├── triggers.ts         # Reddit event handlers
│   │   │   ├── menu.ts             # Moderator menu actions
│   │   │   └── forms.ts            # Devvit form handlers
│   │   ├── services/
│   │   │   ├── automod.service.ts  # Rule parse/serialize/wiki sync
│   │   │   ├── debugger.service.ts # Live post evaluation
│   │   │   ├── blast-radius.service.ts  # Bulk simulation
│   │   │   ├── model-proxy.service.ts   # Gemini API wrapper
│   │   │   ├── escape-hatch.service.ts  # TypeScript code gen
│   │   │   ├── rank.service.ts          # Engagement ranking
│   │   │   └── gemini-key.service.ts    # API key resolution
│   │   ├── templates/
│   │   │   └── escape-hatch-templates.ts  # Pre-built TS trigger templates
│   │   ├── core/
│   │   │   └── post.ts             # Post context helpers
│   │   └── index.ts                # Hono app entry point
│   │
│   └── shared/                   # Code shared between client and server
│       ├── automod.ts              # Rule types, evaluator, prompt builders
│       ├── debug-types.ts          # Debug response shape
│       ├── blast-types.ts          # Blast radius result types
│       ├── rank-types.ts           # Rank levels, thresholds, profiles
│       └── api.ts                  # Shared API contracts
│
├── devvit.json                   # Devvit app config (permissions, menu, triggers)
├── vite.config.ts                # Vite build config
├── vitest.config.ts              # Unit test config
├── vitest.config.integration.ts  # Integration test config
├── tools/                        # TypeScript project references
└── public/                       # Static assets and icons
```

---

## Core concepts

### Modes

The main workspace (`RuleStagePage`) is a tabbed interface with six modes. All modes share the same live rule state — switching modes does not discard your work, and any mode can update the current YAML.

### Rule lifecycle

1. **Load** — on startup, the app fetches the live YAML from the subreddit's AutoModerator wiki. If unavailable, it falls back to the Redis draft cache.
2. **Edit** — changes are debounced and saved to Redis as a draft.
3. **Save** — publishes the rule to both Redis and the wiki page, and creates a history snapshot.
4. **Restore** — any prior snapshot can be applied, which updates both the editor and the wiki.

The wiki is the source of truth. Redis is the draft cache.

### Blast radius

When a rule is saved, the app simulates it against a cached set of recent real posts from the subreddit (stored in Redis). The result shows:

- **Total posts tested**
- **Would catch** — how many would be removed/approved/reported
- **Catch rate** — expressed as a percentage

This answers "how aggressive is this rule against real traffic?" before it goes live.

### Community ranking

A five-tier engagement system automatically tracks user activity:

| Level | Name | Requirements |
|---|---|---|
| 0 | Newcomer | No requirements |
| 1 | Verified | 10 min in app · 10 posts viewed · 1 comment |
| 2 | Silver | 30 min · 20 posts · 5 comments · account age ≥ 14 days |
| 3 | Gold | 2 hrs · 50 posts · 20 comments · account age ≥ 30 days |
| 4 | Platinum | 5 hrs · 100 posts · 50 comments |

On level-up, the user's Reddit flair is updated automatically via the Reddit API. Thresholds are configurable by moderators.

---

## API routes

All routes are served by the Hono backend under `/api/`.

### Rule stage (`/api/rule-stage/`)

| Method | Path | Description |
|---|---|---|
| GET | `/init` | Load current rule from Redis |
| POST | `/save` | Save rule to Redis and wiki |
| GET | `/live-yaml` | Read raw YAML from the AutoMod wiki page |
| POST | `/chat` | AI chat turn — returns updated YAML |
| POST | `/debug` | Debug a real Reddit post against the rule |
| POST | `/debug-mock` | Debug a synthetic mock post against the rule |
| POST | `/blast` | Run blast-radius simulation |
| POST | `/escape-hatch` | Analyse YAML limitation and generate TS trigger |
| POST | `/decode` | Decode obfuscated spam and generate YAML |
| POST | `/reset` | Reset rule to default |

### Rank (`/api/rank/`)

| Method | Path | Description |
|---|---|---|
| GET | `/profile` | Get the current user's rank profile |
| POST | `/heartbeat` | Record time-in-app activity |
| POST | `/post-view` | Record a post view |
| GET | `/leaderboard` | Get top users for the subreddit |

---

## Testing

The test suite is split into two configurations.

**Unit tests** (fast, no Reddit context):

```bash
npm run test
```

**Integration tests** (full service integration with mocked Devvit context):

```bash
npm run test:all
```

Key test files:

- `comprehensive.test.ts` — rule evaluation, serialization, round-trip parsing
- `debugger.service.test.ts` — post evaluation and condition scoring
- `blast-radius.service.test.ts` — bulk simulation logic
- `unified-chat.test.ts` — chat mode AI response handling
- `context-integration.test.ts` — Devvit context isolation between subreddits
- `api-routes.integration.test.ts` — full HTTP route integration

Run a single test file:

```bash
npm run test -- rule-stage.chat
```

---

## Deployment

### Upload a new version

```bash
npm run deploy
```

This runs `type-check → lint → test → devvit upload` in sequence. The upload step will fail if any check fails.

### Publish for public listing

```bash
npm run launch
```

This runs `deploy` first, then submits the app for Reddit's review process.

### Setting production secrets

Store the Gemini API key as a Devvit secret (never committed to source):

```bash
devvit settings set GEMINI_API_KEY
```

Devvit injects this into the server environment at runtime.

### App permissions

The app declares the following permissions in `devvit.json`:

- **HTTP** — outbound requests to `generativelanguage.googleapis.com` (Gemini) only
- **Reddit** — read/write access to posts, wiki, and user flair

---

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes, following the code style guidelines below
3. Run the full check before opening a PR: `npm run type-check && npm run lint && npm run test:all`
4. Open a pull request with a clear description of what changed and why

### Code style

- Prefer type aliases over interfaces in TypeScript
- Prefer named exports over default exports
- Never cast TypeScript types (`as`)
- Do not use `@devvit/public-api` or Blocks — this project uses Devvit Web only
- New server endpoints must be registered in `devvit.json` if they handle a menu item or trigger

---

## License

MIT — see [LICENSE](./LICENSE) for details.