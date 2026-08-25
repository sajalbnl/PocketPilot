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

## Transaction and future testnet boundary

Paper submission is pure local calculation, so the complete approval/fill/position write runs in
one database transaction. An adapter exception is caught inside that transaction: the order becomes
FAILED, the signal becomes EXECUTION_FAILED, and no position is inserted.

A networked Hyperliquid adapter must not hold a database transaction open across an exchange call.
Phase 6 should split this into: (1) transactionally claim APPROVED/order PENDING with the stable
client-order ID, (2) commit, submit externally with that ID, and (3) transactionally reconcile the
venue result into FILLED/position or a known failure. After timeout or process crash it must query by
client-order ID before retrying; an unknown result stays EXECUTING and must never create a second
order. This is the unavoidable external-call boundary that paper mode does not have.

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
