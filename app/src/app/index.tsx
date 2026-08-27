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
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import { colors } from '../lib/theme';

const categoryCopy: Record<SignalCategory, { label: string; empty: string }> = {
  'approval-required': {
    label: 'Approval Required',
    empty: 'No decisions waiting. New proposals will appear here.',
  },
  monitoring: { label: 'Monitoring', empty: 'No market candidates are being monitored.' },
  executed: { label: 'Executed', empty: 'No completed executions to show yet.' },
  expired: { label: 'Expired', empty: 'No expired or inactive signals.' },
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
  const modeLabel = runtime.isError
    ? 'MODE UNKNOWN'
    : `${dataMode.toUpperCase()} · ${(runtime.data?.executionMode ?? 'paper').toUpperCase()}`;

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            FINANCE AGENT · {dataMode === 'live' ? 'LIVE DATA' : 'HISTORICAL REPLAY'}
          </Text>
          <Text style={styles.title}>Signal inbox</Text>
          <Text style={styles.subtitle}>Evidence first. Execution only after approval.</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{modeLabel}</Text>
          </View>
          {latestPosition ? (
            <Pressable
              onPress={() => router.push(`/positions/${latestPosition.id}` as never)}
              style={styles.positionLink}
            >
              <Text style={styles.positionLinkText}>POSITION</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.pushCard}>
        <View style={styles.pushCopy}>
          <Text style={styles.pushLabel}>APPROVAL ALERTS</Text>
          <Text style={styles.pushMessage}>{push.state.message}</Text>
        </View>
        {push.state.status === 'checking' || push.state.status === 'registering' ? (
          <ActivityIndicator color={colors.blue} />
        ) : push.state.status === 'prompt' || push.state.status === 'error' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void push.enable()}
            style={styles.compactAction}
          >
            <Text style={styles.pushAction}>ENABLE</Text>
          </Pressable>
        ) : push.state.status === 'denied' && !push.state.canAskAgain ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openSettings()}
            style={styles.compactAction}
          >
            <Text style={styles.pushAction}>SETTINGS</Text>
          </Pressable>
        ) : push.state.status === 'denied' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void push.enable()}
            style={styles.compactAction}
          >
            <Text style={styles.pushAction}>TRY AGAIN</Text>
          </Pressable>
        ) : (
          <Text style={styles.pushState}>
            {push.state.status === 'registered' ? 'ON' : 'UNAVAILABLE'}
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!control.data || setKillSwitch.isPending}
        onPress={confirmKillSwitch}
        style={[styles.controlCard, control.data?.killSwitchEnabled && styles.controlCardPaused]}
      >
        <View>
          <Text style={styles.controlLabel}>AGENT CONTROL</Text>
          <Text style={styles.controlTitle}>
            {control.data?.killSwitchEnabled ? 'Kill switch active' : 'Execution enabled'}
          </Text>
          <Text style={styles.controlBody}>
            {control.data?.killSwitchEnabled
              ? 'New approvals blocked · positions stay open'
              : 'Tap to pause new approvals and execution'}
          </Text>
        </View>
        {setKillSwitch.isPending ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text
            style={[
              styles.controlAction,
              control.data?.killSwitchEnabled && styles.controlActionPaused,
            ]}
          >
            {control.data?.killSwitchEnabled ? 'RESUME' : 'PAUSE'}
          </Text>
        )}
      </Pressable>

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
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {categoryCopy[item].label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {query.isPending ? (
        <CenteredState>
          <ActivityIndicator color={colors.mint} size="large" />
          <Text style={styles.stateTitle}>Loading {copy.label.toLowerCase()}</Text>
          <Text style={styles.stateBody}>Checking the authoritative server state…</Text>
        </CenteredState>
      ) : query.isError ? (
        <CenteredState>
          <Text style={styles.errorGlyph}>!</Text>
          <Text style={styles.stateTitle}>Couldn’t load signals</Text>
          <Text style={styles.stateBody}>{readableError(query.error)}</Text>
          <Pressable style={styles.retryButton} onPress={() => void query.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.endpoint}>
            API · {API_BASE_URL}
          </Text>
        </CenteredState>
      ) : (
        <FlatList
          data={query.data.signals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SignalCard signal={item} onPress={() => router.push(`/signals/${item.id}` as never)} />
          )}
          contentContainerStyle={[styles.list, query.data.signals.length === 0 && styles.listEmpty]}
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{copy.label}</Text>
              <Text style={styles.sectionCount}>{query.data.total} SIGNALS</Text>
            </View>
          }
          ListEmptyComponent={
            <CenteredState compact>
              <Text style={styles.emptyGlyph}>◎</Text>
              <Text style={styles.stateTitle}>All clear</Text>
              <Text style={styles.stateBody}>{copy.empty}</Text>
            </CenteredState>
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={colors.mint}
              colors={[colors.mint]}
              progressBackgroundColor={colors.surface}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function CenteredState({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return <View style={[styles.state, compact && styles.stateCompact]}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  eyebrow: { color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 31, fontWeight: '800', letterSpacing: -0.9, marginTop: 7 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 5 },
  headerActions: { alignItems: 'flex-end', gap: 9 },
  livePill: {
    alignItems: 'center',
    backgroundColor: colors.mintDark,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  liveDot: { backgroundColor: colors.mint, borderRadius: 4, height: 6, width: 6 },
  liveText: { color: colors.mint, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  positionLink: {
    borderColor: colors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  positionLinkText: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  pushCard: {
    alignItems: 'center',
    backgroundColor: colors.blueDark,
    borderColor: '#2C5275',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 18,
    padding: 14,
  },
  pushCopy: { flex: 1 },
  pushLabel: { color: colors.blue, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pushMessage: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  pushAction: { color: colors.blue, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  compactAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 64 },
  pushState: { color: colors.mint, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  controlCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 10,
    padding: 14,
  },
  controlCardPaused: { backgroundColor: colors.redDark, borderColor: colors.red },
  controlLabel: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  controlTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 3 },
  controlBody: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  controlAction: { color: colors.red, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  controlActionPaused: { color: colors.mint },
  tabs: { gap: 8, paddingHorizontal: 20, paddingVertical: 22 },
  tab: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  tabActive: { backgroundColor: colors.text, borderColor: colors.text },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.background },
  list: { paddingBottom: 28, paddingHorizontal: 20 },
  listEmpty: { flexGrow: 1 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  sectionCount: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  state: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 70,
  },
  stateCompact: { minHeight: 300 },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  stateBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    textAlign: 'center',
  },
  errorGlyph: {
    backgroundColor: colors.redDark,
    borderRadius: 28,
    color: colors.red,
    fontSize: 24,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 21,
    paddingVertical: 12,
  },
  emptyGlyph: { color: colors.borderStrong, fontSize: 46 },
  retryButton: {
    backgroundColor: colors.mint,
    borderRadius: 12,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  endpoint: { color: colors.textDim, fontSize: 10, marginTop: 16, maxWidth: 280 },
});
