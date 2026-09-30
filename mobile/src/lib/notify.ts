// Notification emission, mirrored from the web app (index.html) so both clients
// write the same rows and the web bell/detail modal renders mobile-sent ones.
import { supabase } from './supabase';

export interface EmitOpts {
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  target_user_id?: string;
  actorId?: string;
  actorName?: string;
}

// Insert a notification row (+ fire-and-forget push, which the send-push edge
// function delivers once deployed). Stamps who/when like the web emitNotification.
export async function emitNotification(opts: EmitOpts): Promise<void> {
  const data: Record<string, any> = { ...(opts.data || {}) };
  if (opts.actorId && data.actor_id == null) data.actor_id = opts.actorId;
  if (opts.actorName && data.actor_name == null) data.actor_name = opts.actorName;
  if (data.emitted_at == null) data.emitted_at = new Date().toISOString();

  const row: Record<string, any> = {
    type: opts.type,
    title: opts.title,
    message: opts.message,
    data,
  };
  if (opts.target_user_id) row.target_user_id = opts.target_user_id;

  try {
    await supabase.from('cbd_notifications').insert(row);
  } catch (e) {
    console.warn('notification emit failed:', e);
  }

  try {
    const pushBody: Record<string, any> = {
      title: opts.title,
      body: opts.message,
      data,
      tag: 'cbd-' + (opts.type || 'notif'),
    };
    if (opts.target_user_id) pushBody.target_user_id = opts.target_user_id;
    supabase.functions.invoke('send-push', { body: pushBody }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// Notify every trainer (except the acting assistant) that an assistant changed
// their OWN availability. Subject stays the acting assistant so trainers' bell
// entries read "<name>'s availability …", matching the web app.
export async function notifyTrainersOfAssistantChange(
  actorId: string,
  actorName: string,
  opts: { type?: string; title: string; message: string; data?: Record<string, any> },
): Promise<number> {
  const { data: profRows } = await supabase
    .from('cbd_profiles')
    .select('id, role, full_name');
  const profiles = (profRows || []) as {
    id: string;
    role: string;
    full_name: string | null;
  }[];
  const trainerIds = profiles
    .filter((p) => p.role === 'trainer' && p.id !== actorId)
    .map((p) => p.id);
  if (!trainerIds.length) return 0;

  await Promise.all(
    trainerIds.map((uid) =>
      emitNotification({
        type: opts.type || 'availability_changed_by_assistant',
        title: opts.title,
        message: opts.message,
        target_user_id: uid,
        actorId,
        actorName,
        data: {
          subject_user_id: actorId,
          subject_name: actorName,
          ...(opts.data || {}),
        },
      }),
    ),
  );
  return trainerIds.length;
}
