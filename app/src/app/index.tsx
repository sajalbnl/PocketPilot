import { signalCategories, type SignalCategory } from '@pocketpilot/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
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
  BrandLockup,
  FadeInView,
  SectionHeading,
} from '../components/AppChrome';
import { SignalCard } from '../components/SignalCard';
import { API_BASE_URL, readableError } from '../lib/api';
import { usePushRegistration } from '../lib/push-notifications';
import {
  useAgentControl,
  usePositions,
  useRuntimeConfig,
  useSetKillSwitch,
  useSignals,
} from '../lib/queries';
import { colors, radii, shadows, spacing, typography } from '../lib/theme';

const categoryCopy: Record<SignalCategory, { label: string; empty: string }> = {
  'approval-required': {
    label: 'For review',
    empty: 'No decisions are waiting. New proposals will appear here.',
  },
  monitoring: { label: 'Monitoring', empty: 'No market candidates are being monitored.' },
  executed: { label: 'Executed', empty: 'No completed executions to show yet.' },
  expired: { label: 'Inactive', empty: 'No expired or inactive signals.' },
};

export default function SignalInboxScreen() {
  const [category, setCategory] = useState<SignalCategory>('approval-required');
  const query = useSignals(category);
  const control = useAgentControl();
  const positions = usePositions();
  const runtime = useRuntimeConfig();
  const push = usePushRegistration();
  const setKillSwitch = useSetKillSwitch();
  const copy = categoryCopy[category];
  const latestPosition = positions.data?.positions[0];
  const dataMode = runtime.data?.dataMode ?? 'replay';
  const executionMode = runtime.data?.executionMode ?? 'paper';
  const signals = query.data?.signals ?? [];

  const confirmKillSwitch = () => {
    if (!control.data || setKillSwitch.isPending) return;
    const enabled = !control.data.killSwitchEnabled;
    Alert.alert(
      enabled ? 'Pause new execution?' : 'Resume new execution?',
      enabled
        ? 'New approvals and executions will be blocked. Existing positions remain open.'
        : 'New approvals may execute again when they pass current risk policy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: enabled ? 'Enable kill switch' : 'Resume agent',
          style: enabled ? 'destructive' : 'default',
          onPress: () =>
            setKillSwitch.mutate(
              { enabled, confirmed: true },
              {
                onSuccess: () =>
                  Alert.alert(
                    enabled ? 'Kill switch active' : 'Execution resumed',
                    enabled
                      ? 'New approvals and executions are now blocked.'
                      : 'New approvals may execute after server-side policy checks.',
                  ),
                onError: (error) => Alert.alert('Control update failed', readableError(error)),
              },
            ),
        },
      ],
    );
  };

  const pushAction = () => {
    if (push.state.status === 'denied' && !push.state.canAskAgain) {
      void Linking.openSettings();
      return;
    }
    void push.enable();
  };

  const pushActionLabel =
    push.state.status === 'denied' && !push.state.canAskAgain
      ? 'Settings'
      : push.state.status === 'denied'
        ? 'Try again'
        : 'Enable';
  const pushCanAct = ['prompt', 'error', 'denied'].includes(push.state.status);

  return (
    <AppScreen>
      <FlatList
        data={signals}
        key={`${category}-${query.isPending ? 'pending' : 'ready'}`}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <SignalCard
            index={index}
            signal={item}
            onPress={() => router.push(`/signals/${item.id}` as never)}
          />
        )}
        contentContainerStyle={[styles.list, signals.length === 0 && styles.listEmpty]}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <BrandLockup />
              {latestPosition ? (
                <Pressable 
                  accessibilityLabel="Open latest position"
                  accessibilityRole="button"
                  onPress={() => router.push(`/positions/${latestPosition.id}` as never)}
                  style={({ pressed }) => [styles.positionButton, pressed && styles.pressed]}
                >
                  <AppIcon color={colors.mint} name="wallet" size={16} />
                  <Text style={styles.positionButtonText}>Position</Text>
                </Pressable>
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>PP</Text>
                </View>
              )}
            </View>

            <FadeInView style={styles.hero}>
              <View style={styles.modePill}>
                <Text style={styles.modeText}>
                  {dataMode === 'live' ? 'LIVE DATA' : 'HISTORICAL REPLAY'} ·{' '}
                  {executionMode.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.title}>Signals, ready for review.</Text>
              <Text style={styles.subtitle}>
                Evidence-led decisions with execution kept inside your mandate.
              </Text>
            </FadeInView>

            <FadeInView delay={70} style={styles.agentCard}>
              <View style={styles.agentIcon}>
                <AppIcon
                  color={control.data?.killSwitchEnabled ? colors.red : colors.mint}
                  name={control.data?.killSwitchEnabled ? 'pause' : 'bolt'}
                  size={21}
                />
              </View>
              <View style={styles.agentCopy}>
                <Text style={styles.cardEyebrow}>AGENT CONTROL</Text>
                <Text style={styles.agentTitle}>
                  {control.data?.killSwitchEnabled ? 'Execution paused' : 'Agent is active'}
                </Text>
                <Text style={styles.agentBody} numberOfLines={1}>
                  {control.data?.killSwitchEnabled
                    ? 'New approvals blocked · positions stay open'
                    : 'Mandate checks are enforced server-side'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!control.data || setKillSwitch.isPending}
                onPress={confirmKillSwitch}
                style={({ pressed }) => [
                  styles.agentAction,
                  control.data?.killSwitchEnabled && styles.agentActionResume,
                  pressed && styles.pressed,
                ]}
              >
                {setKillSwitch.isPending ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <AppIcon
                    color={control.data?.killSwitchEnabled ? colors.background : colors.red}
                    name={control.data?.killSwitchEnabled ? 'play' : 'pause'}
                    size={17}
                  />
                )}
              </Pressable>
            </FadeInView>

            <FadeInView delay={110} style={styles.alertRow}>
              <View style={styles.alertIcon}>
                <AppIcon color={colors.blue} name="bell" size={17} />
              </View>
              <View style={styles.alertCopy}>
                <Text style={styles.alertTitle}>Approval alerts</Text>
                <Text numberOfLines={2} style={styles.alertBody}>
                  {push.state.message}
                </Text>
              </View>
              {push.state.status === 'checking' || push.state.status === 'registering' ? (
                <ActivityIndicator color={colors.blue} size="small" />
              ) : pushCanAct ? (
                <Pressable onPress={pushAction} style={styles.textAction}>
                  <Text style={styles.textActionLabel}>{pushActionLabel}</Text>
                </Pressable>
              ) : (
                <View style={styles.alertState}>
                  <View style={styles.alertStateDot} />
                  <Text style={styles.alertStateText}>
                    {push.state.status === 'registered' ? 'On' : 'Off'}
                  </Text>
                </View>
              )}
            </FadeInView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
            >
              {signalCategories.map((item) => {
                const active = item === category;
                return (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    key={item}
                    onPress={() => setCategory(item)}
                    style={({ pressed }) => [
                      styles.tab,
                      active && styles.tabActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {categoryCopy[item].label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <SectionHeading
                title={copy.label}
                trailing={<Text style={styles.sectionCount}>{query.data?.total ?? 0} SIGNALS</Text>}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          query.isPending ? (
            <CenteredState>
              <ActivityIndicator color={colors.mint} size="large" />
              <Text style={styles.stateTitle}>Loading {copy.label.toLowerCase()}</Text>
              <Text style={styles.stateBody}>Checking the authoritative server state…</Text>
            </CenteredState>
          ) : query.isError ? (
            <CenteredState>
              <View style={[styles.stateIcon, styles.errorIcon]}>
                <AppIcon color={colors.red} name="error" size={24} />
              </View>
              <Text style={styles.stateTitle}>Couldn’t load signals</Text>
              <Text style={styles.stateBody}>{readableError(query.error)}</Text>
              <Pressable style={styles.retryButton} onPress={() => void query.refetch()}>
                <AppIcon color={colors.background} name="refresh" size={16} />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
              <Text numberOfLines={1} style={styles.endpoint}>
                API · {API_BASE_URL}
              </Text>
            </CenteredState>
          ) : (
            <CenteredState>
              <View style={styles.stateIcon}>
                <AppIcon color={colors.mint} name="check" size={24} />
              </View>
              <Text style={styles.stateTitle}>You’re all caught up</Text>
              <Text style={styles.stateBody}>{copy.empty}</Text>
            </CenteredState>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mint}
            colors={[colors.mint]}
            progressBackgroundColor={colors.surfaceRaised}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </AppScreen>
  );
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return <View style={styles.state}>{children}</View>;
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxxl, paddingHorizontal: spacing.lg },
  listEmpty: { flexGrow: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  positionButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  positionButtonText: { ...typography.label, color: colors.text },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  hero: { paddingBottom: spacing.xxl, paddingTop: spacing.xs },
  modePill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.mintDark,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  liveDot: { backgroundColor: colors.mint, borderRadius: 3, height: 6, width: 6 },
  modeText: { ...typography.label, color: colors.mint, fontSize: 9, letterSpacing: 0.55 },
  title: { ...typography.title, color: colors.text, marginTop: spacing.lg, maxWidth: 330 },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.md, maxWidth: 340 },
  agentCard: {
    ...shadows.raised,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    flexDirection: 'row',
    padding: spacing.lg,
  },
  agentIcon: {
    alignItems: 'center',
    backgroundColor: colors.mintDark,
    borderRadius: radii.medium,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  agentCopy: { flex: 1, marginLeft: spacing.md },
  cardEyebrow: { ...typography.label, color: colors.textDim, fontSize: 9 },
  agentTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  agentBody: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  agentAction: {
    alignItems: 'center',
    backgroundColor: colors.redDark,
    borderColor: 'rgba(255, 101, 104, 0.22)',
    borderRadius: radii.small,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    width: 40,
  },
  agentActionResume: { backgroundColor: colors.mint, borderColor: colors.mint },
  alertRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
  },
  alertIcon: {
    alignItems: 'center',
    backgroundColor: colors.blueDark,
    borderRadius: radii.small,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  alertCopy: { flex: 1, marginHorizontal: spacing.md },
  alertTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  alertBody: { ...typography.caption, color: colors.textDim, marginTop: 1 },
  textAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  textActionLabel: { ...typography.label, color: colors.blue, textTransform: 'uppercase' },
  alertState: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  alertStateDot: { backgroundColor: colors.mint, borderRadius: 3, height: 6, width: 6 },
  alertStateText: { ...typography.label, color: colors.textMuted },
  tabs: { gap: spacing.sm, paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  tab: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  tabActive: { backgroundColor: colors.text, borderColor: colors.text },
  tabText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.background, fontWeight: '700' },
  sectionHeader: { marginBottom: spacing.md },
  sectionCount: { ...typography.label, color: colors.textDim, marginTop: 3 },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    paddingBottom: 40,
    paddingHorizontal: spacing.xxl,
  },
  stateIcon: {
    alignItems: 'center',
    backgroundColor: colors.mintDark,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  errorIcon: { backgroundColor: colors.redDark },
  stateTitle: {
    ...typography.section,
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  stateBody: { ...typography.body, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  retryText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  endpoint: { ...typography.caption, color: colors.textDim, marginTop: spacing.lg, maxWidth: 280 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
