import { describe, expect, it } from 'vitest';

import { deriveApprovalKey, deriveExecutionClientOrderId } from '../src/domain/approval-service.js';

describe('approval execution client order IDs', () => {
  it('is stable within one reasoning run and changes after a replay reset', () => {
    const approvalKey = deriveApprovalKey('signal-id', 1);
    const firstRun = deriveExecutionClientOrderId(approvalKey, '2026-08-28T10:00:00.000Z');

    expect(firstRun).toBe(deriveExecutionClientOrderId(approvalKey, '2026-08-28T10:00:00.000Z'));
    expect(firstRun).not.toBe(
      deriveExecutionClientOrderId(approvalKey, '2026-08-28T10:05:00.000Z'),
    );
  });
});
