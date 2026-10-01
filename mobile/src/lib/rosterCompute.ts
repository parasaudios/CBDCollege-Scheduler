// Roster computation engine — a faithful port of the resolution logic in the web
// app (index.html): getEffectiveClassInfo / getEffectiveClassTimes / _isClassDay /
// computeRosterForDate / getRosterForDate / getEffectiveAvailability, plus the
// weekend Head-Trainer rotation rule and the head-trainer-full-time rule.
//
// It is a PURE module: no Supabase, no React Native, no globals. All state comes
// in via RosterContext, so it runs identically in the app and in the Node
// cross-check harness (scripts/xcheck) that diffs it against the web functions.
//
// Only `import type` is used (erased at runtime) and formatDate is inlined, so
// this file has zero runtime imports and can be executed standalone.
import type {
  AvailabilityRow,
  DayClass,
  DowDefault,
  Settings,
  StaffMember,
} from './types';

export interface AssistAvail {
  user_id: string;
  is_available: boolean;
  note?: string | null;
}

export interface RosterContext {
  settings: Settings;
  staff: StaffMember[];
  // availabilityByStaff[staffId][dateStr] -> explicit cbd_availability row
  availabilityByStaff: Record<string, Record<string, AvailabilityRow>>;
  // dayClasses[dateStr] -> cbd_day_classes row
  dayClasses: Record<string, DayClass>;
  // assistantAvailByDate[dateStr] -> per-date overrides (all users)
  assistantAvailByDate: Record<string, AssistAvail[]>;
  // availableDowsByUserId[userId] -> weekly pattern from cbd_profiles
  availableDowsByUserId: Record<string, number[]>;
  // publicHolidays[dateStr] -> truthy when the date is a public holiday
  publicHolidays: Record<string, unknown>;
  // formatDate(new Date()) at call time — injectable for deterministic testing
  today: string;
}

export interface ClassInfo {
  students_am: number;
  students_pm: number;
  capped_am: boolean;
  capped_pm: boolean;
  from_default: boolean;
  holiday?: boolean;
}

export interface ClassTimes {
  am_start: string | null;
  am_end: string | null;
  pm_start: string | null;
  pm_end: string | null;
  manual: boolean;
  holiday?: boolean;
}

export interface ComputedEntry {
  staff_id: string;
  name: string;
  color: string | null;
  day_role: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  note?: string | null;
  is_head_trainer: boolean;
  source: 'manual' | 'auto' | 'rule';
}

export interface EffAvail {
  staff_id: string;
  date: string;
  status: string;
  day_role: string;
  start_time: string | null;
  end_time: string | null;
  _computed?: boolean;
}

// --- weekend rule constants (mirror index.html) ---
const WEEKEND_ANCHOR_HT_NAME = 'cameron';
const WEEKEND_ANCHOR_SAT = new Date(2026, 9, 3); // Sat 3 Oct 2026

// Local YYYY-MM-DD (matches web formatDate).
function fmtDate(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function trimTime(t: string | null | undefined): string | null {
  return t ? String(t).slice(0, 5) : null;
}

export function makeRoster(ctx: RosterContext) {
  const settings = ctx.settings;

  function isPublicHoliday(dateStr: string): boolean {
    return !!ctx.publicHolidays[dateStr];
  }

  function getDayClass(dateStr: string): DayClass | null {
    return ctx.dayClasses[dateStr] || null;
  }

  function getAvailability(
    staffId: string,
    dateStr: string,
  ): AvailabilityRow | null {
    const s = ctx.availabilityByStaff[staffId];
    return (s && s[dateStr]) || null;
  }

  function dowDefaults(dateStr: string): DowDefault {
    const dct = settings.default_class_times || {};
    if (!dateStr) return dct['1'];
    const p = dateStr.split('-');
    const dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
    return (
      dct[String(dow)] ||
      dct['1'] || {
        am_start: null,
        am_end: null,
        pm_start: null,
        pm_end: null,
        students_am: 0,
        students_pm: 0,
        capped_am: false,
        capped_pm: false,
      }
    );
  }

  function getEffectiveClassInfo(dateStr: string): ClassInfo {
    if (isPublicHoliday(dateStr)) {
      return {
        students_am: 0,
        students_pm: 0,
        capped_am: false,
        capped_pm: false,
        from_default: true,
        holiday: true,
      };
    }
    const ci = getDayClass(dateStr);
    const def = dowDefaults(dateStr) || ({} as DowDefault);
    const hasRow = !!ci;
    const timesOnlyRow =
      hasRow &&
      !!ci!.times_manually_set &&
      (ci!.students_am || 0) === 0 &&
      (ci!.students_pm || 0) === 0 &&
      !ci!.capped_am &&
      !ci!.capped_pm;
    const useRow = hasRow && !timesOnlyRow;
    return {
      students_am: useRow ? ci!.students_am || 0 : def.students_am || 0,
      students_pm: useRow ? ci!.students_pm || 0 : def.students_pm || 0,
      capped_am: useRow ? !!ci!.capped_am : !!def.capped_am,
      capped_pm: useRow ? !!ci!.capped_pm : !!def.capped_pm,
      from_default: !useRow,
    };
  }

  function getEffectiveClassTimes(dateStr: string): ClassTimes {
    if (isPublicHoliday(dateStr)) {
      return {
        am_start: null,
        am_end: null,
        pm_start: null,
        pm_end: null,
        manual: false,
        holiday: true,
      };
    }
    const ci = getDayClass(dateStr);
    if (ci && ci.times_manually_set) {
      return {
        am_start: trimTime(ci.am_start_time),
        am_end: trimTime(ci.am_end_time),
        pm_start: trimTime(ci.pm_start_time),
        pm_end: trimTime(ci.pm_end_time),
        manual: true,
      };
    }
    const def = dowDefaults(dateStr);
    return {
      am_start: def.am_start,
      am_end: def.am_end,
      pm_start: def.pm_start,
      pm_end: def.pm_end,
      manual: false,
    };
  }

  function isClassDay(dateStr: string): boolean {
    if (isPublicHoliday(dateStr)) return false;
    const info = getEffectiveClassInfo(dateStr);
    return (
      (info.students_am || 0) > 0 ||
      (info.students_pm || 0) > 0 ||
      !!info.capped_am ||
      !!info.capped_pm ||
      info.from_default === false
    );
  }

  function availableDowsForStaff(staff: StaffMember): number[] {
    if (!staff || !staff.user_id) return [0, 1, 2, 3, 4, 5, 6];
    const dows = ctx.availableDowsByUserId[staff.user_id];
    if (Array.isArray(dows)) return dows;
    return [0, 1, 2, 3, 4, 5, 6];
  }

  function isStaffAvailableOnDate(staff: StaffMember, dateStr: string): boolean {
    if (!staff || !staff.user_id) return true;
    const entries = ctx.assistantAvailByDate[dateStr] || [];
    const entry = entries.find((e) => e.user_id === staff.user_id);
    if (entry) return !!entry.is_available;
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    return availableDowsForStaff(staff).indexOf(dow) >= 0;
  }

  function isExcludedFromDow(staff: StaffMember, dow: number): boolean {
    return (
      Array.isArray(staff.excluded_dows) && staff.excluded_dows.indexOf(dow) >= 0
    );
  }

  function effectivePriority(staff: StaffMember, dateStr: string): number {
    if (!staff) return 100;
    if (dateStr && staff.priorities_by_dow) {
      const p = dateStr.split('-');
      const dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
      const v = staff.priorities_by_dow[String(dow)];
      if (v != null && v !== '') return parseInt(v as string, 10);
    }
    return staff.priority != null ? parseInt(String(staff.priority), 10) : 100;
  }

  function monthlyDowIndex(dateStr: string): number {
    const p = dateStr.split('-');
    const year = +p[0],
      month = +p[1] - 1,
      dayNum = +p[2];
    const dow = new Date(year, month, dayNum).getDay();
    let count = 0;
    for (let i = 1; i < dayNum; i++) {
      if (new Date(year, month, i).getDay() === dow) count++;
    }
    return count;
  }

  function maybeRotate<T>(arr: T[], dateStr: string): T[] {
    if (!arr || arr.length < 2) return arr;
    const p = dateStr.split('-');
    const dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
    const rotateDows = settings.rotate_dows || [];
    if (rotateDows.indexOf(dow) < 0) return arr;
    const idx = monthlyDowIndex(dateStr);
    const k = ((idx % arr.length) + arr.length) % arr.length;
    return arr.slice(k).concat(arr.slice(0, k));
  }

  function globalWeekIndex(dateStr: string): number {
    const p = dateStr.split('-');
    const y = +p[0],
      mo = +p[1] - 1,
      dd = +p[2];
    const d = new Date(y, mo, dd);
    const satOffset = d.getDay() === 0 ? -1 : 0;
    const sat = new Date(y, mo, dd + satOffset);
    const anchor = new Date(2026, 0, 3);
    return Math.round((sat.getTime() - anchor.getTime()) / (7 * 86400000));
  }

  function slotTimesForAmStart(
    amStart: string | null,
  ): Record<string, string | null> {
    if (!amStart) return settings.assistant_slot_times || {};
    const byStart = settings.assistant_slot_times_by_start || {};
    if (byStart[amStart]) return byStart[amStart];
    return settings.assistant_slot_times || {};
  }

  function assistantsNeededForClass(ci: {
    students_am: number;
    students_pm: number;
  }): number {
    if (!ci) return 0;
    const biggest = Math.max(ci.students_am || 0, ci.students_pm || 0);
    if (biggest >= settings.min_students_for_two_assistants) return 2;
    if (biggest >= settings.min_students_for_one_assistant) return 1;
    return 0;
  }

  function pickHTForWeekend(
    availHTs: StaffMember[],
    dateStr: string,
  ): StaffMember | null {
    if (!availHTs || availHTs.length === 0) return null;
    if (availHTs.length === 1) return availHTs[0];
    const firstSatId =
      settings.weekend_first_sat_ht_id || (availHTs[0] && availHTs[0].id);
    const htA = availHTs.find((h) => h.id === firstSatId) || availHTs[0];
    const htB = availHTs.find((h) => h !== htA) || htA;
    const p = dateStr.split('-');
    const dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
    if (dow !== 0 && dow !== 6) return htA;
    const isSat = dow === 6;
    const weekendNum = globalWeekIndex(dateStr);
    let aPicks: boolean;
    if (weekendNum % 2 === 0) aPicks = isSat;
    else aPicks = !isSat;
    return aPicks ? htA : htB;
  }

  function computeRosterForDate(dateStr: string): ComputedEntry[] {
    const info = getEffectiveClassInfo(dateStr);
    if (!isClassDay(dateStr)) return [];
    const ci = {
      students_am: info.students_am,
      students_pm: info.students_pm,
      capped_am: info.capped_am,
      capped_pm: info.capped_pm,
    };
    const p = dateStr.split('-');
    const dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
    const times = getEffectiveClassTimes(dateStr);
    const slotTimes = slotTimesForAmStart(times.am_start);

    const hts = ctx.staff
      .filter(
        (s) =>
          s.is_head_trainer &&
          isStaffAvailableOnDate(s, dateStr) &&
          !isExcludedFromDow(s, dow),
      )
      .sort(
        (a, b) =>
          (a.priority || 100) - (b.priority || 100) ||
          a.name.localeCompare(b.name),
      );

    const entries: ComputedEntry[] = [];
    let rosteredHTs: StaffMember[] = [];
    if (hts.length > 0) {
      const isWeekend = dow === 0 || dow === 6;
      if (isWeekend) {
        const picked = pickHTForWeekend(hts, dateStr);
        if (picked) rosteredHTs = [picked];
      } else {
        rosteredHTs = hts.slice();
      }
    }
    rosteredHTs.forEach((ht) => {
      entries.push({
        staff_id: ht.id,
        name: ht.name,
        color: ht.color,
        day_role: 'head_trainer',
        status: 'available',
        start_time: times.am_start || null,
        end_time: times.pm_end || times.am_end || null,
        is_head_trainer: true,
        source: 'auto',
      });
    });

    const base = assistantsNeededForClass(ci);
    const htCount = rosteredHTs.length;
    const needed = Math.max(0, base - Math.max(0, htCount - 1));
    if (needed > 0) {
      let assists = ctx.staff
        .filter(
          (s) =>
            !s.is_head_trainer &&
            isStaffAvailableOnDate(s, dateStr) &&
            !isExcludedFromDow(s, dow),
        )
        .sort(
          (a, b) =>
            effectivePriority(a, dateStr) - effectivePriority(b, dateStr) ||
            a.name.localeCompare(b.name),
        );
      assists = maybeRotate(assists, dateStr);
      const picked = assists.slice(0, needed);
      picked.forEach((a, i) => {
        const slotKey = String(i + 1);
        const slotStart =
          trimTime(slotTimes[slotKey]) || times.am_start || null;
        entries.push({
          staff_id: a.id,
          name: a.name,
          color: a.color,
          day_role: 'assistant',
          status: 'available',
          start_time: slotStart,
          end_time: times.pm_end || times.am_end || null,
          is_head_trainer: false,
          source: 'auto',
        });
      });
    }

    return entries;
  }

  function ruleHTForDate(dateStr: string): StaffMember | null {
    const p = String(dateStr).split('-');
    if (p.length < 3) return null;
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) return null;
    if (dateStr < ctx.today) return null; // never touch past weekends
    const hts = ctx.staff.filter((s) => s.is_head_trainer);
    if (hts.length < 2) return null;
    const anchorHT = hts.find(
      (s) => (s.name || '').toLowerCase().indexOf(WEEKEND_ANCHOR_HT_NAME) !== -1,
    );
    if (!anchorHT) return null;
    const otherHT = hts.find((s) => s.id !== anchorHT.id);
    if (!otherHT) return null;
    const satOffset = dow === 0 ? -1 : 0;
    const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() + satOffset);
    const weeks = Math.round(
      (sat.getTime() - WEEKEND_ANCHOR_SAT.getTime()) / (7 * 86400000),
    );
    const anchorWorksSunday = (((weeks % 2) + 2) % 2) === 0;
    const satHT = anchorWorksSunday ? otherHT : anchorHT;
    const sunHT = anchorWorksSunday ? anchorHT : otherHT;
    const chosen = dow === 6 ? satHT : sunHT;
    if (!isStaffAvailableOnDate(chosen, dateStr)) return null;
    return chosen;
  }

  function applyWeekendHTRule(
    dateStr: string,
    roster: ComputedEntry[],
  ): ComputedEntry[] {
    const rHT = ruleHTForDate(dateStr);
    if (!rHT) return roster;
    const htEntries = roster.filter((r) => r.day_role === 'head_trainer');
    if (htEntries.length === 1 && htEntries[0].staff_id === rHT.id) return roster;
    if (htEntries.length === 0 && !isClassDay(dateStr)) return roster;
    const template = htEntries[0] || null;
    const times = getEffectiveClassTimes(dateStr);
    const out = roster.filter((r) => r.day_role !== 'head_trainer');
    out.push({
      staff_id: rHT.id,
      name: rHT.name,
      color: rHT.color,
      day_role: 'head_trainer',
      status: (template && template.status) || 'available',
      start_time: template ? template.start_time : times.am_start || null,
      end_time: template
        ? template.end_time
        : times.pm_end || times.am_end || null,
      note: (template && template.note) || '',
      is_head_trainer: true,
      source: 'rule',
    });
    return out;
  }

  function getRosterForDate(dateStr: string): ComputedEntry[] {
    const explicit: ComputedEntry[] = [];
    ctx.staff.forEach((s) => {
      const e = getAvailability(s.id, dateStr);
      if (e) {
        explicit.push({
          staff_id: s.id,
          name: s.name,
          color: s.color,
          day_role: e.day_role || 'assistant',
          status: e.status,
          start_time: e.start_time,
          end_time: e.end_time,
          note: (e as any).note,
          is_head_trainer: !!s.is_head_trainer,
          source: 'manual',
        });
      }
    });
    const roster = explicit.length > 0 ? explicit : computeRosterForDate(dateStr);
    return applyWeekendHTRule(dateStr, roster);
  }

  function getEffectiveAvailability(
    staffId: string,
    dateStr: string,
  ): EffAvail | null {
    const st = ctx.staff.find((s) => s.id === staffId);
    if (st && st.is_head_trainer && ruleHTForDate(dateStr)) {
      const mine = getRosterForDate(dateStr).find(
        (r) => r.staff_id === staffId && r.day_role === 'head_trainer',
      );
      return mine
        ? {
            staff_id: staffId,
            date: dateStr,
            status: mine.status,
            day_role: 'head_trainer',
            start_time: mine.start_time,
            end_time: mine.end_time,
            _computed: true,
          }
        : null;
    }
    const explicit = getAvailability(staffId, dateStr);
    if (explicit) {
      return {
        staff_id: staffId,
        date: dateStr,
        status: explicit.status,
        day_role: explicit.day_role || 'assistant',
        start_time: explicit.start_time,
        end_time: explicit.end_time,
      };
    }
    const computed = computeRosterForDate(dateStr);
    const match = computed.find((e) => e.staff_id === staffId);
    return match
      ? {
          staff_id: match.staff_id,
          date: dateStr,
          status: match.status,
          day_role: match.day_role,
          start_time: match.start_time,
          end_time: match.end_time,
          _computed: true,
        }
      : null;
  }

  return {
    isPublicHoliday,
    getEffectiveClassInfo,
    getEffectiveClassTimes,
    isClassDay,
    computeRosterForDate,
    getRosterForDate,
    getEffectiveAvailability,
    isStaffAvailableOnDate,
    ruleHTForDate,
  };
}

export type RosterEngine = ReturnType<typeof makeRoster>;
