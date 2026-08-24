# Replay Mode runbook

Replay Mode is offline after dependencies are installed. It reads committed JSONL events, advances
an explicit event-time clock, normalizes source-shaped payloads, calculates features, evaluates the
versioned Investor Skill, and persists a `DETECTED` signal through the normal signal repository.

## Reset and run

```bash
npm run replay:reset
npm run replay -- --fixture btc-trigger --speed 0
```

Expected summary (the stable UUID is derived from the deduplication key):

```text
Replay btc-catalyst-demo-2025-05-23 complete events=4/4 created=1 deduplicated=0 signals=0ea64328-4a8b-4a28-9ee9-d8759c546260
```

Running the same command again reports `created=0 deduplicated=1` and returns the same signal ID.
The negative control creates no signal:

```bash
npm run replay -- --fixture btc-no-trigger --speed 0
```

Use `--speed 1000` to play five minutes of event time in about 300 milliseconds. `--speed 1` is
real-time and takes five minutes. A speed of zero processes immediately.

With the server running, step through one event at a time:

```bash
curl -X POST http://localhost:3000/dev/replay/start \
  -H 'content-type: application/json' \
  -d '{"fixture":"btc-trigger","speed":0,"stepOnly":true}'
curl -X POST http://localhost:3000/dev/replay/step
curl http://localhost:3000/dev/replay/status
```

The developer endpoints are not registered in production. Reset deletes only replay-mode signals
with a non-null Phase 3 candidate key; mandates, manual/seeded signals, orders, positions, and live
signals are untouched.

## Formulas and missing data

All windows use source event time and include both endpoints of the configured five-minute window.
For a feature, `first` and `latest` mean the chronologically first and latest normalized sample in
that window. Polymarket samples must map to the same asset and latest market identity.

- Price return percent = `(latest mark / first mark - 1) * 100`.
- Volume ratio = `latest 24h USD-volume sample / first 24h USD-volume sample`.
- Funding level = latest eight-hour decimal funding rate.
- Funding change in basis points = `(latest funding - first funding) * 10,000`.
- Open-interest change percent = `(latest USD OI / first USD OI - 1) * 100`; normalized USD OI is
  source coin OI times mark price.
- Polymarket probability movement in points = `(latest probability - first probability) * 100`.
- Polymarket liquidity is the latest normalized USD value.
- Source recency is the older source's age at evaluation: `max(asOf - latest HL, asOf - latest PM)`
  in seconds.
- Evidence completeness is `1` only when both required sources have at least two samples and every
  named feature can be calculated; otherwise it is `0`.

Zero denominators, absent samples, mismatched assets/markets, and incomplete windows produce a
missing feature or completeness `0`. The configured `no_candidate` policy means any failed or
missing required rule creates no candidate.
