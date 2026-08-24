import type { SignalDetail } from '@pocketpilot/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApprovalSheet } from '../../components/ApprovalSheet';
import { StateChip } from '../../components/SignalCard';
import { readableError } from '../../lib/api';
import { formatDateTime, formatPercent, formatUsd } from '../../lib/format';
import { useMandate, useSignal } from '../../lib/queries';
import { colors, radii } from '../../lib/theme';

export default function SignalDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  const signalQuery = useSignal(id);
  const mandateQuery = useMandate();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (signalQuery.isPending) {
    return (
      <ScreenState title="Loading signal" body="Retrieving evidence and authoritative state…" />
    );
  }
  if (signalQuery.isError) {
    return (
      <ScreenState
        title="Signal unavailable"
        body={readableError(signalQuery.error)}
        retry={() => void signalQuery.refetch()}
      />
    );
  }

  const signal = signalQuery.data;
  const proposal =
    signal.llmOutput?.decision === 'PROPOSE_LONG' || signal.llmOutput?.decision === 'PROPOSE_SHORT'
      ? signal.llmOutput
      : null;
  const expiredByTime = signal.expiresAt
    ? new Date(signal.expiresAt).getTime() <= Date.now()
    : false;
  const approvable = signal.state === 'PENDING_APPROVAL' && !expiredByTime;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.nav}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle}>SIGNAL TRACE</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={signalQuery.isRefetching}
            onRefresh={() => void signalQuery.refetch()}
            colors={[colors.mint]}
            progressBackgroundColor={colors.surface}
            tintColor={colors.mint}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.symbol}>{signal.symbol} · PERP</Text>
            <Text style={[styles.direction, signal.side === 'SHORT' ? styles.short : styles.long]}>
              {signal.side ?? 'WATCH'} PROPOSAL
            </Text>
          </View>
          <StateChip state={signal.state} />
        </View>
        <Text style={styles.heroTitle}>{signal.title ?? 'Signal analysis'}</Text>
        <View style={styles.heroMetrics}>
          <HeroMetric
            label="Confidence"
            value={signal.confidence === null ? '—' : formatPercent(signal.confidence)}
          />
          <HeroMetric label="Notional" value={formatUsd(signal.proposedNotionalUsd)} />
          <HeroMetric
            label="Leverage"
            value={signal.proposedLeverage ? `${signal.proposedLeverage}x` : '—'}
          />
        </View>

        <View style={[styles.boundaryCard, styles.reasoningCard]}>
          <Text style={[styles.boundaryLabel, styles.reasoningLabel]}>
            {proposal
              ? 'AGENT REASONING · PHASE 2 SEED'
              : `DETERMINISTIC DETECTION · SKILL v${signal.skillVersion}`}
          </Text>
          <Text style={styles.boundaryTitle}>
            {proposal ? 'Interpretation, not authorization' : signal.skillId}
          </Text>
          <Text style={styles.body}>
            {proposal?.thesis ?? signal.thesis ?? 'Analysis is still being assembled.'}
          </Text>
        </View>

        <Section title="Why now">
          {proposal?.whyNow.map((item) => (
            <Bullet key={item} text={item} color={colors.amber} />
          )) ?? (
            <Text style={styles.body}>No why-now explanation is available for this state.</Text>
          )}
        </Section>

        <Section title="Traceable evidence" subtitle="Captured snapshots from each source">
          {signal.evidence ? (
            <>
              {signal.evidence.hyperliquid.map((sample) => (
                <View key={sample.sampleId} style={styles.evidenceCard}>
                  <SourceHeader color={colors.mint} label="HYPERLIQUID" />
                  <Text style={styles.evidenceTitle}>{sample.symbol} perpetual market</Text>
                  <View style={styles.statGrid}>
                    <Stat label="Mark" value={formatUsd(sample.markPrice, 2)} />
                    <Stat label="24h volume" value={formatUsd(sample.volume24hUsd)} />
                    <Stat label="Open interest" value={formatUsd(sample.openInterestUsd)} />
                    <Stat label="Funding" value={`${(sample.fundingRate * 100).toFixed(4)}%`} />
                  </View>
                </View>
              ))}
              {signal.evidence.polymarket.map((sample) => (
                <View key={sample.marketId} style={styles.evidenceCard}>
                  <SourceHeader color={colors.blue} label="POLYMARKET" />
                  <Text style={styles.evidenceTitle}>{sample.question}</Text>
                  <View style={styles.statGrid}>
                    <Stat label="Yes probability" value={formatPercent(sample.probability)} />
                    <Stat
                      label="24h change"
                      value={`${sample.probabilityChange24h >= 0 ? '+' : ''}${formatPercent(sample.probabilityChange24h)}`}
                    />
                    <Stat label="Liquidity" value={formatUsd(sample.liquidityUsd)} />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.body}>Evidence has not been captured for this signal.</Text>
          )}
        </Section>

        <Section
          title="Investor Skill rules"
          subtitle="Deterministic triggers stored with the signal"
        >
          {signal.triggeredRules.map((rule) => (
            <Bullet key={rule} text={rule} color={colors.mint} />
          ))}
        </Section>

        {signal.evidence?.featureSnapshot ? (
          <Section title="Calculated features" subtitle="Event-time formulas; no LLM calculation">
            <View style={styles.mandateGrid}>
              {Object.entries(signal.evidence.featureSnapshot.values).map(([name, value]) => (
                <Stat
                  key={name}
                  label={name.replaceAll('_', ' ')}
                  value={value === null ? 'missing' : String(value)}
                />
              ))}
            </View>
          </Section>
        ) : null}

        <View style={[styles.boundaryCard, styles.riskCard]}>
          <Text style={[styles.boundaryLabel, styles.riskLabel]}>
            DETERMINISTIC GUARDRAILS · PREVIEW
          </Text>
          <Text style={styles.boundaryTitle}>
            {signal.riskPreview?.allowed
              ? 'Seeded policy preview passed'
              : 'Not yet policy checked'}
          </Text>
          {signal.riskPreview?.messages.map((message) => (
            <Bullet key={message} text={message} color={colors.blue} />
          )) ?? <Text style={styles.body}>A real risk evaluation arrives in Phase 4.</Text>}
          <Text style={styles.previewNotice}>
            Final server-side risk evaluation is not implemented in Phase 2.
          </Text>
        </View>

        <Section title="Proposal terms">
          <View style={styles.termsCard}>
            <Term
              label="Entry reference"
              value={formatUsd(proposal?.proposedTrade.entryPrice ?? null, 2)}
            />
            <Term label="Notional" value={formatUsd(signal.proposedNotionalUsd)} />
            <Term
              label="Leverage"
              value={signal.proposedLeverage ? `${signal.proposedLeverage}x` : '—'}
            />
            <Term label="Stop-loss" value={formatUsd(signal.stopLossPrice, 2)} required />
            <Term label="Expires" value={formatDateTime(signal.expiresAt)} danger={expiredByTime} />
          </View>
        </Section>

        <Section title="Invalidation & uncertainty">
          {proposal?.invalidation.map((item) => (
            <Bullet key={item} text={item} color={colors.red} />
          ))}
          {proposal?.uncertainty.map((item) => (
            <Bullet key={item} text={item} color={colors.textDim} />
          ))}
        </Section>

        <Section
          title="Mandate context"
          subtitle={mandateQuery.data?.agentName ?? 'Loading current mandate'}
        >
          {mandateQuery.isError ? (
            <Text style={styles.errorText}>{readableError(mandateQuery.error)}</Text>
          ) : mandateQuery.data ? (
            <View style={styles.mandateGrid}>
              <Stat
                label="Max position"
                value={formatUsd(mandateQuery.data.riskLimits.maxPositionUsd)}
              />
              <Stat label="Max leverage" value={`${mandateQuery.data.riskLimits.maxLeverage}x`} />
              <Stat
                label="Stop-loss"
                value={mandateQuery.data.riskLimits.stopLossRequired ? 'Required' : 'Optional'}
              />
              <Stat
                label="Approval"
                value={
                  mandateQuery.data.riskLimits.approvalRequired ? 'Every trade' : 'Not required'
                }
              />
            </View>
          ) : (
            <ActivityIndicator color={colors.mint} />
          )}
        </Section>

        <Section title="State timeline" subtitle="Append-only server history">
          {signal.timeline.map((event, index) => (
            <View key={`${event.occurredAt}-${event.toState}`} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={styles.timelineDot} />
                {index < signal.timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineState}>{event.toState.replaceAll('_', ' ')}</Text>
                <Text style={styles.timelineReason}>{event.reason}</Text>
                <Text style={styles.timelineDate}>{formatDateTime(event.occurredAt)}</Text>
              </View>
            </View>
          ))}
        </Section>

        {approvable && mandateQuery.data ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
          >
            <Text style={styles.reviewEyebrow}>ACTION REQUIRED</Text>
            <Text style={styles.reviewText}>Review approval parameters →</Text>
          </Pressable>
        ) : (
          <View style={styles.inactiveCard}>
            <Text style={styles.inactiveTitle}>No active approval action</Text>
            <Text style={styles.inactiveBody}>{inactiveReason(signal, expiredByTime)}</Text>
          </View>
        )}
      </ScrollView>

      {mandateQuery.data ? (
        <ApprovalSheet
          mandate={mandateQuery.data}
          onClose={() => setSheetOpen(false)}
          signal={signal}
          visible={sheetOpen}
        />
      ) : null}
    </SafeAreaView>
  );
}

function inactiveReason(signal: SignalDetail, expiredByTime: boolean): string {
  if (expiredByTime || signal.state === 'EXPIRED')
    return 'This proposal expired and cannot be approved.';
  if (signal.state === 'REJECTED')
    return 'This proposal was rejected and is permanently non-actionable.';
  if (signal.state === 'FILLED' || signal.state === 'CLOSED')
    return 'This signal has already executed.';
  if (signal.state === 'APPROVED' || signal.state === 'EXECUTING')
    return 'Approval is recorded; Phase 2 intentionally defers execution.';
  return `This signal is ${signal.state.toLowerCase().replaceAll('_', ' ')} and is not approvable.`;
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
        {!retry ? (
          <ActivityIndicator color={colors.mint} size="large" />
        ) : (
          <Text style={styles.errorGlyph}>!</Text>
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

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Bullet({ text, color }: { text: string; color: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bullet, { backgroundColor: color }]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroMetric}>
      <Text style={styles.heroMetricLabel}>{label}</Text>
      <Text style={styles.heroMetricValue}>{value}</Text>
    </View>
  );
}

function SourceHeader({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.sourceHeader}>
      <View style={[styles.sourceDot, { backgroundColor: color }]} />
      <Text style={[styles.sourceLabel, { color }]}>{label}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Term({
  label,
  value,
  required,
  danger,
}: {
  label: string;
  value: string;
  required?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.term}>
      <Text style={styles.termLabel}>
        {label}
        {required ? ' · REQUIRED' : ''}
      </Text>
      <Text style={[styles.termValue, danger && styles.danger]}>{value}</Text>
    </View>
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
  backText: { color: colors.text, fontSize: 29, lineHeight: 31, marginTop: -2 },
  navTitle: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  navSpacer: { width: 36 },
  content: { paddingBottom: 38, paddingHorizontal: 20 },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  symbol: { color: colors.text, fontSize: 17, fontWeight: '900' },
  direction: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 5 },
  long: { color: colors.mint },
  short: { color: colors.red },
  heroTitle: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 35,
    marginTop: 20,
  },
  heroMetrics: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 34,
    paddingBottom: 22,
    paddingTop: 20,
  },
  heroMetric: { gap: 5 },
  heroMetricLabel: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroMetricValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  boundaryCard: { borderRadius: radii.large, borderWidth: 1, marginTop: 24, padding: 18 },
  reasoningCard: { backgroundColor: colors.amberDark, borderColor: '#665126' },
  riskCard: { backgroundColor: colors.blueDark, borderColor: '#2C5275' },
  boundaryLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  reasoningLabel: { color: colors.amber },
  riskLabel: { color: colors.blue },
  boundaryTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 7,
  },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  previewNotice: {
    borderTopColor: '#2C5275',
    borderTopWidth: 1,
    color: colors.blue,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 13,
    paddingTop: 11,
  },
  section: { marginTop: 29 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  sectionSubtitle: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  sectionBody: { gap: 10, marginTop: 14 },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 11 },
  bullet: { borderRadius: 3, height: 6, marginTop: 7, width: 6 },
  bulletText: { color: colors.textMuted, flex: 1, fontSize: 14, lineHeight: 21 },
  evidenceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    padding: 16,
  },
  sourceHeader: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  sourceDot: { borderRadius: 4, height: 7, width: 7 },
  sourceLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  evidenceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 10,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 13, rowGap: 14 },
  stat: { minWidth: '50%' },
  statLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  termsCard: { backgroundColor: colors.surface, borderRadius: radii.medium, paddingHorizontal: 16 },
  term: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
  },
  termLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  termValue: { color: colors.text, fontSize: 14, fontWeight: '800' },
  danger: { color: colors.red },
  mandateGrid: {
    backgroundColor: colors.surface,
    borderRadius: radii.medium,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    rowGap: 18,
  },
  errorText: { color: colors.red, fontSize: 13 },
  timelineRow: { flexDirection: 'row', minHeight: 74 },
  timelineRail: { alignItems: 'center', width: 22 },
  timelineDot: { backgroundColor: colors.mint, borderRadius: 5, height: 9, marginTop: 4, width: 9 },
  timelineLine: { backgroundColor: colors.borderStrong, flex: 1, marginVertical: 4, width: 1 },
  timelineContent: { flex: 1, paddingBottom: 20, paddingLeft: 8 },
  timelineState: { color: colors.text, fontSize: 12, fontWeight: '900' },
  timelineReason: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  timelineDate: { color: colors.textDim, fontSize: 10, marginTop: 4 },
  reviewButton: {
    backgroundColor: colors.mint,
    borderRadius: radii.large,
    marginTop: 30,
    padding: 18,
  },
  reviewEyebrow: { color: '#214637', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  reviewText: { color: colors.background, fontSize: 16, fontWeight: '900', marginTop: 5 },
  inactiveCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    marginTop: 30,
    padding: 18,
  },
  inactiveTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  inactiveBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  pressed: { opacity: 0.72 },
  screenState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 70,
    paddingHorizontal: 32,
  },
  screenStateTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 16 },
  screenStateBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    textAlign: 'center',
  },
  errorGlyph: { color: colors.red, fontSize: 36, fontWeight: '900' },
  retryButton: {
    backgroundColor: colors.mint,
    borderRadius: 12,
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryText: { color: colors.background, fontSize: 14, fontWeight: '800' },
});
