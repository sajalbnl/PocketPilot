# pocketpilot

pocketpilot is an Android-first control surface for a finance agent. Phase 1 provides the Expo Router
shell, shared Zod contracts and signal lifecycle, PostgreSQL/Drizzle persistence, and a validated
Express health endpoint. It deliberately contains no market ingestion, LLM calls, risk evaluation,
notifications, or trade execution yet.

## Prerequisites

- Node.js 22 or newer and npm 10 or newer
- PostgreSQL 15 or newer, or Docker with Compose
- Android Studio/emulator or a physical Android device for the mobile shell

## Install and configure

```bash
npm install
cp .env.example .env
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

Never commit `.env`; only `.env.example` is tracked. Phase 1 needs no API keys or credentials beyond
the PostgreSQL URL.

## Database

For the included local database:

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed
```

`npm run db:seed` is repeatable. It upserts one stable mandate allowing BTC/ETH on Hyperliquid, with
a $100 maximum notional, 3x maximum leverage, $25 daily-loss limit, required stop and approval,
10-minute expiry, and the kill switch off.

After changing the Drizzle schema, create a new checked-in migration with `npm run db:generate`.

## Run

Start the API and app in separate terminals:

```bash
npm run dev:server
npm run dev:app
```

Press `a` in the Expo terminal to open Android, or run `npm run android`. The app is intentionally a
foundation screen in this phase. Verify the API with:

```bash
curl http://localhost:3000/health
```

The endpoint returns HTTP 200 with `database: "up"` when PostgreSQL is reachable and HTTP 503 with
`database: "down"` otherwise. `GET /config` exposes the non-secret runtime modes and server time.
Unknown routes and request failures use the shared JSON error shape.

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
