import { describe, expect, it } from 'vitest';

import {
  canTransitionSignal,
  IllegalSignalTransitionError,
  transitionSignalState,
} from '../src/index.js';

describe('signal state machine', () => {
  it('allows explicitly declared lifecycle transitions', () => {
    expect(transitionSignalState('DETECTED', 'ANALYZING')).toBe('ANALYZING');
    expect(transitionSignalState('PENDING_APPROVAL', 'APPROVED')).toBe('APPROVED');
    expect(transitionSignalState('FILLED', 'CLOSED')).toBe('CLOSED');
  });

  it('rejects skipped, reversed, and terminal transitions', () => {
    expect(canTransitionSignal('DETECTED', 'APPROVED')).toBe(false);
    expect(() => transitionSignalState('DETECTED', 'APPROVED')).toThrow(
      IllegalSignalTransitionError,
    );
    expect(() => transitionSignalState('REJECTED', 'PENDING_APPROVAL')).toThrow(
      'Signal cannot transition from REJECTED to PENDING_APPROVAL',
    );
    expect(() => transitionSignalState('CLOSED', 'FILLED')).toThrow(IllegalSignalTransitionError);
  });
});
