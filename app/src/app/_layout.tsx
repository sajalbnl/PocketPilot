import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useNotificationNavigation } from '../lib/push-notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnReconnect: true, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export default function RootLayout() {
  useNotificationNavigation();
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#07110F' } }} />
      <StatusBar style="light" />
    </QueryClientProvider>
  );
}
