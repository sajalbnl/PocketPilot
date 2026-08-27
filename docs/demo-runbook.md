# Demo runbook

Recommended recording modes: `DATA_MODE=replay`, `EXECUTION_MODE=paper`,
`LLM_PROVIDER=fixture`. This is the guaranteed path and is intentionally labelled in the app.

## Clean-reset checklist

- Physical Android development build installed; phone and server can reach each other.
- `app/.env` points at the reachable HTTPS backend or development computer LAN IP.
- Notification permission granted and the app shows Approval Alerts ON.
- `.env` is Replay + paper + fixture reasoning. No testnet key is needed.
- PostgreSQL is running and port 3000 is free.
- Kill switch is off; there are no demo signals or positions.
- Phone screen recording, font scale, and Do Not Disturb are set as desired.

Run the safe preparation command from the repository root:

```bash
npm run demo:prepare
```

It checks Node/dependencies and the two environment files, refuses non-Replay/non-paper modes,
migrates, seeds the fixed demo mandate, and removes only data linked to that mandate. It does not
drop a database, reset another mandate, or delete files.

Start the server and physical-device bundler in separate terminals:

```bash
npm run dev:server
```

```bash
npm run start:dev-client -w @pocketpilot/app
```

Prepare the deterministic trigger. `start` consumes the first event; the three `step` calls consume
events 2–4. The fourth event creates the BTC proposal and sends push, while two later BTC marks stay
queued for the PnL demonstration.

```bash
curl -X POST http://localhost:3000/dev/replay/start -H 'content-type: application/json' -d '{"fixture":"btc-trigger","speed":0,"stepOnly":true}'
curl -X POST http://localhost:3000/dev/replay/step
curl -X POST http://localhost:3000/dev/replay/step
curl -X POST http://localhost:3000/dev/replay/step
```

Expected signal: **BTC bullish cross-market confirmation**, LONG, $100, 2x, required stop at
$64,680, with Hyperliquid price/volume/OI/funding plus Polymarket probability/liquidity evidence.

## 90–150 second tap and narration sequence

| Time     | Action                                                                                                                                           | Narration / proof                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0–8s     | Begin on the Android home screen. Show the real approval notification and tap it.                                                                | “pocketpilot is the mobile control surface for an always-running finance agent. This is clearly Historical Replay and paper execution.”                            |
| 8–30s    | The deep link opens BTC Signal Trace. Scroll through thesis, why-now, both evidence sources, Investor Skill rules, and deterministic guardrails. | “The model explains bounded evidence. It does not authorize or sign anything.”                                                                                     |
| 30–48s   | Tap **Review approval parameters**, change notional to `150`, then tap approve.                                                                  | “The phone can request $150, but the current server mandate caps a position at $100.” Show the exact `maximum-notional` failure.                                   |
| 48–62s   | Correct notional to `100` and tap approve once.                                                                                                  | “The server reruns current mandate, daily loss, expiry, stop, kill switch, legal state, and idempotency immediately before execution.”                             |
| 62–75s   | Position opens. Point to PAPER, entry, size, fee-inclusive PnL, and **Recorded stop · not automated**.                                           | “One approval revision produced exactly one paper order and one position. The stop is honest: required and recorded, not claimed as an exchange protective order.” |
| 75–87s   | From the operator terminal, call `/dev/replay/step`; after refresh/PnL poll, call it once more.                                                  | “Replay advances the same normalized mark pipeline.” The queued marks are $66,500 then $65,500.                                                                    |
| 87–100s  | Generate the follow-up signal from the operator terminal with the command below, then return to inbox.                                           | “Now I’ll show that control is current, not captured when the proposal was made.”                                                                                  |
| 100–112s | Tap Agent Control, confirm **Enable kill switch**, and show success feedback.                                                                    | “The kill switch is server-authoritative and blocks new execution without pretending to close an existing position.”                                               |
| 112–135s | Open the follow-up Approval Required signal, open approval, leave $100, and tap approve.                                                         | Show `KILL_SWITCH_ENABLED`; no order or position is created. “The deterministic boundary wins over both the model and the UI.”                                     |

PnL steps:

```bash
curl -X POST http://localhost:3000/dev/replay/step
curl -X POST http://localhost:3000/dev/replay/step
```

Follow-up signal, generated before enabling the kill switch:

```bash
curl -X POST http://localhost:3000/dev/replay/start -H 'content-type: application/json' -d '{"fixture":"btc-followup","speed":0,"stepOnly":false}'
```

## Expected acceptance points

- Header says `REPLAY · PAPER`; no replay data is called live.
- Notification opens the exact signal UUID.
- $150 fails with `MAX_NOTIONAL_EXCEEDED`; $100 fills.
- Repeated approval of revision 1 returns the same order/position.
- Position mode says PAPER and the stop says recorded/not automated.
- Kill switch success is visible and follow-up approval fails with `KILL_SWITCH_ENABLED`.
- No hidden database edit is used during the recording.

## Recovery

If the server or app is restarted before the first approval, reopen the current signal from the
inbox; state is server-owned. If push fails, the proposal remains under Approval Required and the
notification failure is inspectable separately. If the take is contaminated, stop both processes
and rerun `npm run demo:prepare`; it resets only the demo mandate.

Do not switch to testnet during the recorded pitch. Demonstrate testnet implementation separately
only after the dedicated wallet is funded and the manual steps in
[the testnet note](hyperliquid-testnet.md) pass.
