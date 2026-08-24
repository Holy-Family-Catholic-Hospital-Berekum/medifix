// components/themeToggle.jsx
import { useThemeMode } from "../src/ThemeModeContext";

export default function ThemeToggle({ className = "" }) {
  const { mode, toggleMode } = useThemeMode();
  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
        isDark ? "bg-slate-700" : "bg-white/20"
      } border border-white/20 ${className}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-200 ${
          isDark ? "translate-x-6" : "translate-x-0"
        }`}
      >
        <span className="material-symbols-outlined text-[13px] leading-none text-slate-700">
          {isDark ? "dark_mode" : "light_mode"}
        </span>
      </span>
    </button>
  );
}
