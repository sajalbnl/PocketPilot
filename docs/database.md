# Database runbook

The local path uses the PostgreSQL service in `compose.yaml`. Start it, migrate it, and seed the
canonical mandate with the root npm scripts described in the README. Drizzle records applied
migrations in its own bookkeeping schema; no application table is added for migration history.

The seed uses a stable UUID and an upsert. Re-running it updates the same read-only demo mandate and
resets its initial configuration, including the kill switch, instead of inserting a duplicate.

For a hosted database, replace only `DATABASE_URL` in the uncommitted `.env`. TLS parameters belong
in that provider's connection URL.
