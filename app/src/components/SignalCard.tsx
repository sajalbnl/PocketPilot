import type { SignalListItem } from '@pocketpilot/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatAge, formatPercent, formatUsd } from '../lib/format';
import { colors, radii } from '../lib/theme';

const stateLabels: Record<SignalListItem['state'], string> = {
  DETECTED: 'Detected',
  ANALYZING: 'Analyzing',
  PROPOSED: 'Monitoring',
  PENDING_APPROVAL: 'Approval required',
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
  const inactive = ['EXPIRED', 'REJECTED', 'RISK_BLOCKED', 'EXECUTION_FAILED'].includes(state);
  return (
    <View style={[styles.chip, actionable && styles.chipAction, inactive && styles.chipInactive]}>
      <Text
        style={[
          styles.chipText,
          actionable && styles.chipTextAction,
          inactive && styles.chipTextInactive,
        ]}
      >
        {stateLabels[state]}
      </Text>
    </View>
  );
}

export function SignalCard({ signal, onPress }: { signal: SignalListItem; onPress: () => void }) {
  const long = signal.side === 'LONG';
  return (
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
            <Text style={styles.asset}>{signal.symbol} · PERP</Text>
            <Text style={[styles.side, long ? styles.long : styles.short]}>
              {signal.side ?? 'WATCH'}
            </Text>
          </View>
        </View>
        <StateChip state={signal.state} />
      </View>

      <Text numberOfLines={2} style={styles.thesis}>
        {signal.thesis ?? signal.title ?? 'Signal evidence is being assembled.'}
      </Text>

      <View style={styles.metrics}>
        <Metric label="Age" value={formatAge(signal.createdAt)} />
        <Metric
          label="Confidence"
          value={signal.confidence === null ? '—' : formatPercent(signal.confidence)}
        />
        <Metric label="Size" value={formatUsd(signal.proposedNotionalUsd)} />
        <View style={styles.openHint}>
          <Text style={styles.openHintText}>VIEW ›</Text>
        </View>
      </View>
    </Pressable>
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
    marginBottom: 12,
    padding: 17,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  assetRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  assetBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  assetInitial: { color: colors.text, fontSize: 16, fontWeight: '800' },
  asset: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  side: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 3 },
  long: { color: colors.mint },
  short: { color: colors.red },
  chip: {
    backgroundColor: colors.blueDark,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipAction: { backgroundColor: colors.amberDark },
  chipInactive: { backgroundColor: colors.redDark },
  chipText: { color: colors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  chipTextAction: { color: colors.amber },
  chipTextInactive: { color: colors.red },
  thesis: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 17, minHeight: 44 },
  metrics: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 20,
    marginTop: 15,
    paddingTop: 13,
  },
  metric: { gap: 3 },
  metricLabel: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  openHint: { flex: 1 },
  openHintText: { color: colors.mint, fontSize: 11, fontWeight: '800', textAlign: 'right' },
});
