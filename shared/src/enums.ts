import { z } from 'zod';

export const assets = ['BTC', 'ETH'] as const;
export const AssetSchema = z.enum(assets);
export type Asset = z.infer<typeof AssetSchema>;

export const tradeSides = ['LONG', 'SHORT'] as const;
export const TradeSideSchema = z.enum(tradeSides);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const dataModes = ['replay', 'live'] as const;
export const DataModeSchema = z.enum(dataModes);
export type DataMode = z.infer<typeof DataModeSchema>;

export const executionModes = ['paper', 'hyperliquid-testnet'] as const;
export const ExecutionModeSchema = z.enum(executionModes);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const executionVenues = ['hyperliquid'] as const;
export const ExecutionVenueSchema = z.enum(executionVenues);
export type ExecutionVenue = z.infer<typeof ExecutionVenueSchema>;

export const signalStates = [
  'DETECTED',
  'ANALYZING',
  'PROPOSED',
  'PENDING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'FILLED',
  'CLOSED',
  'NO_TRADE',
  'REJECTED',
  'RISK_BLOCKED',
  'EXPIRED',
  'EXECUTION_FAILED',
] as const;
export const SignalStateSchema = z.enum(signalStates);
export type SignalState = z.infer<typeof SignalStateSchema>;

export const terminalSignalStates = [
  'CLOSED',
  'NO_TRADE',
  'REJECTED',
  'RISK_BLOCKED',
  'EXPIRED',
  'EXECUTION_FAILED',
] as const satisfies readonly SignalState[];

export const llmDecisions = ['PROPOSE', 'NO_TRADE'] as const;
export const LlmDecisionSchema = z.enum(llmDecisions);
export type LlmDecision = z.infer<typeof LlmDecisionSchema>;

export const orderStatuses = ['PENDING', 'SUBMITTED', 'FILLED', 'FAILED', 'CANCELLED'] as const;
export const OrderStatusSchema = z.enum(orderStatuses);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const positionStatuses = ['OPEN', 'CLOSED'] as const;
export const PositionStatusSchema = z.enum(positionStatuses);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

export const riskCodes = [
  'ASSET_NOT_ALLOWED',
  'VENUE_NOT_ALLOWED',
  'MAX_NOTIONAL_EXCEEDED',
  'MAX_LEVERAGE_EXCEEDED',
  'DAILY_LOSS_LIMIT_REACHED',
  'STOP_LOSS_REQUIRED',
  'STOP_LOSS_INVALID',
  'APPROVAL_REQUIRED',
  'SIGNAL_EXPIRED',
  'KILL_SWITCH_ENABLED',
  'INVALID_SIGNAL_STATE',
] as const;
export const RiskCodeSchema = z.enum(riskCodes);
export type RiskCode = z.infer<typeof RiskCodeSchema>;
