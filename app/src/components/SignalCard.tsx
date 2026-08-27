import type { SignalListItem } from '@pocketpilot/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatAge, formatPercent, formatUsd } from '../lib/format';
import { colors, radii, spacing, typography } from '../lib/theme';
import { AppIcon, FadeInView } from './AppChrome';

const stateLabels: Record<SignalListItem['state'], string> = {
  DETECTED: 'Detected',
  ANALYZING: 'Analyzing',
  PROPOSED: 'Monitoring',
  PENDING_APPROVAL: 'Review',
  APPROVED: 'Approved',
  EXECUTING: 'Executing',
  FILLED: 'Filled',
  CLOSED: 'Closed',
  NO_TRADE: 'No trade',
  REJECTED: 'Rejected',
  RISK_BLOCKED: 'Risk blocked',
  EXPIRED: 'Expired',
  EXECUTION_FAILED: 'Failed',
};

export function StateChip({ state }: { state: SignalListItem['state'] }) {
  const actionable = state === 'PENDING_APPROVAL';
  const positive = ['APPROVED', 'EXECUTING', 'FILLED', 'CLOSED'].includes(state);
  const inactive = ['EXPIRED', 'REJECTED', 'RISK_BLOCKED', 'EXECUTION_FAILED'].includes(state);
  const dotColor = actionable
    ? colors.amber
    : positive
      ? colors.mint
      : inactive
        ? colors.red
        : colors.blue;

  return (
    <View
      style={[
        styles.chip,
        actionable && styles.chipAction,
        positive && styles.chipPositive,
        inactive && styles.chipInactive,
      ]}
    >
      <View style={[styles.chipDot, { backgroundColor: dotColor }]} />
      <Text
        style={[
          styles.chipText,
          actionable && styles.chipTextAction,
          positive && styles.chipTextPositive,
          inactive && styles.chipTextInactive,
        ]}
      >
        {stateLabels[state]}
      </Text>
    </View>
  );
}

export function SignalCard({
  signal,
  onPress,
  index = 0,
}: {
  signal: SignalListItem;
  onPress: () => void;
  index?: number;
}) {
  const long = signal.side === 'LONG';
  return (
    <FadeInView delay={Math.min(index, 5) * 45}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${signal.symbol} ${signal.side ?? ''} signal`}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.topRow}>
          <View style={styles.assetRow}>
            <View style={styles.assetBadge}>
              <Text style={styles.assetInitial}>{signal.symbol.slice(0, 1)}</Text>
            </View>
            <View>
              <Text style={styles.asset}>{signal.symbol}</Text>
              <Text style={styles.market}>PERPETUAL</Text>
            </View>
          </View>
          <StateChip state={signal.state} />
        </View>

        <Text numberOfLines={2} style={styles.thesis}>
          {signal.thesis ?? signal.title ?? 'Signal evidence is being assembled.'}
        </Text>

        <View style={styles.directionRow}>
          <View style={[styles.directionPill, long ? styles.longPill : styles.shortPill]}>
            <Text style={[styles.direction, long ? styles.long : styles.short]}>
              {signal.side ?? 'WATCH'}
            </Text>
          </View>
          <View style={styles.rule} />
        </View>

        <View style={styles.metrics}>
          <Metric label="Age" value={formatAge(signal.createdAt)} />
          <Metric
            label="Confidence"
            value={signal.confidence === null ? '—' : formatPercent(signal.confidence)}
          />
          <Metric label="Notional" value={formatUsd(signal.proposedNotionalUsd)} />
          <View style={styles.openHint}>
            <AppIcon color={colors.textMuted} name="forward" size={17} />
          </View>
        </View>
      </Pressable>
    </FadeInView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  assetRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  assetBadge: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderColor: 'rgba(124, 233, 230, 0.22)',
    borderRadius: radii.medium,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  assetInitial: { color: colors.white, fontSize: 16, fontWeight: '700' },
  asset: { color: colors.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.15 },
  market: { ...typography.label, color: colors.textDim, fontSize: 9, marginTop: 2 },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.blueDark,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  chipAction: { backgroundColor: colors.amberDark },
  chipPositive: { backgroundColor: colors.mintDark },
  chipInactive: { backgroundColor: colors.redDark },
  chipDot: { borderRadius: 3, height: 6, width: 6 },
  chipText: { ...typography.label, color: colors.blue, fontSize: 9, letterSpacing: 0.2 },
  chipTextAction: { color: colors.amber },
  chipTextPositive: { color: colors.mint },
  chipTextInactive: { color: colors.red },
  thesis: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  directionRow: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.md },
  directionPill: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4 },
  longPill: { backgroundColor: colors.mintDark },
  shortPill: { backgroundColor: colors.redDark },
  direction: { ...typography.label, fontSize: 9 },
  long: { color: colors.mint },
  short: { color: colors.red },
  rule: { backgroundColor: colors.border, flex: 1, height: 1, marginLeft: spacing.md },
  metrics: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  metric: { gap: 3 },
  metricLabel: {
    ...typography.label,
    color: colors.textDim,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  openHint: { alignItems: 'flex-end', flex: 1 },
});
