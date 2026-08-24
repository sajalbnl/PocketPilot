# pocketpilot

pocketpilot is an Android-first control surface for a finance agent. Phase 4 carries deterministic
Replay Mode candidates across a strict advisory LLM boundary, validates evidence-grounded output,
and applies deterministic policy before and during mobile approval. Notifications, orders, and
execution remain later phases.

## Prerequisites

- Node.js 22 or newer and npm 10 or newer
- PostgreSQL 15 or newer, or Docker with Compose
- Android Studio/emulator or a physical Android device for the mobile shell

## Install and configure

```bash
npm install
cp .env.example .env
cp app/.env.example app/.env
```

The example environment uses local PostgreSQL and safe prototype modes:

| Variable          | Allowed/example value                                       | Required                  |
| ----------------- | ----------------------------------------------------------- | ------------------------- |
| `DATABASE_URL`    | `postgresql://postgres:postgres@localhost:5432/pocketpilot` | yes                       |
| `PORT`            | `3000`                                                      | defaults to `3000`        |
| `APP_BASE_URL`    | `http://localhost:3000`                                     | defaults locally          |
| `DATA_MODE`       | `replay` or `live`                                          | defaults to `replay`      |
| `EXECUTION_MODE`  | `paper` or `hyperliquid-testnet`                            | defaults to `paper`       |
| `NODE_ENV`        | `development`, `test`, or `production`                      | defaults to `development` |
| `LLM_PROVIDER`    | `fixture` or `openai`                                       | defaults to `fixture`     |
| `LLM_MODEL`       | OpenAI model with Structured Outputs support                | `gpt-4.1-mini`            |
| `OPENAI_API_KEY`  | Server-side OpenAI project API key                          | only for `openai`         |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1`                                 | defaults to official API  |
| `LLM_TIMEOUT_MS`  | Provider request timeout                                    | defaults to `20000`       |
| `LLM_MAX_RETRIES` | Transient provider retries, `0` or `1`                      | defaults to `1`           |

Never commit `.env`; only `.env.example` files are tracked. `LLM_PROVIDER=fixture` is deterministic,
offline, and recommended for replay/tests. For the real provider, create a project API key in the
OpenAI Platform dashboard, store it only as the backend's `OPENAI_API_KEY`, and set
`LLM_PROVIDER=openai`. Never put this key in the Expo environment.

`app/.env` configures `EXPO_PUBLIC_API_URL`. Keep `http://10.0.2.2:3000` for the standard Android
emulator. For a physical phone, replace `10.0.2.2` with the development computer's LAN IP; keep the
phone and computer on the same network and allow inbound port 3000 through the host firewall.

## Database

For the included local database:

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed
```

`npm run db:seed` is repeatable. It upserts one stable mandate allowing BTC/ETH on Hyperliquid, with
a $100 maximum notional, 3x maximum leverage, $25 daily-loss limit, required stop and approval,
10-minute expiry, and the kill switch off. It does not insert opportunities; Replay Mode is the only
Phase 3 opportunity source.

After changing the Drizzle schema, create a new checked-in migration with `npm run db:generate`.

## Run

Start the API and app in separate terminals:

```bash
npm run dev:server
npm run dev:app
```

Press `a` in the Expo terminal to open Android, or run `npm run android`. Verify the API with:

```bash
curl http://localhost:3000/health
```

The endpoint returns HTTP 200 with `database: "up"` when PostgreSQL is reachable and HTTP 503 with
`database: "down"` otherwise. `GET /config` exposes the non-secret runtime modes and server time.
Unknown routes and request failures use the shared JSON error shape.

Signal and Phase 4 replay endpoints:

```text
GET  /mandate
GET  /signals[?state=...][&category=...]
GET  /signals/:id
POST /signals/:id/approve
POST /signals/:id/reject
POST /dev/replay/start
POST /dev/replay/step
POST /dev/replay/reset
GET  /dev/replay/status
```

Valid categories are `approval-required`, `monitoring`, `executed`, and `expired`. Approval accepts
`approvalRevision`, `notionalUsd`, `leverage`, and `stopLossPrice`. Approval reruns current policy
against edited terms and returns a typed policy preview on rejection. A passing request persists an
`APPROVED` intent but explicitly defers order creation/execution to Phase 5.

## Replay demo

```bash
npm run replay:reset
npm run replay -- --fixture btc-trigger --speed 0
```

Open **Approval Required** in the mobile app and select the generated BTC signal. It exposes source
snapshots, grounded AI reasoning, numeric features, triggered rule IDs, individual deterministic
risk checks, prompt/model metadata, and the timeline. Entering `$150` reaches the backend and fails
`maximum-notional`; correcting it to `$100` passes policy and becomes ready for Phase 5. See
`docs/replay-runbook.md` for speed, stepping, the no-trigger fixture, and formulas.

## Checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

All API timestamps are UTC ISO 8601 strings. See `docs/architecture.md` for trust boundaries,
idempotency, JSONB use, and the append-only timeline rule.
