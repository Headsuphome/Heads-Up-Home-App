import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Everything personal stays on the phone in this first version:
// chosen categories, allergens and cupboard items. Nothing is sent to the server.

const KEY = 'heads-up-home:v1';

export const DEFAULT_PREFS = {
  categories: [],
  allergens: [],
  timing: 'instant',
  cupboard: [],
  onboarded: false,
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

  return [prefs, update, ready];
}

export const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
