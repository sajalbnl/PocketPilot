import { and, count, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { mandates, orders, positions, signals } from '../src/db/schema.js';
import { AgentControlService } from '../src/domain/agent-control-service.js';
import { ApprovalService, SignalActionError } from '../src/domain/approval-service.js';
import { PositionActionError, PositionService } from '../src/domain/position-service.js';
import { ExecutionAdapterError, type ExecutionAdapter } from '../src/execution/adapter.js';
import { PaperExecutionAdapter } from '../src/execution/paper-adapter.js';

const runIntegration = process.env.RUN_DB_INTEGRATION === '1';
const now = new Date('2026-08-24T12:00:00.000Z');
const mandateId = '50000000-0000-4000-8000-000000000001';
const signalIds = Array.from(
  { length: 8 },
  (_, index) => `50000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
);
const quote = {
  symbol: 'BTC' as const,
  price: 66_000,
  asOf: '2026-08-24T12:00:00.000Z',
  source: 'phase5-test-mark',
};
const paper = new PaperExecutionAdapter(
  { getCurrentPrice: () => Promise.resolve(quote) },
  { feeBps: 5, slippageBps: 2 },
);

function pendingSignal(id: string, expiresAt = new Date(now.getTime() + 600_000)) {
  return {
    id,
    mandateId,
    symbol: 'BTC',
    side: 'LONG' as const,
    state: 'PENDING_APPROVAL' as const,
    dataMode: 'replay' as const,
    llmOutput: {
      schemaVersion: 1 as const,
      decision: 'PROPOSE' as const,
      asset: 'BTC' as const,
      direction: 'LONG' as const,
      venue: 'hyperliquid' as const,
      thesis: 'A complete deterministic integration-test thesis for the paper execution loop.',
      whyNow: ['Current replay evidence confirms the configured trigger.'],
      evidenceReferences: ['test-evidence'],
      counterEvidence: ['The move can reverse.'],
      confidence: 0.75,
      proposedNotionalUsd: 100,
      leverage: 2,
      entryReference: 66_000,
      stopLoss: 64_000,
      invalidationConditions: ['BTC trades below the configured stop-loss.'],
      expiryMinutes: 10,
    },
    proposedNotionalUsd: 100,
    proposedLeverage: 2,
    stopLossPrice: 64_000,
    expiresAt,
    timeline: [
      {
        fromState: 'PROPOSED' as const,
        toState: 'PENDING_APPROVAL' as const,
        occurredAt: now.toISOString(),
        reason: 'Integration test proposal is pending explicit approval.',
        metadata: {},
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

async function expectActionCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(SignalActionError);
    expect((error as SignalActionError).code).toBe(code);
  }
}

async function expectPositionActionCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(PositionActionError);
    expect((error as PositionActionError).code).toBe(code);
    return error as PositionActionError;
  }
}

describe.skipIf(!runIntegration)('Phase 5 PostgreSQL execution loop', () => {
  beforeAll(async () => {
    await db.insert(mandates).values({
      id: mandateId,
      agentName: 'Phase 5 Test Agent',
      skillSlug: 'cross-market-catalyst',
      allowedAssets: ['BTC', 'ETH'],
      allowedVenues: ['hyperliquid'],
      maxPositionUsd: 100,
      maxLeverage: 3,
      maxDailyLossUsd: 1_000,
      stopLossRequired: true,
      approvalRequired: true,
      signalExpiryMinutes: 10,
      killSwitchEnabled: false,
      version: 1,
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
      updatedAt: now,
    });
  });

  afterAll(async () => {
    const testOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.signalId, signalIds));
    if (testOrders.length > 0) {
      await db.delete(positions).where(
        inArray(
          positions.orderId,
          testOrders.map((row) => row.id),
        ),
      );
      await db.delete(orders).where(
        inArray(
          orders.id,
          testOrders.map((row) => row.id),
        ),
      );
    }
    await db.delete(signals).where(inArray(signals.id, signalIds));
    await db.delete(mandates).where(eq(mandates.id, mandateId));
  });

  it('fills successfully and concurrent duplicate approval creates one order', async () => {
    const id = signalIds[0]!;
    await db.insert(signals).values(pendingSignal(id));
    const service = new ApprovalService(paper, () => new Date(now));
    const request = { approvalRevision: 1, notionalUsd: 100, leverage: 2, stopLossPrice: 64_000 };
    const [first, second] = await Promise.all([
      service.approve(id, request),
      service.approve(id, request),
    ]);
    expect(first.order.id).toBe(second.order.id);
    expect([first.duplicate, second.duplicate].sort()).toEqual([false, true]);
    const [orderCount] = await db
      .select({ value: count() })
      .from(orders)
      .where(eq(orders.signalId, id));
    expect(orderCount?.value).toBe(1);
  });

  it('transitions an expired approval to EXPIRED without an order', async () => {
    const id = signalIds[1]!;
    await db.insert(signals).values(pendingSignal(id, new Date(now.getTime() - 1)));
    await expectActionCode(
      new ApprovalService(paper, () => new Date(now)).approve(id, {
        approvalRevision: 1,
        notionalUsd: 100,
        leverage: 2,
        stopLossPrice: 64_000,
      }),
      'SIGNAL_EXPIRED',
    );
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    expect(signal?.state).toBe('EXPIRED');
  });

  it('uses the current changed mandate for a fresh rejection', async () => {
    const id = signalIds[2]!;
    await db.insert(signals).values(pendingSignal(id));
    await db
      .update(mandates)
      .set({ maxPositionUsd: 50, version: 2 })
      .where(eq(mandates.id, mandateId));
    await expectActionCode(
      new ApprovalService(paper, () => new Date(now)).approve(id, {
        approvalRevision: 1,
        notionalUsd: 100,
        leverage: 2,
        stopLossPrice: 64_000,
      }),
      'MAX_NOTIONAL_EXCEEDED',
    );
    await db
      .update(mandates)
      .set({ maxPositionUsd: 100, version: 3 })
      .where(eq(mandates.id, mandateId));
  });

  it('persists the kill switch and blocks approval without closing positions', async () => {
    const id = signalIds[3]!;
    await db.insert(signals).values(pendingSignal(id));
    const control = new AgentControlService();
    const enabled = await control.setKillSwitch({ enabled: true, confirmed: true });
    expect(enabled.killSwitchEnabled).toBe(true);
    await expectActionCode(
      new ApprovalService(paper, () => new Date(now)).approve(id, {
        approvalRevision: 1,
        notionalUsd: 100,
        leverage: 2,
        stopLossPrice: 64_000,
      }),
      'KILL_SWITCH_ENABLED',
    );
    await control.setKillSwitch({ enabled: false, confirmed: true });
  });

  it('records EXECUTION_FAILED and creates no false position when the adapter throws', async () => {
    const id = signalIds[4]!;
    await db.insert(signals).values(pendingSignal(id));
    const failing: ExecutionAdapter = {
      getCurrentPrice: (input) => paper.getCurrentPrice(input),
      submitMarketOrder: () =>
        Promise.reject(
          new ExecutionAdapterError('ADAPTER_FAILURE', 'Injected paper failure', false),
        ),
      closePosition: (input) => paper.closePosition(input),
    };
    await expectActionCode(
      new ApprovalService(failing, () => new Date(now)).approve(id, {
        approvalRevision: 1,
        notionalUsd: 100,
        leverage: 2,
        stopLossPrice: 64_000,
      }),
      'EXECUTION_FAILED',
    );
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    const [order] = await db.select().from(orders).where(eq(orders.signalId, id));
    const falsePositions = order
      ? await db.select().from(positions).where(eq(positions.orderId, order.id))
      : [];
    expect(signal?.state).toBe('EXECUTION_FAILED');
    expect(order?.status).toBe('FAILED');
    expect(falsePositions).toHaveLength(0);
  });

  it('closes once, records fee-inclusive realized PnL, and returns the close on retry', async () => {
    const id = signalIds[5]!;
    await db.insert(signals).values(pendingSignal(id));
    const approval = await new ApprovalService(paper, () => new Date(now)).approve(id, {
      approvalRevision: 1,
      notionalUsd: 100,
      leverage: 2,
      stopLossPrice: 64_000,
    });
    const service = new PositionService(paper, () => new Date(now.getTime() + 1_000));
    const first = await service.close(approval.position.id);
    const second = await service.close(approval.position.id);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.position.realizedPnl).toBe(first.position.realizedPnl);
    expect(first.position.exitFeeUsd).toBeGreaterThan(0);
  });

  it('persists rejection as terminal and never later approves it', async () => {
    const id = signalIds[6]!;
    await db.insert(signals).values(pendingSignal(id));
    const service = new ApprovalService(paper, () => new Date(now));
    const rejected = await service.reject(id, 'Manual integration-test rejection');
    expect(rejected.state).toBe('REJECTED');
    expect(rejected.timeline.at(-1)?.reason).toBe('Manual integration-test rejection');
    await expectActionCode(
      service.approve(id, {
        approvalRevision: 1,
        notionalUsd: 100,
        leverage: 2,
        stopLossPrice: 64_000,
      }),
      'INVALID_SIGNAL_STATE',
    );
    const rows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.signalId, id), eq(orders.status, 'FILLED')));
    expect(rows).toHaveLength(0);
  });

  it('keeps a partially closed venue position open and uses a new close ID for its remainder', async () => {
    const id = signalIds[7]!;
    await db.insert(signals).values(pendingSignal(id));
    const approval = await new ApprovalService(paper, () => new Date(now)).approve(id, {
      approvalRevision: 1,
      notionalUsd: 100,
      leverage: 2,
      stopLossPrice: 64_000,
    });
    const closeClientOrderIds: string[] = [];
    const partialAdapter: ExecutionAdapter = {
      getCurrentPrice: (input) => paper.getCurrentPrice(input),
      submitMarketOrder: (input) => paper.submitMarketOrder(input),
      closePosition: async (input) => {
        closeClientOrderIds.push(input.clientOrderId);
        if (closeClientOrderIds.length > 1) return paper.closePosition(input);
        const quantity = Number((input.quantity * 0.8).toFixed(12));
        return {
          clientOrderId: input.clientOrderId,
          venueOrderId: 'partial-close-venue-order',
          requestedPrice: input.quote.price,
          fillPrice: input.quote.price,
          quantity,
          feeUsd: 0.03,
          slippageBps: 0,
          executedAt: now.toISOString(),
          realizedPnl: 0.1,
        };
      },
    };
    const service = new PositionService(partialAdapter, () => new Date(now.getTime() + 1_000));

    const error = await expectPositionActionCode(
      service.close(approval.position.id),
      'POSITION_CLOSE_FAILED',
    );
    expect(error.details).toMatchObject({ partialClose: true });
    const [remaining] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, approval.position.id));
    const [stillFilled] = await db.select().from(signals).where(eq(signals.id, id));
    expect(remaining?.status).toBe('OPEN');
    expect(remaining?.quantity).toBeCloseTo(approval.position.quantity * 0.2, 10);
    expect(remaining?.realizedPnl).toBe(0.1);
    expect(stillFilled?.state).toBe('FILLED');

    const completed = await service.close(approval.position.id);
    expect(completed.position.status).toBe('CLOSED');
    expect(closeClientOrderIds[1]).not.toBe(closeClientOrderIds[0]);
  });
});
