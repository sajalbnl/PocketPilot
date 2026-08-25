import type {
  CompactError,
  LlmDecisionOutput,
  NotificationDelivery,
  PushTokenRegistration,
  ReasoningMetadata,
  RiskPreview,
  SignalEvidence,
  SignalTimelineEntry,
} from '@pocketpilot/shared';
import {
  dataModes,
  executionModes,
  orderStatuses,
  positionStatuses,
  signalStates,
  tradeSides,
} from '@pocketpilot/shared';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const signalStateEnum = pgEnum('signal_state', signalStates);
export const tradeSideEnum = pgEnum('trade_side', tradeSides);
export const dataModeEnum = pgEnum('data_mode', dataModes);
export const executionModeEnum = pgEnum('execution_mode', executionModes);
export const orderStatusEnum = pgEnum('order_status', orderStatuses);
export const positionStatusEnum = pgEnum('position_status', positionStatuses);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

export const mandates = pgTable(
  'mandates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentName: text('agent_name').notNull(),
    skillSlug: text('skill_slug').notNull(),
    allowedAssets: jsonb('allowed_assets').$type<string[]>().notNull(),
    allowedVenues: jsonb('allowed_venues').$type<string[]>().notNull(),
    maxPositionUsd: numeric('max_position_usd', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }).notNull(),
    maxLeverage: numeric('max_leverage', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    maxDailyLossUsd: numeric('max_daily_loss_usd', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }).notNull(),
    stopLossRequired: boolean('stop_loss_required').notNull(),
    approvalRequired: boolean('approval_required').notNull(),
    signalExpiryMinutes: integer('signal_expiry_minutes').notNull(),
    killSwitchEnabled: boolean('kill_switch_enabled').notNull().default(false),
    pushTokens: jsonb('push_tokens').$type<PushTokenRegistration[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check('mandates_max_position_positive', sql`${table.maxPositionUsd} > 0`),
    check('mandates_max_leverage_positive', sql`${table.maxLeverage} > 0`),
    check('mandates_max_daily_loss_positive', sql`${table.maxDailyLossUsd} > 0`),
    check('mandates_signal_expiry_positive', sql`${table.signalExpiryMinutes} > 0`),
    check('mandates_version_positive', sql`${table.version} > 0`),
  ],
);

export const signals = pgTable(
  'signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandateId: uuid('mandate_id')
      .notNull()
      .references(() => mandates.id, { onDelete: 'restrict' }),
    symbol: text('symbol').notNull(),
    side: tradeSideEnum('side'),
    state: signalStateEnum('state').notNull().default('DETECTED'),
    dataMode: dataModeEnum('data_mode').notNull(),
    skillId: text('skill_id').notNull().default('cross-market-catalyst'),
    skillVersion: integer('skill_version').notNull().default(1),
    candidateKey: text('candidate_key'),
    marketSnapshot: jsonb('market_snapshot').$type<SignalEvidence | null>(),
    triggeredRules: jsonb('triggered_rules').$type<string[]>().notNull().default([]),
    llmOutput: jsonb('llm_output').$type<LlmDecisionOutput | null>(),
    llmMetadata: jsonb('llm_metadata').$type<ReasoningMetadata | null>(),
    reasoningError: jsonb('reasoning_error').$type<CompactError | null>(),
    riskPreview: jsonb('risk_preview').$type<RiskPreview | null>(),
    proposedNotionalUsd: numeric('proposed_notional_usd', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }),
    proposedLeverage: numeric('proposed_leverage', {
      precision: 8,
      scale: 2,
      mode: 'number',
    }),
    stopLossPrice: numeric('stop_loss_price', { precision: 24, scale: 8, mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    timeline: jsonb('timeline').$type<SignalTimelineEntry[]>().notNull().default([]),
    notification: jsonb('notification').$type<NotificationDelivery | null>(),
    ...timestamps,
  },
  (table) => [
    index('signals_mandate_id_idx').on(table.mandateId),
    index('signals_state_idx').on(table.state),
    uniqueIndex('signals_candidate_key_uidx').on(table.candidateKey),
    check('signals_skill_version_positive', sql`${table.skillVersion} > 0`),
    check('signals_timeline_is_array', sql`jsonb_typeof(${table.timeline}) = 'array'`),
    check('signals_triggered_rules_is_array', sql`jsonb_typeof(${table.triggeredRules}) = 'array'`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'restrict' }),
    approvalKey: text('approval_key').notNull(),
    clientOrderId: text('client_order_id').notNull(),
    executionMode: executionModeEnum('execution_mode').notNull(),
    venueOrderId: text('venue_order_id'),
    side: tradeSideEnum('side').notNull(),
    notionalUsd: numeric('notional_usd', { precision: 18, scale: 2, mode: 'number' }).notNull(),
    leverage: numeric('leverage', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    requestedPrice: numeric('requested_price', { precision: 24, scale: 8, mode: 'number' }),
    fillPrice: numeric('fill_price', { precision: 24, scale: 8, mode: 'number' }),
    quantity: numeric('quantity', { precision: 28, scale: 12, mode: 'number' }),
    feeUsd: numeric('fee_usd', { precision: 18, scale: 8, mode: 'number' }).notNull().default(0),
    slippageBps: numeric('slippage_bps', { precision: 10, scale: 4, mode: 'number' })
      .notNull()
      .default(0),
    status: orderStatusEnum('status').notNull().default('PENDING'),
    error: jsonb('error').$type<CompactError | null>(),
    filledAt: timestamp('filled_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('orders_approval_key_uidx').on(table.approvalKey),
    uniqueIndex('orders_client_order_id_uidx').on(table.clientOrderId),
    index('orders_signal_id_idx').on(table.signalId),
    check('orders_notional_positive', sql`${table.notionalUsd} > 0`),
    check('orders_leverage_positive', sql`${table.leverage} > 0`),
    check('orders_quantity_positive', sql`${table.quantity} IS NULL OR ${table.quantity} > 0`),
    check('orders_fee_nonnegative', sql`${table.feeUsd} >= 0`),
    check('orders_slippage_nonnegative', sql`${table.slippageBps} >= 0`),
  ],
);

export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    symbol: text('symbol').notNull(),
    side: tradeSideEnum('side').notNull(),
    entryPrice: numeric('entry_price', { precision: 24, scale: 8, mode: 'number' }).notNull(),
    currentPrice: numeric('current_price', { precision: 24, scale: 8, mode: 'number' }).notNull(),
    notionalUsd: numeric('notional_usd', { precision: 18, scale: 2, mode: 'number' }).notNull(),
    leverage: numeric('leverage', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    quantity: numeric('quantity', { precision: 28, scale: 12, mode: 'number' }).notNull(),
    stopLossPrice: numeric('stop_loss_price', {
      precision: 24,
      scale: 8,
      mode: 'number',
    }).notNull(),
    entryFeeUsd: numeric('entry_fee_usd', { precision: 18, scale: 8, mode: 'number' })
      .notNull()
      .default(0),
    exitFeeUsd: numeric('exit_fee_usd', { precision: 18, scale: 8, mode: 'number' }),
    closeClientOrderId: text('close_client_order_id'),
    closeVenueOrderId: text('close_venue_order_id'),
    closePrice: numeric('close_price', { precision: 24, scale: 8, mode: 'number' }),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 8, mode: 'number' })
      .notNull()
      .default(0),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 8, mode: 'number' }),
    status: positionStatusEnum('status').notNull().default('OPEN'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('positions_order_id_uidx').on(table.orderId),
    uniqueIndex('positions_close_client_order_id_uidx').on(table.closeClientOrderId),
    check(
      'positions_prices_positive',
      sql`${table.entryPrice} > 0 AND ${table.currentPrice} > 0 AND ${table.stopLossPrice} > 0`,
    ),
    check('positions_notional_positive', sql`${table.notionalUsd} > 0`),
    check('positions_leverage_positive', sql`${table.leverage} > 0`),
    check('positions_quantity_positive', sql`${table.quantity} > 0`),
    check('positions_entry_fee_nonnegative', sql`${table.entryFeeUsd} >= 0`),
    check(
      'positions_exit_fee_nonnegative',
      sql`${table.exitFeeUsd} IS NULL OR ${table.exitFeeUsd} >= 0`,
    ),
    check(
      'positions_close_price_positive',
      sql`${table.closePrice} IS NULL OR ${table.closePrice} > 0`,
    ),
  ],
);
