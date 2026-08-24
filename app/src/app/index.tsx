import { signalCategories, type SignalCategory } from '@pocketpilot/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { useSignals } from '../lib/queries';
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
  const copy = categoryCopy[category];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FINANCE AGENT · PAPER MODE</Text>
          <Text style={styles.title}>Signal inbox</Text>
          <Text style={styles.subtitle}>Evidence first. Execution only after approval.</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>SEEDED</Text>
        </View>
      </View>

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
  tabs: { gap: 8, paddingHorizontal: 20, paddingVertical: 22 },
  tab: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 39,
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
