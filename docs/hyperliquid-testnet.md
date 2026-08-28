# Hyperliquid testnet execution note

Reviewed: 2026-08-25

## References and pinned versions

Hyperliquid's API is unversioned. The implementation was checked against these official pages:

- [API overview](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api): testnet REST base URL and Hyperliquid's list of community TypeScript SDKs.
- [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint): IOC orders, `cloid`, reduce-only orders, leverage, `expiresAfter`, and API-wallet authorization.
- [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint): `meta`, `allMids`, `orderStatus`, `userFillsByTime`, and account state.
- [Signing](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing) and [nonces/API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets): SDK signing, signer nonces, and the requirement to query the master/subaccount rather than an agent-wallet address.
- [Tick and lot size](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size) and [asset IDs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids): five-significant-figure perp prices, `szDecimals`, and metadata-derived asset indexes.
- [Official Python SDK](https://github.com/hyperliquid-dex/hyperliquid-python-sdk), release `0.24.0`, as the official behavioral reference for aggressive IOC market-order construction. Its default market-order helper uses a bounded aggressive limit rather than a distinct market-order action.

Hyperliquid does not publish an official TypeScript trading SDK. Its official API page explicitly
lists community TypeScript SDKs. pocketpilot pins
[`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid) `0.33.3` and `viem` `2.55.19` in
`package-lock.json`. The SDK owns signing and nonce construction; pocketpilot does not implement or
infer the signing format. The SDK transport is constructed with `isTestnet: true` and the exact
`https://api.hyperliquid-testnet.xyz` URL.

## Adapter behavior

`HyperliquidTestnetExecutionAdapter` is selected only when all testnet gates pass. It:

- accepts only BTC and ETH and resolves their current index/size precision from testnet `meta`;
- gets a fresh testnet mid before the approval-time risk check;
- combines the approval ID with the persisted reasoning-run timestamp, then derives a stable 128-bit `cloid`;
- queries `orderStatus` by that cloid before submission, in addition to the database uniqueness constraints;
- sets whole-number cross leverage, then sends one IOC order with a 10 bps default worst-price boundary;
- normalizes actual fill price, size, venue order ID, USDC fee, and fill time from submission/fill history;
- polls a bounded number of times when the first response does not contain a complete fill;
- validates the external position before sending a reduce-only IOC close;
- treats the venue's actual close fill quantity as authoritative: an IOC partial fill keeps the
  local position open with its reconciled remaining size, allocated fees, and realized PnL;
- derives each close-attempt cloid from the persisted remaining quantity, so a transport retry is
  idempotent while an explicitly retried remainder receives a new cloid;
- converts timeouts/rejections into structured adapter errors and never calls the paper adapter.

An immediate fill can precede fill-history availability. In that narrow case, the adapter uses the
venue's immediate average price and size and records a zero fee rather than lose an executed
position. A later reconciliation/audit worker would be required for production-grade fee repair.

The application still holds a database transaction open across the bounded external call. This
keeps the prototype's state transition and local uniqueness behavior simple. A production service
would claim the order transactionally, submit outside the transaction, and reconcile through a
durable worker. The cloid remains stable for crash/retry within one persisted signal run, while a
new Replay run does not reuse a terminal cloid from an older scoped reset.

A reduce-only IOC is not guaranteed to consume the entire requested size on a thin testnet book.
When it partially fills, the API returns `POSITION_CLOSE_FAILED` with `partialClose: true`, commits
the smaller remaining position as `OPEN`, and the mobile app refreshes that quantity. The user must
explicitly tap **Close position** again to submit the remainder; the app never labels a partial fill
as `CLOSED`.

## Stop-loss decision

Automated protective-order management is not implemented in Phase 7. Hyperliquid supports trigger
orders, but safe lifecycle management would also need atomic/linked creation semantics, partial-fill
handling, resize synchronization, cancellation on manual close, and durable reconciliation. Adding
only the placement call would overstate protection.

The required stop remains part of the proposal, approval-time risk check, position record, and UI.
Both paper and testnet screens label it as recorded rather than automated. The recorded-demo mode is
therefore Replay + paper. Do not claim that a protective order exists on Hyperliquid.

## Create and fund a dedicated testnet account

1. Use a dedicated EVM wallet for the prototype. Never use a personal or mainnet-funded signing key as the server key.
2. Connect that address to [Hyperliquid testnet](https://app.hyperliquid-testnet.xyz/).
3. Follow the official [testnet faucet instructions](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/testnet-faucet). Hyperliquid currently requires the same address to have deposited on mainnet before it can claim 1,000 mock USDC; this account prerequisite may block verification.
4. In the testnet UI, create/approve a new named API (agent) wallet dedicated to pocketpilot. Do not reuse a deregistered agent-wallet address; the official nonce documentation warns against reuse.
5. Put the funded master address in `HYPERLIQUID_ACCOUNT_ADDRESS`. Put only the dedicated API-wallet private key in the server secret manager as `HYPERLIQUID_API_PRIVATE_KEY`, and set `HYPERLIQUID_SIGNER_KIND=api-wallet`.
6. Never paste the key into documentation, Expo variables, screenshots, shell history, issue trackers, or logs.

## Explicit activation and manual verification

Keep `EXECUTION_MODE=paper` during ordinary development. For a deliberate testnet-only run, set
these values in the server environment:

```text
EXECUTION_MODE=hyperliquid-testnet
HYPERLIQUID_NETWORK=testnet
HYPERLIQUID_TESTNET_ENABLED=true
HYPERLIQUID_ACCOUNT_ADDRESS=0x...
HYPERLIQUID_SIGNER_KIND=api-wallet
HYPERLIQUID_API_PRIVATE_KEY=0x...
```

Start the server and confirm the prominent testnet startup warning. The adapter verifies that the
agent wallet belongs to the configured account and that active BTC/ETH metadata is available before
the HTTP server starts. Then use explicit phone approval with a small valid notional. A testnet
rejection or timeout must remain `EXECUTION_FAILED`; it must never appear as a paper fill.
