// src/ThemeModeContext.jsx
import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "themeMode"; // "light" | "dark"
const ThemeModeContext = createContext(null);

function getInitialMode() {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // Fall back to the OS/browser preference on first visit.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    // Keeping the `dark` class on <html> too, in case any native form
    // controls (date pickers, scrollbars) or future Tailwind dark:
    // utilities need it — costs nothing to keep in sync.
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);

  // Only follow OS changes if the user hasn't explicitly chosen a mode.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setMode(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleMode = () => setMode((m) => (m === "dark" ? "light" : "dark"));

  return (
    <ThemeModeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return ctx;
}
