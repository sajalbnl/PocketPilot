import type { SignalDetail } from '@pocketpilot/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApprovalSheet } from '../../components/ApprovalSheet';
import {
  AppIcon,
  AppScreen,
  FadeInView,
  ScreenNav,
  SectionHeading,
} from '../../components/AppChrome';
import { StateChip } from '../../components/SignalCard';
import { ApiClientError, readableError } from '../../lib/api';
import { formatDateTime, formatPercent, formatUsd } from '../../lib/format';
import { useMandate, useRuntimeConfig, useSignal } from '../../lib/queries';
import { colors, radii, spacing, typography } from '../../lib/theme';

export default function SignalDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  const signalQuery = useSignal(id);
  const mandateQuery = useMandate();
  const runtimeQuery = useRuntimeConfig();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (signalQuery.isPending) {
    return (
      <ScreenState title="Loading signal" body="Retrieving evidence and authoritative state…" />
    );
  }
  if (signalQuery.isError) {
    const missing =
      signalQuery.error instanceof ApiClientError && signalQuery.error.code === 'SIGNAL_NOT_FOUND';
    return (
      <ScreenState
        title="Signal unavailable"
        body={
          missing
            ? 'This signal no longer exists or the approval link is no longer valid. Return to the inbox for current server state.'
            : readableError(signalQuery.error)
        }
        retry={() => void signalQuery.refetch()}
      />
    );
  }

  const signal = signalQuery.data;
  const reasoning = signal.llmOutput;
  const proposal = signal.llmOutput?.decision === 'PROPOSE' ? signal.llmOutput : null;
  const expiredByTime = signal.expiresAt
    ? new Date(signal.expiresAt).getTime() <= Date.now()
    : false;
  const approvable = signal.state === 'PENDING_APPROVAL' && !expiredByTime;

  return (
    <AppScreen>
      <ScreenNav onBack={() => router.back()} title="Signal trace" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={signalQuery.isRefetching}
            onRefresh={() => void signalQuery.refetch()}
            colors={[colors.mint]}
            progressBackgroundColor={colors.surfaceRaised}
            tintColor={colors.mint}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <FadeInView>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.symbol}>{signal.symbol} · PERP</Text>
              <Text
                style={[styles.direction, signal.side === 'SHORT' ? styles.short : styles.long]}
              >
                {signal.side ?? 'WATCH'} PROPOSAL
              </Text>
            </View>
            <StateChip state={signal.state} />
          </View>
          <Text style={styles.modeLine}>
            {signal.dataMode.toUpperCase()} DATA ·{' '}
            {runtimeQuery.data?.executionMode.toUpperCase() ?? 'EXECUTION MODE UNAVAILABLE'}
          </Text>
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
        </FadeInView>

        <View style={[styles.boundaryCard, styles.reasoningCard]}>
          <Text style={[styles.boundaryLabel, styles.reasoningLabel]}>
            {reasoning
              ? `AI REASONING · ${signal.llmMetadata?.model ?? 'VALIDATED MODEL'}`
              : `DETERMINISTIC DETECTION · SKILL v${signal.skillVersion}`}
          </Text>
          <Text style={styles.boundaryTitle}>
            {reasoning ? 'Interpretation, not authorization' : signal.skillId}
          </Text>
          <Text style={styles.body}>
            {reasoning?.thesis ?? signal.thesis ?? 'Analysis is still being assembled.'}
          </Text>
        </View>

        {signal.reasoningError ? (
          <View style={[styles.boundaryCard, styles.errorBoundaryCard]}>
            <Text style={[styles.boundaryLabel, styles.errorBoundaryLabel]}>
              REASONING CLOSED SAFELY · {signal.reasoningError.code}
            </Text>
            <Text style={styles.body}>{signal.reasoningError.message}</Text>
          </View>
        ) : null}

        <Section title="Why now">
          {reasoning?.whyNow.map((item) => (
            <Bullet key={item} text={item} color={colors.amber} />
          )) ?? (
            <Text style={styles.body}>No why-now explanation is available for this state.</Text>
          )}
        </Section>

        <Section title="Traceable evidence" subtitle="Captured snapshots from each source">
          {signal.evidence ? (
            <>
              {reasoning?.evidenceReferences.map((reference) => (
                <Bullet key={reference} text={`AI cited ${reference}`} color={colors.amber} />
              ))}
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
              ? 'Deterministic policy passed'
              : signal.riskPreview
                ? 'Deterministic policy blocked this attempt'
                : 'Not yet policy checked'}
          </Text>
          {signal.riskPreview?.rules.map((rule) => (
            <View key={rule.ruleId} style={styles.riskRuleRow}>
              <Text style={[styles.riskRuleStatus, !rule.passed && styles.riskRuleFailed]}>
                {rule.passed ? 'PASS' : 'FAIL'}
              </Text>
              <View style={styles.riskRuleCopy}>
                <Text style={styles.riskRuleId}>{rule.ruleId.replaceAll('-', ' ')}</Text>
                <Text style={styles.riskRuleExplanation}>{rule.explanation}</Text>
              </View>
            </View>
          )) ?? <Text style={styles.body}>Policy evaluation has not run for this state.</Text>}
          <Text style={styles.previewNotice}>
            {signal.riskPreview
              ? `${signal.riskPreview.phase.toLowerCase()} check · ${formatDateTime(signal.riskPreview.checkedAt)}`
              : 'The server reruns these rules against edited values at approval time.'}
          </Text>
        </View>

        <Section title="Proposal terms">
          <View style={styles.termsCard}>
            <Term label="Entry reference" value={formatUsd(proposal?.entryReference ?? null, 2)} />
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
          {reasoning?.invalidationConditions.map((item) => (
            <Bullet key={item} text={item} color={colors.red} />
          ))}
          {reasoning?.counterEvidence.map((item) => (
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
            <View>
              <Text style={styles.reviewEyebrow}>ACTION REQUIRED</Text>
              <Text style={styles.reviewText}>Review approval parameters</Text>
            </View>
            <AppIcon color={colors.background} name="forward" size={19} />
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
    </AppScreen>
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
    return 'This approval is being executed by the server authority.';
  return `This signal is ${signal.state.toLowerCase().replaceAll('_', ' ')} and is not approvable.`;
}

function ScreenState({ title, body, retry }: { title: string; body: string; retry?: () => void }) {
  return (
    <AppScreen>
      <ScreenNav onBack={() => router.back()} title="Signal trace" />
      <View style={styles.screenState}>
        {!retry ? (
          <ActivityIndicator color={colors.mint} size="large" />
        ) : (
          <View style={styles.errorGlyph}>
            <AppIcon color={colors.red} name="error" size={25} />
          </View>
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
      <SectionHeading {...(subtitle ? { subtitle } : {})} title={title} />
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
  content: { paddingBottom: 44, paddingHorizontal: spacing.lg },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  symbol: { color: colors.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.15 },
  direction: { ...typography.label, fontSize: 9, marginTop: 5 },
  long: { color: colors.mint },
  short: { color: colors.red },
  modeLine: {
    color: colors.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginTop: spacing.lg,
  },
  heroTitle: {
    ...typography.display,
    color: colors.text,
    fontSize: 32,
    lineHeight: 37,
    marginTop: spacing.xl,
  },
  heroMetrics: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  heroMetric: { gap: 5 },
  heroMetricLabel: {
    ...typography.label,
    color: colors.textDim,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  heroMetricValue: {
    color: colors.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  boundaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.large,
    borderWidth: 1,
    marginTop: spacing.xxl,
    padding: spacing.lg,
  },
  reasoningCard: { borderColor: 'rgba(244, 201, 93, 0.24)' },
  errorBoundaryCard: { backgroundColor: colors.redDark, borderColor: 'rgba(255, 101, 104, 0.24)' },
  errorBoundaryLabel: { color: colors.red, marginBottom: 8 },
  riskCard: { borderColor: 'rgba(150, 200, 255, 0.22)' },
  boundaryLabel: { ...typography.label, fontSize: 9 },
  reasoningLabel: { color: colors.amber },
  riskLabel: { color: colors.blue },
  boundaryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  body: { ...typography.body, color: colors.textMuted },
  previewNotice: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    color: colors.blue,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  riskRuleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  riskRuleStatus: { color: colors.mint, fontSize: 9, fontWeight: '700', width: 34 },
  riskRuleFailed: { color: colors.red },
  riskRuleCopy: { flex: 1 },
  riskRuleId: { ...typography.label, color: colors.text, fontSize: 10, textTransform: 'uppercase' },
  riskRuleExplanation: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  section: { marginTop: spacing.xxxl },
  sectionBody: { gap: spacing.md, marginTop: spacing.lg },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  bullet: { borderRadius: 3, height: 6, marginTop: 7, width: 6 },
  bulletText: { ...typography.body, color: colors.textMuted, flex: 1 },
  evidenceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    padding: spacing.lg,
  },
  sourceHeader: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  sourceDot: { borderRadius: 4, height: 7, width: 7 },
  sourceLabel: { ...typography.label, fontSize: 9 },
  evidenceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: spacing.md,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, rowGap: spacing.lg },
  stat: { minWidth: '50%' },
  statLabel: {
    ...typography.label,
    color: colors.textDim,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.text,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 4,
  },
  termsCard: {
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
    minHeight: 56,
  },
  termLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  termValue: { color: colors.text, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700' },
  danger: { color: colors.red },
  mandateGrid: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    rowGap: spacing.xl,
  },
  errorText: { ...typography.body, color: colors.red },
  timelineRow: { flexDirection: 'row', minHeight: 76 },
  timelineRail: { alignItems: 'center', width: 22 },
  timelineDot: { backgroundColor: colors.mint, borderRadius: 5, height: 9, marginTop: 4, width: 9 },
  timelineLine: { backgroundColor: colors.borderStrong, flex: 1, marginVertical: 4, width: 1.5 },
  timelineContent: { flex: 1, paddingBottom: spacing.xl, paddingLeft: spacing.sm },
  timelineState: { ...typography.label, color: colors.text, fontSize: 10 },
  timelineReason: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  timelineDate: { color: colors.textDim, fontSize: 10, marginTop: 5 },
  reviewButton: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: radii.large,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxxl,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
  },
  reviewEyebrow: { ...typography.label, color: '#17494A', fontSize: 9 },
  reviewText: { color: colors.background, fontSize: 15, fontWeight: '700', marginTop: 3 },
  inactiveCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    marginTop: spacing.xxxl,
    padding: spacing.lg,
  },
  inactiveTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  inactiveBody: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  screenState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 70,
    paddingHorizontal: spacing.xxxl,
  },
  screenStateTitle: { ...typography.section, color: colors.text, marginTop: spacing.lg },
  screenStateBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorGlyph: {
    alignItems: 'center',
    backgroundColor: colors.redDark,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  retryButton: {
    backgroundColor: colors.mint,
    borderRadius: radii.medium,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  retryText: { color: colors.background, fontSize: 14, fontWeight: '700' },
});
