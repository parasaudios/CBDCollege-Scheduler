// Shapes mirrored from the web app's Supabase tables. Only the columns the
// mobile app currently reads are typed; extend as later milestones need more.

export type Role = 'trainer' | 'assistant' | string;

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  available_dows?: number[] | null;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  user_id: string | null;
  priority: number | null;
  is_head_trainer: boolean | null;
}

export type DayRole = 'head_trainer' | 'assistant' | string;
export type AvailabilityStatus = 'available' | 'unavailable' | string;

export interface AvailabilityRow {
  id?: string;
  staff_id: string;
  date: string; // YYYY-MM-DD
  status: AvailabilityStatus;
  day_role: DayRole | null;
  start_time: string | null;
  end_time: string | null;
}

export interface DayClass {
  date: string; // YYYY-MM-DD
  students_am: number | null;
  students_pm: number | null;
  capped_am?: boolean | null;
  capped_pm?: boolean | null;
  times_manually_set?: boolean | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any> | null;
  target_user_id: string | null;
  created_at: string;
}

// A resolved roster entry ready to render (staff joined onto their availability).
export interface RosterEntry {
  staff_id: string;
  name: string;
  color: string | null;
  day_role: DayRole | null;
  is_head_trainer: boolean;
  start_time: string | null;
  end_time: string | null;
}
