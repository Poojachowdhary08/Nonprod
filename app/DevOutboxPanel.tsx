// DevOutboxPanel.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { flush } from '../utils/outbox';

const STORAGE_KEY = 'outbox:v1';

// crude global mock toggle
let MOCK_FAIL = false;

export function installFetchMock() {
  if ((global as any).__fetchWrapped) return;
  const realFetch = global.fetch;
  (global as any).__fetchWrapped = true;

  global.fetch = async (input: any, init?: any) => {
    if (
      MOCK_FAIL &&
      typeof input === 'string' &&
      (input.includes('/task-updates') ||
        input.includes('/property-chat/send') ||
        input.includes('/update-schedule/'))
    ) {
      return new Response('Forced 500 by MockFail', { status: 500 });
    }
    return realFetch(input as any, init as any);
  };
}

// --- Conservative online detection that works on web/mobile ---
const isLikelyOnline = (st?: NetInfoState | null): boolean => {
  // Web hint first
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    if ((navigator as any).onLine === false) return false;
  }

  if (!st) return false;
  if (!st.isConnected) return false;               // definitely offline
  if (st.isInternetReachable === false) return false; // definitely offline

  // When isInternetReachable is null/undefined, NetInfo can’t be sure.
  // Treat as online only if connection type is not "none"/"unknown".
  if (st.isInternetReachable == null) {
    const t = st.type?.toLowerCase?.() ?? '';
    if (t === 'none' || t === 'unknown') return false;
    // If we know we are connected to *something*, assume online.
    return true;
  }

  return true;
};

export default function DevOutboxPanel() {
  const [list, setList] = useState<any[]>([]);
  const [net, setNet] = useState<NetInfoState | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const recomputeOnline = useCallback((st?: NetInfoState | null) => {
    setIsOnline(isLikelyOnline(st ?? net));
  }, [net]);

  async function refresh() {
    const s = await AsyncStorage.getItem(STORAGE_KEY);
    setList(s ? JSON.parse(s) : []);
  }

  useEffect(() => {
    refresh();

    // Initial fetch
    NetInfo.fetch().then((st) => {
      setNet(st);
      setIsOnline(isLikelyOnline(st));
    });

    // Subscribe to NetInfo changes
    const sub = NetInfo.addEventListener((st) => {
      setNet(st);
      setIsOnline(isLikelyOnline(st));
    });

    // On web, also listen to browser online/offline events
    let onHandler: any, offHandler: any;
    if (Platform.OS === 'web') {
      onHandler = () => recomputeOnline();
      offHandler = () => setIsOnline(false);
      window.addEventListener('online', onHandler);
      window.addEventListener('offline', offHandler);
    }

    return () => {
      sub && sub();
      if (Platform.OS === 'web') {
        window.removeEventListener('online', onHandler);
        window.removeEventListener('offline', offHandler);
      }
    };
  }, [recomputeOnline]);

  return (
    <View style={styles.wrap} testID="dev-outbox-panel-root">
      {/* Wi-Fi status icon (offline shows a red slash) */}
      <View style={styles.iconWrap} accessibilityLabel={isOnline ? 'Online' : 'Offline'}>
        <Ionicons
          name="wifi"
          size={28}
          color={isOnline ? '#1DB954' : '#9CA3AF'} // green online / gray offline base
        />
        {!isOnline && <View style={styles.slash} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative', // <-- critical so the slash positions over the icon
  },
  // Red slash drawn over the wifi icon for offline state
  slash: {
    position: 'absolute',
    width: 2,
    height: 28,
    backgroundColor: '#E53935',
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
  },
});