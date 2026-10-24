import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import { colors } from './src/theme';
import { fetchRecall, fetchRecalls } from './src/api';
import { cupboardMatches } from './src/logic';
import { newId, usePrefs } from './src/storage';
import { FREE_CUPBOARD_LIMIT, canAddToCupboard } from './src/plans';
import HomeScreen from './src/screens/HomeScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import CupboardScreen from './src/screens/CupboardScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import DetailScreen from './src/screens/DetailScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import PremiumScreen from './src/screens/PremiumScreen';
import ScanScreen from './src/screens/ScanScreen';
import { alertPermission, deleteAccount, enableNotifications, ensureAccount, getSession, isExpoGo, refreshAlertRegistration, sendTestAlert, syncToAccount } from './src/account';

const TABS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'browse', label: 'Browse', icon: 'search' },
  { key: 'cupboard', label: 'Cupboard', icon: 'file-tray-stacked' },
  { key: 'alerts', label: 'My alerts', icon: 'options' },
];

function Main() {
  const insets = useSafeAreaInsets();
  const [prefs, update, ready, reset] = usePrefs();
  const [account, setAccount] = useState({ status: 'unknown', permission: null, note: null, preview: isExpoGo() });
  const [tab, setTab] = useState('home');
  const [open, setOpen] = useState(null); // the recall being viewed, if any
  const [premium, setPremium] = useState(null); // { reason } while the plans screen is open
  const [scan, setScan] = useState(null); // { mode } while the barcode scanner is open
  const [recalls, setRecalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRecalls()
      .then(setRecalls)
      .catch((e) => setError(e.message || 'Something went wrong'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Is there already an account on this phone? If so, check notifications are still allowed
  // and keep this phone's alert registration fresh.
  useEffect(() => {
    getSession()
      .then(async (s) => {
        if (!s) { setAccount((a) => ({ ...a, status: 'none' })); return; }
        const permission = await alertPermission();
        setAccount((a) => ({ ...a, status: 'ready', permission, userId: s.userId }));
        if (permission) refreshAlertRegistration().catch(() => {});
      })
      .catch(() => setAccount((a) => ({ ...a, status: 'none' })));
  }, []);

  // Keep the account's copy of choices and cupboard up to date (a moment after each change).
  useEffect(() => {
    if (!ready || account.status !== 'ready') return undefined;
    const timer = setTimeout(() => { syncToAccount(prefs).catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, [prefs, ready, account.status]);

  /** Creates the private account and turns on notifications. Never throws. */
  const enableAlerts = useCallback(async () => {
    try {
      const session = await ensureAccount();
      const r = await enableNotifications();
      setAccount((a) => ({ ...a, status: 'ready', permission: r.permission, note: r.note, userId: session.userId }));
      return { ok: r.permission, note: r.note };
    } catch (e) {
      const note = `We couldn't turn on alerts just now (${e.message}). You can try again in My alerts.`;
      setAccount((a) => ({ ...a, note }));
      return { ok: false, note };
    }
  }, []);

  const testAlert = useCallback(async () => {
    try {
      const r = await enableNotifications().catch(() => ({ permission: false }));
      if (r.permission === false) {
        Alert.alert('Notifications are off', 'Allow notifications for this app in your phone settings, then try again.');
        return;
      }
      await sendTestAlert(recalls.length ? recalls[0].id : null);
    } catch (e) {
      Alert.alert('Couldn\'t send a test alert', e.message);
    }
  }, [recalls]);

  /** Deletes the account and everything on this phone, then starts again from the welcome screens. Throws on failure. */
  const deleteMyData = useCallback(async () => {
    await deleteAccount();
    setAccount({ status: 'none', permission: null, note: null, preview: isExpoGo() });
    setOpen(null);
    setPremium(null);
    setTab('home');
    reset();
  }, [reset]);

  // Tapping a recall alert opens that recall.
  const tapped = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = tapped && tapped.notification && tapped.notification.request.content.data;
    const id = data && data.recallId;
    if (!id) return;
    const show = (recall) => { if (recall) { setPremium(null); setScan(null); setOpen(recall); } };
    const known = recalls.find((r) => r.id === id);
    if (known) show(known);
    else fetchRecall(id).then(show).catch(() => {});
  }, [tapped]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back button closes a recall before leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (premium) { setPremium(null); return true; }
      if (scan) { setScan(null); return true; }
      if (open) { setOpen(null); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [open, tab, premium, scan]);

  const matches = useMemo(() => cupboardMatches(prefs.cupboard, recalls), [prefs.cupboard, recalls]);
  const recallsById = useMemo(() => Object.fromEntries(recalls.map((r) => [r.id, r])), [recalls]);

  const openRecall = useCallback((recall) => setOpen(recall), []);
  const goTo = useCallback((key) => { setOpen(null); setTab(key); }, []);
  const openPremium = useCallback((reason) => setPremium({ reason: typeof reason === 'string' ? reason : null }), []);
  const openScan = useCallback((mode) => setScan({ mode: mode === 'add' ? 'add' : 'check' }), []);
  const addScanned = useCallback((item) => {
    update((p) => ({ cupboard: [{ id: newId(), dismissed: [], addedAt: new Date().toISOString(), ...item }, ...p.cupboard] }));
  }, [update]);

  const haveIt = (recall) => {
    update((p) => {
      const flagged = p.flagged || [];
      if (flagged.some((f) => f.recallId === recall.id)) return {};
      return { flagged: [{ recallId: recall.id, title: recall.title, at: new Date().toISOString() }, ...flagged] };
    });
    setOpen(null);
    setTab('cupboard');
  };

  const notMine = (recall) => {
    update((p) => ({
      cupboard: p.cupboard.map((i) => (matches.some((m) => m.item.id === i.id && m.recall.id === recall.id)
        ? { ...i, dismissed: [...(i.dismissed || []), recall.id] }
        : i)),
    }));
    setOpen(null);
  };

  const shared = { recalls, prefs, update, matches, recallsById, openRecall, goTo, account, onEnableAlerts: enableAlerts, onTestAlert: testAlert, onDeleteData: deleteMyData, openPremium, openScan };

  if (!ready) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!prefs.onboarded) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        <OnboardingScreen prefs={prefs} update={update} onEnableAlerts={enableAlerts} onFinish={() => update({ onboarded: true })} />
      </View>
    );
  }

  let screen;
  if (premium) {
    screen = <PremiumScreen prefs={prefs} update={update} reason={premium.reason} onClose={() => setPremium(null)} />;
  } else if (scan) {
    screen = (
      <ScanScreen
        mode={scan.mode}
        recalls={recalls}
        canAdd={canAddToCupboard(prefs)}
        onAdd={addScanned}
        onFull={() => openPremium(`Your free cupboard holds ${FREE_CUPBOARD_LIMIT} items. Premium gives you an unlimited cupboard.`)}
        openRecall={(r) => { setScan(null); setOpen(r); }}
        onClose={() => setScan(null)}
      />
    );
  } else if (open) {
    const match = matches.find((m) => m.recall.id === open.id) || null;
    screen = <DetailScreen recall={open} match={match} onBack={() => setOpen(null)} onHaveIt={haveIt} onNotMine={notMine} />;
  } else if (tab === 'browse') {
    screen = <BrowseScreen {...shared} />;
  } else if (tab === 'cupboard') {
    screen = <CupboardScreen {...shared} />;
  } else if (tab === 'alerts') {
    screen = <AlertsScreen {...shared} />;
  } else {
    screen = <HomeScreen {...shared} loading={loading} error={error} onRefresh={load} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>{screen}</View>
      {!open && !premium && !scan ? (
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = tab === t.key;
            const badge = t.key === 'cupboard' && matches.length > 0;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}>
                <View>
                  <Ionicons name={on ? t.icon : `${t.icon}-outline`} size={22} color={on ? colors.accent : colors.muted} />
                  {badge ? <View style={styles.dot} /> : null}
                </View>
                <Text style={[styles.tabText, on && { color: colors.accent, fontWeight: '600' }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  tabText: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  dot: { position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surface },
});
