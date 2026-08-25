# Phase 6: push, deep links, and live ingestion

## Implemented interfaces

### Expo push

The app uses Expo SDK 57 `expo-notifications` in a development build. It creates the Android
`approvals` channel before requesting a token, requests permission only after explanatory UI is
shown, obtains an `ExpoPushToken` with the EAS project ID, and registers it through
`POST /devices/push-token`.

The server sends an array of messages to:

```text
POST https://exp.host/--/api/v2/push/send
```

It optionally sends `Authorization: Bearer <EXPO_ACCESS_TOKEN>` when Expo push security is enabled.
The stored result is the Expo push ticket, not proof that the phone displayed the notification.
Expo recommends checking receipts later; receipt polling is deliberately outside this phase's
minimum delivery path.

Payload data is limited to:

```json
{
  "type": "signal_approval_required",
  "signalId": "server-signal-uuid",
  "url": "pocketpilot://signals/server-signal-uuid"
}
```

It contains no secret and no approval/order authority. Notification taps are schema-checked and
route only to `/signals/[id]`; that screen fetches current state from the API.

Official references:

- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- https://docs.expo.dev/push-notifications/sending-notifications/

### Hyperliquid

The server connects only to the official mainnet public WebSocket:

```text
wss://api.hyperliquid.xyz/ws
```

For each configured venue coin (default `BTC` and `ETH`) it sends:

```json
{ "method": "subscribe", "subscription": { "type": "activeAssetCtx", "coin": "BTC" } }
```

`activeAssetCtx` is schema-checked at the adapter boundary and maps:

| Provider field     | Normalized field  | Choice                                      |
| ------------------ | ----------------- | ------------------------------------------- |
| `coin`             | `symbol`          | Explicit `HYPERLIQUID_SYMBOL_MAP`           |
| `ctx.markPx`       | `markPrice`       | Perpetual mark price                        |
| `ctx.dayNtlVlm`    | `volume24hUsd`    | 24-hour notional USD volume                 |
| `ctx.funding`      | `fundingRate`     | Current funding rate; 8-hour interval label |
| `ctx.openInterest` | `openInterestUsd` | Base-coin OI multiplied by mark price       |

The official message has no exchange event timestamp. `sourceTimestamp` therefore uses the
server's receipt time and normalized metadata identifies the `activeAssetCtx` channel. This is an
explicit provider limitation, not an invented exchange timestamp.

The connection sends `{"method":"ping"}` every configured heartbeat interval, automatically
reconnects with capped exponential backoff and jitter, and re-sends both subscriptions on every
open. A finite reconnect limit prevents an unbounded hot loop. Full missed-event recovery remains
out of scope.

Official references:

- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/timeouts-and-heartbeats

### Polymarket

Markets are never guessed from question text. Configure one to three current, active market IDs
with an explicit asset, outcome, and event meaning. Each polling cycle uses:

```text
GET https://gamma-api.polymarket.com/markets/{marketId}
GET https://clob.polymarket.com/midpoint?token_id={configured-outcome-token-id}
```

Gamma supplies question/condition identifiers, outcome-to-token mapping, 24-hour price movement,
and CLOB liquidity. The CLOB midpoint supplies the current probability. `Yes` maps movement as-is;
the opposite outcome maps its sign inversely. Public polling responses have no quote timestamp, so
request completion time is explicitly used as `sourceTimestamp`. The 15-second default is far
below the documented Gamma `/markets` and CLOB `/midpoint` limits.

The checked example selected on 2026-08-25 is market `701502`, “Will Bitcoin dip to $45,000 by
December 31, 2026?”, mapped to BTC outcome `No`. Rising `No` probability means increasing belief
that BTC remains above $45,000, which is directionally meaningful to the long catalyst. Replace it
when it becomes inactive or closed:

```bash
POLYMARKET_MARKETS_JSON='[{"marketId":"701502","asset":"BTC","outcome":"No","meaning":"Bitcoin remains above $45,000 through December 31, 2026"}]'
```

The official single-midpoint documentation shows `mid_price`; the live public response observed on
2026-08-25 returned `mid`. The adapter schema accepts only those two named shapes and normalizes
both, keeping this narrow provider discrepancy at the boundary.

Official references:

- https://docs.polymarket.com/api-reference/markets/get-market-by-id
- https://docs.polymarket.com/api-reference/data/get-midpoint-price
- https://docs.polymarket.com/api-reference/rate-limits

## Four-table persistence and deduplication

No fifth table is needed for this one-agent demo. `mandates.push_tokens` stores at most five compact
registrations. `signals.notification` stores one claim/ticket/error object. The server atomically
claims only a `PENDING_APPROVAL` signal whose notification field is null. That database predicate
is the duplicate-send backstop for the transition. A push/provider failure updates compact error
metadata and never reverts or corrupts the signal.

## Freshness and alignment policy

The shared feature calculator requires the configured minimum sample count from both venues. The
latest sample from each venue must be no older than `MARKET_FRESHNESS_SECONDS`, and their source
times must be no farther apart than `MARKET_ALIGNMENT_SECONDS`. If either venue is missing, stale,
or misaligned, `evidence_completeness` is `0`; the existing skill's require-all trigger cannot
produce a candidate. Replay uses the same calculator and defaults to the documented 120-second
window.

Inspect runtime state without secrets:

```bash
curl http://localhost:3000/ops/health
```

It shows live connection/poll status, reconnect counts, last events/success/errors, normalized event
counts, notification attempts/tickets/errors, and active freshness thresholds.

## Physical Android push setup

1. In `app/`, run `eas login` and `eas init`. Confirm that EAS writes the real project UUID to
   `expo.extra.eas.projectId` in `app/app.json`.
2. In Firebase Console, create/select a project and register Android package
   `com.sajalbansal.pocketpilot`. Download `google-services.json` to `app/google-services.json`, then
   add `"googleServicesFile": "./google-services.json"` under `expo.android` in `app/app.json`.
3. Firebase Console > Project settings > Service accounts: generate a private service-account JSON.
   Do not commit it. Run `eas credentials`, choose Android, then upload it under the FCM V1 push
   notification service-account option. The same action is available in the Expo project dashboard
   under Credentials > Android > Service Credentials.
4. Build the included APK profile: `cd app && eas build --platform android --profile development`.
   Download/install the APK on the physical phone. Expo Go cannot receive Android remote push on
   this SDK.
5. Point `app/.env` at an HTTPS backend deployment (or reachable LAN API for local testing), run
   `npm run start:dev-client -w @pocketpilot/app`, open the development build, and tap **Enable** in
   the Approval Alerts card. The server should report a registered token and `/ops/health` will
   show notification activity after the next proposal.
6. Reset/start Replay Mode. Test notification taps with the app foregrounded, backgrounded, and
   terminated by swiping it away from Android recents. Do not use Android's **Force stop** action,
   which can suppress push delivery until the app is opened manually. Each tap should open the
   exact ID and refetch its current API state.

If Expo push security is enabled in the Expo dashboard, store the access token only as the backend
deployment secret `EXPO_ACCESS_TOKEN`. No Expo/Firebase credential belongs in the phone code.

Official credential/build references:

- https://docs.expo.dev/push-notifications/fcm-credentials/
- https://docs.expo.dev/build-reference/apk/
