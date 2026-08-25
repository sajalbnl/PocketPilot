# Phase 5 architecture

## Trust boundaries

`shared/` contains the framework-independent runtime contracts and the only signal transition map.
The app and server consume its compiled package. The server is authoritative for persistence and
risk and execution; the mobile app never directly changes lifecycle state or submits venue orders.

The server's domain transition helper validates a transition first and returns a new timeline array.
Callers persist that array as one JSONB value. Existing entries are never edited or removed, making
the signal timeline append-only by application rule without adding a fifth audit table.

## Persistence

PostgreSQL contains exactly four domain tables: `mandates`, `signals`, `orders`, and `positions`.
Evidence, triggered rules, LLM output, risk previews, signal timelines, and compact execution errors
use JSONB. The unique `orders.approval_key` constraint is the database backstop for future approval
idempotency; `positions.order_id` is also unique so one fill cannot create multiple positions.

Drizzle's TypeScript enum declarations import the same constant tuples used by shared Zod schemas.
The checked-in SQL migration is the deployable database history.

## Time and numbers

Database timestamps are PostgreSQL `timestamp with time zone` values. API contracts serialize every
timestamp as a UTC ISO 8601 string such as `2026-08-24T08:30:00.000Z`. Database services will perform
the explicit `Date`/ISO conversion at their boundary. USD and price columns use fixed-precision
PostgreSQL numerics; shared API contracts expose finite JavaScript numbers for this prototype.

## Modes

`DATA_MODE` is validated as `replay` or `live`. `EXECUTION_MODE` is validated as `paper` or
`hyperliquid-testnet`. In Phase 1 these select no adapters yet; they establish explicit startup
configuration for later phases. Replay and paper are the defaults and guaranteed demo path.

## Replay signal pipeline

Replay fixtures and future live clients implement the same `MarketEventSource` boundary and emit
source-shaped events. `normalizeMarketEvent` is the only code allowed to understand those source
payloads. All feature and signal code consumes strict normalized shared contracts.

An explicit replay clock advances by source event time. The pipeline maintains source histories,
calculates named features in pure TypeScript, and applies only the operators accepted by the strict
YAML parser. A candidate key includes skill ID/version, trigger version, asset, replay ID, and window
end. An in-process set suppresses repeats within one run; a unique database index prevents duplicates
across processes and reruns. Generated signals enter only the legal initial `DETECTED` state.

## Mobile product loop

The Expo app uses one typed REST client. Important responses are parsed with shared Zod schemas
before TanStack Query can cache them. Inbox category queries poll only for approval/monitoring
states; detail polling stops for inactive states. Mutations never edit cached signal objects. They
invalidate list/detail keys and reconcile with the authoritative API response.

## Reasoning boundary

`pocketpilot-reasoning-v1` sends only skill identity/instructions, normalized features, triggered
rules, bounded evidence with stable IDs/timestamps, and non-secret mandate context. Provider text
must pass the single strict `AgentDecisionSchema`. Domain validation also enforces candidate
identity, mandate allowlists, grounded evidence IDs, and expiry bounds. Malformed output receives
one controlled repair attempt; a second failure records a compact error and closes as `NO_TRADE`.
The model has no approval, transition, signing, order, or execution capability.

Fixture mode emits deterministic schema-valid output. OpenAI mode uses the Responses API with a
strict JSON Schema response format, bounded timeout, and at most one transient retry. Provider
payloads and API keys are never logged.

## Deterministic risk boundary

The pure policy engine evaluates asset, venue, notional, leverage, required directional stop,
daily realized loss, kill switch, explicit approval, and expiry. Every result has a stable rule ID,
pass/fail, actual value, limit, and explanation. Preliminary failure moves `PROPOSED` to
`RISK_BLOCKED`; a passing preview moves it to `PENDING_APPROVAL`. Approval reruns policy with edited
values, the current mandate/loss/kill-switch/time, never the stored preview. A rejected edit remains
pending so `$150` can be corrected to `$100`; expiry transitions it to `EXPIRED`.

The four inbox categories are projections of lifecycle state, not extra persisted state:

- Approval Required: `PENDING_APPROVAL`
- Monitoring: `DETECTED`, `ANALYZING`, `PROPOSED`, `APPROVED`, `EXECUTING`
- Executed: `FILLED`, `CLOSED`
- Expired: terminal inactive outcomes, including `EXPIRED` and `REJECTED`

## Execution and control boundary

`ExecutionAdapter` exposes only current-price retrieval, market submission, and position close. It
accepts normalized symbols/sides and a stable server client-order ID; signing, SDK responses, and
venue-specific errors remain behind the adapter. Phase 5 wires only `PaperExecutionAdapter`.

The paper path locks the signal and mandate row and performs approval policy, APPROVED, order claim,
the immediate pre-execution policy check, EXECUTING, local paper fill, position creation, and FILLED
inside one PostgreSQL transaction. The unique approval key and client-order ID are both
`signalId:approval-rN`; `positions.order_id` guarantees one position. A duplicate revision returns
the prior filled order/position. A close locks the position and uses `close:positionId`, so repeat
taps return the stored close.

The kill-switch endpoint updates the mandate under a row lock and increments its version. Approval
locks that same row through its second policy check and paper fill, preventing a kill-switch commit
between the check and execution. The switch blocks new work but never closes a position.

Paper fills and marking are specified in `docs/paper-execution.md`.
