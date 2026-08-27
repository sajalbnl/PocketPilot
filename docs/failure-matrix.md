# Failure matrix

Executed/reviewed: 2026-08-25. `PASS-A` means an automated test passed; `PASS-H` means the local HTTP
flow passed against PostgreSQL; `PASS-L` means a live provider check passed. `PENDING-DEVICE` and
`PENDING-CREDENTIALS` are not presented as verified.

| Scenario                               | Expected behavior                                                                        | Actual result                         | Evidence / remaining limit                                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server unavailable during mobile fetch | Clear error, configured endpoint, retry; no stale approval success                       | PASS-A (client path) / PENDING-DEVICE | `api.ts` maps fetch failure to `NETWORK`; inbox/detail/position render retry states. Android bundle passed, but the unavailable-server screen was not tapped on a physical device in this environment. |
| Duplicate approval taps                | One order and position; repeat returns existing IDs                                      | PASS-A + PASS-H                       | PostgreSQL concurrent integration test passed. Local HTTP retry returned `duplicate: true` with the same order and position IDs.                                                                       |
| Approval after expiry                  | 409 `SIGNAL_EXPIRED`, state becomes `EXPIRED`, no order                                  | PASS-A                                | PostgreSQL integration test passed. Policy also treats expiry at the current instant as expired.                                                                                                       |
| Mandate change before approval         | Current locked mandate wins; stale proposal values may be rejected                       | PASS-A                                | PostgreSQL test changed max notional from $100 to $50 before approval and received `MAX_NOTIONAL_EXCEEDED`.                                                                                            |
| Kill switch activated before approval  | 409 `KILL_SWITCH_ENABLED`; no order; existing position unchanged                         | PASS-A + PASS-H                       | Database test passed. Full HTTP rehearsal generated a valid follow-up, enabled kill switch, and received the expected 409.                                                                             |
| LLM timeout / invalid output           | Typed failure, no approvable proposal                                                    | PASS-A                                | Bounded timeout returns `TIMEOUT`; malformed JSON, schema-invalid JSON, invented evidence, and failed repair are rejected by reasoning tests.                                                          |
| Stale or missing market evidence       | No candidate and no model call                                                           | PASS-A                                | Feature tests suppress missing, stale, and misaligned cross-source evidence.                                                                                                                           |
| Push failure                           | Proposal remains available; compact error recorded; no reasoning rollback                | PASS-A / PENDING-DEVICE               | Notification test records `EXPO_PUSH_FAILED` without throwing. Real physical delivery was not repeated in this environment.                                                                            |
| Market connection loss and reconnect   | Bounded backoff, resubscribe, health visible                                             | PASS-A + PASS-L                       | WebSocket test reconnects and resends both subscriptions. Live check received BTC/ETH Hyperliquid events and one mapped Polymarket event with no pipeline error.                                       |
| Paper adapter failure                  | `EXECUTION_FAILED`, failed order, no false position                                      | PASS-A                                | PostgreSQL injected-adapter test passed. No automatic retry or adapter switch occurs.                                                                                                                  |
| Testnet rejection or timeout           | Structured failure, same cloid can reconcile, never fall back to paper                   | PASS-A / PENDING-CREDENTIALS          | Unit tests cover venue rejection, abort timeout, filled-cloid reconciliation, and no duplicate submission. No funded/authorized testnet credentials were available, so no venue order was placed.      |
| App opened from an old notification    | Validate route, fetch current server state, show unavailable/terminal state, no approval | PASS-A / PENDING-DEVICE               | Shared tests reject mismatched/tampered routes. Detail UI handles missing, expired, rejected, filled, closed, and in-progress states. Cold-start physical tap remains manual.                          |

## End-to-end rehearsal result

The full Replay + paper path passed through the real HTTP API against a clean migrated PostgreSQL
database:

1. Four deterministic fixture events created one `PENDING_APPROVAL` BTC signal.
2. `$150` returned HTTP 409 `MAX_NOTIONAL_EXCEEDED`.
3. `$100`, 2x, and a valid required stop created one filled paper order and one open position.
4. The same approval revision returned `duplicate: true` and the same IDs.
5. Queued $66,500 and $65,500 marks changed PnL positive then negative.
6. A second valid signal was created, the kill switch was enabled, and approval returned HTTP 409 `KILL_SWITCH_ENABLED`.
7. Paper close succeeded once; the repeat returned the same closed result.

## Live and build result

- Live Hyperliquid: connected, BTC/ETH subscribed, 18 normalized events, zero schema errors.
- Live Polymarket: documented market mapping polled successfully, one normalized event, zero pipeline errors.
- Expo Doctor: 21/21 checks passed.
- Android Metro export: succeeded, 1 Android Hermes bundle and 27 assets.
- EAS preview configuration: resolved successfully to an internal-distribution APK with remote credentials.
- Remote EAS APK build: not started; the verified command is documented in README.

## Known lower-impact limitations

- Physical Android push delivery, terminated-state tap, and unavailable-server UI need a device/deployed backend rehearsal.
- Testnet needs a dedicated funded account and authorized API wallet. Unit/integration code is verified; venue execution is not.
- Automated protective stops are not placed. The stop is mandatory, stored, and explicitly labelled recorded/not automated.
- Hyperliquid leverage is whole-number only in this adapter; a fractional leverage value that passes the generic mandate is rejected by the adapter.
- An immediate testnet fill may be stored with zero fee if fill history remains unavailable after bounded polling; production needs a durable reconciliation worker.
- Live Polymarket IDs expire and must be replaced with a current explicitly mapped market before a later live demo.
- `npm audit --omit=dev` reports 11 moderate `uuid` advisories through Expo/xcode configuration
  tooling. npm's proposed forced remediation downgrades Expo to 46, so it was not applied; Expo
  Doctor still passes 21/21 checks.
