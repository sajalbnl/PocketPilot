# Replay fixtures

Each JSONL file contains small, realistic raw public-API-shaped events. Its adjacent metadata file
provides attribution, a capture timestamp, and an explicit historical-data disclaimer. The values
are curated—not claimed as a byte-for-byte exchange capture—so the demo is deterministic and
inspectable without internet access.

`btc-trigger` crosses every Cross-Market Catalyst v1 boundary. `btc-no-trigger` is the negative
control. Both pass through `normalizeMarketEvent`, the same narrow normalization boundary intended
for future live adapters.
