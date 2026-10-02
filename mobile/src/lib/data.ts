// Loads a month's worth of data from Supabase and assembles a RosterContext for
// the roster engine (rosterCompute.ts). Mirrors what the web app caches per month.
import { formatDate, monthRange } from './format';
import { makeRoster, type AssistAvail, type RosterContext } from './rosterCompute';
import { supabase } from './supabase';
import type {
  AvailabilityRow,
  DayClass,
  DowDefault,
  Settings,
  StaffMember,
} from './types';

function trimTime(t: string | null | undefined): string | null {
  return t ? String(t).slice(0, 5) : null;
}

const DEFAULT_SETTINGS: Settings = {
  min_students_for_one_assistant: 8,
  min_students_for_two_assistants: 16,
  default_class_times: seedDowDefaults(),
  assistant_slot_times: { '1': '08:30', '2': '09:00', '3': '09:30', '4': '10:00' },
  assistant_slot_times_by_start: {},
  weekend_first_sat_ht_id: null,
  rotate_dows: [],
};

function seedDowDefaults(): Record<string, DowDefault> {
  const out: Record<string, DowDefault> = {};
  for (let i = 0; i < 7; i++) {
    out[String(i)] = {
      am_start: '08:30',
      am_end: '12:00',
      pm_start: '13:00',
      pm_end: '15:30',
      students_am: 0,
      students_pm: 0,
      capped_am: false,
      capped_pm: false,
    };
  }
  return out;
}

// Normalise the cbd_auto_roster_rules row into Settings (mirrors web loadSettings).
export async function loadSettings(): Promise<Settings> {
  try {
    const { data } = await supabase
      .from('cbd_auto_roster_rules')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (!data) return DEFAULT_SETTINGS;

    let dct: Record<string, DowDefault> = data.default_class_times;
    if (!dct || typeof dct !== 'object' || Object.keys(dct).length === 0) {
      const globalDef: DowDefault = {
        am_start: trimTime(data.default_am_start_time) || '08:30',
        am_end: trimTime(data.default_am_end_time) || '12:00',
        pm_start: trimTime(data.default_pm_start_time) || '13:00',
        pm_end: trimTime(data.default_pm_end_time) || '15:30',
      };
      dct = {};
      for (let i = 0; i < 7; i++) dct[String(i)] = globalDef;
    } else {
      const norm: Record<string, DowDefault> = {};
      Object.keys(dct).forEach((k) => {
        const d: any = dct[k] || {};
        norm[k] = {
          am_start: trimTime(d.am_start) || '08:30',
          am_end: trimTime(d.am_end) || '12:00',
          pm_start: trimTime(d.pm_start) || '13:00',
          pm_end: trimTime(d.pm_end) || '15:30',
          students_am: parseInt(d.students_am, 10) || 0,
          students_pm: parseInt(d.students_pm, 10) || 0,
          capped_am: !!d.capped_am,
          capped_pm: !!d.capped_pm,
        };
      });
      dct = norm;
    }

    const stbs: Record<string, Record<string, string | null>> = {};
    const rawStbs = data.assistant_slot_times_by_start || {};
    Object.keys(rawStbs).forEach((amStart) => {
      const slots = rawStbs[amStart] || {};
      const normSlots: Record<string, string | null> = {};
      Object.keys(slots).forEach((k) => {
        normSlots[k] = trimTime(slots[k]);
      });
      stbs[trimTime(amStart) || amStart] = normSlots;
    });

    return {
      min_students_for_one_assistant: data.min_students_for_one_assistant,
      min_students_for_two_assistants: data.min_students_for_two_assistants,
      default_class_times: dct,
      assistant_slot_times:
        data.assistant_slot_times || {
          '1': '08:30',
          '2': '09:00',
          '3': '09:30',
          '4': '10:00',
        },
      assistant_slot_times_by_start: stbs,
      weekend_first_sat_ht_id: data.weekend_first_sat_ht_id || null,
      rotate_dows: Array.isArray(data.rotate_dows) ? data.rotate_dows : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface LoadedContext {
  ctx: RosterContext;
  staff: StaffMember[];
}

export async function loadRosterContext(
  year: number,
  month0: number,
): Promise<LoadedContext> {
  const { start, end } = monthRange(year, month0);

  const [settings, staffRes, availRes, classRes, assistRes, profRes, holRes] =
    await Promise.all([
      loadSettings(),
      supabase.from('cbd_staff_members').select('*').order('name'),
      supabase.from('cbd_availability').select('*').gte('date', start).lte('date', end),
      supabase.from('cbd_day_classes').select('*').gte('date', start).lte('date', end),
      supabase
        .from('cbd_assistant_availability')
        .select('*')
        .gte('date', start)
        .lte('date', end),
      supabase.from('cbd_profiles').select('id, available_dows'),
      supabase.from('cbd_public_holidays').select('date, label'),
    ]);

  const staff = (staffRes.data || []) as StaffMember[];

  const availabilityByStaff: Record<string, Record<string, AvailabilityRow>> = {};
  ((availRes.data || []) as AvailabilityRow[]).forEach((a) => {
    (availabilityByStaff[a.staff_id] = availabilityByStaff[a.staff_id] || {})[a.date] = a;
  });

  const dayClasses: Record<string, DayClass> = {};
  ((classRes.data || []) as DayClass[]).forEach((c) => {
    dayClasses[c.date] = c;
  });

  const assistantAvailByDate: Record<string, AssistAvail[]> = {};
  ((assistRes.data || []) as {
    date: string;
    user_id: string;
    is_available: boolean;
    note?: string | null;
  }[]).forEach((m) => {
    (assistantAvailByDate[m.date] = assistantAvailByDate[m.date] || []).push({
      user_id: m.user_id,
      is_available: m.is_available,
      note: m.note ?? null,
    });
  });

  const availableDowsByUserId: Record<string, number[]> = {};
  ((profRes.data || []) as { id: string; available_dows: number[] | null }[]).forEach((p) => {
    if (Array.isArray(p.available_dows)) availableDowsByUserId[p.id] = p.available_dows;
  });

  const publicHolidays: Record<string, unknown> = {};
  ((holRes.data || []) as { date: string }[]).forEach((h) => {
    publicHolidays[h.date] = true;
  });

  const ctx: RosterContext = {
    settings,
    staff,
    availabilityByStaff,
    dayClasses,
    assistantAvailByDate,
    availableDowsByUserId,
    publicHolidays,
    today: formatDate(new Date()),
  };
  return { ctx, staff };
}

// The linked-account user_ids of everyone rostered on a given date — i.e. the
// people a change to that date actually affects (used to target notifications).
// Loads a fresh context, so call it AFTER writing a change to get the new roster.
export async function rosteredUserIdsForDate(dateStr: string): Promise<string[]> {
  const p = dateStr.split('-');
  if (p.length < 3) return [];
  try {
    const { ctx } = await loadRosterContext(+p[0], +p[1] - 1);
    const engine = makeRoster(ctx);
    const out: string[] = [];
    engine.getRosterForDate(dateStr).forEach((r) => {
      const s = ctx.staff.find((st) => st.id === r.staff_id);
      if (s?.user_id) out.push(s.user_id);
    });
    return out;
  } catch {
    return [];
  }
}
