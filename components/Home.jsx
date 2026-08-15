import { markOverdueReports, markReportViewed } from "../src/utils";
import NavBar from "./navBar";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import SlideInRight from "../components/slideInRight";
import { NavLink } from "react-router";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";
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
      <span className="text-[10px] font-black text-red-300 bg-red-950/70 border border-red-700/50 px-2 py-0.5 rounded-full tracking-wider uppercase">
        ⚠ Overdue
      </span>
    );
  return (
    <div
      className={`flex items-center gap-1 ${bgColor} border border-white/10 px-2 py-1 rounded-lg`}
    >
      {t.days > 0 && (
        <span className="text-[12px] font-mono text-slate-900">{t.days}d</span>
      )}
      <span className="text-[11px] font-mono font-bold text-white tabular-nums">
        {String(t.hours).padStart(2, "0")}:{String(t.mins).padStart(2, "0")}:
        {String(t.secs).padStart(2, "0")}
      </span>
      <span className="text-[9px] text-white/80 uppercase tracking-wider">
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
// birthdate is stored as "YYYY-MM-DD" (see SignUp.jsx). Only month/day need
// to match today — the year is irrelevant.
function isBirthdayToday(birthdate) {
  if (!birthdate || typeof birthdate !== "string") return false;
  const parts = birthdate.split("-").map(Number);
  if (parts.length !== 3) return false;
  const [, month, day] = parts;
  if (!month || !day) return false;
  const today = new Date();
  return month === today.getMonth() + 1 && day === today.getDate();
}

function getFirstName(userObj) {
  return userObj?.name?.trim().split(" ")[0] || "there";
}

function BirthdayBanner({ name, onDismiss }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed top-0 inset-x-0 z-[120] flex justify-center px-4 pt-4 pointer-events-none">
      <div
        className={`pointer-events-auto relative max-w-md w-full rounded-2xl overflow-hidden shadow-2xl border border-white/30 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 text-white px-5 py-4 flex items-center gap-3 transition-all duration-500 ${
          entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        }`}
      >
        <span className="text-3xl animate-bounce">🎉</span>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm md:text-base leading-tight">
            Happy Birthday, {name}! 🎂
          </p>
          <p className="text-xs md:text-sm text-white/85 mt-0.5">
            Wishing you a fantastic day — from all of us here.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/80 hover:text-white text-lg font-bold px-1 flex-shrink-0"
          aria-label="Dismiss birthday message"
        >
          ✕
        </button>
        <span className="absolute -top-2 left-8 text-base animate-pulse pointer-events-none">
          ✨
        </span>
        <span className="absolute -bottom-2 right-12 text-base animate-pulse [animation-delay:0.3s] pointer-events-none">
          🎈
        </span>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = [
  "#f43f5e",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
];

// Falls from just under the navbar for as long as it's mounted. Home
// unmounts it after 10s via a timeout, independent of the banner's
// dismiss state, so refreshing on your birthday always re-triggers it.
function BirthdayConfetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 3 + Math.random() * 2.5,
      width: 6 + Math.random() * 6,
      height: 10 + Math.random() * 8,
      color:
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      drift: (Math.random() - 0.5) * 200,
    })),
  );

  return (
    <div className="fixed top-16 md:top-20 inset-x-0 bottom-0 z-[90] overflow-hidden pointer-events-none">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            "--drift": `${p.drift}px`,
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
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div
          className={`absolute inset-0 rounded-full border-2 border-transparent ${spinnerOuter} animate-spin`}
        />
        <div
          className={`absolute inset-2 rounded-full border border-transparent ${spinnerInner} animate-spin [animation-direction:reverse] [animation-duration:0.7s]`}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p
          className={`text-xs font-semibold tracking-[0.3em] uppercase ${textColor} animate-pulse`}
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
const cardConfig = (status, priority, theme) => {
  const {
    cardEmergencyBorder,
    cardEmergencyGlow,
    cardEmergencyBadge,
    cardEmergencyDot,
    cardEmergencyAccent,
    cardEmergencyPriority,
    cardUrgentBorder,
    cardUrgentGlow,
    cardUrgentBadge,
    cardUrgentDot,
    cardUrgentAccent,
    cardUrgentPriority,
    cardNormalBorder,
    cardNormalGlow,
    cardNormalBadge,
    cardNormalDot,
    cardNormalAccent,
    cardNormalPriority,
    cardBg = "bg-zinc-900/70",
  } = theme;

  if (!TERMINAL_STATUSES.includes(status) && priority === "emergency")
    return {
      border: cardEmergencyBorder || "border-red-600/60",
      glow: cardEmergencyGlow || "shadow-[0_0_20px_rgba(220,38,38,0.25)]",
      badge: cardEmergencyBadge || "bg-red-600 text-white",
      dot:
        cardEmergencyDot || "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]",
      accent: cardEmergencyAccent || "from-red-600/20 to-transparent",
      priorityColor: cardEmergencyPriority || "text-red-400",
      cardBg,
    };
  if (!TERMINAL_STATUSES.includes(status) && priority === "urgent")
    return {
      border: cardUrgentBorder || "border-orange-500/50",
      glow: cardUrgentGlow || "shadow-[0_0_16px_rgba(249,115,22,0.2)]",
      badge: cardUrgentBadge || "bg-orange-500 text-white",
      dot:
        cardUrgentDot || "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.7)]",
      accent: cardUrgentAccent || "from-orange-500/15 to-transparent",
      priorityColor: cardUrgentPriority || "text-orange-400",
      cardBg,
    };
  return {
    border: cardNormalBorder || "border-emerald-700/40",
    glow: cardNormalGlow || "shadow-[0_0_12px_rgba(16,185,129,0.1)]",
    badge: cardNormalBadge || "bg-emerald-600 text-white",
    dot:
      cardNormalDot || "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)]",
    accent: cardNormalAccent || "from-emerald-600/10 to-transparent",
    priorityColor: cardNormalPriority || "text-emerald-400",
    cardBg,
  };
};

let emergency;
let urgent;
let routine;

// ─── Default theme (can be overridden per role) ───────────────────────────────
export const THEMES = {
  admin: {
    // ─── Page ─────────────────────────────────────────────
    pageBg: "bg-gradient-to-br from-emerald-50 via-lime-50 to-green-100",

    sidebarBg:
      "bg-gradient-to-br from-emerald-200/55 via-green-100/45 to-lime-100/40 backdrop-blur-2xl supports-[backdrop-filter]:bg-emerald-200/35",

    sidebarBorder:
      "border border-white/30 shadow-[0_8px_32px_rgba(16,185,129,0.18)]",

    contentBg: "bg-transparent",

    // ─── Navbar ──────────────────────────────────────────
    navBg:
      "bg-gradient-to-r from-emerald-500/90 via-green-500/85 to-lime-400/80 backdrop-blur-2xl",

    navBorder:
      "border border-white/20 shadow-[0_8px_32px_rgba(16,185,129,0.18)]",

    logoFrom: "from-emerald-950",
    logoTo: "to-lime-600",
    logoSub: "text-emerald-950/60",

    liveColor: "bg-lime-400",

    liveShadow: "shadow-[0_0_10px_2px_rgba(163,230,53,0.7)]",

    liveText: "text-emerald-950",

    linkActive: "text-white",
    linkHover: "hover:text-lime-100",
    linkBar: "bg-lime-300",

    logoutBorder: "border-white/20",
    logoutText: "text-emerald-950",

    logoutHoverBorder: "hover:border-red-400/50",
    logoutHoverText: "hover:text-red-500",
    logoutHoverBg: "hover:bg-red-500/5",

    accent: "shadow-[0_1px_0_0_rgba(134,239,172,0.25)]",

    glowLine: "via-emerald-300/40",

    // ─── Sidebar nav ─────────────────────────────────────
    sideNavActive:
      "text-emerald-950 bg-white/35 backdrop-blur-xl border border-white/40 shadow-lg",

    sideNavIdle:
      "text-emerald-900/80 hover:text-emerald-950 hover:bg-white/20 backdrop-blur-md border border-transparent",

    sideNavDotActive: "bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.95)]",

    sideNavDotIdle: "bg-emerald-500/40 group-hover:bg-emerald-500",

    sideNavLabel: "text-emerald-950/50",

    // ─── Section headers ─────────────────────────────────
    sectionAccentBar: "from-emerald-500 to-lime-400",

    sectionLabel: "text-emerald-700/70",

    sectionTitle: "text-emerald-950",

    sectionCountBg: "bg-white/30 backdrop-blur-xl border border-white/40",

    sectionCountBorder: "border-white/30",

    sectionCountDot: "bg-lime-400 shadow-[0_0_6px_rgba(163,230,53,0.8)]",

    sectionCountText: "text-emerald-950",

    sectionDivider: "border-emerald-300/40",

    // ─── Cards ───────────────────────────────────────────
    cardBg: "bg-white/25 backdrop-blur-2xl border border-white/20",

    cardNormalBorder: "border-emerald-400/50",

    cardNormalGlow: "shadow-[0_0_18px_rgba(16,185,129,0.14)]",

    cardNormalDot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",

    cardNormalAccent: "from-emerald-500/15 to-transparent",

    cardNormalPriority: "text-emerald-700",

    cardEmergencyBorder: "border-red-400/60",

    cardEmergencyGlow: "shadow-[0_0_20px_rgba(239,68,68,0.22)]",

    cardEmergencyDot: "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]",

    cardEmergencyAccent: "from-red-500/20 to-transparent",

    cardEmergencyPriority: "text-red-500",

    cardUrgentBorder: "border-yellow-400/60",

    cardUrgentGlow: "shadow-[0_0_20px_rgba(250,204,21,0.18)]",

    cardUrgentDot: "bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.9)]",

    cardUrgentAccent: "from-yellow-400/20 to-transparent",

    cardUrgentPriority: "text-yellow-600",

    cardDateLabel: "text-emerald-900/60",

    cardDateValue: "text-emerald-950",

    cardStatusBg: "bg-white/25 backdrop-blur-lg border border-white/30",

    cardStatusBorder: "border-white/20",

    cardStatusText: "text-emerald-900",

    // ─── Feedback badge ──────────────────────────────────
    feedbackBadge: "bg-lime-300 text-emerald-950 shadow-lg",

    // ─── Mobile toggle ───────────────────────────────────
    mobileToggleBg: "bg-white/25 backdrop-blur-xl",

    mobileToggleBorder: "border-white/30",

    mobileToggleText: "text-emerald-950",

    mobileToggleHover: "hover:bg-white/40",

    mobileBottomBg: "bg-white/25 backdrop-blur-2xl",

    mobileBottomBorder: "border-white/30",

    mobileBottomDot: "bg-lime-400",

    mobileBottomText: "text-emerald-950",

    // ─── Bottom sheet ────────────────────────────────────
    sheetBg:
      "bg-gradient-to-br from-emerald-100/95 to-lime-50/95 backdrop-blur-2xl",

    sheetBorder: "border-white/30",

    sheetTopBar: "from-emerald-400 via-lime-400",

    titleColor: "text-emerald-950",

    emptyText: "text-emerald-700/50",

    // ─── Slide panel ─────────────────────────────────────
    slideBg:
      "bg-gradient-to-br from-emerald-100/95 to-lime-50/95 backdrop-blur-2xl",

    slideBorder: "border-white/30",

    slideTopBar: "from-emerald-400 via-lime-400",

    linkActiveBg: "bg-white/35 backdrop-blur-xl",

    linkActiveBorder: "border-white/40",

    linkActiveText: "text-emerald-950",

    linkIdleBorder: "border-white/10",

    linkIdleText: "text-emerald-900/50",

    linkHoverText: "hover:text-emerald-950",

    linkHoverBorder: "hover:border-white/30",

    linkHoverBg: "hover:bg-white/20",

    // ─── Spinner ─────────────────────────────────────────
    spinnerOuter: "border-t-emerald-500",

    spinnerInner: "border-t-lime-400/70",

    dotColor: "bg-lime-400",

    textColor: "text-emerald-700/70",

    // ─── Report details ──────────────────────────────────
    detailsBg: "bg-gradient-to-br from-emerald-100 to-lime-50",

    detailsCloseText: "text-emerald-950",

    detailsLabelColor: "text-emerald-900",

    detailsValueColor: "text-emerald-700",
  },

  estate: {
    // ─── Page ─────────────────────────────────────────────
    pageBg: "bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100",

    sidebarBg:
      "bg-gradient-to-br from-sky-200/55 via-blue-100/45 to-cyan-100/40 backdrop-blur-2xl supports-[backdrop-filter]:bg-sky-200/35",

    sidebarBorder:
      "border border-white/30 shadow-[0_8px_32px_rgba(14,165,233,0.18)]",

    contentBg: "bg-transparent",

    // ─── Navbar ──────────────────────────────────────────
    navBg:
      "bg-gradient-to-r from-sky-500/90 via-blue-500/85 to-cyan-400/80 backdrop-blur-2xl",

    navBorder:
      "border border-white/20 shadow-[0_8px_32px_rgba(14,165,233,0.18)]",

    logoFrom: "from-sky-950",
    logoTo: "to-cyan-500",
    logoSub: "text-sky-950/60",

    liveColor: "bg-cyan-300",

    liveShadow: "shadow-[0_0_10px_2px_rgba(103,232,249,0.7)]",

    liveText: "text-sky-950",

    linkActive: "text-white",
    linkHover: "hover:text-cyan-100",
    linkBar: "bg-cyan-200",

    logoutBorder: "border-white/20",
    logoutText: "text-sky-950",

    logoutHoverBorder: "hover:border-red-400/50",
    logoutHoverText: "hover:text-red-500",
    logoutHoverBg: "hover:bg-red-500/5",

    accent: "shadow-[0_1px_0_0_rgba(125,211,252,0.25)]",

    glowLine: "via-sky-300/40",

    // ─── Sidebar nav ─────────────────────────────────────
    sideNavActive:
      "text-sky-950 bg-white/35 backdrop-blur-xl border border-white/40 shadow-lg",

    sideNavIdle:
      "text-sky-900/80 hover:text-sky-950 hover:bg-white/20 backdrop-blur-md border border-transparent",

    sideNavDotActive: "bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.95)]",

    sideNavDotIdle: "bg-sky-500/40 group-hover:bg-sky-500",

    sideNavLabel: "text-sky-950/50",

    // ─── Section headers ─────────────────────────────────
    sectionAccentBar: "from-sky-500 to-cyan-400",

    sectionLabel: "text-sky-700/70",

    sectionTitle: "text-sky-950",

    sectionCountBg: "bg-white/30 backdrop-blur-xl border border-white/40",

    sectionCountBorder: "border-white/30",

    sectionCountDot: "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]",

    sectionCountText: "text-sky-950",

    sectionDivider: "border-sky-300/40",

    // ─── Cards ───────────────────────────────────────────
    cardBg: "bg-white/25 backdrop-blur-2xl border border-white/20",

    cardNormalBorder: "border-green-400/50",

    cardNormalGlow: "shadow-[0_0_18px_rgba(34,197,94,0.14)]",

    cardNormalDot: "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]",

    cardNormalAccent: "from-green-500/15 to-transparent",

    cardNormalPriority: "text-green-700",

    cardEmergencyBorder: "border-red-400/60",

    cardEmergencyGlow: "shadow-[0_0_20px_rgba(239,68,68,0.22)]",

    cardEmergencyDot: "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]",

    cardEmergencyAccent: "from-red-500/20 to-transparent",

    cardEmergencyPriority: "text-red-500",

    cardUrgentBorder: "border-yellow-400/60",

    cardUrgentGlow: "shadow-[0_0_20px_rgba(250,204,21,0.18)]",

    cardUrgentDot: "bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.9)]",

    cardUrgentAccent: "from-yellow-400/20 to-transparent",

    cardUrgentPriority: "text-yellow-600",

    cardDateLabel: "text-sky-900/60",

    cardDateValue: "text-sky-950",

    cardStatusBg: "bg-white/25 backdrop-blur-lg border border-white/30",

    cardStatusBorder: "border-white/20",

    cardStatusText: "text-sky-900",

    // ─── Feedback badge ──────────────────────────────────
    feedbackBadge: "bg-cyan-300 text-sky-950 shadow-lg",

    // ─── Mobile toggle ───────────────────────────────────
    mobileToggleBg: "bg-white/25 backdrop-blur-xl",

    mobileToggleBorder: "border-white/30",

    mobileToggleText: "text-sky-950",

    mobileToggleHover: "hover:bg-white/40",

    mobileBottomBg: "bg-white/25 backdrop-blur-2xl",

    mobileBottomBorder: "border-white/30",

    mobileBottomDot: "bg-cyan-300",

    mobileBottomText: "text-sky-950",

    // ─── Bottom sheet ────────────────────────────────────
    sheetBg:
      "bg-gradient-to-br from-sky-100/95 to-cyan-50/95 backdrop-blur-2xl",

    sheetBorder: "border-white/30",

    sheetTopBar: "from-sky-400 via-cyan-400",

    titleColor: "text-sky-950",

    emptyText: "text-sky-700/50",

    // ─── Slide panel ─────────────────────────────────────
    slideBg:
      "bg-gradient-to-br from-sky-100/95 to-cyan-50/95 backdrop-blur-2xl",

    slideBorder: "border-white/30",

    slideTopBar: "from-sky-400 via-cyan-400",

    linkActiveBg: "bg-white/35 backdrop-blur-xl",

    linkActiveBorder: "border-white/40",

    linkActiveText: "text-sky-950",

    linkIdleBorder: "border-white/10",

    linkIdleText: "text-sky-900/50",

    linkHoverText: "hover:text-sky-950",

    linkHoverBorder: "hover:border-white/30",

    linkHoverBg: "hover:bg-white/20",

    // ─── Spinner ─────────────────────────────────────────
    spinnerOuter: "border-t-sky-500",

    spinnerInner: "border-t-cyan-400/70",

    dotColor: "bg-cyan-300",

    textColor: "text-sky-700/70",

    // ─── Report details ──────────────────────────────────
    detailsBg: "bg-gradient-to-br from-sky-100 to-cyan-50",

    detailsCloseText: "text-sky-950",

    detailsLabelColor: "text-sky-900",

    detailsValueColor: "text-sky-700",
  },

  worker: {
    // ─── Page ─────────────────────────────────────────────
    pageBg: "bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100",

    sidebarBg:
      "bg-gradient-to-br from-amber-200/55 via-yellow-100/45 to-orange-100/40 backdrop-blur-2xl supports-[backdrop-filter]:bg-amber-200/35",

    sidebarBorder:
      "border border-white/30 shadow-[0_8px_32px_rgba(245,158,11,0.18)]",

    contentBg: "bg-transparent",

    // ─── Navbar ──────────────────────────────────────────
    navBg:
      "bg-gradient-to-r from-amber-400/90 via-yellow-400/85 to-orange-300/80 backdrop-blur-2xl",

    navBorder:
      "border border-white/20 shadow-[0_8px_32px_rgba(245,158,11,0.18)]",

    logoFrom: "from-amber-950",
    logoTo: "to-orange-500",
    logoSub: "text-amber-950/60",

    liveColor: "bg-orange-300",

    liveShadow: "shadow-[0_0_10px_2px_rgba(253,186,116,0.7)]",

    liveText: "text-amber-950",

    linkActive: "text-white",
    linkHover: "hover:text-yellow-100",
    linkBar: "bg-yellow-100",

    logoutBorder: "border-white/20",
    logoutText: "text-amber-950",

    logoutHoverBorder: "hover:border-red-400/50",
    logoutHoverText: "hover:text-red-500",
    logoutHoverBg: "hover:bg-red-500/5",

    accent: "shadow-[0_1px_0_0_rgba(253,224,71,0.25)]",

    glowLine: "via-yellow-200/40",

    // ─── Sidebar nav ─────────────────────────────────────
    sideNavActive:
      "text-amber-950 bg-white/35 backdrop-blur-xl border border-white/40 shadow-lg",

    sideNavIdle:
      "text-amber-900/80 hover:text-amber-950 hover:bg-white/20 backdrop-blur-md border border-transparent",

    sideNavDotActive: "bg-orange-300 shadow-[0_0_8px_rgba(253,186,116,0.95)]",

    sideNavDotIdle: "bg-amber-500/40 group-hover:bg-amber-500",

    sideNavLabel: "text-amber-950/50",

    // ─── Section headers ─────────────────────────────────
    sectionAccentBar: "from-amber-400 to-orange-300",

    sectionLabel: "text-amber-700/70",

    sectionTitle: "text-amber-950",

    sectionCountBg: "bg-white/30 backdrop-blur-xl border border-white/40",

    sectionCountBorder: "border-white/30",

    sectionCountDot: "bg-orange-300 shadow-[0_0_6px_rgba(253,186,116,0.8)]",

    sectionCountText: "text-amber-950",

    sectionDivider: "border-amber-300/40",

    // ─── Cards ───────────────────────────────────────────
    cardBg: "bg-white/25 backdrop-blur-2xl border border-white/20",

    // Routine / Normal
    normalTimeLeftBg: "bg-green-500",

    cardNormalBorder: "border-green-400/50",

    cardNormalGlow: "shadow-[0_0_18px_rgba(34,197,94,0.14)]",

    cardNormalDot: "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]",

    cardNormalAccent: "from-green-500/15 to-transparent",

    cardNormalPriority: "text-green-700",

    // Emergency
    cardEmergencyBorder: "border-red-400/60",

    cardEmergencyGlow: "shadow-[0_0_20px_rgba(239,68,68,0.22)]",

    cardEmergencyDot: "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]",

    cardEmergencyAccent: "from-red-500/20 to-transparent",

    cardEmergencyPriority: "text-red-500",

    // Urgent
    cardUrgentBorder: "border-yellow-400/60",

    cardUrgentGlow: "shadow-[0_0_20px_rgba(250,204,21,0.18)]",

    cardUrgentDot: "bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.9)]",

    cardUrgentAccent: "from-yellow-400/20 to-transparent",

    cardUrgentPriority: "text-yellow-600",

    cardDateLabel: "text-amber-900/60",

    cardDateValue: "text-amber-950",

    cardStatusBg: "bg-white/25 backdrop-blur-lg border border-white/30",

    cardStatusBorder: "border-white/20",

    cardStatusText: "text-amber-900",

    // ─── Feedback badge ──────────────────────────────────
    feedbackBadge: "bg-orange-300 text-amber-950 shadow-lg",

    // ─── Mobile toggle ───────────────────────────────────
    mobileToggleBg: "bg-white/25 backdrop-blur-xl",

    mobileToggleBorder: "border-white/30",

    mobileToggleText: "text-amber-950",

    mobileToggleHover: "hover:bg-white/40",

    mobileBottomBg: "bg-white/25 backdrop-blur-2xl",

    mobileBottomBorder: "border-white/30",

    mobileBottomDot: "bg-orange-300",

    mobileBottomText: "text-amber-950",

    // ─── Bottom sheet ────────────────────────────────────
    sheetBg:
      "bg-gradient-to-br from-amber-100/95 to-yellow-50/95 backdrop-blur-2xl",

    sheetBorder: "border-white/30",

    sheetTopBar: "from-amber-400 via-orange-300",

    titleColor: "text-amber-950",

    emptyText: "text-amber-700/50",

    // ─── Slide panel ─────────────────────────────────────
    slideBg:
      "bg-gradient-to-br from-amber-100/95 to-yellow-50/95 backdrop-blur-2xl",

    slideBorder: "border-white/30",

    slideTopBar: "from-amber-400 via-orange-300",

    linkActiveBg: "bg-white/35 backdrop-blur-xl",

    linkActiveBorder: "border-white/40",

    linkActiveText: "text-amber-950",

    linkIdleBorder: "border-white/10",

    linkIdleText: "text-amber-900/50",

    linkHoverText: "hover:text-amber-950",

    linkHoverBorder: "hover:border-white/30",

    linkHoverBg: "hover:bg-white/20",

    // ─── Spinner ─────────────────────────────────────────
    spinnerOuter: "border-t-amber-500",

    spinnerInner: "border-t-orange-300/70",

    dotColor: "bg-orange-300",

    textColor: "text-amber-700/70",

    // ─── Report details ──────────────────────────────────
    detailsBg: "bg-gradient-to-br from-amber-100 to-yellow-50",

    detailsCloseText: "text-amber-950",

    detailsLabelColor: "text-amber-900",

    detailsValueColor: "text-amber-700",
  },
  manager: {
    // ─── Page ─────────────────────────────────────────────
    pageBg: "bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100",

    sidebarBg:
      "bg-gradient-to-br from-orange-200/55 via-amber-100/45 to-orange-100/40 backdrop-blur-2xl supports-[backdrop-filter]:bg-orange-200/35",

    sidebarBorder:
      "border border-white/30 shadow-[0_8px_32px_rgba(255,136,37,0.18)]",

    contentBg: "bg-transparent",

    // ─── Navbar ──────────────────────────────────────────
    navBg:
      "bg-gradient-to-r from-[#FF8825]/90 via-[#FF9F52]/85 to-[#FFB878]/80 backdrop-blur-2xl",

    navBorder:
      "border border-white/20 shadow-[0_8px_32px_rgba(255,136,37,0.18)]",

    logoFrom: "from-[#7C3A00]",
    logoTo: "to-[#FF8825]",
    logoSub: "text-[#7C3A00]/60",

    liveColor: "bg-[#FFD166]",
    liveShadow: "shadow-[0_0_10px_2px_rgba(255,209,102,0.7)]",
    liveText: "text-[#7C3A00]",

    linkActive: "text-white",
    linkHover: "hover:text-[#FFE3C2]",
    linkBar: "bg-[#FFD166]",

    logoutBorder: "border-white/20",
    logoutText: "text-[#7C3A00]",

    logoutHoverBorder: "hover:border-red-400/50",
    logoutHoverText: "hover:text-red-500",
    logoutHoverBg: "hover:bg-red-500/5",

    accent: "shadow-[0_1px_0_0_rgba(255,209,102,0.25)]",
    glowLine: "via-[#FFCB91]/40",

    // ─── Sidebar nav ─────────────────────────────────────
    sideNavActive:
      "text-[#7C3A00] bg-white/35 backdrop-blur-xl border border-white/40 shadow-lg",

    sideNavIdle:
      "text-[#7C3A00]/80 hover:text-[#7C3A00] hover:bg-white/20 backdrop-blur-md border border-transparent",

    sideNavDotActive: "bg-[#FFD166] shadow-[0_0_8px_rgba(255,209,102,0.95)]",
    sideNavDotIdle: "bg-[#FF8825]/40 group-hover:bg-[#FF8825]",
    sideNavLabel: "text-[#7C3A00]/50",

    // ─── Section headers ─────────────────────────────────
    sectionAccentBar: "from-[#FF8825] to-[#FFB878]",
    sectionLabel: "text-[#7C3A00]/70",
    sectionTitle: "text-[#7C3A00]",
    sectionCountBg: "bg-white/30 backdrop-blur-xl border border-white/40",
    sectionCountBorder: "border-white/30",
    sectionCountDot: "bg-[#FFD166] shadow-[0_0_6px_rgba(255,209,102,0.8)]",
    sectionCountText: "text-[#7C3A00]",
    sectionDivider: "border-orange-300/40",

    // ─── Cards ───────────────────────────────────────────
    cardBg: "bg-white/25 backdrop-blur-2xl border border-white/20",

    cardNormalBorder: "border-emerald-400/50",
    cardNormalGlow: "shadow-[0_0_18px_rgba(16,185,129,0.14)]",
    cardNormalDot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
    cardNormalAccent: "from-emerald-500/15 to-transparent",
    cardNormalPriority: "text-emerald-700",

    cardEmergencyBorder: "border-red-400/60",
    cardEmergencyGlow: "shadow-[0_0_20px_rgba(239,68,68,0.22)]",
    cardEmergencyDot: "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]",
    cardEmergencyAccent: "from-red-500/20 to-transparent",
    cardEmergencyPriority: "text-red-500",

    cardUrgentBorder: "border-yellow-400/60",
    cardUrgentGlow: "shadow-[0_0_20px_rgba(250,204,21,0.18)]",
    cardUrgentDot: "bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.9)]",
    cardUrgentAccent: "from-yellow-400/20 to-transparent",
    cardUrgentPriority: "text-yellow-600",

    cardDateLabel: "text-[#7C3A00]/60",
    cardDateValue: "text-[#7C3A00]",
    cardStatusBg: "bg-white/25 backdrop-blur-lg border border-white/30",
    cardStatusBorder: "border-white/20",
    cardStatusText: "text-[#7C3A00]/90",

    // ─── Feedback badge ──────────────────────────────────
    feedbackBadge: "bg-[#FFD166] text-[#7C3A00] shadow-lg",

    // ─── Mobile toggle ───────────────────────────────────
    mobileToggleBg: "bg-white/25 backdrop-blur-xl",
    mobileToggleBorder: "border-white/30",
    mobileToggleText: "text-[#7C3A00]",
    mobileToggleHover: "hover:bg-white/40",

    mobileBottomBg: "bg-white/25 backdrop-blur-2xl",
    mobileBottomBorder: "border-white/30",
    mobileBottomDot: "bg-[#FFD166]",
    mobileBottomText: "text-[#7C3A00]",

    // ─── Bottom sheet ────────────────────────────────────
    sheetBg:
      "bg-gradient-to-br from-orange-100/95 to-amber-50/95 backdrop-blur-2xl",
    sheetBorder: "border-white/30",
    sheetTopBar: "from-[#FF8825] via-[#FFB878]",
    titleColor: "text-[#7C3A00]",
    emptyText: "text-[#7C3A00]/50",

    // ─── Slide panel ─────────────────────────────────────
    slideBg:
      "bg-gradient-to-br from-orange-100/95 to-amber-50/95 backdrop-blur-2xl",
    slideBorder: "border-white/30",
    slideTopBar: "from-[#FF8825] via-[#FFB878]",

    linkActiveBg: "bg-white/35 backdrop-blur-xl",
    linkActiveBorder: "border-white/40",
    linkActiveText: "text-[#7C3A00]",
    linkIdleBorder: "border-white/10",
    linkIdleText: "text-[#7C3A00]/50",
    linkHoverText: "hover:text-[#7C3A00]",
    linkHoverBorder: "hover:border-white/30",
    linkHoverBg: "hover:bg-white/20",

    // ─── Spinner ─────────────────────────────────────────
    spinnerOuter: "border-t-[#FF8825]",
    spinnerInner: "border-t-[#FFB878]/70",
    dotColor: "bg-[#FFD166]",
    textColor: "text-[#7C3A00]/70",

    // ─── Report details ──────────────────────────────────
    detailsBg: "bg-gradient-to-br from-orange-100 to-amber-50",
    detailsCloseText: "text-[#7C3A00]",
    detailsLabelColor: "text-[#7C3A00]/90",
    detailsValueColor: "text-[#7C3A00]/70",
  },

  procurement: {
    // ─── Page ─────────────────────────────────────────────
    pageBg: "bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100",

    sidebarBg:
      "bg-gradient-to-br from-violet-200/55 via-purple-100/45 to-indigo-100/40 backdrop-blur-2xl supports-[backdrop-filter]:bg-violet-200/35",

    sidebarBorder:
      "border border-white/30 shadow-[0_8px_32px_rgba(124,58,237,0.18)]",

    contentBg: "bg-transparent",

    // ─── Navbar ──────────────────────────────────────────
    navBg:
      "bg-gradient-to-r from-violet-500/90 via-purple-500/85 to-indigo-400/80 backdrop-blur-2xl",

    navBorder:
      "border border-white/20 shadow-[0_8px_32px_rgba(124,58,237,0.18)]",

    logoFrom: "from-violet-950",
    logoTo: "to-indigo-600",
    logoSub: "text-violet-950/60",

    liveColor: "bg-indigo-300",
    liveShadow: "shadow-[0_0_10px_2px_rgba(165,180,252,0.7)]",
    liveText: "text-violet-950",

    linkActive: "text-white",
    linkHover: "hover:text-indigo-100",
    linkBar: "bg-indigo-200",

    logoutBorder: "border-white/20",
    logoutText: "text-violet-950",

    logoutHoverBorder: "hover:border-red-400/50",
    logoutHoverText: "hover:text-red-500",
    logoutHoverBg: "hover:bg-red-500/5",

    accent: "shadow-[0_1px_0_0_rgba(199,210,254,0.25)]",
    glowLine: "via-violet-300/40",

    // ─── Sidebar nav ─────────────────────────────────────
    sideNavActive:
      "text-violet-950 bg-white/35 backdrop-blur-xl border border-white/40 shadow-lg",

    sideNavIdle:
      "text-violet-900/80 hover:text-violet-950 hover:bg-white/20 backdrop-blur-md border border-transparent",

    sideNavDotActive: "bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.95)]",
    sideNavDotIdle: "bg-violet-500/40 group-hover:bg-violet-500",
    sideNavLabel: "text-violet-950/50",

    // ─── Section headers ─────────────────────────────────
    sectionAccentBar: "from-violet-500 to-indigo-400",
    sectionLabel: "text-violet-700/70",
    sectionTitle: "text-violet-950",
    sectionCountBg: "bg-white/30 backdrop-blur-xl border border-white/40",
    sectionCountBorder: "border-white/30",
    sectionCountDot: "bg-indigo-300 shadow-[0_0_6px_rgba(165,180,252,0.8)]",
    sectionCountText: "text-violet-950",
    sectionDivider: "border-violet-300/40",

    // ─── Cards ───────────────────────────────────────────
    cardBg: "bg-white/25 backdrop-blur-2xl border border-white/20",

    cardNormalBorder: "border-emerald-400/50",
    cardNormalGlow: "shadow-[0_0_18px_rgba(16,185,129,0.14)]",
    cardNormalDot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
    cardNormalAccent: "from-emerald-500/15 to-transparent",
    cardNormalPriority: "text-emerald-700",

    cardEmergencyBorder: "border-red-400/60",
    cardEmergencyGlow: "shadow-[0_0_20px_rgba(239,68,68,0.22)]",
    cardEmergencyDot: "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]",
    cardEmergencyAccent: "from-red-500/20 to-transparent",
    cardEmergencyPriority: "text-red-500",

    cardUrgentBorder: "border-yellow-400/60",
    cardUrgentGlow: "shadow-[0_0_20px_rgba(250,204,21,0.18)]",
    cardUrgentDot: "bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.9)]",
    cardUrgentAccent: "from-yellow-400/20 to-transparent",
    cardUrgentPriority: "text-yellow-600",

    cardDateLabel: "text-violet-900/60",
    cardDateValue: "text-violet-950",
    cardStatusBg: "bg-white/25 backdrop-blur-lg border border-white/30",
    cardStatusBorder: "border-white/20",
    cardStatusText: "text-violet-900",

    // ─── Feedback badge ──────────────────────────────────
    feedbackBadge: "bg-indigo-300 text-violet-950 shadow-lg",

    // ─── Mobile toggle ───────────────────────────────────
    mobileToggleBg: "bg-white/25 backdrop-blur-xl",
    mobileToggleBorder: "border-white/30",
    mobileToggleText: "text-violet-950",
    mobileToggleHover: "hover:bg-white/40",

    mobileBottomBg: "bg-white/25 backdrop-blur-2xl",
    mobileBottomBorder: "border-white/30",
    mobileBottomDot: "bg-indigo-300",
    mobileBottomText: "text-violet-950",

    // ─── Bottom sheet ────────────────────────────────────
    sheetBg:
      "bg-gradient-to-br from-violet-100/95 to-indigo-50/95 backdrop-blur-2xl",
    sheetBorder: "border-white/30",
    sheetTopBar: "from-violet-400 via-indigo-400",
    titleColor: "text-violet-950",
    emptyText: "text-violet-700/50",

    // ─── Slide panel ─────────────────────────────────────
    slideBg:
      "bg-gradient-to-br from-violet-100/95 to-indigo-50/95 backdrop-blur-2xl",
    slideBorder: "border-white/30",
    slideTopBar: "from-violet-400 via-indigo-400",

    linkActiveBg: "bg-white/35 backdrop-blur-xl",
    linkActiveBorder: "border-white/40",
    linkActiveText: "text-violet-950",
    linkIdleBorder: "border-white/10",
    linkIdleText: "text-violet-900/50",
    linkHoverText: "hover:text-violet-950",
    linkHoverBorder: "hover:border-white/30",
    linkHoverBg: "hover:bg-white/20",

    // ─── Spinner ─────────────────────────────────────────
    spinnerOuter: "border-t-violet-500",
    spinnerInner: "border-t-indigo-400/70",
    dotColor: "bg-indigo-300",
    textColor: "text-violet-700/70",

    // ─── Report details ──────────────────────────────────
    detailsBg: "bg-gradient-to-br from-violet-100 to-indigo-50",
    detailsCloseText: "text-violet-950",
    detailsLabelColor: "text-violet-900",
    detailsValueColor: "text-violet-700",
  },
};

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
        className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border ${theme.sectionCountBg} ${theme.sectionCountBorder} ${theme.sectionCountText} transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110`}
      >
        <span className="material-symbols-outlined text-sm">chevron_left</span>
        Prev
      </button>
      <span
        className={`text-xs font-mono font-semibold tracking-wide ${theme.sectionCountText}`}
      >
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border ${theme.sectionCountBg} ${theme.sectionCountBorder} ${theme.sectionCountText} transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110`}
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

function buildBaseConstraints({ statusValue, role, userId, timeFilter }) {
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

  // Reset paging whenever the query "shape" changes (status set, role/user,
  // time filter, or switching in/out of search mode). dateField no longer
  // affects the Firestore query itself (see note above), only display
  // sorting, but it's kept here too in case a caller ever swaps it.
  useEffect(() => {
    setPage(1);
    cursorCacheRef.current = { 1: null };
  }, [statusKey, dateField, role, userId, timeFilter, searchMode]);

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
  title1,
  title2,
  reportDate1,
  reportDate2,
  firstReportsStatus,
  secondReportsStatus,
  reportsHiddenOnMobileTitle,
  specificReportsPage,
  closedRedirect,
  homeRedirect,
  dashboardRedirect,
  role,
}) {
  const theme = THEMES[role] || THEMES[(role = "admin")];
  const [sidePopup, setSidePopup] = useState(false);
  const [showReportsHiddenOnMobile, SetShowReportsHiddenOnMobile] =
    useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReportId, setCurrentReportId] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showBirthdayBanner, setShowBirthdayBanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("overall");
  const [badgeData, setBadgeData] = useState({});

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

  // Show the birthday banner once per day, on the user's actual birthday
  // only. Dismissal is remembered in localStorage so it doesn't keep
  // popping back up on every navigation/refresh for the rest of the day,
  // but it'll return next year.
  useEffect(() => {
    if (!user?.birthdate || !isBirthdayToday(user.birthdate)) return;
    const todayKey = new Date().toISOString().split("T")[0];
    const dismissKey = `birthdayDismissed:${user.ID || user.email}:${todayKey}`;
    if (localStorage.getItem(dismissKey)) return;
    setShowBirthdayBanner(true);
  }, []);

  const dismissBirthdayBanner = () => {
    setShowBirthdayBanner(false);
    const todayKey = new Date().toISOString().split("T")[0];
    const dismissKey = `birthdayDismissed:${user?.ID || user?.email}:${todayKey}`;
    localStorage.setItem(dismissKey, "1");
  };

  const [showConfetti, setShowConfetti] = useState(false);

  // Confetti runs for exactly 10s from mount/refresh, regardless of
  // whether the banner has been dismissed for the day — so it replays
  // every time the page opens/refreshes on the birthday.
  useEffect(() => {
    if (!user?.birthdate || !isBirthdayToday(user.birthdate)) return;
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 10000);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setTimeout(() => SetShowReportsHiddenOnMobile(false), 300);
  };

  const isNewForUser = useCallback(
    (report) =>
      !!user?.ID && report.lastViewedStatus?.[user.ID] !== report.status,
    [user?.ID],
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
    const newRejectedCount = allBadgeReports.filter(
      (r) => r.status === "rejected" && isNewForUser(r),
    ).length;
    const newAcceptedCount = allBadgeReports.filter(
      (r) => r.status === "accepted" && isNewForUser(r),
    ).length;
    const newReopenedCount = allBadgeReports.filter(
      (r) => r.status === "reopened" && isNewForUser(r),
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

    return {
      newAssignedCount,
      newRejectedCount,
      newAcceptedCount,
      newReopenedCount,
      newCompletedCount,
      newClosedCount,
      completedWithFeedback,
      closedWithFeedback,
      rejectedCount,
      acceptedCount,
      reopenedCount,
    };
  }, [allBadgeReports, isNewForUser, hasFeedback]);

  const {
    newAssignedCount,
    newRejectedCount,
    newAcceptedCount,
    newReopenedCount,
    newCompletedCount,
    newClosedCount,
    completedWithFeedback,
    closedWithFeedback,
    rejectedCount,
    acceptedCount,
    reopenedCount,
  } = badgeCounts;

  const displayReportDetails = (report) => {
    setCurrentReportId(report.id);
    setSelectedReport(report);
    setDisplayDetails(true);

    if (isNewForUser(report)) {
      markReportViewed(report.id, user.ID, report.status);
      const patch = {
        lastViewedStatus: {
          ...(report.lastViewedStatus || {}),
          [user.ID]: report.status,
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
    approved: "Approved by admin — waiting for the Estate Manager review.",
    pending: "Material request sent to admin — awaiting approval.",
    confirmed: "Material request approved — awaiting procurement.",
    procured: "Materials procured — waiting for technician assignment.",
    assigned: "Assigned to a technician — awaiting their response.",
    rejected:
      "Technician declined this job — waiting for Estate Manager reassignment.",
    accepted: "Technician accepted the job and is currently working on it.",
    reopened: "Reporter wasn't satisfied — back with the Estate Manager.",
    closed: "Report closed.",
  };

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
  const { pageNewCount, pageFeedbackCount } = useMemo(() => {
    const relevant = allBadgeReports.filter((r) =>
      pageStatuses.includes(r.status),
    );
    return {
      pageNewCount: relevant.filter((r) => isNewForUser(r)).length,
      pageFeedbackCount: relevant.filter((r) => hasFeedback(r)).length,
    };
  }, [allBadgeReports, pageStatuses, isNewForUser, hasFeedback]);

  const hasUnreadItems = pageNewCount > 0 || pageFeedbackCount > 0;

  // Clears every "🆕 New" and "💬 Feedback" badge across this user's
  // reports for the statuses shown on this page (bounded to the badge
  // data's fetch window — see BADGE_FETCH_LIMIT). Two separate batches are
  // used because the Firestore rules only allow a report update to touch
  // lastViewedStatus OR feedbackViewedBy in a single write, never both
  // together. Each batch is further chunked to stay under Firestore's
  // 500-operation-per-batch hard limit.
  const handleMarkAllAsRead = useCallback(async () => {
    if (!user?.ID) return;
    const relevant = allBadgeReports.filter((r) =>
      pageStatuses.includes(r.status),
    );
    const toMarkNew = relevant.filter((r) => isNewForUser(r));
    const toMarkFeedback = relevant.filter((r) => hasFeedback(r));
    if (toMarkNew.length === 0 && toMarkFeedback.length === 0) return;

    try {
      for (const group of chunk(toMarkNew, BATCH_CHUNK_SIZE)) {
        const viewedBatch = writeBatch(db);
        group.forEach((r) => {
          viewedBatch.update(doc(db, "reports", r.id), {
            [`lastViewedStatus.${user.ID}`]: r.status,
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
            pageStatuses.includes(r.status)
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
    user?.ID,
    isNewForUser,
    hasFeedback,
    firstSection,
  ]);

  const PRIORITY_BG = {
    emergency: "bg-red-500",
    urgent: "bg-yellow-400",
    routine: "bg-green-500",
  };

  const WorkStartedLabel = ({ dateAccepted, className }) => {
    const label = useLiveTimeAgo(dateAccepted);
    if (!label) return null;
    return (
      <p className={`text-[12px] italic ${className}`}>Work started {label}</p>
    );
  };

  // ─── Report Card ───────────────────────────────────────────────────────────
  const ReportCard = ({ report, reportDate }) => {
    const cfg = cardConfig(report.status, report.priorityLevel, theme);
    return (
      <div className="relative w-full  max-w-[250px] md:max-w-[300px] flex justify-center">
        {/* Feedback badge */}
        {hasFeedback(report) && (
          <span
            className={`absolute -top-1 -right-1 ${theme.feedbackBadge} text-[10px] font-black px-2 py-0.5 rounded-full  animate-bounce z-10 tracking-wide`}
          >
            💬 Feedback
          </span>
        )}

        {isNewForUser(report) && (
          <span className="absolute -top-1 -left-1 bg-sky-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce z-10 tracking-wide">
            🆕 New
          </span>
        )}
        <div
          className={`relative group select-none ${cfg.border} ${cfg.glow} ${theme.cardBg} flex flex-col gap-3 cursor-pointer transition-all border-${theme.secColor} duration-300 hover:scale-[1.03] hover:-translate-y-1 rounded-2xl w-full max-w-[250px] md:max-w-[280px] p-4 overflow-hidden`}
          onClick={() => displayReportDetails(report)}
        >
          {/* Top gradient line */}
          <div
            className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${cfg.accent}`}
          />
          <div
            className={`absolute top-0 left-0 right-0 h-16 bg-gradient-to-b ${cfg.accent} pointer-events-none rounded-t-2xl`}
          />
          {/* Priority row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`}
              />
              <span
                className={`text-xs font-black tracking-widest uppercase ${cfg.priorityColor}`}
              >
                {report.priorityLevel}
              </span>
            </div>
            <span
              className={`text-[10px] ${theme.cardStatusBg} border ${theme.cardStatusBorder} ${theme.cardStatusText} px-2 py-0.5 rounded-full font-mono tracking-wider uppercase`}
            >
              {report.status}
            </span>
          </div>
          <div className="h-px bg-white/5" />
          <div className="h-px bg-white/5" />
          {getStatusMessage(report) && (
            <p
              className={`text-[12px] leading-relaxed font-bold -mt-1 ${theme.cardDateLabel} `}
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
          {/* Date */}
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] ${theme.cardDateLabel} uppercase tracking-wider font-semibold`}
            >
              Sent
            </span>
            <span className={`text-xs ${theme.cardDateValue} font-mono`}>
              {report[reportDate]?.toDate?.().toLocaleDateString()}
            </span>
          </div>

          {report.overdue && (
            <div className="flex flex-col gap-1 bg-red-950/50 border border-red-800/40 rounded-xl px-3 py-2">
              <span className="text-[10px] font-black text-red-500 tracking-widest uppercase flex items-center gap-1">
                <span>⚠</span> Overdue
              </span>
              {report.dateDue && !TERMINAL_STATUSES.includes(report.status) && (
                <span className="text-[10px] text-yellow-400/90 font-mono">
                  Due {timeAgo(report.dateDue)}
                </span>
              )}
            </div>
          )}
          {!report.overdue && (
            <Countdown
              dateDue={report.dateDue}
              status={report.status}
              bgColor={PRIORITY_BG[report.priorityLevel] ?? "bg-green-800"}
            />
          )}
          {/* Hover shimmer */}
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br from-white/[0.03] to-transparent" />
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
          className={`w-1 h-6 bg-gradient-to-b ${theme.sectionAccentBar} rounded-full`}
        />
        <div>
          <p
            className={`text-[10px] ${theme.sectionLabel} tracking-[0.3em] uppercase font-semibold`}
          >
            Reports
          </p>
          <h1
            className={`text-lg md:text-xl font-black tracking-tight ${theme.sectionTitle} uppercase leading-tight`}
          >
            {title}
          </h1>
        </div>
      </div>
      {count !== undefined && (
        <span
          className={`ml-auto flex items-center gap-1.5 ${theme.sectionCountBg} border ${theme.sectionCountBorder} px-3 py-1 rounded-full`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${theme.sectionCountDot} animate-pulse`}
          />
          <span
            className={`text-xs ${theme.sectionCountText} font-semibold tabular-nums`}
          >
            {count}
          </span>
        </span>
      )}
      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-2 hidden md:block" />
    </div>
  );

  // ─── Empty state ───────────────────────────────────────────────────────────
  const EmptyState = ({ filtered }) => (
    <div className="flex flex-col items-center gap-3 my-16">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl opacity-40">
        📋
      </div>
      <p
        className={`${theme.sectionCountText} text-sm tracking-widest uppercase font-semibold`}
      >
        {filtered
          ? "No reports match your search"
          : "Nothing to display here...yet"}
      </p>
    </div>
  );

  return (
    <>
      {showBirthdayBanner && (
        <BirthdayBanner
          name={getFirstName(user)}
          onDismiss={dismissBirthdayBanner}
        />
      )}

      {showConfetti && <BirthdayConfetti />}

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
        rejectedCount={rejectedCount}
        acceptedCount={acceptedCount}
        reopenedCount={reopenedCount}
        completedRedirect={completedRedirect}
        completedWithFeedback={completedWithFeedback}
        dashboardRedirect={dashboardRedirect}
        theme={theme}
        newAssignedCount={newAssignedCount}
        newRejectedCount={newRejectedCount}
        newAcceptedCount={newAcceptedCount}
        newReopenedCount={newReopenedCount}
        newCompletedCount={newCompletedCount}
        closedRedirect={closedRedirect}
        newClosedCount={newClosedCount}
        closedWithFeedback={closedWithFeedback}
      />

      {/* Mobile side toggle */}
      <div className="md:hidden">
        <button
          className={`material-symbols-outlined select-none z-[60] fixed cursor-pointer top-1/2 -translate-y-1/2 right-0 ${theme.mobileToggleBg} border ${theme.mobileToggleBorder} border-r-0 ${theme.mobileToggleText} rounded-l-xl py-3 pl-2 pr-1 shadow-[-4px_0_12px_rgba(0,0,0,0.4)] ${theme.mobileToggleHover} transition-colors`}
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_right" : "chevron_left"}
        </button>
      </div>

      {/* Mobile bottom sheet toggle */}
      {!specificReportsPage && (
        <div
          className={`fixed z-[100] bottom-0 cursor-pointer left-1/2 -translate-x-1/2 select-none rounded-t-2xl px-8 py-2.5 md:hidden ${theme.mobileBottomBg} border border-b-0 ${theme.mobileBottomBorder} shadow-[0_-4px_24px_rgba(0,0,0,0.5)] flex items-center gap-2 hover:brightness-110 transition-all`}
          onClick={() => SetShowReportsHiddenOnMobile((prev) => !prev)}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${theme.mobileBottomDot} animate-pulse`}
          />
          <span
            className={`${theme.mobileBottomText} text-xs font-bold tracking-widest uppercase`}
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
          {/* Glass glow effects */}
          <div className="absolute top-0 left-0 w-40 h-40 bg-emerald-400/20 blur-3xl rounded-full pointer-events-none" />

          <div className="absolute bottom-0 right-0 w-40 h-40 bg-lime-300/20 blur-3xl rounded-full pointer-events-none" />

          <div className="absolute inset-0 bg-white/[0.06] backdrop-blur-2xl pointer-events-none" />
          <div
            className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${theme.glowLine} to-transparent`}
          />

          <p
            className={`text-[9px] ${theme.sideNavLabel} tracking-[0.3em] uppercase font-semibold mb-3 px-3`}
          >
            Navigation
          </p>

          {assignedRedirect && (
            <NavLink
              to={assignedRedirect}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Assigned
                  {newAssignedCount > 0 && (
                    <span className="ml-auto bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
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
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Rejected
                  {newRejectedCount > 0 && (
                    <span className="ml-auto bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
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
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  In Progress
                  {newAcceptedCount > 0 && (
                    <span className="ml-auto bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                      {newAcceptedCount}
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
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Reopened
                  {newReopenedCount > 0 && (
                    <span className="ml-auto bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                      {newReopenedCount}
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
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                    />
                    Completed
                    {newCompletedCount > 0 && (
                      <span className="ml-auto bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                        {newCompletedCount}
                      </span>
                    )}
                    {completedWithFeedback > 0 && (
                      <span
                        className={`ml-auto ${theme.feedbackBadge} text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums`}
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
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 group ${isActive ? theme.sideNavActive : theme.sideNavIdle}`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${isActive ? theme.sideNavDotActive : theme.sideNavDotIdle}`}
                  />
                  Closed
                  {newClosedCount > 0 && (
                    <span className="ml-auto bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                      {newClosedCount}
                    </span>
                  )}
                  {closedWithFeedback > 0 && (
                    <span
                      className={`ml-auto ${theme.feedbackBadge} text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums`}
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
                className={`flex-1 flex items-center gap-2 ${theme.sectionCountBg} border ${theme.sectionCountBorder} rounded-full px-4 py-2 min-w-0`}
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
                className={`${theme.sectionCountBg} border ${theme.sectionCountBorder} ${theme.sectionCountText} rounded-full px-4 py-2 text-sm font-semibold outline-none cursor-pointer`}
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
                  className={`flex items-center justify-center gap-1.5 ${theme.sectionCountBg} border ${theme.sectionCountBorder} ${theme.sectionCountText} rounded-full px-4 py-2 text-sm font-semibold hover:brightness-110 transition whitespace-nowrap`}
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
