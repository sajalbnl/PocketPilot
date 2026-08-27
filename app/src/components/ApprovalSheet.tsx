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

import { ApiClientError, readableError } from '../lib/api';
import { formatUsd } from '../lib/format';
import { useApproveSignal, useRejectSignal, useRuntimeConfig } from '../lib/queries';
import { colors, radii } from '../lib/theme';

interface ApprovalSheetProps {
  visible: boolean;
  onClose: () => void;
  signal: SignalDetail;
  mandate: Mandate;
}

export function ApprovalSheet({ visible, onClose, signal, mandate }: ApprovalSheetProps) {
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
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.eyebrow}>AUTHORIZE PARAMETERS</Text>
                <Text style={styles.title}>
                  {signal.symbol} {signal.side}
                </Text>
              </View>
              <Pressable disabled={busy} hitSlop={12} onPress={onClose}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>

            <View style={styles.mandateCard}>
              <Text style={styles.mandateTitle}>MANDATE BOUNDARY</Text>
              <Text style={styles.mandateText}>
                {formatUsd(mandate.riskLimits.maxPositionUsd)} max ·{' '}
                {mandate.riskLimits.maxLeverage}x max · Stop required · Approval required
              </Text>
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
                <Text style={styles.approveText}>Approve & execute {executionLabel} order</Text>
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    maxHeight: '91%',
    paddingBottom: Platform.OS === 'android' ? 18 : 34,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: 3,
    height: 4,
    marginBottom: 17,
    width: 42,
  },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: colors.mint, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 4 },
  close: { color: colors.textMuted, fontSize: 32, lineHeight: 32 },
  mandateCard: {
    backgroundColor: colors.blueDark,
    borderRadius: radii.medium,
    marginTop: 18,
    padding: 14,
  },
  mandateTitle: { color: colors.blue, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  mandateText: { color: colors.text, fontSize: 13, lineHeight: 20, marginTop: 5 },
  field: { marginTop: 17 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  inputFrame: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    height: 54,
    paddingHorizontal: 15,
  },
  inputError: { borderColor: colors.red },
  input: { color: colors.text, flex: 1, fontSize: 18, fontWeight: '700', paddingVertical: 0 },
  affix: { color: colors.textMuted, fontSize: 17, fontWeight: '700', marginHorizontal: 3 },
  fieldError: { color: colors.red, fontSize: 11, marginTop: 6 },
  safetyCopy: { color: colors.textDim, fontSize: 11, lineHeight: 17, marginTop: 16 },
  testnetWarning: {
    backgroundColor: colors.amberDark,
    borderColor: colors.amber,
    borderRadius: radii.small,
    borderWidth: 1,
    marginTop: 13,
    padding: 12,
  },
  testnetWarningTitle: { color: colors.amber, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  testnetWarningBody: { color: colors.text, fontSize: 11, lineHeight: 17, marginTop: 4 },
  serverError: {
    backgroundColor: colors.redDark,
    borderRadius: radii.small,
    marginTop: 13,
    padding: 12,
  },
  serverErrorTitle: { color: colors.red, fontSize: 12, fontWeight: '800' },
  serverErrorBody: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 3 },
  serverRiskRule: { color: colors.red, fontSize: 11, lineHeight: 17, marginTop: 5 },
  approveButton: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: 15,
    height: 54,
    justifyContent: 'center',
    marginTop: 18,
  },
  approveText: { color: colors.background, fontSize: 15, fontWeight: '900' },
  rejectButton: {
    alignItems: 'center',
    borderColor: colors.redDark,
    borderRadius: 15,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    marginTop: 10,
  },
  rejectText: { color: colors.red, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
