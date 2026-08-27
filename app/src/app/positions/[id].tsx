import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppIcon,
  AppScreen,
  FadeInView,
  ScreenNav,
  SectionHeading,
} from '../../components/AppChrome';
import { readableError } from '../../lib/api';
import { formatDateTime, formatUsd } from '../../lib/format';
import { useClosePosition, usePosition } from '../../lib/queries';
import { colors, radii, spacing, typography } from '../../lib/theme';

export default function PositionScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  const query = usePosition(id);
  const close = useClosePosition(id);

  if (query.isPending) {
    return <ScreenState title="Loading position" body="Retrieving the latest paper mark…" />;
  }
  if (query.isError) {
    return (
      <ScreenState
        title="Position unavailable"
        body={readableError(query.error)}
        retry={() => void query.refetch()}
      />
    );
  }

  const position = query.data;
  const executionLabel = position.executionMode === 'paper' ? 'paper' : 'Hyperliquid testnet';
  const pnl = position.status === 'OPEN' ? position.unrealizedPnl : (position.realizedPnl ?? 0);
  const confirmClose = () => {
    if (position.status !== 'OPEN' || close.isPending) return;
    Alert.alert(
      `Close ${executionLabel} position?`,
      `Close ${position.symbol} ${position.side.toLowerCase()} through the ${executionLabel} adapter? Repeated taps return the same close result.`,
      [
        { text: 'Keep open', style: 'cancel' },
        { text: 'Close position', style: 'destructive', onPress: () => close.mutate() },
      ],
    );
  };

  return (
    <AppScreen>
      <ScreenNav onBack={() => router.back()} title={`${executionLabel} position`} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            colors={[colors.mint]}
            progressBackgroundColor={colors.surfaceRaised}
            tintColor={colors.mint}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <FadeInView>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.symbol}>{position.symbol} · PERP</Text>
              <Text style={[styles.side, position.side === 'LONG' ? styles.long : styles.short]}>
                {position.side} · {position.status}
              </Text>
            </View>
            <View style={[styles.statusPill, position.status === 'CLOSED' && styles.closedPill]}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{position.executionMode.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.pnlCard}>
            <View style={styles.pnlIcon}>
              <AppIcon color={pnl >= 0 ? colors.mint : colors.red} name="trend" size={20} />
            </View>
            <Text style={styles.pnlLabel}>
              {position.status === 'OPEN' ? 'UNREALIZED PNL' : 'REALIZED PNL'} · FEES INCLUDED
            </Text>
            <Text style={[styles.pnl, pnl >= 0 ? styles.positive : styles.negative]}>
              {pnl >= 0 ? '+' : ''}
              {formatUsd(pnl, 4)}
            </Text>
            <View style={styles.pollingRow}>
              <View style={styles.pollingDot} />
              <Text style={styles.pollingCopy}>
                {position.status === 'OPEN'
                  ? 'Normalized server mark · refreshes every 10 seconds'
                  : `Closed ${formatDateTime(position.closedAt)}`}
              </Text>
            </View>
          </View>
        </FadeInView>

        <Section title="Execution">
          <View style={styles.grid}>
            <Metric label="Entry price" value={formatUsd(position.entryPrice, 2)} />
            <Metric label="Current price" value={formatUsd(position.currentPrice, 2)} />
            <Metric label="Notional" value={formatUsd(position.notionalUsd, 2)} />
            <Metric label="Leverage" value={`${position.leverage}x`} />
            <Metric label="Quantity" value={`${position.quantity.toFixed(8)} ${position.symbol}`} />
            <Metric
              label="Recorded stop · not automated"
              value={formatUsd(position.stopLossPrice, 2)}
            />
          </View>
        </Section>

        <Section title="Costs & close">
          <View style={styles.terms}>
            <Term label="Entry fee" value={formatUsd(position.entryFeeUsd, 4)} />
            <Term label="Exit fee" value={formatUsd(position.exitFeeUsd, 4)} />
            <Term label="Close price" value={formatUsd(position.closePrice, 2)} />
          </View>
        </Section>

        <Section title="Linked thesis health">
          <View style={styles.thesisCard}>
            <Text style={styles.thesis}>{position.thesisHealth}</Text>
            {position.invalidationSummary.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        </Section>

        {close.error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Close not completed</Text>
            <Text style={styles.errorBody}>{readableError(close.error)}</Text>
          </View>
        ) : null}

        {position.status === 'OPEN' ? (
          <Pressable
            accessibilityRole="button"
            disabled={close.isPending}
            onPress={confirmClose}
            style={({ pressed }) => [
              styles.closeButton,
              close.isPending && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {close.isPending ? (
              <ActivityIndicator color={colors.red} />
            ) : (
              <>
                <Text style={styles.closeText}>Close position</Text>
                <AppIcon color={colors.red} name="close" size={17} />
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.closedCard}>
            <Text style={styles.closedTitle}>Position closed</Text>
            <Text style={styles.closedBody}>Repeated close requests return this same result.</Text>
          </View>
        )}
      </ScrollView>
    </AppScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeading title={title} />
      {children}
    </View>
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

function Term({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.term}>
      <Text style={styles.termLabel}>{label}</Text>
      <Text style={styles.termValue}>{value}</Text>
    </View>
  );
}

function ScreenState({ title, body, retry }: { title: string; body: string; retry?: () => void }) {
  return (
    <AppScreen>
      <ScreenNav onBack={() => router.back()} title="Position" />
      <View style={styles.screenState}>
        {retry ? (
          <View style={styles.errorGlyph}>
            <AppIcon color={colors.red} name="error" size={25} />
          </View>
        ) : (
          <ActivityIndicator color={colors.mint} />
        )}
        <Text style={styles.screenStateTitle}>{title}</Text>
        <Text style={styles.screenStateBody}>{body}</Text>
        {retry ? (
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 44, paddingHorizontal: spacing.lg },
  heroRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  symbol: { ...typography.title, color: colors.text },
  side: { ...typography.label, fontSize: 9, marginTop: spacing.sm },
  long: { color: colors.mint },
  short: { color: colors.red },
  statusPill: {
    alignItems: 'center',
    backgroundColor: colors.mintDark,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  closedPill: { backgroundColor: colors.blueDark },
  statusDot: { backgroundColor: colors.mint, borderRadius: 3, height: 6, width: 6 },
  statusText: { ...typography.label, color: colors.text, fontSize: 8.5 },
  pnlCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    marginTop: spacing.xxl,
    overflow: 'hidden',
    padding: spacing.xl,
  },
  pnlIcon: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.mintDark,
    borderRadius: radii.medium,
    height: 40,
    justifyContent: 'center',
    marginBottom: -24,
    width: 40,
  },
  pnlLabel: { ...typography.label, color: colors.textDim, fontSize: 9 },
  pnl: {
    fontSize: 40,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -1.4,
    marginTop: spacing.sm,
  },
  positive: { color: colors.mint },
  negative: { color: colors.red },
  pollingRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: spacing.sm },
  pollingDot: { backgroundColor: colors.mint, borderRadius: 3, height: 5, width: 5 },
  pollingCopy: { ...typography.caption, color: colors.textMuted },
  section: { gap: spacing.md, marginTop: spacing.xxxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: '46%',
    padding: spacing.lg,
  },
  metricLabel: { ...typography.label, color: colors.textDim, fontSize: 9 },
  metricValue: {
    color: colors.text,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 6,
  },
  terms: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  term: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 55,
  },
  termLabel: { ...typography.caption, color: colors.textMuted },
  termValue: { color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '700' },
  thesisCard: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(150, 200, 255, 0.20)',
    borderRadius: radii.medium,
    borderWidth: 1,
    padding: spacing.lg,
  },
  thesis: { ...typography.body, color: colors.text },
  bulletRow: { flexDirection: 'row', marginTop: 12 },
  bullet: {
    backgroundColor: colors.red,
    borderRadius: 4,
    height: 7,
    marginRight: 9,
    marginTop: 6,
    width: 7,
  },
  bulletText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.redDark,
    borderColor: colors.red,
    borderRadius: radii.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 54,
    justifyContent: 'center',
    marginTop: spacing.xxxl,
  },
  closeText: { color: colors.red, fontSize: 14, fontWeight: '700' },
  closedCard: {
    backgroundColor: colors.mintDark,
    borderColor: 'rgba(22, 217, 213, 0.18)',
    borderRadius: radii.medium,
    borderWidth: 1,
    marginTop: spacing.xxxl,
    padding: spacing.lg,
  },
  closedTitle: { color: colors.mint, fontSize: 14, fontWeight: '700' },
  closedBody: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  errorCard: {
    backgroundColor: colors.redDark,
    borderColor: 'rgba(255, 101, 104, 0.2)',
    borderRadius: radii.medium,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  errorTitle: { color: colors.red, fontSize: 13, fontWeight: '700' },
  errorBody: { ...typography.caption, color: colors.text, marginTop: spacing.xs },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  screenState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 70,
    paddingHorizontal: spacing.xxxl,
  },
  errorGlyph: {
    alignItems: 'center',
    backgroundColor: colors.redDark,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  screenStateTitle: { ...typography.section, color: colors.text, marginTop: spacing.lg },
  screenStateBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.mint,
    borderRadius: radii.medium,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  retryText: { color: colors.background, fontWeight: '700' },
});
