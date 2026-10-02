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
  warningLight: '#fde68a',
  warningBorder: '#fcd34d',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  dangerBorder: '#fca5a5',
  holiday: '#a855f7',
  surface: '#ffffff',
  // Page background sits clearly behind white cards so they lift off it.
  surface2: '#eceff4',
  surface3: '#e2e6ee',
  border: '#dce0e8',
  borderStrong: '#c3c9d4',
  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  textMuted: '#6b7280',
  onPrimary: '#ffffff',
};

export const darkPalette: Palette = {
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryLight: 'rgba(59,130,246,0.26)',
  success: '#34d058',
  successLight: 'rgba(34,197,94,0.28)',
  successBorder: 'rgba(34,197,94,0.6)',
  warning: '#fbbf24',
  warningLight: 'rgba(245,158,11,0.28)',
  warningBorder: 'rgba(245,158,11,0.6)',
  danger: '#f87171',
  dangerLight: 'rgba(248,113,113,0.26)',
  dangerBorder: 'rgba(248,113,113,0.6)',
  holiday: '#c084fc',
  // Clear three-step hierarchy: page (darkest) < card < raised/input.
  surface: '#212a3c',
  surface2: '#0e121b',
  surface3: '#2b3547',
  border: '#394459',
  borderStrong: '#4a566e',
  textPrimary: '#f3f4f6',
  textSecondary: '#cbd3e1',
  textMuted: '#9aa6bd',
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
