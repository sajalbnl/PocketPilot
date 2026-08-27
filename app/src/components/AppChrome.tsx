import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography } from '../lib/theme';

const iconNames = {
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  bell: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  bolt: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  error: { ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' },
  forward: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  pause: { ios: 'pause.fill', android: 'pause_circle', web: 'pause_circle' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  shield: { ios: 'checkmark.shield.fill', android: 'shield', web: 'shield' },
  trend: { ios: 'chart.line.uptrend.xyaxis', android: 'monitoring', web: 'monitoring' },
  wallet: { ios: 'wallet.pass.fill', android: 'wallet', web: 'wallet' },
} as const;

export type AppIconName = keyof typeof iconNames;

export function AppIcon({
  name,
  color = colors.text,
  size = 18,
}: {
  name: AppIconName;
  color?: string;
  size?: number;
}) {
  return (
    <SymbolView
      name={iconNames[name]}
      fallback={<Text style={{ color, fontSize: size }}>•</Text>}
      size={size}
      tintColor={color}
      weight="semibold"
    />
  );
}

export function AppScreen({
  children,
  edges = ['top', 'bottom'],
}: ViewProps & { edges?: ('top' | 'bottom')[] }) {
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      <AppBackdrop />
      {children}
    </SafeAreaView>
  );
}

export function AppBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.glow} />
      <View style={[styles.ray, styles.rayOne]} />
      <View style={[styles.ray, styles.rayTwo]} />
    </View>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandLockup}>
      <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
        <View style={styles.brandNodeTop} />
        <View style={styles.brandNodeBottom} />
        <View style={styles.brandLink} />
      </View>
      <Text style={[styles.brandText, compact && styles.brandTextCompact]}>PocketPilot</Text>
    </View>
  );
}

export function IconButton({ icon, ...props }: PressableProps & { icon: AppIconName }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}
    >
      <AppIcon name={icon} size={18} />
    </Pressable>
  );
}

export function ScreenNav({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.nav}>
      <IconButton accessibilityLabel="Go back" icon="back" onPress={onBack} />
      <Text style={styles.navTitle}>{title}</Text>
      <View style={styles.navSpacer} />
    </View>
  );
}

export function SectionHeading({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function FadeInView({ children, delay = 0, style }: ViewProps & { delay?: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      delay,
      duration: 360,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  glow: {
    backgroundColor: 'rgba(22, 217, 213, 0.045)',
    borderRadius: 180,
    height: 360,
    position: 'absolute',
    right: -210,
    top: -145,
    width: 360,
  },
  ray: {
    backgroundColor: 'rgba(255, 255, 255, 0.018)',
    height: 1,
    position: 'absolute',
    right: -65,
    top: 95,
    transform: [{ rotate: '-37deg' }],
    width: 310,
  },
  rayOne: { top: 61 },
  rayTwo: { right: -80, top: 126, width: 260 },
  brandLockup: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  brandMark: {
    height: 25,
    position: 'relative',
    width: 25,
  },
  brandMarkCompact: { height: 21, transform: [{ scale: 0.84 }], width: 21 },
  brandNodeTop: {
    backgroundColor: colors.mint,
    borderRadius: 6,
    height: 11,
    left: 2,
    position: 'absolute',
    top: 1,
    width: 11,
  },
  brandNodeBottom: {
    borderColor: colors.text,
    borderRadius: 6,
    borderWidth: 1.5,
    bottom: 1,
    height: 11,
    position: 'absolute',
    right: 2,
    width: 11,
  },
  brandLink: {
    backgroundColor: colors.textMuted,
    height: 1.5,
    left: 9,
    position: 'absolute',
    top: 12,
    transform: [{ rotate: '45deg' }],
    width: 9,
  },
  brandText: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.25 },
  brandTextCompact: { fontSize: 14 },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.small,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  buttonPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  nav: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  navTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  navSpacer: { width: 40 },
  sectionHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionCopy: { flex: 1 },
  sectionTitle: { ...typography.section, color: colors.text },
  sectionSubtitle: { ...typography.caption, color: colors.textDim, marginTop: spacing.xs },
});
