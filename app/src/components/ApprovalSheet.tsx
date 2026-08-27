import {
  ApprovalRequestSchema,
  RiskPreviewSchema,
  type ApprovalRequest,
  type Mandate,
  type SignalDetail,
} from '@pocketpilot/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from './AppChrome';
import { ApiClientError, readableError } from '../lib/api';
import { formatUsd } from '../lib/format';
import { useApproveSignal, useRejectSignal, useRuntimeConfig } from '../lib/queries';
import { colors, radii, spacing, typography } from '../lib/theme';

interface ApprovalSheetProps {
  visible: boolean;
  onClose: () => void;
  signal: SignalDetail;
  mandate: Mandate;
}

export function ApprovalSheet({ visible, onClose, signal, mandate }: ApprovalSheetProps) {
  const insets = useSafeAreaInsets();
  const approve = useApproveSignal(signal.id);
  const reject = useRejectSignal(signal.id);
  const runtime = useRuntimeConfig();
  const busy = approve.isPending || reject.isPending;
  const executionMode = runtime.data?.executionMode;
  const executionLabel =
    executionMode === 'paper'
      ? 'paper'
      : executionMode === 'hyperliquid-testnet'
        ? 'Hyperliquid testnet'
        : 'configured';
  const approvalDisabled = busy || !executionMode;
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApprovalRequest>({
    resolver: zodResolver(ApprovalRequestSchema),
    mode: 'onChange',
    defaultValues: {
      approvalRevision: 1,
      notionalUsd: signal.proposedNotionalUsd ?? 1,
      leverage: signal.proposedLeverage ?? 1,
      stopLossPrice: signal.stopLossPrice ?? 1,
    },
  });

  useEffect(() => {
    if (visible) {
      approve.reset();
      reject.reset();
      reset({
        approvalRevision: 1,
        notionalUsd: signal.proposedNotionalUsd ?? 1,
        leverage: signal.proposedLeverage ?? 1,
        stopLossPrice: signal.stopLossPrice ?? 1,
      });
    }
  }, [visible, signal.proposedLeverage, signal.proposedNotionalUsd, signal.stopLossPrice, reset]);

  const submitApproval = handleSubmit(async (values) => {
    try {
      const result = await approve.mutateAsync(values);
      onClose();
      router.replace(`/positions/${result.position.id}` as never);
    } catch {
      // The mutation error remains visible in this sheet.
    }
  });

  const submitRejection = async () => {
    if (busy) return;
    try {
      await reject.mutateAsync();
      onClose();
    } catch {
      // The mutation error remains visible in this sheet.
    }
  };

  const serverError = approve.error ?? reject.error;
  const parsedRisk =
    serverError instanceof ApiClientError
      ? RiskPreviewSchema.safeParse(serverError.details?.risk)
      : null;
  const rejectedRisk = parsedRisk?.success
    ? parsedRisk.data.rules.filter((rule) => !rule.passed)
    : [];

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => !busy && onClose()}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable
          accessibilityLabel="Close approval"
          onPress={() => !busy && onClose()}
          style={styles.backdrop}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.eyebrow}>AUTHORIZE PARAMETERS</Text>
                <Text style={styles.title}>
                  {signal.symbol} {signal.side}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close approval"
                disabled={busy}
                hitSlop={12}
                onPress={onClose}
                style={styles.closeButton}
              >
                <AppIcon color={colors.textMuted} name="close" size={18} />
              </Pressable>
            </View>

            <View style={styles.mandateCard}>
              <View style={styles.mandateIcon}>
                <AppIcon color={colors.blue} name="shield" size={18} />
              </View>
              <View style={styles.mandateCopy}>
                <Text style={styles.mandateTitle}>MANDATE BOUNDARY</Text>
                <Text style={styles.mandateText}>
                  {formatUsd(mandate.riskLimits.maxPositionUsd)} max ·{' '}
                  {mandate.riskLimits.maxLeverage}x max · Stop required
                </Text>
              </View>
            </View>

            <Field
              control={control}
              error={errors.notionalUsd?.message}
              label="Notional size"
              name="notionalUsd"
              prefix="$"
            />
            <Field
              control={control}
              error={errors.leverage?.message}
              label="Leverage"
              name="leverage"
              suffix="x"
            />
            <Field
              control={control}
              error={errors.stopLossPrice?.message}
              label="Stop-loss · required"
              name="stopLossPrice"
              prefix="$"
            />

            <Text style={styles.safetyCopy}>
              The server reruns every deterministic rule against these edited values, checks the
              kill switch again, and creates at most one {executionLabel} order for this approval
              revision. The stop is recorded for review; automated protective-order management is
              not implemented.
            </Text>

            {executionMode === 'hyperliquid-testnet' ? (
              <View style={styles.testnetWarning}>
                <Text style={styles.testnetWarningTitle}>TESTNET EXECUTION</Text>
                <Text style={styles.testnetWarningBody}>
                  This sends a real signed testnet order. A rejection or timeout will be shown as a
                  failure; pocketpilot will not switch it to paper.
                </Text>
              </View>
            ) : null}

            {!executionMode ? (
              <View style={styles.serverError}>
                <Text style={styles.serverErrorTitle}>Execution mode unavailable</Text>
                <Text style={styles.serverErrorBody}>
                  Approval is disabled until the server confirms whether execution is Paper or
                  Hyperliquid Testnet.
                </Text>
              </View>
            ) : null}

            {serverError ? (
              <View style={styles.serverError}>
                <Text style={styles.serverErrorTitle}>Action not saved</Text>
                <Text style={styles.serverErrorBody}>{readableError(serverError)}</Text>
                {rejectedRisk.map((rule) => (
                  <Text key={rule.ruleId} style={styles.serverRiskRule}>
                    {rule.ruleId.replaceAll('-', ' ')} · {rule.explanation}
                  </Text>
                ))}
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={approvalDisabled}
              onPress={() => void submitApproval()}
              style={({ pressed }) => [
                styles.approveButton,
                approvalDisabled && styles.disabled,
                pressed && !approvalDisabled && styles.pressed,
              ]}
            >
              {approve.isPending ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Text style={styles.approveText}>Approve & execute</Text>
                  <AppIcon color={colors.background} name="forward" size={18} />
                </>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void submitRejection()}
              style={({ pressed }) => [
                styles.rejectButton,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {reject.isPending ? (
                <ActivityIndicator color={colors.red} />
              ) : (
                <Text style={styles.rejectText}>Reject signal</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type NumericFieldName = 'notionalUsd' | 'leverage' | 'stopLossPrice';

function Field({
  control,
  name,
  label,
  prefix,
  suffix,
  error,
}: {
  control: ReturnType<typeof useForm<ApprovalRequest>>['control'];
  name: NumericFieldName;
  label: string;
  prefix?: string;
  suffix?: string;
  error: string | undefined;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onBlur, onChange, value } }) => (
          <View style={[styles.inputFrame, error && styles.inputError]}>
            {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
            <TextInput
              keyboardType="decimal-pad"
              onBlur={onBlur}
              onChangeText={(text) => onChange(text.trim() === '' ? Number.NaN : Number(text))}
              selectTextOnFocus
              style={styles.input}
              value={value === null || Number.isNaN(value) ? '' : String(value)}
            />
            {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
          </View>
        )}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '93%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: 3,
    height: 4,
    marginBottom: spacing.xl,
    width: 36,
  },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { ...typography.label, color: colors.mint, fontSize: 9 },
  title: { ...typography.title, color: colors.text, marginTop: spacing.xs },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.small,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  mandateCard: {
    alignItems: 'center',
    backgroundColor: colors.blueDark,
    borderColor: 'rgba(150, 200, 255, 0.18)',
    borderRadius: radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: spacing.xl,
    padding: spacing.md,
  },
  mandateIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(150, 200, 255, 0.10)',
    borderRadius: radii.small,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  mandateCopy: { flex: 1, marginLeft: spacing.md },
  mandateTitle: { ...typography.label, color: colors.blue, fontSize: 9 },
  mandateText: { ...typography.caption, color: colors.text, marginTop: 3 },
  field: { marginTop: spacing.lg },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  inputFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: spacing.lg,
  },
  inputError: { borderColor: colors.red },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    paddingVertical: 0,
  },
  affix: { color: colors.textMuted, fontSize: 16, fontWeight: '600', marginHorizontal: 3 },
  fieldError: { ...typography.caption, color: colors.red, marginTop: 6 },
  safetyCopy: {
    ...typography.caption,
    color: colors.textDim,
    lineHeight: 17,
    marginTop: spacing.lg,
  },
  testnetWarning: {
    backgroundColor: colors.amberDark,
    borderColor: 'rgba(244, 201, 93, 0.24)',
    borderRadius: radii.small,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  testnetWarningTitle: { ...typography.label, color: colors.amber, fontSize: 9 },
  testnetWarningBody: { ...typography.caption, color: colors.text, marginTop: spacing.xs },
  serverError: {
    backgroundColor: colors.redDark,
    borderColor: 'rgba(255, 101, 104, 0.20)',
    borderRadius: radii.small,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  serverErrorTitle: { color: colors.red, fontSize: 12, fontWeight: '700' },
  serverErrorBody: { ...typography.caption, color: colors.text, marginTop: 3 },
  serverRiskRule: { ...typography.caption, color: colors.red, marginTop: spacing.xs },
  approveButton: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 56,
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  approveText: { color: colors.background, fontSize: 15, fontWeight: '700' },
  rejectButton: {
    alignItems: 'center',
    backgroundColor: colors.redDark,
    borderColor: 'rgba(255, 101, 104, 0.22)',
    borderRadius: radii.medium,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  rejectText: { color: colors.red, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
