// Admin user management — mirrors the web app's adminAPI (the admin-users edge fn).
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import { supabase } from './supabase';

export interface AdminUser {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

async function adminAPI(action: string, method: 'POST' | 'DELETE', body?: Record<string, any>) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users?action=${action}`, {
    method,
    headers: {
      Authorization: 'Bearer ' + session.access_token,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('cbd_list_users');
  if (error) throw error;
  return (data || []) as AdminUser[];
}

// bare username -> @cbdcollege.edu.au (matches web cbdEmailFromInput)
export function emailFromInput(raw: string): string {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return '';
  return v.indexOf('@') === -1 ? v + '@cbdcollege.edu.au' : v;
}

export async function createUser(fullName: string, email: string, password: string, role: string, createdBy: string) {
  const created = await adminAPI('create', 'POST', { email, password, full_name: fullName, role });
  // Auto-create a linked staff member so the person shows on schedules.
  const newId = created?.user?.id;
  if (newId) {
    await supabase.from('cbd_staff_members').insert({
      name: fullName.slice(0, 100),
      role: '',
      color: '#2563eb',
      user_id: newId,
      priority: 100,
      is_head_trainer: false,
      created_by: createdBy,
    });
  }
  return created;
}

export async function deleteUser(userId: string) {
  return adminAPI('delete', 'DELETE', { user_id: userId });
}
export async function setUserPassword(userId: string, password: string) {
  return adminAPI('set-password', 'POST', { user_id: userId, password });
}
export async function setUserEmail(userId: string, email: string) {
  return adminAPI('set-email', 'POST', { user_id: userId, email });
}
export async function setUserRole(userId: string, role: string) {
  const { error } = await supabase.from('cbd_profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

// 14-char strong password, no ambiguous characters (matches the web generator's intent).
export function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
