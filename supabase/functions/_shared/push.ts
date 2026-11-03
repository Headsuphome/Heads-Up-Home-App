// Sends phone notifications through Expo's push service, which delivers to
// both Apple (APNs) and Android (FCM) from one request. Free to use.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

import type { FetchFn, Json } from './util.ts';

export interface PushMessage {
  to: string;           // Expo push token
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'high';
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo's limit per request

/**
 * Sends messages and returns tokens Expo says are dead (app uninstalled),
 * so the caller can delete them. A batch that fails is reported in `errors`
 * rather than stopping everyone else's alerts.
 */
export async function sendPush(fetchFn: FetchFn, messages: PushMessage[], accessToken?: string): Promise<{ sent: number; deadTokens: string[]; errors: string[] }> {
  const result = { sent: 0, deadTokens: [] as string[], errors: [] as string[] };
  for (let i = 0; i < messages.length; i += BATCH) {
    await sendBatch(fetchFn, messages.slice(i, i + BATCH), accessToken, result, true);
  }
  return result;
}

async function sendBatch(
  fetchFn: FetchFn,
  batch: PushMessage[],
  accessToken: string | undefined,
  result: { sent: number; deadTokens: string[]; errors: string[] },
  maySplit: boolean,
): Promise<void> {
  let res: Response;
  try {
    res = await fetchFn(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch.map((m) => ({ sound: 'default', priority: 'high', ...m }))),
    });
  } catch (e) {
    result.errors.push(`Expo push unreachable: ${(e as Error).message}`);
    return;
  }
  const text = await res.text();
  let json: Json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }

  if (!res.ok) {
    // Expo refuses a batch that mixes tokens from different apps (for example an Expo Go
    // preview and the real app). It tells us which token belongs to which app, so send
    // each app's share on its own.
    const mixed = (json?.errors ?? []).find((e: Json) => e?.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS');
    if (maySplit && mixed?.details && typeof mixed.details === 'object') {
      const groups = new Map<string, PushMessage[]>();
      const owner = new Map<string, string>();
      for (const [project, tokens] of Object.entries(mixed.details as Record<string, string[]>)) {
        for (const token of tokens ?? []) owner.set(token, project);
      }
      for (const m of batch) {
        const key = owner.get(m.to) ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(m);
      }
      for (const group of groups.values()) await sendBatch(fetchFn, group, accessToken, result, false);
      return;
    }
    result.errors.push(`Expo push failed: ${res.status} ${text.slice(0, 300)}`);
    return;
  }

  const tickets: Json[] = json?.data ?? [];
  tickets.forEach((ticket, idx) => {
    if (ticket?.status === 'ok') result.sent++;
    else if (ticket?.details?.error === 'DeviceNotRegistered') result.deadTokens.push(batch[idx].to);
  });
}
