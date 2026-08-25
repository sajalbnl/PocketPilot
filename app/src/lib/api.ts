import {
  AgentControlStateSchema,
  ApiErrorSchema,
  ApprovalExecutionResultSchema,
  ClosePositionResultSchema,
  MandateSchema,
  PositionDetailSchema,
  PositionListResponseSchema,
  RegisterPushTokenResultSchema,
  RuntimeConfigSchema,
  RejectSignalResultSchema,
  SignalDetailSchema,
  SignalListResponseSchema,
  type AgentControlState,
  type ApprovalExecutionResult,
  type ApprovalRequest,
  type ClosePositionResult,
  type KillSwitchUpdateRequest,
  type Mandate,
  type PositionDetail,
  type PositionListResponse,
  type RegisterPushTokenRequest,
  type RegisterPushTokenResult,
  type RuntimeConfig,
  type RejectSignalResult,
  type SignalCategory,
  type SignalDetail,
  type SignalListResponse,
} from '@pocketpilot/shared';
import { Platform } from 'react-native';

interface Parser<T> {
  parse(value: unknown): T;
}

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const API_BASE_URL =
  configuredUrl ?? (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, schema: Parser<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiClientError(
      `Cannot reach the pocketpilot server at ${API_BASE_URL}`,
      0,
      'NETWORK',
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.message,
        response.status,
        parsed.data.error.code,
        parsed.data.error.details,
      );
    }
    throw new ApiClientError(`Server request failed (${response.status})`, response.status, 'HTTP');
  }

  try {
    return schema.parse(payload);
  } catch {
    throw new ApiClientError('Server returned an incompatible response', response.status, 'SCHEMA');
  }
}

export const api = {
  getConfig(): Promise<RuntimeConfig> {
    return request('/config', RuntimeConfigSchema);
  },
  registerPushToken(registration: RegisterPushTokenRequest): Promise<RegisterPushTokenResult> {
    return request('/devices/push-token', RegisterPushTokenResultSchema, {
      method: 'POST',
      body: JSON.stringify(registration),
    });
  },
  listSignals(category: SignalCategory): Promise<SignalListResponse> {
    return request(`/signals?category=${encodeURIComponent(category)}`, SignalListResponseSchema);
  },
  getSignal(id: string): Promise<SignalDetail> {
    return request(`/signals/${encodeURIComponent(id)}`, SignalDetailSchema);
  },
  getMandate(): Promise<Mandate> {
    return request('/mandate', MandateSchema);
  },
  approveSignal(id: string, approval: ApprovalRequest): Promise<ApprovalExecutionResult> {
    return request(`/signals/${encodeURIComponent(id)}/approve`, ApprovalExecutionResultSchema, {
      method: 'POST',
      body: JSON.stringify(approval),
    });
  },
  rejectSignal(id: string): Promise<RejectSignalResult> {
    return request(`/signals/${encodeURIComponent(id)}/reject`, RejectSignalResultSchema, {
      method: 'POST',
      body: '{}',
    });
  },
  listPositions(): Promise<PositionListResponse> {
    return request('/positions', PositionListResponseSchema);
  },
  getPosition(id: string): Promise<PositionDetail> {
    return request(`/positions/${encodeURIComponent(id)}`, PositionDetailSchema);
  },
  closePosition(id: string): Promise<ClosePositionResult> {
    return request(`/positions/${encodeURIComponent(id)}/close`, ClosePositionResultSchema, {
      method: 'POST',
      body: '{}',
    });
  },
  getAgentControl(): Promise<AgentControlState> {
    return request('/agent/control', AgentControlStateSchema);
  },
  setKillSwitch(update: KillSwitchUpdateRequest): Promise<AgentControlState> {
    return request('/agent/kill-switch', AgentControlStateSchema, {
      method: 'POST',
      body: JSON.stringify(update),
    });
  },
};

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
