import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { darkPalette, lightPalette, type Palette } from './theme';

type Mode = 'system' | 'light' | 'dark';
const STORE_KEY = 'cbd_theme_mode';

interface ThemeCtx {
  palette: Palette;
  effective: 'light' | 'dark';
  mode: Mode;
  setMode: (m: Mode) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  function setMode(m: Mode) {
    setModeState(m);
    AsyncStorage.setItem(STORE_KEY, m).catch(() => {});
  }

  const effective: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeCtx>(
    () => ({
      palette: effective === 'dark' ? darkPalette : lightPalette,
      effective,
      mode,
      setMode,
      toggle: () => setMode(effective === 'dark' ? 'light' : 'dark'),
    }),
    [effective, mode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used within ThemeProvider');
  return c;
}
