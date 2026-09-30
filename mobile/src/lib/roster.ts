import type { AvailabilityRow, RosterEntry, StaffMember } from './types';

// Build a display roster from EXPLICIT availability rows (the authoritative,
// saved roster — what the web app's getRosterForDate prefers). The computed
// fallback for unsaved days (weekend rotation, HT full-time, assistant scaling)
// is ported in a later milestone.
export function buildExplicitRoster(
  avail: AvailabilityRow[],
  staff: StaffMember[],
): RosterEntry[] {
  const byId: Record<string, StaffMember> = {};
  staff.forEach((s) => {
    byId[s.id] = s;
  });
  return avail
    .filter((a) => a.status === 'available')
    .map((a) => {
      const s = byId[a.staff_id];
      return {
        staff_id: a.staff_id,
        name: s?.name || 'Unknown',
        color: s?.color || null,
        day_role: a.day_role,
        is_head_trainer: !!s?.is_head_trainer,
        start_time: a.start_time,
        end_time: a.end_time,
      };
    })
    .sort((a, b) => {
      // Head trainers first, then alphabetical.
      if (a.is_head_trainer !== b.is_head_trainer) return a.is_head_trainer ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function roleLabel(entry: RosterEntry): string {
  if (entry.is_head_trainer) return 'Head Trainer';
  if (entry.day_role === 'assistant') return 'Assistant';
  return 'Trainer';
}
