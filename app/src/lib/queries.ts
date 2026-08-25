import type { ApprovalRequest, KillSwitchUpdateRequest, SignalCategory } from '@pocketpilot/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api';

export const queryKeys = {
  config: ['config'] as const,
  signals: ['signals'] as const,
  signalLists: (category: SignalCategory) => ['signals', 'list', category] as const,
  signal: (id: string) => ['signals', 'detail', id] as const,
  mandate: ['mandate'] as const,
  positions: ['positions'] as const,
  position: (id: string) => ['positions', 'detail', id] as const,
  agentControl: ['agent', 'control'] as const,
};

export function useRuntimeConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: api.getConfig, staleTime: 60_000 });
}

export function useSignals(category: SignalCategory) {
  return useQuery({
    queryKey: queryKeys.signalLists(category),
    queryFn: () => api.listSignals(category),
    staleTime: 10_000,
    refetchInterval: category === 'approval-required' || category === 'monitoring' ? 20_000 : false,
  });
}

export function useSignal(id: string) {
  return useQuery({
    queryKey: queryKeys.signal(id),
    queryFn: () => api.getSignal(id),
    enabled: id.length > 0,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'PENDING_APPROVAL' || state === 'APPROVED' || state === 'EXECUTING'
        ? 15_000
        : false;
    },
  });
}

export function useMandate() {
  return useQuery({ queryKey: queryKeys.mandate, queryFn: api.getMandate, staleTime: 5 * 60_000 });
}

export function usePositions() {
  return useQuery({
    queryKey: queryKeys.positions,
    queryFn: api.listPositions,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function usePosition(id: string) {
  return useQuery({
    queryKey: queryKeys.position(id),
    queryFn: () => api.getPosition(id),
    enabled: id.length > 0,
    staleTime: 3_000,
    refetchInterval: (query) => (query.state.data?.status === 'OPEN' ? 10_000 : false),
  });
}

export function useAgentControl() {
  return useQuery({
    queryKey: queryKeys.agentControl,
    queryFn: api.getAgentControl,
    staleTime: 3_000,
    refetchInterval: 15_000,
  });
}

export function useApproveSignal(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (approval: ApprovalRequest) => api.approveSignal(id, approval),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.signals }),
        client.invalidateQueries({ queryKey: queryKeys.signal(id) }),
      ]);
    },
  });
}

export function useRejectSignal(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.rejectSignal(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.signals }),
        client.invalidateQueries({ queryKey: queryKeys.signal(id) }),
      ]);
    },
  });
}

export function useClosePosition(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.closePosition(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.positions }),
        client.invalidateQueries({ queryKey: queryKeys.position(id) }),
        client.invalidateQueries({ queryKey: queryKeys.signals }),
      ]);
    },
  });
}

export function useSetKillSwitch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (update: KillSwitchUpdateRequest) => api.setKillSwitch(update),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.agentControl }),
        client.invalidateQueries({ queryKey: queryKeys.mandate }),
      ]);
    },
  });
}
