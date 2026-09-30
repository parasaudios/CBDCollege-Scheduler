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
  priorities_by_dow?: Record<string, any> | null;
  excluded_dows?: number[] | null;
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
  am_start_time?: string | null;
  am_end_time?: string | null;
  pm_start_time?: string | null;
  pm_end_time?: string | null;
}

export interface DowDefault {
  am_start: string | null;
  am_end: string | null;
  pm_start: string | null;
  pm_end: string | null;
  students_am?: number;
  students_pm?: number;
  capped_am?: boolean;
  capped_pm?: boolean;
}

export interface Settings {
  min_students_for_one_assistant: number;
  min_students_for_two_assistants: number;
  default_class_times: Record<string, DowDefault>;
  assistant_slot_times?: Record<string, string | null>;
  assistant_slot_times_by_start?: Record<string, Record<string, string | null>>;
  weekend_first_sat_ht_id?: string | null;
  rotate_dows?: number[];
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
