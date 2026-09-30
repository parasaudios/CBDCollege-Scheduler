// Notification type → label/icon/tone, mirroring the web app's _notifTypeMeta.
import type { Palette } from '../theme';

export interface NotifMeta {
  label: string;
  icon: string;
  accent: (p: Palette) => string;
}

export function notifTypeMeta(type: string): NotifMeta {
  switch (type) {
    case 'roster_changed':
      return { label: 'Roster change', icon: '📅', accent: (p) => p.primary };
    case 'availability_changed_by_trainer':
      return { label: 'Availability change', icon: '🗓️', accent: (p) => p.primary };
    case 'availability_changed_by_assistant':
      return { label: 'Availability change', icon: '🗓️', accent: (p) => p.warning };
    case 'class_changed':
    case 'class_time_changed':
    case 'default_class_times_changed':
      return { label: 'Class update', icon: '🎓', accent: (p) => p.primary };
    case 'vasto_staffing_changed':
      return { label: 'Staffing change', icon: '👥', accent: (p) => p.warning };
    case 'manual_announcement':
      return { label: 'Announcement', icon: '📣', accent: (p) => p.primary };
    case 'start_time_changed':
    case 'rules_changed':
      return { label: 'Update', icon: '🔔', accent: (p) => p.textMuted };
    default:
      return { label: 'Update', icon: '🔔', accent: (p) => p.textMuted };
  }
}
