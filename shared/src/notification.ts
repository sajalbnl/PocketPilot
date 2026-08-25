import { z } from 'zod';

import { CompactErrorSchema } from './execution.js';
import { UtcDateTimeSchema, UuidSchema } from './primitives.js';

export const ExpoPushTokenSchema = z
  .string()
  .regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/u, 'Invalid Expo push token');

export const PushPlatformSchema = z.enum(['android', 'ios']);

export const PushTokenRegistrationSchema = z
  .object({
    token: ExpoPushTokenSchema,
    platform: PushPlatformSchema,
    registeredAt: UtcDateTimeSchema,
    lastSeenAt: UtcDateTimeSchema,
  })
  .strict();
export type PushTokenRegistration = z.infer<typeof PushTokenRegistrationSchema>;

export const RegisterPushTokenRequestSchema = z
  .object({ token: ExpoPushTokenSchema, platform: PushPlatformSchema })
  .strict();
export type RegisterPushTokenRequest = z.infer<typeof RegisterPushTokenRequestSchema>;

export const RegisterPushTokenResultSchema = z
  .object({ registered: z.literal(true), tokenCount: z.number().int().nonnegative() })
  .strict();
export type RegisterPushTokenResult = z.infer<typeof RegisterPushTokenResultSchema>;

export const SignalNotificationDataSchema = z
  .object({
    type: z.literal('signal_approval_required'),
    signalId: UuidSchema,
    url: z.string().min(1),
  })
  .strict();
export type SignalNotificationData = z.infer<typeof SignalNotificationDataSchema>;

export const NotificationDeliverySchema = z
  .object({
    transitionKey: z.string().min(1),
    status: z.enum(['CLAIMED', 'SENT', 'SKIPPED', 'ERROR']),
    attemptedAt: UtcDateTimeSchema,
    completedAt: UtcDateTimeSchema.nullable(),
    recipientCount: z.number().int().nonnegative(),
    ticketIds: z.array(z.string().min(1)),
    error: CompactErrorSchema.nullable(),
  })
  .strict();
export type NotificationDelivery = z.infer<typeof NotificationDeliverySchema>;

/**
 * Converts a safe, schema-checked notification payload into the one route it may open.
 * The identifier in the URL must match the authoritative signal identifier in the payload.
 */
export function parseSignalNotificationRoute(input: unknown): `/signals/${string}` | null {
  const parsed = SignalNotificationDataSchema.safeParse(input);
  if (!parsed.success) return null;

  if (parsed.data.url !== `pocketpilot://signals/${parsed.data.signalId}`) return null;
  return `/signals/${parsed.data.signalId}`;
}
