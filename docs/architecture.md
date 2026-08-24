# Phase 1 architecture

## Trust boundaries

`shared/` contains the framework-independent runtime contracts and the only signal transition map.
The app and server consume its compiled package. The server is authoritative for persistence and
will own risk and execution in later phases; the mobile app never directly changes lifecycle state.

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
