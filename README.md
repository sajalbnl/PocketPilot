# pocketpilot

pocketpilot is an Android-first control surface for a finance agent. Phase 2 provides a seeded,
persisted product loop: browse signal categories, inspect a traceable cross-market thesis, review
the current mandate, and approve or reject an intent from a phone. It deliberately contains no live
market ingestion, LLM calls, real risk engine, notifications, orders, or execution yet.

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

| Variable         | Allowed/example value                                       | Required                  |
| ---------------- | ----------------------------------------------------------- | ------------------------- |
| `DATABASE_URL`   | `postgresql://postgres:postgres@localhost:5432/pocketpilot` | yes                       |
| `PORT`           | `3000`                                                      | defaults to `3000`        |
| `APP_BASE_URL`   | `http://localhost:3000`                                     | defaults locally          |
| `DATA_MODE`      | `replay` or `live`                                          | defaults to `replay`      |
| `EXECUTION_MODE` | `paper` or `hyperliquid-testnet`                            | defaults to `paper`       |
| `NODE_ENV`       | `development`, `test`, or `production`                      | defaults to `development` |

Never commit `.env`; only `.env.example` files are tracked. Phase 2 needs no API keys beyond
the PostgreSQL URL.

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
10-minute expiry, and the kill switch off. It also resets five stable Phase 2 signals: two awaiting
approval plus monitoring, filled, and expired examples. Re-seed whenever you want a clean demo.

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

Phase 2 endpoints:

```text
GET  /mandate
GET  /signals[?state=...][&category=...]
GET  /signals/:id
POST /signals/:id/approve
POST /signals/:id/reject
```

Valid categories are `approval-required`, `monitoring`, `executed`, and `expired`. Approval accepts
`approvalRevision`, `notionalUsd`, `leverage`, and `stopLossPrice`. The Phase 2 stub persists the
approval state and edited terms but explicitly defers order creation/execution.

## Exact mobile demo flow

1. Seed immediately before the demo so the two ten-minute approval proposals are fresh.
2. Open **Approval Required** and select the rich BTC long proposal.
3. Review Why now, both evidence cards, Investor Skill rules, risk preview, terms, mandate, and timeline.
4. Open **Review approval parameters**, edit values within $100/3x, and approve. The signal moves to Monitoring as `APPROVED`.
5. Return to Approval Required, open the ETH short proposal, and reject it. It moves to Expired as `REJECTED`.
6. Browse Monitoring, Executed, and Expired to see every seeded category. Pull down on any list/detail to reconcile from PostgreSQL.

Stopping/restarting the server does not reset actions. Run `npm run db:seed` to intentionally reset
the demo state.

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
