// Colour palette mirrored from the web app (index.html :root / [data-theme=dark]).
// Keeping the two apps visually consistent so trainers/assistants see the same brand.

export type Palette = {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
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
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  surface: '#ffffff',
  surface2: '#f9fafb',
  surface3: '#f3f4f6',
  border: '#e5e7eb',
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
  warning: '#f59e0b',
  warningLight: 'rgba(245,158,11,0.18)',
  danger: '#ef4444',
  dangerLight: 'rgba(239,68,68,0.18)',
  surface: '#1e2433',
  surface2: '#161b28',
  surface3: '#0f1320',
  border: '#2e3548',
  textPrimary: '#f3f4f6',
  textSecondary: '#d1d5db',
  textMuted: '#9ca3af',
  onPrimary: '#ffffff',
};

export const radius = 12;
export const spacing = (n: number) => n * 4;

// Accepts React Native's ColorSchemeName ('light' | 'dark' | 'unspecified' | null).
export function paletteFor(scheme: string | null | undefined): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}
