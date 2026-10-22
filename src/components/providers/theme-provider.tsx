"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "system" | "light" | "dark";
export type Accent = "forest" | "ocean" | "plum" | "ember";
export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "forest", label: "Forest", swatch: "#14583a" },
  { value: "ocean", label: "Ocean", swatch: "#2563c9" },
  { value: "plum", label: "Plum", swatch: "#7c3fb0" },
  { value: "ember", label: "Ember", swatch: "#c2491d" },
];
const KEY = "theme";
const ACCENT_KEY = "accent";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; accent: Accent; setAccent: (a: Accent) => void }>({
  theme: "system",
  setTheme: () => undefined,
  accent: "forest",
  setAccent: () => undefined,
});

function applyAccent(a: Accent) {
  const el = document.documentElement;
  if (a === "forest") el.removeAttribute("data-accent");
  else el.setAttribute("data-accent", a);
}

function apply(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [accent, setAccentState] = useState<Accent>("forest");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data / syncs external state on mount
        setThemeState(saved);
        apply(saved);
      }
      const a = localStorage.getItem(ACCENT_KEY);
      if (a === "ocean" || a === "plum" || a === "ember") {
        setAccentState(a);
        applyAccent(a);
      }
    } catch {
      /* storage unavailable: stay on the system theme */
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a);
    applyAccent(a);
    try {
      if (a === "forest") localStorage.removeItem(ACCENT_KEY);
      else localStorage.setItem(ACCENT_KEY, a);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme, accent, setAccent }), [theme, setTheme, accent, setAccent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
