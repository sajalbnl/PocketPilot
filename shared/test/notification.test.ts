import { describe, expect, it } from 'vitest';

import { parseSignalNotificationRoute } from '../src/notification.js';

const signalId = '10000000-0000-4000-8000-000000000123';

describe('notification deep-link route parsing', () => {
  it('accepts only the matching pocketpilot signal route', () => {
    expect(
      parseSignalNotificationRoute({
        type: 'signal_approval_required',
        signalId,
        url: `pocketpilot://signals/${signalId}`,
      }),
    ).toBe(`/signals/${signalId}`);
  });

  it('rejects stale/tampered identifiers, unsupported schemes, and arbitrary routes', () => {
    expect(
      parseSignalNotificationRoute({
        type: 'signal_approval_required',
        signalId,
        url: 'pocketpilot://signals/10000000-0000-4000-8000-000000000999',
      }),
    ).toBeNull();
    expect(
      parseSignalNotificationRoute({
        type: 'signal_approval_required',
        signalId,
        url: `https://example.com/signals/${signalId}`,
      }),
    ).toBeNull();
    expect(
      parseSignalNotificationRoute({ type: 'open_url', url: 'pocketpilot://settings' }),
    ).toBeNull();
  });
});
