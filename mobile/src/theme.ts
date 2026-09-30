// Colour palette mirrored from the web app (index.html :root / [data-theme=dark]).
// Keeping the two apps visually consistent so trainers/assistants see the same brand.

export type Palette = {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  success: string;
  successLight: string;
  successBorder: string;
  warning: string;
  warningLight: string;
  warningBorder: string;
  danger: string;
  dangerLight: string;
  dangerBorder: string;
  holiday: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  onPrimary: string;
};

export const lightPalette: Palette = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primaryLight: '#dbeafe',
  success: '#16a34a',
  successLight: '#bbf7d0',
  successBorder: '#86efac',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  warningBorder: '#fcd34d',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  dangerBorder: '#fca5a5',
  holiday: '#a855f7',
  surface: '#ffffff',
  surface2: '#f9fafb',
  surface3: '#f3f4f6',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  textMuted: '#6b7280',
  onPrimary: '#ffffff',
};

export const darkPalette: Palette = {
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryLight: 'rgba(59,130,246,0.18)',
  success: '#22c55e',
  successLight: 'rgba(34,197,94,0.18)',
  successBorder: 'rgba(34,197,94,0.5)',
  warning: '#f59e0b',
  warningLight: 'rgba(245,158,11,0.18)',
  warningBorder: 'rgba(245,158,11,0.5)',
  danger: '#ef4444',
  dangerLight: 'rgba(239,68,68,0.18)',
  dangerBorder: 'rgba(239,68,68,0.5)',
  holiday: '#c084fc',
  surface: '#1e2433',
  surface2: '#161b28',
  surface3: '#0f1320',
  border: '#2e3548',
  borderStrong: '#424a5e',
  textPrimary: '#f3f4f6',
  textSecondary: '#d1d5db',
  textMuted: '#9ca3af',
  onPrimary: '#ffffff',
};

// The header/hero gradient is always the blue brand gradient in both themes.
export const HEADER_GRADIENT = ['#2563eb', '#1d4ed8'] as const;
export const HERO_GRADIENT = ['#2563eb', '#1e40af'] as const;

export const radius = 12;
export const spacing = (n: number) => n * 4;

export function paletteFor(scheme: string | null | undefined): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}
