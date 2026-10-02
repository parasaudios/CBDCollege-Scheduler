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

  const pushBody: Record<string, any> = {
    title: opts.title,
    body: opts.message,
    message: opts.message,
    data,
    tag: 'cbd-' + (opts.type || 'notif'),
  };
  if (opts.target_user_id) pushBody.target_user_id = opts.target_user_id;
  // Web push (existing) + native push (Expo tokens). Both fire-and-forget.
  try {
    supabase.functions.invoke('send-push', { body: pushBody }).catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    supabase.functions.invoke('send-native-push', { body: pushBody }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// The developer (Cameron, the weekend-anchor head trainer) is notified of every
// change; plus the full trainer list as a safety fallback.
async function recipientInfra(): Promise<{ developer: string | null; trainers: string[] }> {
  const [staffRes, profRes] = await Promise.all([
    supabase.from('cbd_staff_members').select('user_id, name').not('user_id', 'is', null),
    supabase.from('cbd_profiles').select('id, role'),
  ]);
  const staff = (staffRes.data || []) as { user_id: string; name: string | null }[];
  const profs = (profRes.data || []) as { id: string; role: string | null }[];
  const trainers = profs.filter((p) => p.role === 'trainer').map((p) => p.id);
  const cam = staff.find((s) => (s.name || '').toLowerCase().includes('cameron'));
  return { developer: cam?.user_id ?? null, trainers };
}

// All trainer user_ids — recipients for non-dated changes (weekly patterns,
// default class times) that don't map to a single day's roster.
export async function allTrainerUserIds(): Promise<string[]> {
  const { data } = await supabase.from('cbd_profiles').select('id, role');
  return ((data || []) as { id: string; role: string | null }[])
    .filter((p) => p.role === 'trainer')
    .map((p) => p.id);
}

// Fan a change out to exactly the people it affects, one targeted row each:
//   recipients = affected (rostered that day) ∪ subject ∪ Cameron − actor
// The actor never gets notified of their own action; Cameron always is. The
// subject (the person the change is about) gets `selfTitle` ("Your …"); everyone
// else gets `title` ("<name>'s …"), so no one ever sees a mislabelled "Your".
export async function notifyChange(opts: {
  type: string;
  actorId: string;
  actorName: string;
  subjectUserId?: string | null;
  subjectName?: string | null;
  affectedUserIds?: (string | null | undefined)[];
  selfTitle?: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}): Promise<void> {
  const { developer, trainers } = await recipientInfra();
  const set = new Set<string>();
  (opts.affectedUserIds || []).forEach((u) => {
    if (u) set.add(u);
  });
  if (opts.subjectUserId) set.add(opts.subjectUserId);
  if (developer) set.add(developer);
  else trainers.forEach((t) => set.add(t)); // fallback so Cameron (a trainer) is still covered
  set.delete(opts.actorId);
  if (set.size === 0) return;

  const data = {
    subject_user_id: opts.subjectUserId ?? null,
    subject_name: opts.subjectName ?? null,
    ...(opts.data || {}),
  };
  await Promise.all(
    [...set].map((uid) =>
      emitNotification({
        type: opts.type,
        title: opts.selfTitle && uid === opts.subjectUserId ? opts.selfTitle : opts.title,
        message: opts.message,
        target_user_id: uid,
        actorId: opts.actorId,
        actorName: opts.actorName,
        data,
      }),
    ),
  );
}
