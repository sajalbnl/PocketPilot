# pocketpilot architecture

## System shape

```text
Replay fixture or live venue adapters
                |
                v
normalized market samples -> feature window -> Investor Skill thresholds
                                                   |
                                                   v
                                           reasoning provider
                                                   |
                                                   v
                                      validated structured proposal
                                                   |
                                                   v
Android app <- REST + push/deep link <- server state/risk service
                                                   |
                                      explicit phone approval
                                                   |
                                                   v
                                  paper or testnet execution adapter
                                                   |
                                                   v
                                      order + position + PnL
```

Replay and live ingestion share normalization, feature calculation, deterministic rules, reasoning,
risk, state transitions, and persistence. Paper and Hyperliquid testnet share the approval service
and execution interface. Mode switches replace only the edge adapter.

## Trust boundaries

The Expo app is an untrusted display and input client. It may validate form shape and request an
action, but it cannot change signal state, mandate limits, execution mode, expiry, or orders. It
contains only the public API URL and Firebase/Expo client configuration.

The Node server is the authority for the mandate, state machine, current daily loss, expiry, kill
switch, explicit approval, idempotency, execution selection, and database writes. The LLM receives
bounded evidence and mandate context and returns schema-validated advisory JSON. It cannot sign,
approve, or call an execution adapter.

The signing boundary exists only inside the server process. `HYPERLIQUID_API_PRIVATE_KEY` is parsed
only by server configuration and passed to the SDK wallet. It is not returned by `/config`, `/health`,
`/ops/health`, errors, notification payloads, or mobile code. SDK/network errors are replaced with
compact allowlisted messages and non-secret metadata.

## State machine

Core flow:

```text
DETECTED -> ANALYZING -> PROPOSED -> PENDING_APPROVAL
                                      |
                                      v
                          APPROVED -> EXECUTING -> FILLED -> CLOSED
```

Terminal/blocking states are `NO_TRADE`, `REJECTED`, `RISK_BLOCKED`, `EXPIRED`, and
`EXECUTION_FAILED`. Only `appendSignalTransition` creates state changes, and each transition appends
a timestamped reason to the signal timeline. Controllers call domain services rather than updating
state directly.

Invalid model output never becomes approvable. An old notification resolves the current signal by
ID: a missing signal shows an unavailable state and a terminal/expired signal shows no approval
action.

## Approval and deterministic policy

The approval service locks the signal and current mandate, then checks:

- legal `PENDING_APPROVAL` state;
- current mandate asset and Hyperliquid venue allowlists;
- notional at or below $100;
- leverage at or below 3x;
- directionally valid required stop;
- realized daily loss below $25;
- kill switch off;
- explicit approval request present;
- signal expiry still in the future.

It checks the entire policy again immediately before adapter submission. The adapter receives only
an already-approved typed order; there is no controller route that calls an adapter directly.

## Idempotency and external-call boundary

`approvalKey = signalId + ":approval-r" + approvalRevision`. The `orders` table has unique indexes
on `approval_key` and `client_order_id`. A repeated filled revision returns its existing order and
position. A previously failed revision returns the existing failure rather than silently creating a
new order.

Paper venue IDs are deterministic hashes. Hyperliquid derives a stable 128-bit cloid from the same
client order ID and queries `orderStatus` before any submission. This covers the critical case where
the venue accepted an order but the server failed before committing local state. The provider also
rejects duplicate cloids.

The prototype keeps a database transaction open during the bounded adapter call. A production
design would use an outbox/worker sequence:

```text
transactionally claim order -> commit -> submit/reconcile by cloid -> transactionally apply result
```

That production split is deliberately excluded because it adds worker infrastructure without
improving the 90–150 second proof-of-work demo.

## Execution adapters

`ExecutionAdapter` exposes fresh price retrieval, market submission, and close. Paper fills from the
normalized mark with configured fee/slippage and deterministic IDs. Hyperliquid testnet is pinned to
the official testnet REST URL, allowlists BTC/ETH, obtains asset precision/index from metadata,
submits IOC orders, retrieves fills/status, and closes with reduce-only IOC orders after checking the
actual testnet position.

There is no automatic fallback between adapters. `EXECUTION_MODE` is stored on each order and shown
in the app. Testnet configuration requires an explicit activation gate, exact testnet network,
dedicated signing key, account address, and signer kind. Startup validates an API-wallet relationship
before listening. See [Hyperliquid testnet execution note](hyperliquid-testnet.md).

Stops are mandatory policy inputs and are stored, but neither adapter automatically manages a
protective order. The UI says this explicitly. Replay + paper is the recommended recorded-demo mode.

## Data and notification behavior

Replay uses captured, clearly historical events and an event clock. Resetting removes only data
linked to the fixed demo mandate. Live mode maintains constrained Hyperliquid and Polymarket clients,
normalizes their data, rejects stale/misaligned evidence, and reconnects the market WebSocket with
bounded exponential backoff.

The notification service claims the `PENDING_APPROVAL` transition once. Push failures are recorded
but do not roll back a valid signal. Deep-link data contains only a type, signal UUID, and matching
`pocketpilot://signals/:id` URL. The app schema-checks both before navigation.

## Deliberate scope cuts

- no mainnet or real-fund execution;
- no authentication/multi-user model;
- no automatic execution or mobile-held key;
- no automatic stop-order lifecycle;
- no durable execution reconciliation worker;
- no offline mobile database or mobile WebSocket;
- no chat, full audit UI, portfolio breadth, or additional strategies;
- no claim that replayed data is live or that a recorded stop is a placed order.
