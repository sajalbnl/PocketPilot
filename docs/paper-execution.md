# Paper execution contract

## Adapter boundary

The server-only `ExecutionAdapter` supports `getCurrentPrice`, `submitMarketOrder`, and
`closePosition`. Every open and close carries a stable client-order ID. Results normalize venue ID,
requested/fill price, base-asset quantity, fee, slippage, and execution timestamp. Adapter failures
use stable codes plus retryability and compact metadata. No exchange SDK or signing type crosses the
boundary.

Replay prices come from the latest Hyperliquid sample already ingested by the replay controller. If
the process restarted, the adapter falls back to the latest normalized Hyperliquid sample stored in
the signal evidence; an open position can finally fall back to its stored mark. The final two
`btc-trigger` events are post-trigger marks for deterministic PnL movement in step mode.

Proposal expiry uses server time because explicit approval occurs in the current human session and
historical source timestamps would otherwise expire immediately. Replay event time remains
authoritative for market marks and venue-like paper timestamps. Tests inject clocks for exact expiry
boundaries.

## Fill, quantity, fee, and PnL rules

Defaults are `PAPER_FEE_BPS=5` and `PAPER_SLIPPAGE_BPS=2`; both are configurable and non-negative.
Slippage is always adverse:

- long open: `mark * (1 + slippageBps / 10,000)`
- short open: `mark * (1 - slippageBps / 10,000)`
- long close: `mark * (1 - slippageBps / 10,000)`
- short close: `mark * (1 + slippageBps / 10,000)`

`quantity = approvedNotionalUsd / entryFillPrice`. Notional is exposure; leverage describes margin
and is not multiplied into PnL a second time. Entry fee is approved notional times the fee rate. Exit
fee is close fill price times quantity times the fee rate.

For `direction = +1` on long and `-1` on short:

```text
unrealizedPnl = direction * quantity * (currentMark - entryFill) - entryFee
realizedPnl   = direction * quantity * (closeFill - entryFill) - entryFee - exitFee
```

Money/PnL is rounded to eight decimals, quantity to twelve, and paper venue IDs are deterministic
hashes of the stable client-order ID and action.

## Transaction and testnet boundary

Paper submission is pure local calculation, so the complete approval/fill/position write runs in
one database transaction. An adapter exception is caught inside that transaction: the order becomes
FAILED, the signal becomes EXECUTION_FAILED, and no position is inserted.

The Phase 7 testnet prototype keeps the same transaction shape around a bounded external call. It
adds a stable Hyperliquid cloid and queries venue status before submission, so a process crash before
the local commit does not create a second venue order. A production service should instead: (1)
transactionally claim APPROVED/order PENDING, (2) commit, submit externally, and (3) reconcile the
venue result through a durable worker. The deliberate prototype tradeoff is documented in
`docs/architecture.md`.

The required stop is recorded and risk-checked but is not an automated paper or testnet protective
order. The app labels it accordingly.

## Focused failure checks

The default suite runs pure fill/PnL tests offline. Database checks are opt-in so ordinary unit tests
do not require PostgreSQL:

```bash
docker compose up -d db
npm run db:migrate
RUN_DB_INTEGRATION=1 npm run test -w @pocketpilot/server
```

The integration suite covers one successful fill, concurrent duplicate approval, expiry, changed
mandate, kill switch, injected adapter failure with no position, fee-inclusive close PnL, close
retry, and permanent rejection.
