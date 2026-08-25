import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { readableError } from '../../lib/api';
import { formatDateTime, formatUsd } from '../../lib/format';
import { useClosePosition, usePosition } from '../../lib/queries';
import { colors, radii } from '../../lib/theme';

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
  const pnl = position.status === 'OPEN' ? position.unrealizedPnl : (position.realizedPnl ?? 0);
  const confirmClose = () => {
    if (position.status !== 'OPEN' || close.isPending) return;
    Alert.alert(
      'Close paper position?',
      `Close ${position.symbol} ${position.side.toLowerCase()} at the current normalized mark? Repeated taps return the same close result.`,
      [
        { text: 'Keep open', style: 'cancel' },
        { text: 'Close position', style: 'destructive', onPress: () => close.mutate() },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.nav}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle}>PAPER POSITION</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            colors={[colors.mint]}
            progressBackgroundColor={colors.surface}
            tintColor={colors.mint}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.symbol}>{position.symbol} · PERP</Text>
            <Text style={[styles.side, position.side === 'LONG' ? styles.long : styles.short]}>
              {position.side} · {position.status}
            </Text>
          </View>
          <View style={[styles.statusPill, position.status === 'CLOSED' && styles.closedPill]}>
            <Text style={styles.statusText}>{position.executionMode.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.pnlCard}>
          <Text style={styles.pnlLabel}>
            {position.status === 'OPEN' ? 'UNREALIZED PNL' : 'REALIZED PNL'} · FEES INCLUDED
          </Text>
          <Text style={[styles.pnl, pnl >= 0 ? styles.positive : styles.negative]}>
            {pnl >= 0 ? '+' : ''}
            {formatUsd(pnl, 4)}
          </Text>
          <Text style={styles.pollingCopy}>
            {position.status === 'OPEN'
              ? 'Normalized server mark · refreshes every 10 seconds'
              : `Closed ${formatDateTime(position.closedAt)}`}
          </Text>
        </View>

        <Section title="Execution">
          <View style={styles.grid}>
            <Metric label="Entry price" value={formatUsd(position.entryPrice, 2)} />
            <Metric label="Current price" value={formatUsd(position.currentPrice, 2)} />
            <Metric label="Notional" value={formatUsd(position.notionalUsd, 2)} />
            <Metric label="Leverage" value={`${position.leverage}x`} />
            <Metric label="Quantity" value={`${position.quantity.toFixed(8)} ${position.symbol}`} />
            <Metric label="Stop-loss" value={formatUsd(position.stopLossPrice, 2)} />
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
              <Text style={styles.closeText}>Close Position</Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.closedCard}>
            <Text style={styles.closedTitle}>Position closed</Text>
            <Text style={styles.closedBody}>Repeated close requests return this same result.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.nav}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      </View>
      <View style={styles.screenState}>
        {retry ? (
          <Text style={styles.errorGlyph}>!</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  nav: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 54,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  backText: { color: colors.text, fontSize: 29, lineHeight: 31 },
  navTitle: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  navSpacer: { width: 36 },
  content: { paddingBottom: 38, paddingHorizontal: 20 },
  heroRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  symbol: { color: colors.text, fontSize: 25, fontWeight: '900' },
  side: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  long: { color: colors.mint },
  short: { color: colors.red },
  statusPill: { backgroundColor: colors.mintDark, borderRadius: 14, padding: 9 },
  closedPill: { backgroundColor: colors.blueDark },
  statusText: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  pnlCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    marginTop: 22,
    padding: 20,
  },
  pnlLabel: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pnl: { fontSize: 38, fontWeight: '900', letterSpacing: -1.2, marginTop: 9 },
  positive: { color: colors.mint },
  negative: { color: colors.red },
  pollingCopy: { color: colors.textMuted, fontSize: 11, marginTop: 7 },
  section: { marginTop: 26 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    backgroundColor: colors.surface,
    borderRadius: radii.medium,
    minWidth: '46%',
    padding: 14,
  },
  metricLabel: { color: colors.textDim, fontSize: 10, fontWeight: '800' },
  metricValue: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 5 },
  terms: { backgroundColor: colors.surface, borderRadius: radii.medium, paddingHorizontal: 14 },
  term: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  termLabel: { color: colors.textMuted, fontSize: 12 },
  termValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  thesisCard: { backgroundColor: colors.blueDark, borderRadius: radii.medium, padding: 15 },
  thesis: { color: colors.text, fontSize: 13, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', marginTop: 12 },
  bullet: {
    backgroundColor: colors.red,
    borderRadius: 4,
    height: 7,
    marginRight: 9,
    marginTop: 6,
    width: 7,
  },
  bulletText: { color: colors.textMuted, flex: 1, fontSize: 12, lineHeight: 19 },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.red,
    borderRadius: 15,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    marginTop: 28,
  },
  closeText: { color: colors.red, fontSize: 15, fontWeight: '900' },
  closedCard: {
    backgroundColor: colors.mintDark,
    borderRadius: radii.medium,
    marginTop: 28,
    padding: 16,
  },
  closedTitle: { color: colors.mint, fontSize: 14, fontWeight: '900' },
  closedBody: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  errorCard: {
    backgroundColor: colors.redDark,
    borderRadius: radii.medium,
    marginTop: 20,
    padding: 14,
  },
  errorTitle: { color: colors.red, fontSize: 13, fontWeight: '900' },
  errorBody: { color: colors.text, fontSize: 12, marginTop: 4 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
  screenState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  errorGlyph: { color: colors.red, fontSize: 34, fontWeight: '900' },
  screenStateTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 14 },
  screenStateBody: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  retryButton: { backgroundColor: colors.mint, borderRadius: 12, marginTop: 18, padding: 12 },
  retryText: { color: colors.background, fontWeight: '900' },
});
