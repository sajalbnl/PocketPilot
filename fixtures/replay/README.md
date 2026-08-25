# Replay fixtures

Each JSONL file contains small, realistic raw public-API-shaped events. Its adjacent metadata file
provides attribution, a capture timestamp, and an explicit historical-data disclaimer. The values
are curated—not claimed as a byte-for-byte exchange capture—so the demo is deterministic and
inspectable without internet access.

`btc-trigger` crosses every Cross-Market Catalyst v1 boundary. `btc-followup` repeats the historical
scenario under a distinct replay ID so the demo can create a second proposal and prove that the
kill switch blocks it after the first position fills. `btc-no-trigger` is the negative control. All
fixtures pass through `normalizeMarketEvent`, the same narrow normalization boundary intended for
future live adapters.

The final two `btc-trigger` Hyperliquid events are deterministic post-trigger marks. In step mode,
approve after event four, then advance events five and six to demonstrate positive and negative PnL
changes through the same replay clock and normalized price service.
