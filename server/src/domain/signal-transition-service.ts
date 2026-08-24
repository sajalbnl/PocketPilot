import {
  transitionSignalState,
  type SignalState,
  type SignalTimelineEntry,
} from '@pocketpilot/shared';

interface TransitionInput {
  currentState: SignalState;
  nextState: SignalState;
  currentTimeline: readonly SignalTimelineEntry[];
  reason: string;
  occurredAt?: Date;
  metadata?: SignalTimelineEntry['metadata'];
}

export interface TransitionResult {
  state: SignalState;
  timeline: SignalTimelineEntry[];
}

export function appendSignalTransition(input: TransitionInput): TransitionResult {
  const state = transitionSignalState(input.currentState, input.nextState);
  const entry: SignalTimelineEntry = {
    fromState: input.currentState,
    toState: state,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    reason: input.reason,
    metadata: input.metadata ?? {},
  };

  return {
    state,
    timeline: [...input.currentTimeline, entry],
  };
}
