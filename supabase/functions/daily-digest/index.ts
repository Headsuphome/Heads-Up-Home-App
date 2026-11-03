// daily-digest: one morning notification for people who chose "Daily summary".
// Only category alerts wait for this — cupboard and allergen alerts are always sent instantly.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush, type PushMessage } from '../_shared/push.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorised', { status: 401 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: pending, error } = await db
    .from('user_alerts')
    .select('id, user_id, recalls(title)')
    .is('pushed_at', null)
    .eq('reason', 'category');
  if (error) return new Response(error.message, { status: 500 });
  if (!pending?.length) return Response.json({ users: 0, sent: 0 });

  const byUser = new Map<string, { ids: number[]; titles: string[] }>();
  for (const a of pending as Array<{ id: number; user_id: string; recalls: { title: string } | null }>) {
    const entry = byUser.get(a.user_id) ?? { ids: [], titles: [] };
    entry.ids.push(a.id);
    if (a.recalls?.title) entry.titles.push(a.recalls.title);
    byUser.set(a.user_id, entry);
  }

  const { data: tokens } = await db.from('push_tokens').select('token, user_id').in('user_id', [...byUser.keys()]);
  const messages: PushMessage[] = (tokens ?? []).map((t: { token: string; user_id: string }) => {
    const { titles } = byUser.get(t.user_id)!;
    const n = titles.length;
    return {
      to: t.token,
      title: n === 1 ? '1 new recall for you' : `${n} new recalls for you`,
      body: n === 1 ? titles[0] : `${titles[0]} and ${n - 1} more. Tap to see them.`,
      data: { screen: 'alerts' },
    };
  });

  const { sent, deadTokens, errors: pushErrors } = await sendPush(fetch, messages, Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined);
  if (pushErrors.length) console.error('Some alerts could not be sent:', pushErrors);
  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);
  const allIds = [...byUser.values()].flatMap((e) => e.ids);
  await db.from('user_alerts').update({ pushed_at: new Date().toISOString() }).in('id', allIds);

  return Response.json({ users: byUser.size, sent });
});
