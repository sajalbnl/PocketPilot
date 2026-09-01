# pocketpilot

pocketpilot is an Android control surface for a market-watching finance agent. It turns bounded
Hyperliquid and Polymarket evidence into an explainable trade proposal, asks for explicit phone
approval, reruns deterministic safety checks, and executes through either a reliable paper adapter
or an explicitly armed Hyperliquid testnet adapter.

The guaranteed demo uses historical Replay data, fixture reasoning, and paper execution. Live data
and testnet execution are separate, inspectable upgrades—never hidden fallbacks.

## What it demonstrates

- Deterministic Replay and live Hyperliquid/Polymarket ingestion behind one normalized pipeline.
- A versioned Investor Skill plus schema-validated reasoning grounded in supplied evidence.
- Server-authoritative limits: $100 notional, 3x leverage, required stop, daily loss, expiry, legal
  state, kill switch, and idempotency.
- Android inbox, signal trace, approval editing, push/deep links, position/PnL, close, and control.
- Idempotent paper execution and testnet-only signed Hyperliquid IOC execution with no paper fallback.

```text
Replay fixtures or live providers
              ↓
normalize → Investor Skill → structured thesis → phone approval
                                                ↓
                                  deterministic risk checks
                                                ↓
                                  paper or testnet adapter
                                                ↓
                                      order → position → PnL
```

## Stack

TypeScript monorepo · Expo/React Native · Node/Express · PostgreSQL/Drizzle · Zod · Vitest · Expo
Push · Hyperliquid API

## Quick start

Requires Node.js 22+, npm 10+, PostgreSQL 15+ (or Docker), and an Android emulator or device.

```bash
npm install
cp .env.example .env
cp app/.env.example app/.env
docker compose up -d db
npm run demo:prepare
```

`demo:prepare` validates the safe Replay + paper configuration, migrates and seeds PostgreSQL, and
resets only data belonging to the prototype mandate.

Start the server and app in separate terminals:

```bash
npm run dev:server
```

```bash
npm run dev:app
```

`app/.env` defaults to `http://10.0.2.2:3000` for the Android emulator. For a physical device, use
your computer's reachable LAN address and keep both devices on the same network. Remote push on
Android requires the configured development/preview build; see
[Live data and push](docs/phase6-live-and-push.md).

## Deterministic demo

With the server running, consume the four trigger events:

```bash
curl -X POST http://localhost:3000/dev/replay/start -H 'content-type: application/json' -d '{"fixture":"btc-trigger","speed":0,"stepOnly":true}'
curl -X POST http://localhost:3000/dev/replay/step
curl -X POST http://localhost:3000/dev/replay/step
curl -X POST http://localhost:3000/dev/replay/step
```

The app receives one BTC approval proposal. Enter `$150` to show the mandate rejection, correct it
to `$100` to create one paper position, then use the two remaining replay steps to move PnL. The
exact recording sequence and recovery steps are in the [demo runbook](docs/demo-runbook.md).

## Runtime modes

| Data   | Execution           | Purpose                                                      |
| ------ | ------------------- | ------------------------------------------------------------ |
| Replay | Paper               | Deterministic, guaranteed pitch path                         |
| Replay | Hyperliquid testnet | Repeatable signal with an actual testnet-only order          |
| Live   | Paper               | Inspect current ingestion without external execution         |
| Live   | Hyperliquid testnet | Advanced testnet verification; not the recorded-demo default |

The root `.env` is server-only. Testnet execution requires all of the following and fails closed if
any value is missing or ambiguous:

```env
EXECUTION_MODE=hyperliquid-testnet
HYPERLIQUID_NETWORK=testnet
HYPERLIQUID_TESTNET_ENABLED=true
HYPERLIQUID_API_PRIVATE_KEY=...
HYPERLIQUID_ACCOUNT_ADDRESS=...
HYPERLIQUID_SIGNER_KIND=account
```

Prefer a dedicated API wallet. Never place signing keys or OpenAI credentials in `app/.env`, source
control, logs, screenshots, or any `EXPO_PUBLIC_*` variable. Mainnet execution is not implemented.
See the [Hyperliquid testnet note](docs/hyperliquid-testnet.md) before enabling this mode.

## Useful commands

| Command                                                    | Purpose                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `npm run demo:prepare`                                     | Validate, migrate, seed, and safely reset the paper demo |
| `npm run demo:reset`                                       | Reset only prototype mandate data                        |
| `npm run replay -- --fixture btc-trigger --speed 0`        | Run Replay from the CLI                                  |
| `npm run typecheck`                                        | Typecheck shared, server, and app workspaces             |
| `npm run lint`                                             | Run ESLint                                               |
| `npm run format:check`                                     | Check Prettier formatting                                |
| `npm test`                                                 | Run shared and server tests                              |
| `RUN_DB_INTEGRATION=1 npm run test -w @pocketpilot/server` | Run PostgreSQL integration tests                         |
| `npm run build`                                            | Build shared and server packages                         |

Build an installable Android preview APK with:

```bash
cd app
npx eas-cli@latest build --platform android --profile preview
```

## Repository map

```text
app/       Expo Android client
server/    HTTP API, domain services, ingestion, reasoning, risk, execution
shared/    Runtime contracts and state machine shared by app and server
skills/    Versioned Investor Skill
fixtures/  Deterministic Replay inputs
docs/      Architecture, runbooks, verification, and pitch notes
```

## Documentation

- [Architecture and trust boundaries](docs/architecture.md)
- [Demo runbook](docs/demo-runbook.md)
- [Replay Mode](docs/replay-runbook.md)
- [Paper execution contract](docs/paper-execution.md)
- [Hyperliquid testnet execution](docs/hyperliquid-testnet.md)
- [Live data and push](docs/phase6-live-and-push.md)
- [Failure matrix](docs/failure-matrix.md)
- [Pitch notes](docs/pitch-notes.md)

## Deliberate limits

This is a proof-of-work prototype, not a production trading system. It has no mainnet execution,
authentication, multi-user isolation, automatic protective-order management, or durable execution
reconciliation worker. Stops are required and recorded but are not automatically placed. Replay +
paper remains the recommended demo configuration.
