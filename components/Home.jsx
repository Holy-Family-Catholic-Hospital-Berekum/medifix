import { markOverdueReports, markReportViewed } from "../src/utils";
import NavBar from "./navBar";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import SlideInRight from "../components/slideInRight";
import { NavLink } from "react-router";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";
import { useThemeMode } from "../src/ThemeModeContext";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  doc,
  getDocs,
  getCountFromServer,
  arrayUnion,
  writeBatch,
} from "firebase/firestore";
import { db } from "../src/firebase";

import { getAuth, onAuthStateChanged } from "firebase/auth";

// ─── Live auth uid ───────────────────────────────────────────────────────
// currentUser is only populated once Firebase finishes restoring the
// session — reading it once at module load nearly always races that and
// gets `undefined`, which then never updates. onAuthStateChanged fires
// once the real state is known (and again on sign-in/out), so this stays
// correct instead of freezing at whatever was true at import time.
function useAuthUid() {
  const [uid, setUid] = useState(() => getAuth().currentUser?.uid ?? null);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), (u) => {
      setUid(u?.uid ?? null);
    });
    return unsubscribe;
  }, []);
  return uid;
}

// ─── Countdown hook ──────────────────────────────────────────────────────────
function useCountdown(dateDue) {
  const getTimeLeft = () => {
    let due = null;
    if (dateDue?.toDate) due = dateDue.toDate();
    else if (dateDue instanceof Date) due = dateDue;
    else if (dateDue) due = new Date(dateDue);
    if (!due || isNaN(due.getTime())) return null;
    const diff = due - Date.now();
    if (diff <= 0) return { overdue: true };
    const days = Math.floor(diff / 864e5);
    const hours = Math.floor((diff % 864e5) / 36e5);
    const mins = Math.floor((diff % 36e5) / 6e4);
    const secs = Math.floor((diff % 6e4) / 1e3);
    return { days, hours, mins, secs, overdue: false };
  };
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);
  useEffect(() => {
    setTimeLeft(getTimeLeft());
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [dateDue]);
  return timeLeft;
}

const TERMINAL_STATUSES = ["closed", "completed"];

function Countdown({ dateDue, status, bgColor }) {
  const t = useCountdown(dateDue);
  if (TERMINAL_STATUSES.includes(status) || !t) return null;
  if (t.overdue)
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300 bg-red-950/70 border border-red-700/40 px-2 py-0.5 rounded-full tracking-wide">
        <span className="material-symbols-outlined text-[12px] leading-none">
          warning
        </span>
        Overdue
      </span>
    );
  return (
    <div
      className={`flex items-center gap-1.5 ${bgColor} border border-white/10 px-2 py-1 rounded-lg shadow-sm`}
    >
      {t.days > 0 && (
        <span className="text-[12px] font-mono text-slate-900">{t.days}d</span>
      )}
      <span className="text-[11px] font-mono font-semibold text-white tabular-nums">
        {String(t.hours).padStart(2, "0")}:{String(t.mins).padStart(2, "0")}:
        {String(t.secs).padStart(2, "0")}
      </span>
      <span className="text-[9px] text-white/75 uppercase tracking-wide">
        left
      </span>
    </div>
  );
}

function timeAgo(date) {
  if (!date) return null;
  let d = date?.toDate
    ? date.toDate()
    : date instanceof Date
      ? date
      : new Date(date);
  if (!d || isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 6e4);
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(diff / 864e5);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

// Live-updating version of timeAgo — refreshes once a minute so
// "Work started Xd ago" doesn't go stale on a card left open.
function useLiveTimeAgo(date) {
  const [label, setLabel] = useState(() => timeAgo(date));
  useEffect(() => {
    setLabel(timeAgo(date));
    const id = setInterval(() => setLabel(timeAgo(date)), 60_000);
    return () => clearInterval(id);
  }, [date]);
  return label;
}

// ─── Search & time-filter helpers ───────────────────────────────────────────
const TIME_FILTERS = [
  { value: "overall", label: "Overall" },
  { value: "thisWeek", label: "This Week" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "thisYear", label: "This Year" },
  { value: "lastYear", label: "Last Year" },
];

// Returns JS Date bounds ({start, end}) for a time filter, or null for
// "overall". `end: null` means "no upper bound" (thisWeek runs to now).
// These bounds are now pushed down into the Firestore query itself
// (where("dateSent", ">=", start) / where("dateSent", "<", end)) instead
// of being applied client-side after fetching everything.
function getTimeRangeBounds(filter) {
  const now = new Date();
  switch (filter) {
    case "thisWeek": {
      const start = new Date(now);
      const day = start.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      return { start, end: null };
    }
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start, end };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
    case "thisYear": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      return { start, end };
    }
    case "lastYear": {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear(), 0, 1);
      return { start, end };
    }
    default:
      return null;
  }
}

function matchesSearch(report, searchQuery) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  return (
    report.category?.toLowerCase().includes(q) ||
    report.priorityLevel?.toLowerCase().includes(q)
  );
}

function toJsDate(value) {
  if (!value) return null;
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d?.getTime?.()) ? null : d;
}

// Purely a DISPLAY-order helper — never used inside a Firestore query.
// Sorts an already-fetched page of docs by the section's own relevant
// date field (e.g. dateAccepted, dateClosed), falling back to dateSent
// (guaranteed on every report) when that field is missing on a given
// doc, and finally to epoch so it never throws. This restores the
// original per-section visual ordering without requiring Firestore's
// orderBy() to see that field on every document — see note above
// useSectionData for why orderBy(dateField) is unsafe.
function sortByDateFieldForDisplay(docs, dateField) {
  return [...docs].sort((a, b) => {
    const aDate = toJsDate(a[dateField]) || toJsDate(a.dateSent) || new Date(0);
    const bDate = toJsDate(b[dateField]) || toJsDate(b.dateSent) || new Date(0);
    return bDate - aDate;
  });
}

// ─── Birthday celebration helpers ───────────────────────────────────────────
function isBirthdayToday(birthdate) {
  if (!birthdate || typeof birthdate !== "string") return false;
  const parts = birthdate.split("-").map(Number);
  if (parts.length !== 3) return false;
  const [, month, day] = parts;
  if (!month || !day) return false;
  const today = new Date();
  return month === today.getMonth() + 1 && day === today.getDate();
}

function getBirthdaySeenKey(userObj) {
  if (!userObj?.birthdate || typeof userObj.birthdate !== "string") return null;
  const parts = userObj.birthdate.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [, month, day] = parts;
  if (!month || !day) return null;
  const year = new Date().getFullYear();
  const userKey = userObj.ID || userObj.email || "guest";
  return `birthdayCelebration:${userKey}:${year}-${month}-${day}`;
}

function getFirstName(userObj) {
  return userObj?.name?.trim().split(" ")[0] || "there";
}

function BirthdayBanner({ name, onDismiss, isDarkMode }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(t);
  }, []);

  const palette = isDarkMode
    ? {
        shell:
          "border border-white/10 bg-[#160f24] shadow-[0_30px_80px_rgba(0,0,0,0.6)]",
        headlineFrom: "from-[#FF5FA2]",
        headlineVia: "via-[#FFB84D]",
        headlineTo: "to-[#7C6FFF]",
        sub: "text-white/60",
        badge: "border border-white/15 bg-white/5 text-white/80",
        button:
          "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
        balloons: ["#FF5FA2", "#7C6FFF", "#3EE0C4", "#FFB84D"],
        sparkle: "#FFD84D",
      }
    : {
        shell:
          "border border-white/60 bg-white shadow-[0_30px_70px_rgba(255,62,138,0.25)]",
        headlineFrom: "from-[#FF3E8A]",
        headlineVia: "via-[#FF7A3E]",
        headlineTo: "to-[#7C4DFF]",
        sub: "text-slate-500",
        badge: "border border-[#FF3E8A]/20 bg-[#FFF1F6] text-[#D6256B]",
        button:
          "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800",
        balloons: ["#FF3E8A", "#7C4DFF", "#1FC8A0", "#FF9F3E"],
        sparkle: "#FF9F3E",
      };

  return (
    <div className="fixed inset-x-0 top-4 z-[120] flex justify-center px-4 pointer-events-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap');
        @keyframes balloon-float {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-10px) rotate(3deg); }
        }
        @keyframes sparkle-twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.7) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.15) rotate(20deg); }
        }
        @keyframes banner-pop {
          0% { transform: scale(0.85) translateY(-14px); opacity: 0; }
          65% { transform: scale(1.02) translateY(2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .banner-pop-in { animation: banner-pop 520ms cubic-bezier(.22,1.4,.36,1) both; }
        .balloon { animation: balloon-float 3.4s ease-in-out infinite; }
        .sparkle { animation: sparkle-twinkle 2.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .banner-pop-in, .balloon, .sparkle { animation: none !important; }
        }
      `}</style>

      <div
        className={`pointer-events-auto relative w-full max-w-lg overflow-hidden rounded-[28px] ${palette.shell} ${
          entered ? "banner-pop-in" : "opacity-0"
        }`}
      >
        {/* Balloons drifting along the bottom edge, clipped to the card */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden">
          {palette.balloons.map((color, i) => (
            <span
              key={i}
              className="balloon absolute bottom-[-6px] block h-7 w-6 rounded-[50%_50%_50%_50%/60%_60%_40%_40%]"
              style={{
                left: `${10 + i * 24}%`,
                backgroundColor: color,
                opacity: 0.85,
                animationDelay: `${i * 0.35}s`,
                animationDuration: `${3 + i * 0.4}s`,
              }}
            />
          ))}
        </div>

        {/* Sparkles */}
        <span
          className="sparkle absolute right-10 top-4 text-lg"
          style={{ color: palette.sparkle }}
        >
          ✦
        </span>
        <span
          className="sparkle absolute right-24 top-8 text-xs"
          style={{ color: palette.sparkle, animationDelay: "0.6s" }}
        >
          ✦
        </span>
        <span
          className="sparkle absolute left-16 top-3 text-sm"
          style={{ color: palette.sparkle, animationDelay: "1.1s" }}
        >
          ✦
        </span>

        <div className="relative flex items-start gap-4 px-6 py-5">
          <div className="min-w-0 flex-1">
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${palette.badge}`}
            >
              It's your day
            </span>
            <p
              className={`mt-2 bg-gradient-to-r ${palette.headlineFrom} ${palette.headlineVia} ${palette.headlineTo} bg-clip-text text-transparent text-3xl md:text-4xl leading-none`}
              style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 600 }}
            >
              Happy Birthday, {name}!
            </p>
            <p className={`mt-2 text-sm ${palette.sub}`}>
              Phix wishes you a birthday as great as you are.
            </p>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className={`shrink-0 rounded-full p-2 transition ${palette.button}`}
            aria-label="Dismiss birthday message"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">
              close
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Small helper so the shell string stays readable above
function classes(palette) {
  return palette.shell;
}

function BirthdayConfetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 90 }, (_, index) => ({
      id: index,
      left: Math.random() * 100,
      delay: Math.random() * 1.4,
      duration: 2.6 + Math.random() * 2.8,
      width: 6 + Math.random() * 8,
      height: 14 + Math.random() * 18,
      color: ["#FF3E8A", "#7C4DFF", "#1FC8A0", "#FF9F3E", "#FFD84D", "#FF5FA2"][
        Math.floor(Math.random() * 6)
      ],
      drift: (Math.random() - 0.5) * 260,
    })),
  );

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[110] overflow-hidden"
      style={{ top: "72px", height: "calc(100vh - 72px)" }}
    >
      <style>{`
        @keyframes birthday-confetti {
          0% {
            transform: translateY(-20px) translateX(0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translateY(calc(100vh - 72px)) translateX(var(--drift)) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>

      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${piece.left}%`,
            width: `${piece.width}px`,
            height: `${piece.height}px`,
            backgroundColor: piece.color,
            animation: `birthday-confetti ${piece.duration}s ease-in ${piece.delay}s forwards`,
            opacity: 0,
            "--drift": `${piece.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

function Preloader({ theme }) {
  const {
    spinnerOuter = "border-t-sky-400",
    spinnerInner = "border-t-cyan-500/60",
    dotColor = "bg-sky-400",
    textColor = "text-sky-500/70",
  } = theme;
  return (
    <div className="flex flex-col justify-center items-center w-full py-24 gap-5">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div
          className={`absolute inset-0 rounded-full border-2 border-transparent ${spinnerOuter} animate-spin`}
        />
        <div
          className={`absolute inset-2 rounded-full border border-transparent ${spinnerInner} animate-spin [animation-direction:reverse] [animation-duration:0.7s]`}
        />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <p
          className={`text-xs font-medium tracking-[0.2em] uppercase ${textColor}`}
        >
          Loading reports
        </p>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`w-1 h-1 ${dotColor} rounded-full animate-bounce`}
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Card priority config — uses theme accent colors ─────────────────────────
// Priority is signalled with a left accent bar + a small static dot + a
// text label. No blurred colour glow — a plain, slightly elevated shadow
// keeps every card visually calm regardless of priority.
const cardConfig = (status, priority, theme) => {
  const {
    cardEmergencyBorder,
    cardEmergencyBadge,
    cardEmergencyDot,
    cardEmergencyAccent,
    cardEmergencyPriority,
    cardUrgentBorder,
    cardUrgentBadge,
    cardUrgentDot,
    cardUrgentAccent,
    cardUrgentPriority,
    cardNormalBorder,
    cardNormalBadge,
    cardNormalDot,
    cardNormalAccent,
    cardNormalPriority,
    cardBg = "bg-white/70",
  } = theme;

  if (!TERMINAL_STATUSES.includes(status) && priority === "emergency")
    return {
      border: cardEmergencyBorder || "border-red-300",
      badge: cardEmergencyBadge || "bg-red-600 text-white",
      dot: cardEmergencyDot || "bg-red-500",
      accent: cardEmergencyAccent || "bg-red-500",
      priorityColor: cardEmergencyPriority || "text-red-600",
      cardBg,
    };
  if (!TERMINAL_STATUSES.includes(status) && priority === "urgent")
    return {
      border: cardUrgentBorder || "border-amber-300",
      badge: cardUrgentBadge || "bg-amber-500 text-white",
      dot: cardUrgentDot || "bg-amber-400",
      accent: cardUrgentAccent || "bg-amber-400",
      priorityColor: cardUrgentPriority || "text-amber-600",
      cardBg,
    };
  return {
    border: cardNormalBorder || "border-emerald-300",
    badge: cardNormalBadge || "bg-emerald-600 text-white",
    dot: cardNormalDot || "bg-emerald-400",
    accent: cardNormalAccent || "bg-emerald-400",
    priorityColor: cardNormalPriority || "text-emerald-600",
    cardBg,
  };
};

// ─── Shared theme tokens ─────────────────────────────────────────────────────
// Every role theme is a light, neutral surface (white / slate) with a single
// accent colour carrying the role's identity — instead of five independently
// hand-tuned palettes with their own gradients, glows and opacities. This
// keeps every screen calm and legible, and means a new role only needs one
// accent choice, not sixty bespoke values.
//
// NOTE: Tailwind's class scanner needs complete, literal class strings in
// the source — so each theme below is still written out in full (not
// assembled from partial fragments at runtime), it's just far shorter
// because the values themselves are restrained and consistent. Any class
// built from the `ringColor` template below (shadow-*, ring-*, border-t-*)
// must be safelisted in tailwind.config.js since the scanner can't see
// through the interpolation — see the safelist block at the bottom of
// this file's accompanying config.
function makeTheme({
  accent,
  accentDark,
  accentSoft,
  accentSoftDark,
  ring,
  mode = "light",
}) {
  const ringColor = ring.replace("bg-", "");
  const dark = mode === "dark";

  return {
    // ─── Page ─────────────────────────────────────────────
    pageBg: dark
      ? "bg-gradient-to-b from-slate-950 to-slate-900"
      : "bg-gradient-to-b from-slate-50 to-slate-100/60",
    sidebarBg: dark
      ? "bg-slate-900/90 backdrop-blur-xl"
      : "bg-white/90 backdrop-blur-xl",
    sidebarBorder: dark
      ? "border border-slate-800 shadow-sm"
      : "border border-slate-200 shadow-sm",
    contentBg: "bg-transparent",

    // ─── Navbar ──────────────────────────────────────────
    navBg: `bg-gradient-to-r ${accent}`,
    navBorder: "border border-white/10",
    navShadow: `shadow-[0_4px_20px_-4px_var(--tw-shadow-color)] shadow-${ringColor}/40`,
    logoFrom: "from-white",
    logoTo: "to-white/80",
    logoSub: "text-white/70",

    liveColor: "bg-white",
    liveShadow: "shadow-[0_0_6px_1px_rgba(255,255,255,0.6)]",
    liveText: "text-white",

    linkActive: "text-white",
    linkHover: "hover:text-white/80",
    linkBar: "bg-white",

    logoutBorder: "border-white/20",
    logoutText: "text-white",
    logoutHoverBorder: "hover:border-red-300/60",
    logoutHoverText: "hover:text-red-100",
    logoutHoverBg: "hover:bg-red-500/10",

    accent: "shadow-[0_1px_0_0_rgba(255,255,255,0.15)]",
    glowLine: "via-white/30",

    // ─── Sidebar nav ─────────────────────────────────────
    sideNavActive: dark
      ? `text-white ${accentSoftDark || "bg-white/5"} border border-white/10 shadow-sm ring-1 ring-${ringColor}/20`
      : `text-slate-900 ${accentSoft} border border-slate-200/80 shadow-sm ring-1 ring-${ringColor}/10`,
    sideNavIdle: dark
      ? "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 border border-transparent",
    sideNavDotActive: accentDark,
    sideNavDotIdle: dark
      ? "bg-slate-600 group-hover:bg-slate-500"
      : "bg-slate-300 group-hover:bg-slate-400",
    sideNavLabel: dark ? "text-slate-500" : "text-slate-400",

    // ─── Section headers ─────────────────────────────────
    sectionAccentBar: accent,
    sectionLabel: dark ? "text-slate-500" : "text-slate-400",
    sectionTitle: dark ? "text-slate-100" : "text-slate-900",
    sectionCountBg: dark
      ? "bg-slate-800 border border-slate-700"
      : "bg-white border border-slate-200",
    sectionCountBorder: dark ? "border-slate-700" : "border-slate-200",
    sectionCountDot: accentDark,
    sectionCountText: dark ? "text-slate-200" : "text-slate-700",
    sectionDivider: dark ? "border-slate-800" : "border-slate-200",

    // ─── Cards ───────────────────────────────────────────
    cardBg: dark
      ? "bg-gradient-to-b from-slate-800 to-slate-800/80 border border-slate-700"
      : "bg-gradient-to-b from-white to-slate-50/80 border border-slate-200",
    cardHoverShadow: `hover:shadow-[0_8px_24px_-8px_var(--tw-shadow-color)] hover:shadow-${ringColor}/25`,

    cardNormalBorder: "border-l-emerald-400",
    cardNormalBadge:
      "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white",
    cardNormalDot: "bg-emerald-400",
    cardNormalAccent: "bg-emerald-400",
    cardNormalPriority: dark ? "text-emerald-400" : "text-emerald-600",

    cardEmergencyBorder: "border-l-red-500",
    cardEmergencyBadge: "bg-gradient-to-r from-red-600 to-red-500 text-white",
    cardEmergencyDot: "bg-red-500",
    cardEmergencyAccent: "bg-red-500",
    cardEmergencyPriority: dark ? "text-red-400" : "text-red-600",

    cardUrgentBorder: "border-l-amber-400",
    cardUrgentBadge: "bg-gradient-to-r from-amber-500 to-amber-400 text-white",
    cardUrgentDot: "bg-amber-400",
    cardUrgentAccent: "bg-amber-400",
    cardUrgentPriority: dark ? "text-amber-400" : "text-amber-600",

    cardDateLabel: dark ? "text-slate-500" : "text-slate-400",
    cardDateValue: dark ? "text-slate-300" : "text-slate-700",

    cardStatusBg: dark ? "bg-slate-700/60" : "bg-slate-100",
    cardStatusBorder: dark ? "border-slate-600" : "border-slate-200",
    cardStatusText: dark ? "text-slate-300" : "text-slate-600",

    // ─── Feedback badge ──────────────────────────────────
    feedbackBadge: `${ring} text-white shadow-sm`,

    // ─── Mobile toggle ───────────────────────────────────
    mobileToggleBg: dark ? "bg-slate-800" : "bg-white",
    mobileToggleBorder: dark ? "border-slate-700" : "border-slate-200",
    mobileToggleText: dark ? "text-slate-200" : "text-slate-700",
    mobileToggleHover: dark ? "hover:bg-slate-700" : "hover:bg-slate-50",

    mobileBottomBg: dark ? "bg-slate-800" : "bg-white",
    mobileBottomBorder: dark ? "border-slate-700" : "border-slate-200",
    mobileBottomDot: accentDark,
    mobileBottomText: dark ? "text-slate-200" : "text-slate-700",

    // ─── Bottom sheet ────────────────────────────────────
    sheetBg: dark ? "bg-slate-900" : "bg-white",
    sheetBorder: dark ? "border-slate-700" : "border-slate-200",
    sheetTopBar: accent,
    titleColor: dark ? "text-slate-100" : "text-slate-900",
    emptyText: dark ? "text-slate-500" : "text-slate-400",

    // ─── Slide panel ─────────────────────────────────────
    slideBg: dark ? "bg-slate-900" : "bg-white",
    slideBorder: dark ? "border-slate-700" : "border-slate-200",
    slideTopBar: accent,

    linkActiveBg: dark ? accentSoftDark || "bg-white/5" : accentSoft,
    linkActiveBorder: dark ? "border-slate-700" : "border-slate-200",
    linkActiveText: dark ? "text-slate-100" : "text-slate-900",

    linkIdleBorder: "border-transparent",
    linkIdleText: dark ? "text-slate-400" : "text-slate-500",

    linkHoverText: dark ? "hover:text-slate-100" : "hover:text-slate-900",
    linkHoverBorder: dark ? "hover:border-slate-700" : "hover:border-slate-200",
    linkHoverBg: dark ? "hover:bg-slate-800" : "hover:bg-slate-50",

    // ─── Spinner ─────────────────────────────────────────
    spinnerOuter: `border-t-${ringColor}`,
    spinnerInner: dark ? "border-t-slate-600" : "border-t-slate-300",
    dotColor: ring,
    textColor: dark ? "text-slate-500" : "text-slate-400",

    // ─── Report details ──────────────────────────────────
    detailsBg: dark ? "bg-slate-900" : "bg-white",
    detailsCloseText: dark ? "text-slate-400" : "text-slate-500",
    detailsLabelColor: dark ? "text-slate-500" : "text-slate-500",
    detailsValueColor: dark ? "text-slate-200" : "text-slate-800",
    mode,

    // ─── Report details (extended surfaces) ──────────────
    detailsHeaderBg: dark
      ? "bg-slate-900/90 backdrop-blur"
      : "bg-white/90 backdrop-blur",
    detailsHeaderBorder: dark ? "border-slate-800" : "border-gray-100",
    detailsCloseText: dark ? "text-slate-500" : "text-gray-400",
    detailsCloseHover: dark
      ? "hover:text-slate-100 hover:bg-slate-800"
      : "hover:text-gray-700 hover:bg-gray-100",
    detailsMutedText: dark ? "text-slate-500" : "text-gray-400",

    surfaceBg: dark
      ? "bg-slate-800 border border-slate-700"
      : "bg-white border border-gray-200",
    surfaceHeading: dark ? "text-slate-100" : "text-gray-800",
    surfaceHint: dark ? "text-slate-400" : "text-gray-500",

    inputBg: dark ? "bg-slate-900" : "bg-white",
    inputBorder: dark ? "border-slate-600" : "border-gray-300",
    inputText: dark
      ? "text-slate-100 placeholder:text-slate-500"
      : "text-gray-900 placeholder:text-gray-400",

    tableHeaderBg: dark
      ? "bg-slate-900 text-slate-400"
      : "bg-gray-50 text-gray-600",
    tableBorder: dark ? "border-slate-700" : "border-gray-200",
    tableCellBorder: dark ? "border-slate-700" : "border-gray-100",
    tableRowBg: dark ? "bg-slate-800" : "bg-white",
    tableAltRowBg: dark ? "bg-slate-900/60" : "bg-gray-50",
    tableCellText: dark ? "text-slate-200" : "text-gray-800",
    tableMutedText: dark ? "text-slate-500" : "text-gray-400",

    uploaderBg: dark
      ? "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200"
      : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700",

    timelineLine: dark ? "bg-slate-700" : "bg-gray-200",
  };
}

// Per-role identity: accent + a translucent "soft" accent for dark mode,
// since the light-mode -50 tints (e.g. bg-emerald-50) go invisible on a
// dark surface — a translucent version of the same hue reads correctly
// in both.
const ROLE_ACCENTS = {
  admin: {
    accent: "from-emerald-600 to-emerald-500",
    accentDark: "bg-emerald-500",
    accentSoft: "bg-emerald-50",
    accentSoftDark: "bg-emerald-500/10",
    ring: "bg-emerald-500",
  },
  estate: {
    accent: "from-sky-600 to-sky-500",
    accentDark: "bg-sky-500",
    accentSoft: "bg-sky-50",
    accentSoftDark: "bg-sky-500/10",
    ring: "bg-sky-500",
  },
  worker: {
    accent: "from-amber-500 to-amber-400",
    accentDark: "bg-amber-500",
    accentSoft: "bg-amber-50",
    accentSoftDark: "bg-amber-500/10",
    ring: "bg-amber-500",
  },
  manager: {
    accent: "from-orange-500 to-orange-400",
    accentDark: "bg-orange-500",
    accentSoft: "bg-orange-50",
    accentSoftDark: "bg-orange-500/10",
    ring: "bg-orange-500",
  },
  procurement: {
    accent: "from-indigo-600 to-indigo-500",
    accentDark: "bg-indigo-500",
    accentSoft: "bg-indigo-50",
    accentSoftDark: "bg-indigo-500/10",
    ring: "bg-indigo-500",
  },
};

// Pre-build both mode variants once (avoids rebuilding token objects on
// every render) and look them up by [mode][role].
const THEME_CACHE = { light: {}, dark: {} };
for (const mode of ["light", "dark"]) {
  for (const [role, cfg] of Object.entries(ROLE_ACCENTS)) {
    THEME_CACHE[mode][role] = makeTheme({ ...cfg, mode });
  }
}

export function getTheme(role, mode = "light") {
  return THEME_CACHE[mode]?.[role] || THEME_CACHE[mode]?.admin;
}

// Kept for any other file still importing THEMES directly — defaults to
// light mode. Prefer getTheme(role, mode) going forward.
export const THEMES = THEME_CACHE.light;

// Per-role identity lives in exactly four values. Everything else is
// derived by makeTheme() above, so the whole theme system fits on one
// screen instead of being spread across hundreds of hand-tuned lines.
//
// Procurement uses indigo — distinct from admin (emerald), estate (sky),
// worker (amber), and manager (orange); reads as "purchasing/logistics"
// rather than the alert-red it used to borrow.

// ─── Pagination controls ───────────────────────────────────────────────────
const PAGE_SIZE = 9;

const PaginationControls = ({ page, totalPages, onChange, theme }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pb-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border ${theme.sectionCountBg} ${theme.sectionCountBorder} ${theme.sectionCountText} shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 hover:shadow`}
      >
        <span className="material-symbols-outlined text-sm">chevron_left</span>
        Prev
      </button>
      <span
        className={`text-xs font-mono font-medium tracking-wide ${theme.sectionCountText}`}
      >
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border ${theme.sectionCountBg} ${theme.sectionCountBorder} ${theme.sectionCountText} shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 hover:shadow`}
      >
        Next
        <span className="material-symbols-outlined text-sm">chevron_right</span>
      </button>
    </div>
  );
};

// Splits an array into chunks of at most `size` — used to keep Firestore
// writeBatch calls under its hard 500-operation limit regardless of how
// many reports need to be marked at once.
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const BATCH_CHUNK_SIZE = 450;

// ── Badge / "mark all as read" data is only ever needed for these six
// statuses (the sidebar nav only shows badges for these). Each status gets
// its own small, bounded, live query instead of the whole collection.
const BADGE_STATUS_LIST = [
  "assigned",
  "rejected",
  "accepted",
  "reopened",
  "dropped",
  "completed",
  "closed",
];
// Cap per status. Practically this only matters for statuses that
// accumulate a long history (completed/closed) — the cap means an item a
// user never opened, sitting further back than this window, stops showing
// a "new"/"feedback" badge. That's judged an acceptable trade-off versus
// re-reading the full historical collection on every dashboard load.
const BADGE_FETCH_LIMIT = 150;

// Bounded fallback fetch size when free-text search is active (Firestore
// can't do substring search server-side, so we pull a generously-sized,
// still-bounded window for the active status/time-filter and search
// within it client-side, instead of the entire collection).
const SEARCH_FETCH_CAP = 500;

function buildBaseConstraints({
  statusValue,
  role,
  userId,
  timeFilter,
  serviceType,
}) {
  const constraints = [];
  if (role === "worker" && userId) {
    constraints.push(where("assignedTo", "==", userId));
  }
  if (Array.isArray(statusValue)) {
    if (statusValue.length > 0)
      constraints.push(where("status", "in", statusValue));
  } else if (statusValue) {
    constraints.push(where("status", "==", statusValue));
  }
  // New: lets a section scope itself to only external (or internal) jobs,
  // e.g. the External Jobs tab = status "assigned" + serviceType "external".
  if (serviceType) {
    constraints.push(where("serviceType", "==", serviceType));
  }
  const range = getTimeRangeBounds(timeFilter);
  if (range) {
    constraints.push(where("dateSent", ">=", range.start));
    if (range.end) constraints.push(where("dateSent", "<", range.end));
  }
  return constraints;
}

// ─── Paginated section hook ─────────────────────────────────────────────────
// Replaces "fetch the whole collection, slice client-side" with a real
// Firestore query bounded by status (+ role, + time filter), ordered and
// limited server-side, walked forward with startAfter cursors.
//
// IMPORTANT — why the query orders by `dateSent` and NOT by the section's
// own `dateField` (e.g. dateAccepted / dateClosed / dateCompleted):
// Firestore's orderBy() silently drops any document that doesn't have the
// ordered field set at all. A report that was closed before that field
// existed, or that some code path never wrote it on, would simply vanish
// from the results — while a plain count query (no orderBy) would still
// count it. That mismatch is exactly the "pagination says there are
// reports, but no cards render" bug. `dateSent` is the one date every
// report is guaranteed to have (see getTimeRangeBounds/matchesSearch
// above), so it's the only safe field to drive the server-side order and
// the startAfter cursor. The section's own `dateField` is still used
// purely for on-screen sorting of the page you already fetched (see
// sortByDateFieldForDisplay) and for the date shown on each card — it
// just never gates which documents Firestore is allowed to return.
//
// NOTE on required indexes: the first time each distinct query shape runs
// (a given status set + role, with/without a time filter), Firestore may
// respond with a "the query requires an index" error that includes a
// direct link to auto-create it in the console. That's expected — click
// the link once per shape, it takes about a minute to build, and it's
// free on Spark (composite indexes aren't billed). Ordering everything by
// `dateSent` keeps this to a small, predictable set of shapes shared
// across every page, instead of a new shape per reportDate field.
function useSectionData({
  statusValue,
  dateField,
  role,
  userId,
  searchQuery,
  timeFilter,
  serviceType, // ← new
  pageSize = PAGE_SIZE,
}) {
  const [docsOut, setDocsOut] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const cursorCacheRef = useRef({ 1: null });

  const hasStatus =
    !!statusValue && (!Array.isArray(statusValue) || statusValue.length > 0);
  const searchMode = hasStatus && searchQuery.trim() !== "";
  const statusKey = JSON.stringify(statusValue);

  useEffect(() => {
    setPage(1);
    cursorCacheRef.current = { 1: null };
  }, [statusKey, dateField, role, userId, timeFilter, serviceType, searchMode]);

  // Also reset to page 1 whenever the search text itself changes (still in
  // search mode, but it's a new result set).
  useEffect(() => {
    if (searchMode) setPage(1);
  }, [searchQuery, searchMode]);

  // ── Mode A: server-side cursor pagination (no free-text search) ───────
  useEffect(() => {
    if (!hasStatus || searchMode) return;
    setLoading(true);
    const cursor = cursorCacheRef.current[page] || null;
    const base = buildBaseConstraints({
      statusValue,
      role,
      userId,
      timeFilter,
      serviceType,
    });

    const q = query(
      collection(db, "reports"),
      ...base,
      orderBy("dateSent", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Re-order the fetched page for display using the section's own
        // date field (falling back to dateSent) — purely cosmetic, does
        // not affect which documents were fetched or how paging cursors
        // are tracked below.
        setDocsOut(sortByDateFieldForDisplay(docs, dateField));
        setLoading(false);
        if (snapshot.docs.length > 0) {
          cursorCacheRef.current[page + 1] =
            snapshot.docs[snapshot.docs.length - 1];
        }
      },
      (err) => {
        console.error(
          "Section query failed — this usually means a composite index is needed; check the console for a creation link:",
          err,
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasStatus,
    searchMode,
    page,
    statusKey,
    role,
    userId,
    timeFilter,
    pageSize,
    dateField,
    serviceType,
  ]);

  // Accurate total count for pagination, via a cheap aggregation query
  // (billed per ~1000 index entries scanned, not per document read). No
  // orderBy here, so it's unaffected by the missing-field issue described
  // above and needs no composite index beyond the base equality filters.
  useEffect(() => {
    if (!hasStatus || searchMode) return;
    const base = buildBaseConstraints({
      statusValue,
      role,
      userId,
      timeFilter,
      serviceType,
    });
    const q = query(collection(db, "reports"), ...base);
    getCountFromServer(q)
      .then((snap) => setTotalCount(snap.data().count))
      .catch((err) => console.error("Count query failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStatus, searchMode, statusKey, role, userId, timeFilter]);

  // ── Mode B: bounded one-time fetch + client-side substring search ─────
  useEffect(() => {
    if (!hasStatus || !searchMode) return;
    setLoading(true);
    const base = buildBaseConstraints({
      statusValue,
      role,
      userId,
      timeFilter,
      serviceType,
    });

    const q = query(
      collection(db, "reports"),
      ...base,
      orderBy("dateSent", "desc"),
      limit(SEARCH_FETCH_CAP),
    );

    let cancelled = false;
    getDocs(q)
      .then((snapshot) => {
        if (cancelled) return;
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => matchesSearch(r, searchQuery));
        setDocsOut(sortByDateFieldForDisplay(docs, dateField));
        setTotalCount(docs.length);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Search query failed:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasStatus,
    searchMode,
    searchQuery,
    statusKey,
    role,
    userId,
    timeFilter,
    dateField,
    serviceType,
  ]);

  const displayedDocs = searchMode
    ? docsOut.slice((page - 1) * pageSize, page * pageSize)
    : docsOut;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const patchDoc = useCallback((id, patch) => {
    setDocsOut((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  return {
    docs: displayedDocs,
    loading,
    page,
    setPage,
    totalPages,
    totalCount,
    patchDoc,
  };
}

// ─── Main Home component ──────────────────────────────────────────────────────
export default function Home({
  completedRedirect,
  assignedRedirect,
  rejectedRedirect,
  acceptedRedirect,
  reopenedRedirect,
  droppedRedirect,
  externalRedirect,
  title1,
  title2,
  reportDate1,
  reportDate2,
  firstReportsStatus,
  secondReportsStatus,
  reportsHiddenOnMobileTitle,
  firstReportsServiceType,
  specificReportsPage,
  closedRedirect,
  homeRedirect,
  dashboardRedirect,
  role,
}) {
  const { mode } = useThemeMode();
  const theme = getTheme(role || "admin", mode);
  const [sidePopup, setSidePopup] = useState(false);
  const [showReportsHiddenOnMobile, SetShowReportsHiddenOnMobile] =
    useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReportId, setCurrentReportId] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showBirthdayBanner, setShowBirthdayBanner] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("overall");
  const [badgeData, setBadgeData] = useState({});
  const uid = useAuthUid();
  const user = JSON.parse(localStorage.getItem("user"))?.data;

  useEffect(() => {
    markOverdueReports(user);
  }, []);

  // Debounce the search box so every keystroke doesn't trigger a Firestore
  // read while the user is still typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Show the birthday card and confetti only once for this year's birthday.
  // The celebration key is stored in localStorage so it won't replay on every
  // refresh or re-navigation until the next birthday year.
  useEffect(() => {
    if (!user?.birthdate || !isBirthdayToday(user.birthdate)) return;
    const seenKey = getBirthdaySeenKey(user);
    if (!seenKey || localStorage.getItem(seenKey)) return;

    setShowBirthdayBanner(true);
    setShowConfetti(true);
    localStorage.setItem(seenKey, "1");

    const confettiTimer = setTimeout(() => setShowConfetti(false), 10000);
    return () => clearTimeout(confettiTimer);
  }, [user?.ID, user?.birthdate]);

  const dismissBirthdayBanner = () => {
    setShowBirthdayBanner(false);
    const seenKey = getBirthdaySeenKey(user);
    if (seenKey) localStorage.setItem(seenKey, "1");
  };

  const handleClose = () => {
    setTimeout(() => SetShowReportsHiddenOnMobile(false), 300);
  };

  const isNewForUser = useCallback(
    (report) =>
      !!uid &&
      !!user?.ID &&
      report.lastViewedStatus?.[user.ID] !== report.status,
    [uid, user?.ID],
  );

  const hasFeedback = useCallback(
    (report) => report.feedback && !report.feedbackViewedBy?.includes(user?.ID),
    [user?.ID],
  );

  // ─── Two bounded, server-paginated sections (replaces the old single
  // full-collection onSnapshot + client-side slice) ──────────────────────
  const firstSection = useSectionData({
    statusValue: firstReportsStatus,
    dateField: reportDate1,
    role: user?.role,
    userId: user?.ID,
    searchQuery: debouncedSearchQuery,
    timeFilter,
    serviceType: firstReportsServiceType, // ← new
  });

  const secondSection = useSectionData({
    statusValue: specificReportsPage ? null : secondReportsStatus,
    dateField: reportDate2,
    role: user?.role,
    userId: user?.ID,
    searchQuery: debouncedSearchQuery,
    timeFilter,
  });

  const firstReports = firstSection.docs;
  const secondReports = secondSection.docs;

  // ─── Badge / "mark all as read" data — six small bounded live queries
  // (one per badge-relevant status) instead of reading everything ───────
  useEffect(() => {
    if (!user?.ID) return;
    const unsubscribers = BADGE_STATUS_LIST.map((status) => {
      const constraints = [];
      if (user.role === "worker") {
        constraints.push(where("assignedTo", "==", user.ID));
      }
      constraints.push(where("status", "==", status));
      constraints.push(orderBy("dateSent", "desc"));
      constraints.push(limit(BADGE_FETCH_LIMIT));
      const q = query(collection(db, "reports"), ...constraints);
      return onSnapshot(
        q,
        (snapshot) => {
          setBadgeData((prev) => ({
            ...prev,
            [status]: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
          }));
        },
        (err) =>
          console.error(`Badge query failed for status="${status}":`, err),
      );
    });
    return () => unsubscribers.forEach((u) => u());
  }, [user?.ID, user?.role]);

  const allBadgeReports = useMemo(
    () => Object.values(badgeData).flat(),
    [badgeData],
  );

  // ─── Badge counts (sidebar) — sourced from the six bounded badge
  // queries instead of the full reports collection ──────────────────────
  const badgeCounts = useMemo(() => {
    const newAssignedCount = allBadgeReports.filter(
      (r) => r.status === "assigned" && isNewForUser(r),
    ).length;
    // New: external jobs share the "assigned" status but are a distinct
    // tab (admin/estate own these, no worker acceptance step).
    const newExternalCount = allBadgeReports.filter(
      (r) =>
        ["accepted", "reopened"].includes(r.status) && // ← was status === "assigned"
        r.serviceType === "external" &&
        isNewForUser(r),
    ).length;
    const newRejectedCount = allBadgeReports.filter(
      (r) => r.status === "rejected" && isNewForUser(r),
    ).length;
    const newAcceptedCount = allBadgeReports.filter(
      (r) =>
        r.serviceType === "internal" &&
        r.status === "accepted" &&
        isNewForUser(r),
    ).length;
    const newReopenedCount = allBadgeReports.filter(
      (r) =>
        r.serviceType === "internal" &&
        r.status === "reopened" &&
        isNewForUser(r),
    ).length;
    const newDroppedCount = allBadgeReports.filter(
      (r) => r.status === "dropped" && isNewForUser(r),
    ).length;
    const newCompletedCount = allBadgeReports.filter(
      (r) => r.status === "completed" && isNewForUser(r),
    ).length;
    const newClosedCount = allBadgeReports.filter(
      (r) => r.status === "closed" && isNewForUser(r),
    ).length;
    const completedWithFeedback = allBadgeReports.filter(
      (r) => r.status === "completed" && hasFeedback(r),
    ).length;
    const closedWithFeedback = allBadgeReports.filter(
      (r) => r.status === "closed" && hasFeedback(r),
    ).length;
    const rejectedCount = allBadgeReports.filter(
      (r) => r.status === "rejected",
    ).length;
    const acceptedCount = allBadgeReports.filter(
      (r) => r.status === "accepted",
    ).length;
    const reopenedCount = allBadgeReports.filter(
      (r) => r.status === "reopened",
    ).length;
    const droppedCount = allBadgeReports.filter(
      (r) => r.status === "dropped",
    ).length;

    return {
      newAssignedCount,
      newExternalCount,
      newRejectedCount,
      newAcceptedCount,
      newReopenedCount,
      newDroppedCount,
      newCompletedCount,
      newClosedCount,
      completedWithFeedback,
      closedWithFeedback,
      rejectedCount,
      acceptedCount,
      reopenedCount,
      droppedCount,
    };
  }, [allBadgeReports, isNewForUser, hasFeedback]);

  const {
    newAssignedCount,
    newRejectedCount,
    newAcceptedCount,
    newReopenedCount,
    newDroppedCount,
    newExternalCount,
    newCompletedCount,
    newClosedCount,
    completedWithFeedback,
    closedWithFeedback,
    rejectedCount,
    acceptedCount,
    reopenedCount,
    droppedCount,
  } = badgeCounts;

  const displayReportDetails = (report) => {
    setCurrentReportId(report.id);
    setSelectedReport(report);
    setDisplayDetails(true);

    if (isNewForUser(report)) {
      markReportViewed(report.id, user.ID, report.status); // was: uid
      const patch = {
        lastViewedStatus: {
          ...(report.lastViewedStatus || {}),
          [user.ID]: report.status, // already correct
        },
      };
      // Optimistic local patch so the "New" badge disappears immediately —
      // wherever this report currently lives (either section, or a badge
      // bucket), rather than waiting on the round-trip from Firestore.
      firstSection.patchDoc(report.id, patch);
      secondSection.patchDoc(report.id, patch);
      setBadgeData((prev) => {
        const bucket = prev[report.status];
        if (!bucket) return prev;
        return {
          ...prev,
          [report.status]: bucket.map((r) =>
            r.id === report.id ? { ...r, ...patch } : r,
          ),
        };
      });
    }
  };

  // Keeps the open detail panel live via a single-document listener,
  // instead of depending on a full-collection listener to catch updates.
  useEffect(() => {
    if (!displayDetails || !currentReportId) return;
    const unsubscribe = onSnapshot(
      doc(db, "reports", currentReportId),
      (snap) => {
        if (snap.exists()) setSelectedReport({ id: snap.id, ...snap.data() });
      },
      (err) => console.error("Report detail listener failed:", err),
    );
    return () => unsubscribe();
  }, [displayDetails, currentReportId]);

  const currentReport = selectedReport ? [selectedReport] : [];

  // ─── Status messages — explains what's currently happening at each stage ────
  const STATUS_MESSAGES = {
    incoming: "Waiting for admin approval.",
    approved: "Approved by admin, waiting for the Estate Manager review.",
    pending: "Material request sent to admin, awaiting approval.",
    confirmed: "Material request approved, awaiting procurement.",
    procured: "Materials procured, waiting for technician assignment.",
    assigned: "Assigned to a technician, awaiting their response.",
    rejected:
      "Technician declined this job, waiting for Estate Manager reassignment.",
    accepted: "Technician accepted the job and is currently working on it.",
    dropped:
      "Worker dropped this job, waiting for Estate Manager reassignment.",
    reopened: "Reporter wasn't satisfied, back with the Estate Manager.",
    closed: "Report closed.",
  };

  // ─── Status → display-date mapping for report cards ───────────────────────
  // Each status shows the date most relevant to *that* status, instead of
  // always showing dateSent.
  const STATUS_DATE_FIELD = {
    incoming: "dateSent",
    approved: "dateApproved",
    pending: "dateCostAdded",
    costDenied: "dateCostDenied",
    confirmed: "dateConfirmed",
    procured: "dateProcured",
    assigned: "dateAssigned",
    rejected: "dateRejected",
    accepted: "dateAccepted",
    dropped: "dateDropped",
    reopened: "dateReopened",
    completed: "dateCompleted",
    closed: "dateClosed",
  };

  const STATUS_DATE_LABEL = {
    incoming: "Sent",
    approved: "Approved",
    denied: "Denied",
    pending: "Materials Added",
    costDenied: "Request Denied",
    confirmed: "Confirmed",
    procured: "Procured",
    assigned: "Assigned",
    rejected: "Rejected",
    accepted: "Accepted",
    dropped: "Dropped",
    reopened: "Reopened",
    completed: "Completed",
    closed: "Closed",
  };

  // Denied reports don't have their own dedicated date field — the denial
  // timestamp lives inside the last "denial" entry of `notes` (see
  // getDenialNote in reportDetails.jsx / staffReportDetails.jsx) as a plain
  // client-side Date, not a Firestore Timestamp.
  function getDenialDate(report) {
    const denialNotes = (report.notes || []).filter(
      (n) => n?.type === "denial",
    );
    if (!denialNotes.length) return null;
    return denialNotes[denialNotes.length - 1].date || null;
  }

  function getDisplayDate(report) {
    const label = STATUS_DATE_LABEL[report.status] || "Sent";

    let raw;
    if (report.status === "denied") {
      raw = getDenialDate(report);
    } else if (report.status === "assigned") {
      // Prefer the more recent reassignment date when one exists.
      raw = report.dateReAssigned || report.dateAssigned;
    } else {
      const field = STATUS_DATE_FIELD[report.status];
      raw = field ? report[field] : null;
    }

    // Fall back to dateSent whenever the status-specific field is missing —
    // e.g. an older report written before a field existed.
    if (!raw) raw = report.dateSent;

    const jsDate = raw?.toDate
      ? raw.toDate()
      : raw instanceof Date
        ? raw
        : null;
    return {
      label,
      value: jsDate ? jsDate.toLocaleDateString() : "—",
    };
  }

  function getStatusMessage(report) {
    if (report.status === "closed") return "Report closed by staff.";
    if (report.status === "completed")
      return "Work completed, waiting for staff feedback.";
    return STATUS_MESSAGES[report.status] || "";
  }

  const hasActiveFilters =
    searchQuery.trim() !== "" || timeFilter !== "overall";

  // Statuses that belong to *this* page (e.g. just "closed", or
  // "incoming"+"pending" on the two-section home). Second section is
  // excluded on specificReportsPage since only firstReportsStatus is shown.
  const pageStatuses = useMemo(() => {
    const toStatusArray = (s) => (Array.isArray(s) ? s : s ? [s] : []);
    return [
      ...toStatusArray(firstReportsStatus),
      ...(specificReportsPage ? [] : toStatusArray(secondReportsStatus)),
    ];
  }, [firstReportsStatus, secondReportsStatus, specificReportsPage]);

  // Unread counts scoped to this page only — drives whether the
  // "Mark all as read" button shows up at all. Sourced from the bounded
  // badge data (pageStatuses, when this toolbar is shown, is always a
  // subset of BADGE_STATUS_LIST).

  // Only meaningful when this page is scoped to one serviceType (e.g. the
  // External Jobs page), so "assigned" doesn't also catch internal jobs
  // still awaiting a worker's response.
  const pageServiceType = specificReportsPage ? firstReportsServiceType : null;

  // Unread counts scoped to this page only — drives whether the
  // "Mark all as read" button shows up at all. Sourced from the bounded
  // badge data (pageStatuses, when this toolbar is shown, is always a
  // subset of BADGE_STATUS_LIST).
  const { pageNewCount, pageFeedbackCount } = useMemo(() => {
    const relevant = allBadgeReports.filter(
      (r) =>
        pageStatuses.includes(r.status) &&
        (!pageServiceType || r.serviceType === pageServiceType),
    );
    return {
      pageNewCount: relevant.filter((r) => isNewForUser(r)).length,
      pageFeedbackCount: relevant.filter((r) => hasFeedback(r)).length,
    };
  }, [
    allBadgeReports,
    pageStatuses,
    pageServiceType,
    isNewForUser,
    hasFeedback,
  ]);

  const hasUnreadItems = pageNewCount > 0 || pageFeedbackCount > 0;

  // Clears every "New" and "Feedback" badge across this user's reports for
  // the statuses shown on this page (bounded to the badge data's fetch
  // window — see BADGE_FETCH_LIMIT). Two separate batches are used because
  // the Firestore rules only allow a report update to touch
  // lastViewedStatus OR feedbackViewedBy in a single write, never both
  // together. Each batch is further chunked to stay under Firestore's
  // 500-operation-per-batch hard limit.
  const handleMarkAllAsRead = useCallback(async () => {
    if (!user?.ID || !uid) return;
    
    const relevant = allBadgeReports.filter(
      (r) =>
        pageStatuses.includes(r.status) &&
        (!pageServiceType || r.serviceType === pageServiceType),
    );
    const toMarkNew = relevant.filter((r) => isNewForUser(r));
    const toMarkFeedback = relevant.filter((r) => hasFeedback(r));
    if (toMarkNew.length === 0 && toMarkFeedback.length === 0) return;

    try {
      for (const group of chunk(toMarkNew, BATCH_CHUNK_SIZE)) {
        const viewedBatch = writeBatch(db);

        group.forEach((r) => {
          viewedBatch.update(doc(db, "reports", r.id), {
            [`lastViewedStatus.${user.ID}`]: r.status, // was: ${uid}
          });
        });
        await viewedBatch.commit();
      }

      for (const group of chunk(toMarkFeedback, BATCH_CHUNK_SIZE)) {
        const feedbackBatch = writeBatch(db);
        group.forEach((r) => {
          feedbackBatch.update(doc(db, "reports", r.id), {
            feedbackViewedBy: arrayUnion(user.ID),
          });
        });
        await feedbackBatch.commit();
      }

      // Optimistic local patch so badges disappear without waiting on the
      // snapshot listeners' round trip — applied to badge data AND to
      // whichever visible section cards happen to hold the same reports
      // (a card's own "New"/"Feedback" indicator reads straight off the
      // report doc, not off badgeData).
      const patchForReport = (r) => {
        const patch = {};
        if (isNewForUser(r)) {
          patch.lastViewedStatus = {
            ...(r.lastViewedStatus || {}),
            [user.ID]: r.status,
          };
        }
        if (hasFeedback(r)) {
          patch.feedbackViewedBy = [...(r.feedbackViewedBy || []), user.ID];
        }
        return patch;
      };

      setBadgeData((prev) => {
        const next = {};
        for (const [status, docsForStatus] of Object.entries(prev)) {
          next[status] = docsForStatus.map((r) =>
            pageStatuses.includes(r.status) &&
            (!pageServiceType || r.serviceType === pageServiceType)
              ? { ...r, ...patchForReport(r) }
              : r,
          );
        }
        return next;
      });

      relevant.forEach((r) => {
        const patch = patchForReport(r);
        firstSection.patchDoc(r.id, patch);
        secondSection.patchDoc(r.id, patch);
      });
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [
    allBadgeReports,
    pageStatuses,
    pageServiceType,
    user?.ID,
    uid,
    isNewForUser,
    hasFeedback,
    firstSection,
  ]);

  const PRIORITY_BG = {
    emergency: "bg-red-500",
    urgent: "bg-amber-400",
    routine: "bg-emerald-500",
  };

  const WorkStartedLabel = ({ dateAccepted, className }) => {
    const label = useLiveTimeAgo(dateAccepted);
    if (!label) return null;
    return (
      <p className={`text-[12px] italic ${className}`}>Work started {label}</p>
    );
  };

  // ─── Report Card ───────────────────────────────────────────────────────────
  // A single restrained hover state (subtle lift + role-colored shadow, no
  // scale/rotate stacking), a left accent bar instead of a full glow, a
  // faint corner accent that fades in on hover, and status badges that
  // appear once via a short fade/scale-in rather than looping forever.
  // Emergency-priority active items get a gentle pulse on the priority dot.
  const ReportCard = ({ report, reportDate }) => {
    const cfg = cardConfig(report.status, report.priorityLevel, theme);
    const { label: dateLabel, value: dateValue } = getDisplayDate(report);
    const isActiveEmergency =
      !TERMINAL_STATUSES.includes(report.status) &&
      report.priorityLevel === "emergency";
    return (
      <div className="relative w-full max-w-[250px] md:max-w-[300px] flex justify-center">
        {/* Feedback badge */}
        {hasFeedback(report) && (
          <span
            className={`absolute -top-2 -right-2 ${theme.feedbackBadge} text-[10px] font-semibold pl-1.5 pr-2 py-0.5 rounded-full z-10 tracking-wide flex items-center gap-0.5 animate-badge-in`}
          >
            <span className="material-symbols-outlined text-[12px] leading-none">
              chat_bubble
            </span>
            Feedback
          </span>
        )}

        {isNewForUser(report) && (
          <span className="absolute -top-2 -left-2 bg-gradient-to-r from-sky-600 to-sky-500 text-white text-[10px] font-semibold pl-1.5 pr-2 py-0.5 rounded-full z-10 tracking-wide flex items-center gap-0.5 animate-badge-in shadow-sm">
            <span className="material-symbols-outlined text-[12px] leading-none">
              fiber_new
            </span>
            New
          </span>
        )}
        <div
          className={`relative group select-none border-l-4 ${cfg.border} ${theme.cardBg} flex flex-col gap-3 cursor-pointer transition-all duration-200 shadow-sm ${theme.cardHoverShadow} hover:-translate-y-1 rounded-xl w-full max-w-[250px] md:max-w-[280px] p-4 overflow-hidden`}
          onClick={() => displayReportDetails(report)}
        >
          {/* Priority row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex w-2 h-2">
                {isActiveEmergency && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
                )}
                <span
                  className={`relative inline-flex rounded-full w-2 h-2 ${cfg.dot}`}
                />
              </span>
              <span
                className={`text-xs font-semibold tracking-wide uppercase ${cfg.priorityColor}`}
              >
                {report.priorityLevel}
              </span>
            </div>
            <span
              className={`text-[10px] ${theme.cardStatusBg} border ${theme.cardStatusBorder} ${theme.cardStatusText} px-2 py-0.5 rounded-full font-mono tracking-wide uppercase`}
            >
              {report.status}
            </span>
          </div>
          <div className="h-px bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
          {getStatusMessage(report) && (
            <p
              className={`text-[12px] leading-relaxed font-medium -mt-1 ${theme.cardDateLabel}`}
            >
              {getStatusMessage(report)}
            </p>
          )}
          {report.status === "accepted" && report.dateAccepted && (
            <WorkStartedLabel
              dateAccepted={report.dateAccepted}
              className={theme.cardStatusText}
            />
          )}
          {/* Date — status-specific label/value, see getDisplayDate above */}
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] ${theme.cardDateLabel} uppercase tracking-wide font-medium`}
            >
              {dateLabel}
            </span>
            <span className={`text-xs ${theme.cardDateValue} font-mono`}>
              {dateValue}
            </span>
          </div>

          {report.overdue && (
            <div className="flex flex-col gap-1 bg-gradient-to-r from-red-50 to-red-50/50 border border-red-200 rounded-lg px-3 py-2">
              <span className="text-[10px] font-semibold text-red-600 tracking-wide uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] leading-none">
                  warning
                </span>
                Overdue
              </span>
              {report.dateDue && !TERMINAL_STATUSES.includes(report.status) && (
                <span className="text-[10px] text-amber-700 font-mono">
                  Due {timeAgo(report.dateDue)}
                </span>
              )}
            </div>
          )}
          {!report.overdue && (
            <Countdown
              dateDue={report.dateDue}
              status={report.status}
              bgColor={PRIORITY_BG[report.priorityLevel] ?? "bg-emerald-700"}
            />
          )}

          {/* Subtle role-colored corner accent, only visible on hover */}
          <div
            className={`absolute -right-6 -top-6 w-16 h-16 rounded-full ${cfg.accent} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-300 pointer-events-none`}
          />
        </div>
      </div>
    );
  };

  const firstReportsCard = firstReports.map((r) => (
    <ReportCard key={r.id} report={r} reportDate={reportDate1} />
  ));
  const secondReportsCard = secondReports.map((r) => (
    <div
      className={`z-[60] w-full max-w-[250px] md:max-w-[300px] justify-center md:flex ${showReportsHiddenOnMobile ? "flex" : "hidden"}`}
      key={r.id}
    >
      <ReportCard report={r} reportDate={reportDate2} />
    </div>
  ));

  // ─── Section Header ────────────────────────────────────────────────────────
  const SectionHeader = ({ title, count }) => (
    <div className="w-full flex items-center gap-4 px-6 md:pl-[calc(20%+24px)]">
      <div className="flex items-center gap-3">
        <div
          className={`w-1.5 h-8 bg-gradient-to-b ${theme.sectionAccentBar} rounded-full shadow-sm`}
        />
        <div>
          <p
            className={`text-[10px] ${theme.sectionLabel} tracking-[0.2em] uppercase font-semibold`}
          >
            Reports
          </p>
          <h1
            className={`text-xl md:text-2xl font-bold tracking-tight ${theme.sectionTitle} leading-tight`}
          >
            {title}
          </h1>
        </div>
      </div>
      {count !== undefined && (
        <span
          className={`ml-auto flex items-center gap-1.5 ${theme.sectionCountBg} border ${theme.sectionCountBorder} px-3 py-1 rounded-full shadow-sm`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${theme.sectionCountDot}`}
          />
          <span
            className={`text-xs ${theme.sectionCountText} font-semibold tabular-nums`}
          >
            {count}
          </span>
        </span>
      )}
      <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent ml-2 hidden md:block" />
    </div>
  );

  // ─── Empty state ───────────────────────────────────────────────────────────
  const EmptyState = ({ filtered }) => (
    <div className="flex flex-col items-center gap-3 my-16">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 shadow-sm flex items-center justify-center text-slate-400">
        <span className="material-symbols-outlined text-3xl">
          {filtered ? "search_off" : "inbox"}
        </span>
      </div>
      <p className="text-slate-500 text-sm tracking-wide font-medium">
        {filtered
          ? "No reports match your search"
          : "Nothing to display here yet"}
      </p>
      {filtered && (
        <p className="text-slate-400 text-xs">
          Try adjusting your search or time filter
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* One-time entrance keyframe for status badges — plays once on
          mount, no looping motion. */}
      <style>{`
        @keyframes badge-pop {
          0% { opacity: 0; transform: scale(0.7); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-badge-in {
          animation: badge-pop 220ms ease-out both;
        }
      `}</style>

      {showConfetti && <BirthdayConfetti />}

      {showBirthdayBanner && (
        <BirthdayBanner
          name={getFirstName(user)}
          onDismiss={dismissBirthdayBanner}
          isDarkMode={mode === "dark"}
        />
      )}

      <ReportDetailsContainer
        currentReport={currentReport}
        displayDetails={displayDetails}
        setDisplayDetails={setDisplayDetails}
        theme={theme}
      />

      {showReportsHiddenOnMobile && (
        <ReportsHiddenOnMobile
          showReportsHiddenOnMobile={showReportsHiddenOnMobile}
          onClose={handleClose}
          reportsHiddenOnMobile={secondReportsCard}
          reportsHiddenOnMobileTitle={reportsHiddenOnMobileTitle}
          secondReports={secondReports}
          theme={theme}
        />
      )}

      <NavBar
        homeRedirect={homeRedirect}
        dashboardRedirect={dashboardRedirect}
        theme={theme}
      />

      <SlideInRight
        sidePopup={sidePopup}
        assignedRedirect={assignedRedirect}
        rejectedRedirect={rejectedRedirect}
        acceptedRedirect={acceptedRedirect}
        reopenedRedirect={reopenedRedirect}
        droppedRedirect={droppedRedirect}
        externalRedirect={externalRedirect}
        newExternalCount={newExternalCount}
        rejectedCount={rejectedCount}
        acceptedCount={acceptedCount}
        reopenedCount={reopenedCount}
        droppedCount={droppedCount}
        completedRedirect={completedRedirect}
        completedWithFeedback={completedWithFeedback}
        dashboardRedirect={dashboardRedirect}
        theme={theme}
        newAssignedCount={newAssignedCount}
        newRejectedCount={newRejectedCount}
        newAcceptedCount={newAcceptedCount}
        newReopenedCount={newReopenedCount}
        newDroppedCount={newDroppedCount}
        newCompletedCount={newCompletedCount}
        closedRedirect={closedRedirect}
        newClosedCount={newClosedCount}
        closedWithFeedback={closedWithFeedback}
      />

      {/* Mobile side toggle */}
      <div className="md:hidden">
        <button
          className={`material-symbols-outlined select-none z-[60] fixed cursor-pointer top-1/2 -translate-y-1/2 right-0 ${theme.mobileToggleBg} border ${theme.mobileToggleBorder} border-r-0 ${theme.mobileToggleText} rounded-l-xl py-3 pl-2 pr-1 shadow-md ${theme.mobileToggleHover} transition-colors`}
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_right" : "chevron_left"}
        </button>
      </div>

      {/* Mobile bottom sheet toggle */}
      {!specificReportsPage && (
        <div
          className={`fixed z-[40] bottom-0 cursor-pointer left-1/2 -translate-x-1/2 select-none rounded-t-2xl px-8 py-2.5 md:hidden ${theme.mobileBottomBg} border border-b-0 ${theme.mobileBottomBorder} shadow-md flex items-center gap-2 hover:bg-slate-50 transition-colors`}
          onClick={() => SetShowReportsHiddenOnMobile((prev) => !prev)}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${theme.mobileBottomDot}`}
          />
          <span
            className={`${theme.mobileBottomText} text-xs font-semibold tracking-wide`}
          >
            {showReportsHiddenOnMobile
              ? "Close"
              : reportsHiddenOnMobileTitle?.split(" ")[0]}
          </span>
        </div>
      )}

      {/* Main layout */}
      <main className={`flex ${theme.pageBg} min-h-screen`}>
        {/* Sidebar */}
        <div
          className={`w-full fixed inset-y-0 z-10 max-w-[20%] h-screen ${theme.sidebarBg} ${theme.sidebarBorder} md:flex flex-col pt-28 px-5 gap-2 hidden overflow-hidden`}
        >
          <p
            className={`text-[9px] ${theme.sideNavLabel} tracking-[0.2em] uppercase font-medium mb-3 px-3`}
          >
            Navigation
          </p>

          {assignedRedirect && (
            <NavLink
              to={assignedRedirect}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Assigned
                  {newAssignedCount > 0 && (
                    <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {newAssignedCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}

          {rejectedRedirect && (
            <NavLink
              to={rejectedRedirect}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Rejected
                  {newRejectedCount > 0 && (
                    <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {newRejectedCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}

          {acceptedRedirect && (
            <NavLink
              to={acceptedRedirect}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  In Progress
                  {newAcceptedCount > 0 && (
                    <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {newAcceptedCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}

          {droppedRedirect && (
            <NavLink
              to={droppedRedirect}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Dropped
                  {newDroppedCount > 0 && (
                    <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {newDroppedCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}

          {reopenedRedirect && (
            <NavLink
              to={reopenedRedirect}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Reopened
                  {newReopenedCount > 0 && (
                    <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {newReopenedCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}

          {externalRedirect && ["admin", "estate"].includes(role) && (
            <NavLink
              to={externalRedirect}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  External Jobs
                  {newExternalCount > 0 && (
                    <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {newExternalCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}

          {/* Completed nav link — for admin, estate, worker */}
          {completedRedirect &&
            ["admin", "estate", "worker"].includes(role) && (
              <NavLink
                to={completedRedirect}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                    />
                    Completed
                    {newCompletedCount > 0 && (
                      <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                        {newCompletedCount}
                      </span>
                    )}
                    {completedWithFeedback > 0 && (
                      <span
                        className={`ml-auto ${theme.feedbackBadge} text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums`}
                      >
                        {completedWithFeedback}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )}

          {/* Closed nav link */}
          {closedRedirect && (
            <NavLink
              to={closedRedirect}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tracking-wide transition-colors duration-150 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Closed
                  {newClosedCount > 0 && (
                    <span className="ml-auto bg-sky-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {newClosedCount}
                    </span>
                  )}
                  {closedWithFeedback > 0 && (
                    <span
                      className={`ml-auto ${theme.feedbackBadge} text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums`}
                    >
                      {closedWithFeedback}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}
        </div>

        {/* Content area */}
        <div className="w-full h-screen [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-auto pt-20 pb-16 flex flex-col items-center z-0 gap-8">
          {/* ── Search / filter / mark-all-as-read toolbar ─────────────────── */}
          {specificReportsPage && (
            <div className="w-full px-6 md:pl-[calc(20%+24px)] flex flex-col md:flex-row md:items-center gap-3">
              <div
                className={`flex-1 flex items-center gap-2 ${theme.sectionCountBg} border ${theme.sectionCountBorder} rounded-full px-4 py-2 min-w-0 shadow-sm`}
              >
                <span
                  className={`material-symbols-outlined text-base ${theme.sectionCountText} opacity-60`}
                >
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search category or priority…"
                  className={`flex-1 min-w-0 bg-transparent outline-none text-sm ${theme.sectionCountText} placeholder:opacity-50`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className={`material-symbols-outlined text-base ${theme.sectionCountText} opacity-60 hover:opacity-100 cursor-pointer`}
                    aria-label="Clear search"
                  >
                    close
                  </button>
                )}
              </div>

              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className={`${theme.sectionCountBg} border ${theme.sectionCountBorder} ${theme.sectionCountText} rounded-full px-4 py-2 text-sm font-medium outline-none cursor-pointer shadow-sm`}
              >
                {TIME_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              {hasUnreadItems && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className={`flex items-center justify-center gap-1.5 ${theme.sectionCountBg} border ${theme.sectionCountBorder} ${theme.sectionCountText} rounded-full px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 hover:shadow transition-all whitespace-nowrap`}
                >
                  <span className="material-symbols-outlined text-base">
                    done_all
                  </span>
                  Mark all as read
                </button>
              )}
            </div>
          )}

          {/* First reports section */}
          <div className={`w-full py-6 border-b ${theme.sectionDivider}`}>
            <SectionHeader
              title={title1}
              count={firstSection.loading ? undefined : firstSection.totalCount}
            />
          </div>

          {firstSection.loading ? (
            <Preloader theme={theme} />
          ) : firstSection.totalCount > 0 ? (
            <>
              <div className="flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-6 justify-center w-full flex-wrap py-4 px-4">
                {firstReportsCard}
              </div>
              <PaginationControls
                page={firstSection.page}
                totalPages={firstSection.totalPages}
                onChange={firstSection.setPage}
                theme={theme}
              />
            </>
          ) : (
            <EmptyState filtered={hasActiveFilters} />
          )}

          {/* Second reports section */}
          {!specificReportsPage && (
            <>
              <div
                className={`w-full py-6 border-y ${theme.sectionDivider} hidden md:block`}
              >
                <SectionHeader
                  title={title2}
                  count={
                    secondSection.loading ? undefined : secondSection.totalCount
                  }
                />
              </div>

              {secondSection.loading ? (
                <div className="hidden md:flex">
                  <Preloader theme={theme} />
                </div>
              ) : secondSection.totalCount > 0 ? (
                <div className="hidden md:flex md:flex-col items-center w-full">
                  <div className="flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-6 justify-center w-full flex-wrap py-4 px-4">
                    {secondReportsCard}
                  </div>
                  <PaginationControls
                    page={secondSection.page}
                    totalPages={secondSection.totalPages}
                    onChange={secondSection.setPage}
                    theme={theme}
                  />
                </div>
              ) : (
                <div className="hidden md:flex">
                  <EmptyState filtered={hasActiveFilters} />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
