import type { ApprovalRequest, RiskCode, SignalDetail } from '@pocketpilot/shared';
import { and, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { getCurrentMandate } from '../db/mandate-repository.js';
import { getSignal, getSignalRow } from '../db/signal-repository.js';
import { signals } from '../db/schema.js';
import { appendSignalTransition } from './signal-transition-service.js';

export class SignalActionError extends Error {
  constructor(
    readonly code: RiskCode | 'SIGNAL_NOT_FOUND' | 'MANDATE_NOT_FOUND' | 'ACTION_CONFLICT',
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'SignalActionError';
  }
}

/**
 * Phase 2 persistence stub. It enforces request shape, obvious mandate bounds, expiry, and the
 * central state machine, then persists the intent. It deliberately creates no order and performs
 * no real risk evaluation or execution; those remain Phase 4/5 boundaries.
 */
export class ApprovalStubService {
  async approve(signalId: string, request: ApprovalRequest): Promise<SignalDetail> {
    const [signal, mandate] = await Promise.all([getSignalRow(signalId), getCurrentMandate()]);
    if (!signal) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    if (!mandate) throw new SignalActionError('MANDATE_NOT_FOUND', 'Current mandate was not found');
    if (signal.state !== 'PENDING_APPROVAL') {
      throw new SignalActionError(
        'INVALID_SIGNAL_STATE',
        `A ${signal.state.toLowerCase()} signal cannot be approved`,
      );
    }

    if (!signal.expiresAt || signal.expiresAt.getTime() <= Date.now()) {
      const expired = appendSignalTransition({
        currentState: signal.state,
        nextState: 'EXPIRED',
        currentTimeline: signal.timeline,
        reason: 'Approval was attempted after the proposal expired',
      });
      await db
        .update(signals)
        .set({ ...expired, updatedAt: new Date() })
        .where(and(eq(signals.id, signal.id), eq(signals.state, signal.state)));
      throw new SignalActionError('SIGNAL_EXPIRED', 'This signal has expired');
    }

    if (request.notionalUsd > mandate.riskLimits.maxPositionUsd) {
      throw new SignalActionError(
        'MAX_NOTIONAL_EXCEEDED',
        `Notional cannot exceed $${mandate.riskLimits.maxPositionUsd}`,
        'notionalUsd',
      );
    }
    if (request.leverage > mandate.riskLimits.maxLeverage) {
      throw new SignalActionError(
        'MAX_LEVERAGE_EXCEEDED',
        `Leverage cannot exceed ${mandate.riskLimits.maxLeverage}x`,
        'leverage',
      );
    }

    const approved = appendSignalTransition({
      currentState: signal.state,
      nextState: 'APPROVED',
      currentTimeline: signal.timeline,
      reason: 'User approved proposal parameters; execution deferred in Phase 2',
      metadata: { approvalRevision: request.approvalRevision },
    });
    const updated = await db
      .update(signals)
      .set({
        ...approved,
        proposedNotionalUsd: request.notionalUsd,
        proposedLeverage: request.leverage,
        stopLossPrice: request.stopLossPrice,
        updatedAt: new Date(),
      })
      .where(and(eq(signals.id, signal.id), eq(signals.state, signal.state)))
      .returning({ id: signals.id });
    if (updated.length !== 1) {
      throw new SignalActionError('ACTION_CONFLICT', 'Signal state changed; refresh and try again');
    }

    const detail = await getSignal(signal.id);
    if (!detail) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    return detail;
  }

  async reject(signalId: string): Promise<SignalDetail> {
    const signal = await getSignalRow(signalId);
    if (!signal) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    if (signal.state !== 'PENDING_APPROVAL') {
      throw new SignalActionError(
        'INVALID_SIGNAL_STATE',
        `A ${signal.state.toLowerCase()} signal cannot be rejected`,
      );
    }

    const rejected = appendSignalTransition({
      currentState: signal.state,
      nextState: 'REJECTED',
      currentTimeline: signal.timeline,
      reason: 'User rejected proposal from the mobile approval flow',
    });
    const updated = await db
      .update(signals)
      .set({ ...rejected, updatedAt: new Date() })
      .where(and(eq(signals.id, signal.id), eq(signals.state, signal.state)))
      .returning({ id: signals.id });
    if (updated.length !== 1) {
      throw new SignalActionError('ACTION_CONFLICT', 'Signal state changed; refresh and try again');
    }

    const detail = await getSignal(signal.id);
    if (!detail) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    return detail;
  }
}
