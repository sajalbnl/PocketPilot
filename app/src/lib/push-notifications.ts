import { parseSignalNotificationRoute } from '@pocketpilot/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { api, readableError } from './api';

export type PushRegistrationState =
  | { status: 'checking'; message: string }
  | { status: 'prompt'; message: string }
  | { status: 'registering'; message: string }
  | { status: 'registered'; message: string }
  | { status: 'denied'; message: string; canAskAgain: boolean }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useNotificationNavigation(): void {
  useEffect(() => {
    const redirect = (notification: Notifications.Notification) => {
      const route = parseSignalNotificationRoute(notification.request.content.data);
      if (route) router.push(route as never);
    };

    const initial = Notifications.getLastNotificationResponse();
    if (initial?.notification) {
      redirect(initial.notification);
      void Notifications.clearLastNotificationResponseAsync();
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
      void Notifications.clearLastNotificationResponseAsync();
    });
    return () => subscription.remove();
  }, []);
}

export function usePushRegistration(): {
  state: PushRegistrationState;
  enable: () => Promise<void>;
} {
  const [state, setState] = useState<PushRegistrationState>({
    status: 'checking',
    message: 'Checking notification support…',
  });

  const obtainAndRegister = useCallback(async () => {
    setState({ status: 'registering', message: 'Registering this device for approval alerts…' });
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('approvals', {
          name: 'Trade approvals',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 180, 250],
          lightColor: '#58E0B1',
        });
      }
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (typeof projectId !== 'string' || projectId.length === 0) {
        throw new Error(
          'Expo project ID is missing. Run eas init and rebuild the development app.',
        );
      }
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await api.registerPushToken({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
      setState({ status: 'registered', message: 'Approval alerts are enabled on this device.' });
    } catch (error: unknown) {
      setState({ status: 'error', message: readableError(error) });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!Device.isDevice) {
        if (active) {
          setState({
            status: 'unsupported',
            message: 'Remote push requires a physical Android or iOS device.',
          });
        }
        return;
      }
      try {
        const permission = await Notifications.getPermissionsAsync();
        if (!active) return;
        if (permission.status === 'granted') {
          await obtainAndRegister();
        } else if (!permission.canAskAgain) {
          setState({
            status: 'denied',
            canAskAgain: false,
            message: 'Notifications are blocked in system settings.',
          });
        } else {
          setState({
            status: 'prompt',
            message: 'Get an alert when a proposal needs approval. Alerts never approve trades.',
          });
        }
      } catch (error: unknown) {
        if (active) setState({ status: 'error', message: readableError(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [obtainAndRegister]);

  const enable = useCallback(async () => {
    if (!Device.isDevice) return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('approvals', {
          name: 'Trade approvals',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setState({
          status: 'denied',
          canAskAgain: permission.canAskAgain,
          message: permission.canAskAgain
            ? 'Notification permission was not granted.'
            : 'Notifications are blocked in system settings.',
        });
        return;
      }
      await obtainAndRegister();
    } catch (error: unknown) {
      setState({ status: 'error', message: readableError(error) });
    }
  }, [obtainAndRegister]);

  return { state, enable };
}
