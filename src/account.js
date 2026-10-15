// The person's private account, created automatically (no email or password).
// It lets the recall engine know what to watch for and where to send alerts.
//
// Uses Supabase's anonymous sign-in. In the Supabase dashboard this must be switched on:
// Authentication → Sign In / Providers → "Allow anonymous sign-ins".

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

const SESSION_KEY = 'heads-up-home:session';

// Show alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.msg || json.message || json.error_description || `error ${res.status}`;
    throw new Error(/anonymous/i.test(msg) ? 'Accounts are switched off in Supabase (anonymous sign-ins).' : msg);
  }
  return json;
}

function toSession(json) {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    userId: json.user && json.user.id,
  };
}

async function save(session) {
  try { await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* keep going */ }
  return session;
}

/** The saved account, refreshed if needed, or null if there isn't one yet. */
export async function getSession() {
  let session = null;
  try { session = JSON.parse((await AsyncStorage.getItem(SESSION_KEY)) || 'null'); } catch (e) { session = null; }
  if (!session) return null;
  if (Date.now() < session.expiresAt - 60000) return session;
  const fresh = toSession(await authRequest('token?grant_type=refresh_token', { refresh_token: session.refreshToken }));
  return save({ ...fresh, userId: fresh.userId || session.userId });
}

/** Creates the private account the first time, or returns the existing one. */
export async function ensureAccount() {
  const existing = await getSession().catch(() => null);
  if (existing) return existing;
  return save(toSession(await authRequest('signup', { data: {} })));
}

async function rest(session, method, path, body, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=minimal',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Couldn't save (${res.status})`);
}

/**
 * Copies the person's choices and cupboard to their account, so the recall engine
 * can alert them even when the app is closed.
 */
export async function syncToAccount(prefs) {
  const session = await getSession();
  if (!session) return false;
  const uid = session.userId;
  await rest(session, 'POST', 'profiles?on_conflict=user_id', {
    user_id: uid,
    categories: prefs.categories,
    allergens: prefs.allergens,
    alert_timing: prefs.timing === 'daily' ? 'daily' : 'instant',
  }, 'resolution=merge-duplicates,return=minimal');
  await rest(session, 'DELETE', `cupboard_items?user_id=eq.${uid}`);
  if (prefs.cupboard.length) {
    await rest(session, 'POST', 'cupboard_items', prefs.cupboard.map((i) => ({
      user_id: uid,
      name: i.name,
      brand: i.brand || null,
      barcode: i.barcode || null,
      added_via: i.barcode ? 'barcode' : 'manual',
      dismissed_recalls: i.dismissed || [],
    })));
  }
  return true;
}

/**
 * Asks permission for notifications and registers this phone for alerts.
 * Returns { permission, token, note } so the screen can explain what happened.
 */
export async function enableNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('recalls', {
      name: 'Recall alerts',
      importance: Notifications.AndroidImportance.MAX,
    }).catch(() => {});
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { permission: false, token: null, note: 'Notifications are turned off for this app in your phone settings.' };

  const projectId = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.eas && Constants.expoConfig.extra.eas.projectId)
    || (Constants.easConfig && Constants.easConfig.projectId);
  let token = null;
  try {
    token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch (e) {
    return { permission: true, token: null, note: 'Alerts are ready. They start arriving once the app is installed from a test build, as previews like this one can\'t receive them.' };
  }

  const session = await ensureAccount();
  await rest(session, 'POST', 'push_tokens?on_conflict=token', {
    token,
    user_id: session.userId,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    updated_at: new Date().toISOString(),
  }, 'resolution=merge-duplicates,return=minimal');
  return { permission: true, token, note: null };
}

/** Shows a sample alert on this phone straight away, so people can see what they'll get. */
export async function sendTestAlert() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Possible recall in your cupboard',
      body: 'This is a test. Real alerts look like this and open the recall when tapped.',
    },
    trigger: null,
  });
}
