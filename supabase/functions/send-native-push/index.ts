// send-native-push — deliver a notification to native (Expo) push tokens.
//
// Additive to the existing web-push `send-push` function: this one fans out to
// the CBD College Scheduler mobile app's Expo push tokens (cbd_expo_push_tokens).
// Both the web app and the mobile app call this (fire-and-forget) whenever they
// emit a notification, so native devices get an OS notification no matter where
// the change was made.
//
// Deploy:
//   supabase functions deploy send-native-push --project-ref nqbonrcmbhjutlrpjfpk
//
// It uses the SERVICE_ROLE key (injected automatically) to read tokens past RLS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Body {
  title?: string;
  body?: string;
  message?: string; // web app sends `message`; accept either
  data?: Record<string, unknown>;
  target_user_id?: string | null;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  try {
    const payload = (await req.json().catch(() => ({}))) as Body;
    const title = payload.title || 'CBD College Scheduler';
    const body = payload.body || payload.message || '';
    const data = payload.data || {};
    const target = payload.target_user_id || null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let q = supabase.from('cbd_expo_push_tokens').select('token');
    if (target) q = q.eq('user_id', target);
    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const tokens = ((rows || []) as { token: string }[])
      .map((r) => r.token)
      .filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));

    if (tokens.length === 0) return json({ sent: 0 });

    const messages = tokens.map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      channelId: 'default',
      priority: 'high',
    }));

    const receipts: unknown[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      receipts.push(await resp.json().catch(() => null));
    }

    // Prune tokens Expo reports as no longer registered.
    try {
      const dead: string[] = [];
      receipts.forEach((r: any, ci: number) => {
        const arr = r?.data;
        if (Array.isArray(arr)) {
          arr.forEach((item: any, idx: number) => {
            if (item?.status === 'error' && item?.details?.error === 'DeviceNotRegistered') {
              dead.push(messages[ci * 100 + idx].to);
            }
          });
        }
      });
      if (dead.length) await supabase.from('cbd_expo_push_tokens').delete().in('token', dead);
    } catch {
      /* best effort */
    }

    return json({ sent: tokens.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
