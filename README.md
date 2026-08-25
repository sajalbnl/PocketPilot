# pocketpilot

pocketpilot is an Android-first control surface for a finance agent. Phase 6 adds real Expo push
alerts and live Hyperliquid/Polymarket ingestion while preserving deterministic Replay Mode and
paper execution as the guaranteed demo path.

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

| Variable             | Allowed/example value                                       | Required                  |
| -------------------- | ----------------------------------------------------------- | ------------------------- |
| `DATABASE_URL`       | `postgresql://postgres:postgres@localhost:5432/pocketpilot` | yes                       |
| `PORT`               | `3000`                                                      | defaults to `3000`        |
| `APP_BASE_URL`       | `http://localhost:3000`                                     | defaults locally          |
| `DATA_MODE`          | `replay` or `live`                                          | defaults to `replay`      |
| `EXECUTION_MODE`     | `paper` or `hyperliquid-testnet`                            | defaults to `paper`       |
| `NODE_ENV`           | `development`, `test`, or `production`                      | defaults to `development` |
| `LLM_PROVIDER`       | `fixture` or `openai`                                       | defaults to `fixture`     |
| `LLM_MODEL`          | OpenAI model with Structured Outputs support                | `gpt-4.1-mini`            |
| `OPENAI_API_KEY`     | Server-side OpenAI project API key                          | only for `openai`         |
| `OPENAI_BASE_URL`    | `https://api.openai.com/v1`                                 | defaults to official API  |
| `LLM_TIMEOUT_MS`     | Provider request timeout                                    | defaults to `20000`       |
| `LLM_MAX_RETRIES`    | Transient provider retries, `0` or `1`                      | defaults to `1`           |
| `PAPER_FEE_BPS`      | Fee charged on entry and exit notional                      | defaults to `5`           |
| `PAPER_SLIPPAGE_BPS` | Adverse paper market-fill slippage                          | defaults to `2`           |

Phase 6 adds `EXPO_ACCESS_TOKEN` (optional unless Expo push security is enabled), explicit
Hyperliquid symbol mapping, explicit Polymarket market/outcome/meaning mapping, polling/reconnect
controls, and 120-second freshness/alignment defaults. Every value is documented in `.env.example`;
the exact provider contracts and Android credential steps are in
[`docs/phase6-live-and-push.md`](docs/phase6-live-and-push.md).

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
GET  /positions
GET  /positions/:id
POST /positions/:id/close
GET  /agent/control
POST /agent/kill-switch
POST /devices/push-token
GET  /ops/health
POST /dev/replay/start
POST /dev/replay/step
POST /dev/replay/reset
GET  /dev/replay/status
```

Valid categories are `approval-required`, `monitoring`, `executed`, and `expired`. Approval accepts
`approvalRevision`, `notionalUsd`, `leverage`, and `stopLossPrice`. Approval reruns current policy,
locks the signal and mandate, derives `signalId:approval-rN`, and creates at most one filled order
and position. The position endpoint marks open PnL and the app polls it every 10 seconds.

## Clean Phase 5 replay demo

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run demo:reset
npm run dev:server
```

In a second terminal, advance exactly through the trigger and leave the two post-trigger marks for
the position screen:

```bash
curl -X POST http://localhost:3000/dev/replay/start -H 'content-type: application/json' -d '{"fixture":"btc-trigger","speed":0,"stepOnly":true}'
curl -X POST http://localhost:3000/dev/replay/step
curl -X POST http://localhost:3000/dev/replay/step
curl -X POST http://localhost:3000/dev/replay/step
```

Start the app with `npm run dev:app`. Open **Approval Required**, open BTC, enter `$150` and observe
the exact maximum-notional rejection. Correct it to `$100`; approval creates one fill and routes to
the position. Advance one replay step to mark `$66,500`, wait for the 10-second poll, then advance
again to `$65,500` to see directionally changing PnL. Close the position from the phone.

Create the next approvable signal while execution is enabled, then enable the confirmed kill switch
in the inbox and attempt approval:

```bash
curl -X POST http://localhost:3000/dev/replay/start -H 'content-type: application/json' -d '{"fixture":"btc-followup","speed":0,"stepOnly":false}'
```

The server returns `KILL_SWITCH_ENABLED`; it does not close the existing position. See
`docs/paper-execution.md` for the fill/PnL contract and `docs/replay-runbook.md` for replay details.

## Phase 6 Replay Mode with push

Keep the safe defaults in `.env`:

```bash
DATA_MODE=replay
EXECUTION_MODE=paper
```

Then run:

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run demo:reset
npm run dev:server
```

On the configured physical-device development build, start the bundler with
`npm run start:dev-client -w @pocketpilot/app`, enable Approval Alerts once, then start the fixture:

```bash
curl -X POST http://localhost:3000/dev/replay/start \
  -H 'content-type: application/json' \
  -d '{"fixture":"btc-trigger","speed":0,"stepOnly":false}'
```

The proposal transition sends at most one push. Tapping it opens the server-authoritative signal.

## Live Mode

Set `DATA_MODE=live`, leave `EXECUTION_MODE=paper`, and configure one to three current Polymarket
IDs with explicit meaning, for example:

```bash
DATA_MODE=live
EXECUTION_MODE=paper
POLYMARKET_MARKETS_JSON='[{"marketId":"701502","asset":"BTC","outcome":"No","meaning":"Bitcoin remains above $45,000 through December 31, 2026"}]'
npm run dev:server
curl http://localhost:3000/ops/health
```

Live conditions are not expected to force a proposal. The health response proves both providers are
receiving and normalizing data through the same downstream pipeline. Replay remains the recorded
trade-trigger path.

## Checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
RUN_DB_INTEGRATION=1 npm run test -w @pocketpilot/server
npm run build
```

All API timestamps are UTC ISO 8601 strings. See `docs/architecture.md` for trust boundaries,
idempotency, JSONB use, and the append-only timeline rule.
