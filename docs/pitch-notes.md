# Pitch notes

## Problem

Finance agents are useful only if a user can understand and control them when away from a desktop.
The hard product problem is not another market dashboard; it is preserving a trustworthy boundary
between probabilistic reasoning and actions that can move money.

## What I built

pocketpilot is an Android-first control surface around one narrow finance-agent loop. Hyperliquid
and Polymarket evidence enters a common pipeline. A versioned Investor Skill calculates features and
triggers a candidate. An LLM turns bounded evidence into a structured thesis. Deterministic software
then checks the user's mandate, sends a real phone approval alert, accepts edited parameters, and
executes through a paper or explicitly enabled Hyperliquid testnet adapter.

The app includes a signal inbox, evidence trace, risk preview, approval sheet, position/PnL, close,
push deep links, Replay/Live data labels, Paper/Testnet execution labels, and a kill switch. The
backend includes replay/live source adapters, schema-validated reasoning, a legal state machine,
idempotent execution, current-policy checks, bounded errors, and scoped reset tooling.

## What the demo proves

- Captured cross-market inputs produce the same BTC opportunity through the real pipeline.
- The reasoning is evidence-linked and visible, but cannot authorize execution.
- A mobile request for $150 loses to the current $100 server mandate.
- A corrected $100 approval produces one order even if the request is repeated.
- Position state and fee-inclusive paper PnL update from the normalized mark.
- The kill switch blocks a proposal that was valid before the control changed.
- Live venue health and testnet code are inspectable without making the pitch depend on either.

The most important moment is the $150 rejection. It demonstrates the architectural thesis in one
screen: the model and UI can propose, but deterministic policy remains authoritative.

## Technical tradeoffs

Replay is the recorded trigger because live conditions cannot be scheduled. Paper is a supported
execution mode because a pitch should not depend on testnet funding, liquidity, account state, or
availability. Both modes are named honestly in the UI.

The testnet adapter uses an SDK for signing, an explicit activation gate, metadata-derived precision,
stable cloids, fill/status reconciliation, reduce-only close, bounded timeouts, and no paper fallback.
It deliberately does not place a protective stop. Safe stop management would require durable order
lifecycle synchronization; storing and clearly labelling the proposed stop is more honest than
claiming incomplete protection.

The prototype uses four domain tables and JSONB for bounded evidence/timeline details. It keeps the
external execution call within a database transaction. That is simple and safe enough for one
controlled prototype order, but a production design needs an outbox and reconciliation worker.

Authentication, multi-user custody, offline sync, phone WebSockets, chat, and strategy breadth were
cut because none strengthens the central proof: explainable reasoning plus deterministic human
control.

## Lessons learned

- Idempotency crosses two systems: database uniqueness prevents local duplicates, while a stable
  venue client order ID handles “accepted remotely, not committed locally.”
- An approval is a point-in-time request, not a permission token. Mandate, daily loss, expiry, kill
  switch, and legal state must be checked again at execution time.
- Push delivery must be useful but non-authoritative. A push can fail while the proposal remains
  available; an old push must resolve current server state.
- “Market order” is venue-specific. Hyperliquid uses an aggressive IOC limit with strict price/size
  formatting and metadata-derived asset IDs.
- Honest labels are safety features. Historical Replay, Paper, Testnet, and recorded/not-automated
  stops prevent a polished demo from becoming a misleading one.

## Sensible production next steps

1. Add authentication, tenant ownership, scoped API authorization, and an audited custody model.
2. Split execution into a durable claim/outbox/reconciliation worker and continuously repair venue/local state.
3. Add atomic or fully managed protective-order lifecycle handling, including partial fills, resize, cancellation, and manual venue changes.
4. Add snapshot recovery and gap detection for live market streams plus production telemetry/alerting.
5. Add policy version pinning, audit export, incident controls, and stronger daily-loss accounting across venues.
6. Expand strategies and assets only after the first workflow has measured trust, approval conversion, rejection reasons, and execution quality.

## Outreach framing

“I built the mobile control boundary I would want around an AI finance agent: real cross-market
evidence, structured reasoning, deterministic permissions, explicit phone approval, idempotent
execution, and a kill switch. The two-minute demo is intentionally narrow, but every boundary is
designed to survive technical questioning.”
