# Cross-Market Catalyst v1

`skill.yaml` is the prototype's only Investor Skill. It is deliberately a readable strategy
configuration, not an executable workflow language. The server accepts only its named features and
operators, calculates every value in TypeScript, and fails startup with a field-level error when the
file is malformed.

The v1 long rule requires all configured thresholds: five-minute BTC/ETH price return at least 1%,
24-hour-volume sample ratio at least 1.5x, funding at most 0.05%, open-interest growth at least 2%,
a Polymarket probability increase of at least 8 percentage points, at least $100,000 liquidity,
both sources no more than 120 seconds old, and complete evidence.
