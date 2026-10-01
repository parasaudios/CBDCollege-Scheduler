// Display helpers for roster entries produced by the roster engine.

export function roleLabel(entry: {
  is_head_trainer: boolean;
  day_role: string | null;
}): string {
  if (entry.is_head_trainer) return 'Head Trainer';
  if (entry.day_role === 'assistant') return 'Assistant';
  return 'Trainer';
}
