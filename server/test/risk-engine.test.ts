import type { Mandate } from '@pocketpilot/shared';
import { describe, expect, it } from 'vitest';

import { evaluateRiskPolicy } from '../src/risk/engine.js';

const now = new Date('2026-08-24T10:00:00.000Z');
const mandate: Mandate = {
  id: '10000000-0000-4000-8000-000000000001',
  agentName: 'Risk Test Agent',
  skillSlug: 'cross-market-catalyst',
  allowedAssets: ['BTC', 'ETH'],
  allowedVenues: ['hyperliquid'],
  riskLimits: {
    maxPositionUsd: 100,
    maxLeverage: 3,
    maxDailyLossUsd: 25,
    stopLossRequired: true,
    approvalRequired: true,
    signalExpiryMinutes: 10,
  },
  killSwitchEnabled: false,
  version: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

function evaluate(
  overrides: {
    order?: Partial<Parameters<typeof evaluateRiskPolicy>[0]['order']>;
    mandate?: Partial<Mandate>;
    dailyRealizedLossUsd?: number;
    explicitApprovalProvided?: boolean;
    phase?: 'PRELIMINARY' | 'APPROVAL';
    at?: Date;
  } = {},
) {
  return evaluateRiskPolicy({
    phase: overrides.phase ?? 'APPROVAL',
    order: {
      asset: 'BTC',
      venue: 'hyperliquid',
      direction: 'LONG',
      notionalUsd: 100,
      leverage: 3,
      entryReference: 65_000,
      stopLossPrice: 63_700,
      expiresAt: new Date('2026-08-24T10:10:00.000Z'),
      ...overrides.order,
    },
    mandate: { ...mandate, ...overrides.mandate },
    dailyRealizedLossUsd: overrides.dailyRealizedLossUsd ?? 0,
    explicitApprovalProvided: overrides.explicitApprovalProvided ?? true,
    now: overrides.at ?? now,
  });
}

function failedRule(result: ReturnType<typeof evaluateRiskPolicy>, ruleId: string) {
  return result.rules.find((rule) => rule.ruleId === ruleId && !rule.passed);
}

describe('deterministic risk policy', () => {
  it('accepts every inclusive order maximum and blocks unsupported asset and venue', () => {
    expect(evaluate().allowed).toBe(true);
    expect(failedRule(evaluate({ order: { asset: 'SOL' } }), 'allowed-asset')?.code).toBe(
      'ASSET_NOT_ALLOWED',
    );
    expect(
      failedRule(evaluate({ order: { venue: 'binance' } }), 'allowed-execution-venue')?.code,
    ).toBe('VENUE_NOT_ALLOWED');
  });

  it('blocks $150 and accepts exactly $100, with exact leverage boundaries', () => {
    expect(failedRule(evaluate({ order: { notionalUsd: 150 } }), 'maximum-notional')?.actual).toBe(
      150,
    );
    expect(evaluate({ order: { notionalUsd: 100 } }).allowed).toBe(true);
    expect(evaluate({ order: { leverage: 3 } }).allowed).toBe(true);
    expect(failedRule(evaluate({ order: { leverage: 3.0001 } }), 'maximum-leverage')).toBeDefined();
  });

  it('requires a directionally valid stop-loss for long and short proposals', () => {
    expect(
      failedRule(evaluate({ order: { stopLossPrice: null } }), 'directional-stop-loss')?.code,
    ).toBe('STOP_LOSS_REQUIRED');
    expect(
      failedRule(evaluate({ order: { stopLossPrice: 65_000 } }), 'directional-stop-loss')?.code,
    ).toBe('STOP_LOSS_INVALID');
    expect(evaluate({ order: { direction: 'SHORT', stopLossPrice: 66_000 } }).allowed).toBe(true);
  });

  it('denies at the daily loss limit and whenever the kill switch is enabled', () => {
    expect(evaluate({ dailyRealizedLossUsd: 24.99 }).allowed).toBe(true);
    expect(failedRule(evaluate({ dailyRealizedLossUsd: 25 }), 'daily-realized-loss')?.code).toBe(
      'DAILY_LOSS_LIMIT_REACHED',
    );
    expect(
      failedRule(evaluate({ mandate: { killSwitchEnabled: true } }), 'kill-switch-off')?.code,
    ).toBe('KILL_SWITCH_ENABLED');
  });

  it('requires explicit approval and denies an expiry at or before the current instant', () => {
    expect(
      failedRule(evaluate({ explicitApprovalProvided: false }), 'explicit-human-approval')?.code,
    ).toBe('APPROVAL_REQUIRED');
    expect(
      failedRule(evaluate({ order: { expiresAt: new Date(now) } }), 'signal-not-expired')?.code,
    ).toBe('SIGNAL_EXPIRED');
    expect(
      failedRule(
        evaluate({ order: { expiresAt: new Date(now.getTime() - 1) } }),
        'signal-not-expired',
      ),
    ).toBeDefined();
  });
});
