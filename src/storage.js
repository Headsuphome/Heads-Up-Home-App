import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your choices, cupboard and plan, saved on the phone. Once you turn on alerts, the choices
// and cupboard are also copied to your private account (see account.js) so the recall engine
// can alert you while the app is closed.

const KEY = 'heads-up-home:v1';

export const DEFAULT_PREFS = {
  categories: [],
  allergens: [],
  timing: 'instant',
  cupboard: [],
  onboarded: false,
  plan: 'free',        // 'free' | 'premium' | 'trade' once payments are connected
  trialUsed: false,
  trialEndsAt: null,
};

export function usePrefs() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefs]);

  const update = useCallback((changes) => {
    setPrefs((p) => ({ ...p, ...(typeof changes === 'function' ? changes(p) : changes) }));
  }, []);

  /** Puts everything back to how it was on first install (used by "Delete my data"). */
  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), []);

  return [prefs, update, ready, reset];
}

export const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
