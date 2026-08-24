import type {
  Mandate,
  RiskCode,
  RiskPreview,
  RiskRuleResult,
  TradeSide,
} from '@pocketpilot/shared';

export interface RiskOrderInput {
  asset: string;
  venue: string;
  direction: TradeSide;
  notionalUsd: number | null;
  leverage: number | null;
  entryReference: number | null;
  stopLossPrice: number | null;
  expiresAt: Date | null;
}

export interface RiskEvaluationInput {
  phase: RiskPreview['phase'];
  order: RiskOrderInput;
  mandate: Mandate;
  dailyRealizedLossUsd: number;
  explicitApprovalProvided: boolean;
  now?: Date;
}

function result(input: {
  ruleId: string;
  code: RiskCode;
  passed: boolean;
  actual: RiskRuleResult['actual'];
  limit: RiskRuleResult['limit'];
  pass: string;
  fail: string;
}): RiskRuleResult {
  return {
    ruleId: input.ruleId,
    code: input.code,
    passed: input.passed,
    actual: input.actual,
    limit: input.limit,
    explanation: input.passed ? input.pass : input.fail,
  };
}

export function evaluateRiskPolicy(input: RiskEvaluationInput): RiskPreview {
  const { mandate, order } = input;
  const now = input.now ?? new Date();
  const assetAllowed = mandate.allowedAssets.some((asset) => asset === order.asset);
  const venueAllowed = mandate.allowedVenues.some((venue) => venue === order.venue);
  const notionalAllowed =
    order.notionalUsd !== null &&
    Number.isFinite(order.notionalUsd) &&
    order.notionalUsd > 0 &&
    order.notionalUsd <= mandate.riskLimits.maxPositionUsd;
  const leverageAllowed =
    order.leverage !== null &&
    Number.isFinite(order.leverage) &&
    order.leverage > 0 &&
    order.leverage <= mandate.riskLimits.maxLeverage;
  const stopPresent =
    order.stopLossPrice !== null && Number.isFinite(order.stopLossPrice) && order.stopLossPrice > 0;
  const stopDirectional =
    stopPresent &&
    order.entryReference !== null &&
    Number.isFinite(order.entryReference) &&
    order.entryReference > 0 &&
    (order.direction === 'LONG'
      ? order.stopLossPrice! < order.entryReference
      : order.stopLossPrice! > order.entryReference);
  const stopAllowed = mandate.riskLimits.stopLossRequired
    ? stopDirectional
    : !stopPresent || stopDirectional;
  const dailyLossAllowed =
    Number.isFinite(input.dailyRealizedLossUsd) &&
    input.dailyRealizedLossUsd >= 0 &&
    input.dailyRealizedLossUsd < mandate.riskLimits.maxDailyLossUsd;
  const approvalAllowed =
    mandate.riskLimits.approvalRequired &&
    (input.phase === 'PRELIMINARY' || input.explicitApprovalProvided);
  const notExpired = order.expiresAt !== null && order.expiresAt.getTime() > now.getTime();

  const rules: RiskRuleResult[] = [
    result({
      ruleId: 'allowed-asset',
      code: 'ASSET_NOT_ALLOWED',
      passed: assetAllowed,
      actual: order.asset,
      limit: mandate.allowedAssets.join(', '),
      pass: `${order.asset} is allowed by the current mandate.`,
      fail: `${order.asset} is not in the mandate asset allowlist.`,
    }),
    result({
      ruleId: 'allowed-execution-venue',
      code: 'VENUE_NOT_ALLOWED',
      passed: venueAllowed,
      actual: order.venue,
      limit: mandate.allowedVenues.join(', '),
      pass: `${order.venue} is an allowed execution venue.`,
      fail: `${order.venue} is not an allowed execution venue.`,
    }),
    result({
      ruleId: 'maximum-notional',
      code: 'MAX_NOTIONAL_EXCEEDED',
      passed: notionalAllowed,
      actual: order.notionalUsd,
      limit: mandate.riskLimits.maxPositionUsd,
      pass: `$${order.notionalUsd} is within the $${mandate.riskLimits.maxPositionUsd} maximum.`,
      fail: `Notional must be positive and no more than $${mandate.riskLimits.maxPositionUsd}.`,
    }),
    result({
      ruleId: 'maximum-leverage',
      code: 'MAX_LEVERAGE_EXCEEDED',
      passed: leverageAllowed,
      actual: order.leverage,
      limit: mandate.riskLimits.maxLeverage,
      pass: `${order.leverage}x is within the ${mandate.riskLimits.maxLeverage}x maximum.`,
      fail: `Leverage must be positive and no more than ${mandate.riskLimits.maxLeverage}x.`,
    }),
    result({
      ruleId: 'directional-stop-loss',
      code: stopPresent ? 'STOP_LOSS_INVALID' : 'STOP_LOSS_REQUIRED',
      passed: stopAllowed,
      actual: order.stopLossPrice,
      limit:
        order.direction === 'LONG'
          ? `below ${order.entryReference ?? 'entry'}`
          : `above ${order.entryReference ?? 'entry'}`,
      pass: stopPresent
        ? `The stop-loss is present and valid for a ${order.direction.toLowerCase()} position.`
        : 'The mandate does not require a stop-loss and none was supplied.',
      fail: stopPresent
        ? `The stop-loss must be ${order.direction === 'LONG' ? 'below' : 'above'} the entry reference.`
        : 'A stop-loss is required by the mandate.',
    }),
    result({
      ruleId: 'daily-realized-loss',
      code: 'DAILY_LOSS_LIMIT_REACHED',
      passed: dailyLossAllowed,
      actual: input.dailyRealizedLossUsd,
      limit: mandate.riskLimits.maxDailyLossUsd,
      pass: `Today's realized loss is below the $${mandate.riskLimits.maxDailyLossUsd} limit.`,
      fail: `Today's realized loss has reached the $${mandate.riskLimits.maxDailyLossUsd} limit.`,
    }),
    result({
      ruleId: 'kill-switch-off',
      code: 'KILL_SWITCH_ENABLED',
      passed: !mandate.killSwitchEnabled,
      actual: mandate.killSwitchEnabled,
      limit: false,
      pass: 'The kill switch is off.',
      fail: 'The kill switch is enabled; new approvals are blocked.',
    }),
    result({
      ruleId: 'explicit-human-approval',
      code: 'APPROVAL_REQUIRED',
      passed: approvalAllowed,
      actual:
        input.phase === 'PRELIMINARY'
          ? mandate.riskLimits.approvalRequired
          : input.explicitApprovalProvided,
      limit: true,
      pass:
        input.phase === 'PRELIMINARY'
          ? 'The mandate requires explicit human approval before execution.'
          : 'This validation was triggered by an explicit human approval request.',
      fail: 'Explicit human approval is required before execution.',
    }),
    result({
      ruleId: 'signal-not-expired',
      code: 'SIGNAL_EXPIRED',
      passed: notExpired,
      actual: order.expiresAt?.toISOString() ?? null,
      limit: now.toISOString(),
      pass: 'The signal has not expired.',
      fail: 'The signal is expired or has no valid expiry.',
    }),
  ];

  return {
    allowed: rules.every((rule) => rule.passed),
    phase: input.phase,
    checkedAt: now.toISOString(),
    rules,
  };
}

export function firstFailedRiskRule(preview: RiskPreview): RiskRuleResult | null {
  return preview.rules.find((rule) => !rule.passed) ?? null;
}
