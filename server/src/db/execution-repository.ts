import {
  OrderSchema,
  PositionDetailSchema,
  type Order,
  type PositionDetail,
} from '@pocketpilot/shared';

import type { orders, positions, signals } from './schema.js';

export type OrderRow = typeof orders.$inferSelect;
export type PositionRow = typeof positions.$inferSelect;
export type ExecutionSignalRow = typeof signals.$inferSelect;

export function mapOrder(row: OrderRow): Order {
  return OrderSchema.parse({
    id: row.id,
    signalId: row.signalId,
    approvalKey: row.approvalKey,
    clientOrderId: row.clientOrderId,
    executionMode: row.executionMode,
    venueOrderId: row.venueOrderId,
    side: row.side,
    notionalUsd: row.notionalUsd,
    leverage: row.leverage,
    requestedPrice: row.requestedPrice,
    fillPrice: row.fillPrice,
    quantity: row.quantity,
    feeUsd: row.feeUsd,
    slippageBps: row.slippageBps,
    status: row.status,
    error: row.error,
    filledAt: row.filledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapPositionDetail(input: {
  position: PositionRow;
  order: OrderRow;
  signal: ExecutionSignalRow;
}): PositionDetail {
  const invalidations =
    input.signal.llmOutput?.decision === 'PROPOSE'
      ? input.signal.llmOutput.invalidationConditions
      : ['No linked invalidation summary is available.'];
  return PositionDetailSchema.parse({
    id: input.position.id,
    orderId: input.position.orderId,
    symbol: input.position.symbol,
    side: input.position.side,
    entryPrice: input.position.entryPrice,
    currentPrice: input.position.currentPrice,
    notionalUsd: input.position.notionalUsd,
    leverage: input.position.leverage,
    quantity: input.position.quantity,
    stopLossPrice: input.position.stopLossPrice,
    entryFeeUsd: input.position.entryFeeUsd,
    exitFeeUsd: input.position.exitFeeUsd,
    closeClientOrderId: input.position.closeClientOrderId,
    closeVenueOrderId: input.position.closeVenueOrderId,
    closePrice: input.position.closePrice,
    unrealizedPnl: input.position.unrealizedPnl,
    realizedPnl: input.position.realizedPnl,
    status: input.position.status,
    executionMode: input.order.executionMode,
    signalId: input.signal.id,
    thesisHealth:
      input.position.status === 'OPEN'
        ? 'Monitoring the linked thesis; invalidations are informational in paper mode.'
        : 'Position closed; realized PnL is final for this paper execution.',
    invalidationSummary: invalidations,
    createdAt: input.position.createdAt.toISOString(),
    updatedAt: input.position.updatedAt.toISOString(),
    closedAt: input.position.closedAt?.toISOString() ?? null,
  });
}
