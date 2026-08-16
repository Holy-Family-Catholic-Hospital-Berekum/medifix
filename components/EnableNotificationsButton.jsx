import { useState, useEffect } from "react";
import { usePushNotifications } from "../hooks/usePushNotification";

const DISMISS_KEY = "phix_notif_banner_dismissed";
const AUTO_HIDE_MS = 4000;

// Floating pill, fixed to a corner by default so it works the same
// regardless of which page/theme it's dropped into. Adjust the className
// prop if you'd rather position it inline inside a specific NavBar instead.
export default function EnableNotificationsButton({ className = "" }) {
  const { permission, status, error, enable } = usePushNotifications();

  // The "granted" confirmation is a toast, not a permanent fixture — it
  // shows briefly to confirm the action worked, then gets out of the way.
  // sessionStorage means it won't nag again on every page within the same
  // browser session once the user has seen or dismissed it once.
  const [showGrantedToast, setShowGrantedToast] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) !== "true",
  );

  useEffect(() => {
    if (permission !== "granted" || status === "error" || !showGrantedToast) {
      return;
    }
    const t = setTimeout(() => dismissGrantedToast(), AUTO_HIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, status, showGrantedToast]);

  const dismissGrantedToast = () => {
    setShowGrantedToast(false);
    sessionStorage.setItem(DISMISS_KEY, "true");
  };

  const baseClass =
    "fixed top-4 right-4 z-[200] text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition";

  if (permission === "unsupported") return null;

  if (permission === "granted" && status !== "error") {
    if (!showGrantedToast) return null;
    return (
      <span
        className={`${baseClass} bg-white/90 text-emerald-700 border border-emerald-200 flex items-center gap-2 ${className}`}
      >
        🔔 Notifications on
        <button
          type="button"
          onClick={dismissGrantedToast}
          aria-label="Dismiss"
          className="text-emerald-700/60 hover:text-emerald-700 font-bold leading-none cursor-pointer"
        >
          ×
        </button>
      </span>
    );
  }

  if (permission === "denied") {
    return (
      <span
        className={`${baseClass} bg-white/90 text-gray-500 border border-gray-200 cursor-help ${className}`}
        title="Notifications were blocked in your browser. Re-enable them from your browser's site settings (usually the padlock icon next to the address bar) to receive updates."
      >
        🔕 Notifications blocked
      </span>
    );
  }

  return (
    <div
      className={`fixed top-4 right-4 z-[200] flex flex-col items-end gap-1 ${className}`}
    >
      <button
        type="button"
        onClick={enable}
        disabled={status === "enabling"}
        className="text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg bg-white/90 text-gray-800 border border-gray-200 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "enabling" ? "Enabling…" : "🔔 Enable notifications"}
      </button>
      {status === "error" && error && (
        <span className="text-[10px] text-red-600 bg-white/90 px-2 py-1 rounded-lg shadow max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}
