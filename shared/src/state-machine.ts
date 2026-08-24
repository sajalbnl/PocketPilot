import type { SignalState } from './enums.js';
import type { SignalCategory } from './signal.js';

export const signalTransitionMap = {
  DETECTED: ['ANALYZING', 'EXPIRED'],
  ANALYZING: ['PROPOSED', 'NO_TRADE', 'EXPIRED'],
  PROPOSED: ['PENDING_APPROVAL', 'NO_TRADE', 'RISK_BLOCKED', 'EXPIRED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'RISK_BLOCKED', 'EXPIRED'],
  APPROVED: ['EXECUTING', 'RISK_BLOCKED', 'EXPIRED'],
  EXECUTING: ['FILLED', 'EXECUTION_FAILED'],
  FILLED: ['CLOSED'],
  CLOSED: [],
  NO_TRADE: [],
  REJECTED: [],
  RISK_BLOCKED: [],
  EXPIRED: [],
  EXECUTION_FAILED: [],
} as const satisfies Record<SignalState, readonly SignalState[]>;

export class IllegalSignalTransitionError extends Error {
  readonly code = 'ILLEGAL_SIGNAL_TRANSITION';

  constructor(
    readonly fromState: SignalState,
    readonly toState: SignalState,
  ) {
    super(`Signal cannot transition from ${fromState} to ${toState}`);
    this.name = 'IllegalSignalTransitionError';
  }
}

export function canTransitionSignal(fromState: SignalState, toState: SignalState): boolean {
  return (signalTransitionMap[fromState] as readonly SignalState[]).includes(toState);
}

export function transitionSignalState(fromState: SignalState, toState: SignalState): SignalState {
  if (!canTransitionSignal(fromState, toState)) {
    throw new IllegalSignalTransitionError(fromState, toState);
  }

  return toState;
}

const signalCategoryStates = {
  'approval-required': ['PENDING_APPROVAL'],
  monitoring: ['DETECTED', 'ANALYZING', 'PROPOSED', 'APPROVED', 'EXECUTING'],
  executed: ['FILLED', 'CLOSED'],
  expired: ['NO_TRADE', 'REJECTED', 'RISK_BLOCKED', 'EXPIRED', 'EXECUTION_FAILED'],
} as const satisfies Record<SignalCategory, readonly SignalState[]>;

export function getSignalCategory(state: SignalState): SignalCategory {
  for (const category of Object.keys(signalCategoryStates) as SignalCategory[]) {
    if ((signalCategoryStates[category] as readonly SignalState[]).includes(state)) return category;
  }

  return 'monitoring';
}

export function getSignalStatesForCategory(category: SignalCategory): readonly SignalState[] {
  return signalCategoryStates[category];
}
