import { markOverdueReports, markReportViewed } from "../src/utils";
import NavBar from "./navBar";
import { useState, useEffect, useMemo, useCallback } from "react";
import SlideInRight from "../components/slideInRight";
import { NavLink } from "react-router";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
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

function toJsDate(value) {
  if (!value) return null;
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d?.getTime?.()) ? null : d;
}

// Filters by dateSent — the one date every report always has regardless of
// which stage it's currently in — so the same filter works consistently
// across every section (incoming, assigned, completed, etc.)
function isWithinTimeFilter(dateValue, filter) {
  if (filter === "overall") return true;
  const d = toJsDate(dateValue);
  if (!d) return false;
  const now = new Date();

  switch (filter) {
    case "thisWeek": {
      const start = new Date(now);
      const day = start.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      return d >= start;
    }
    case "thisMonth":
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    case "lastMonth": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return (
        d.getFullYear() === lastMonth.getFullYear() &&
        d.getMonth() === lastMonth.getMonth()
      );
    }
    case "thisYear":
      return d.getFullYear() === now.getFullYear();
    case "lastYear":
      return d.getFullYear() === now.getFullYear() - 1;
    default:
      return true;
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

const paginate = (arr, page, pageSize = PAGE_SIZE) =>
  arr.slice((page - 1) * pageSize, page * pageSize);

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
  const [reports, setReports] = useState([]);
  const [currentReportId, setCurrentReportId] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [firstPage, setFirstPage] = useState(1);
  const [secondPage, setSecondPage] = useState(1);
  const [showBirthdayBanner, setShowBirthdayBanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("overall");

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  useEffect(() => {
    markOverdueReports(user);
  }, []);

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

  // ─── Badge counts (sidebar) — depend on the full reports set & user, not
  // on pagination/search/timeFilter, so they're memoized separately from
  // the section filtering below to avoid recomputing 10+ .filter() passes
  // on every unrelated re-render (e.g. every 1s countdown tick).
  const badgeCounts = useMemo(() => {
    const newAssignedCount = reports.filter(
      (r) => r.status === "assigned" && isNewForUser(r),
    ).length;
    const newRejectedCount = reports.filter(
      (r) => r.status === "rejected" && isNewForUser(r),
    ).length;
    const newAcceptedCount = reports.filter(
      (r) => r.status === "accepted" && isNewForUser(r),
    ).length;
    const newReopenedCount = reports.filter(
      (r) => r.status === "reopened" && isNewForUser(r),
    ).length;
    const newCompletedCount = reports.filter(
      (r) => r.status === "completed" && isNewForUser(r),
    ).length;
    const newClosedCount = reports.filter(
      (r) => r.status === "closed" && isNewForUser(r),
    ).length;
    const completedWithFeedback = reports.filter(
      (r) => r.status === "completed" && hasFeedback(r),
    ).length;
    const closedWithFeedback = reports.filter(
      (r) => r.status === "closed" && hasFeedback(r),
    ).length;
    const rejectedCount = reports.filter((r) => r.status === "rejected").length;
    const acceptedCount = reports.filter((r) => r.status === "accepted").length;
    const reopenedCount = reports.filter((r) => r.status === "reopened").length;

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
  }, [reports, isNewForUser, hasFeedback]);

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
    setDisplayDetails(true);

    if (isNewForUser(report)) {
      markReportViewed(report.id, user.ID, report.status);
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? {
                ...r,
                lastViewedStatus: {
                  ...(r.lastViewedStatus || {}),
                  [user.ID]: report.status,
                },
              }
            : r,
        ),
      );
    }
  };

  useEffect(() => {
    const reportsQuery =
      user?.role === "worker"
        ? query(collection(db, "reports"), where("assignedTo", "==", user.ID))
        : query(collection(db, "reports"));

    const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReports(data);
      setReportsLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const getAllAlerts = () => {
    const allAlerts = [];
    reports.forEach((report) => {
      if (!report.alerts || !Array.isArray(report.alerts)) return;
      report.alerts.forEach((alert) => {
        if (alert.sentTo === user?.role || alert.sentTo === user?.ID) {
          allAlerts.push({
            ...alert,
            reportId: report.id,
            reportCategory: report.category,
          });
        }
      });
    });
    return allAlerts.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const sortByDate = (arr, key) =>
    [...arr].sort(
      (a, b) =>
        (b[key]?.toDate?.() ?? new Date(0)) -
        (a[key]?.toDate?.() ?? new Date(0)),
    );

  // Each section is sorted by its OWN relevant date field, most recent first,
  // then narrowed by the search box (category / priority) and the time-range
  // filter (based on dateSent, since that's the one date every report
  // always has regardless of its current stage). Memoized so this filter +
  // sort pass (over the full reports array) only re-runs when the inputs
  // that actually affect it change — not on every render (e.g. countdown
  // ticks, mark-as-read state patches to unrelated reports).
  const firstReports = useMemo(
    () =>
      sortByDate(
        reports.filter(
          (r) =>
            (Array.isArray(firstReportsStatus)
              ? firstReportsStatus.includes(r.status)
              : r.status === firstReportsStatus) &&
            matchesSearch(r, searchQuery) &&
            isWithinTimeFilter(r.dateSent, timeFilter),
        ),
        reportDate1,
      ),
    [reports, firstReportsStatus, searchQuery, timeFilter, reportDate1],
  );

  const secondReports = useMemo(
    () =>
      sortByDate(
        reports.filter(
          (r) =>
            (Array.isArray(secondReportsStatus)
              ? secondReportsStatus.includes(r.status)
              : r.status === secondReportsStatus) &&
            matchesSearch(r, searchQuery) &&
            isWithinTimeFilter(r.dateSent, timeFilter),
        ),
        reportDate2,
      ),
    [reports, secondReportsStatus, searchQuery, timeFilter, reportDate2],
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" || timeFilter !== "overall";

  // Reset to page 1 whenever the underlying data set changes size
  // (e.g. filters change, or new reports come in over the snapshot listener),
  // and also whenever the search/time filter itself changes (in case the
  // result count happens to stay the same across the change).
  useEffect(() => {
    setFirstPage(1);
  }, [firstReports.length]);

  useEffect(() => {
    setSecondPage(1);
  }, [secondReports.length]);

  useEffect(() => {
    setFirstPage(1);
    setSecondPage(1);
  }, [searchQuery, timeFilter]);

  const firstTotalPages = Math.max(
    1,
    Math.ceil(firstReports.length / PAGE_SIZE),
  );
  const secondTotalPages = Math.max(
    1,
    Math.ceil(secondReports.length / PAGE_SIZE),
  );

  const paginatedFirstReports = paginate(firstReports, firstPage);
  const paginatedSecondReports = paginate(secondReports, secondPage);

  const currentReport = reports.filter((r) => r.id === currentReportId);

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
  // "Mark all as read" button shows up at all.
  const { pageNewCount, pageFeedbackCount } = useMemo(() => {
    return {
      pageNewCount: reports.filter(
        (r) => pageStatuses.includes(r.status) && isNewForUser(r),
      ).length,
      pageFeedbackCount: reports.filter(
        (r) => pageStatuses.includes(r.status) && hasFeedback(r),
      ).length,
    };
  }, [reports, pageStatuses, isNewForUser, hasFeedback]);

  const hasUnreadItems = pageNewCount > 0 || pageFeedbackCount > 0;

  // Clears every "🆕 New" and "💬 Feedback" badge across ALL of this user's
  // reports (not just what's currently visible/filtered/paginated), so
  // switching filters afterward doesn't reveal badges that were "missed".
  // Two separate batches are used because the Firestore rules only allow a
  // report update to touch lastViewedStatus OR feedbackViewedBy in a single
  // write, never both together. Each batch is further chunked to stay under
  // Firestore's 500-operation-per-batch hard limit, regardless of how many
  // reports need marking.
  const handleMarkAllAsRead = useCallback(async () => {
    if (!user?.ID) return;
    const toMarkNew = reports.filter(
      (r) => pageStatuses.includes(r.status) && isNewForUser(r),
    );
    const toMarkFeedback = reports.filter(
      (r) => pageStatuses.includes(r.status) && hasFeedback(r),
    );
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

      // Patch local state immediately so badges disappear without waiting
      // on the snapshot listener round-trip.
      setReports((prev) =>
        prev.map((r) => {
          if (!pageStatuses.includes(r.status)) return r;
          let updated = r;
          if (isNewForUser(r)) {
            updated = {
              ...updated,
              lastViewedStatus: {
                ...(updated.lastViewedStatus || {}),
                [user.ID]: updated.status,
              },
            };
          }
          if (hasFeedback(r)) {
            updated = {
              ...updated,
              feedbackViewedBy: [...(updated.feedbackViewedBy || []), user.ID],
            };
          }
          return updated;
        }),
      );
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [reports, pageStatuses, user?.ID, isNewForUser, hasFeedback]);

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
          {/* Date */}
          <div className="flex items-center gap-2"></div>
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

  const firstReportsCard = paginatedFirstReports.map((r) => (
    <ReportCard key={r.id} report={r} reportDate={reportDate1} />
  ));
  const secondReportsCard = paginatedSecondReports.map((r) => (
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
      {count !== undefined && !reportsLoading && (
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
            <SectionHeader title={title1} count={firstReports.length} />
          </div>

          {reportsLoading ? (
            <Preloader theme={theme} />
          ) : firstReports.length > 0 ? (
            <>
              <div className="flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-6 justify-center w-full flex-wrap py-4 px-4">
                {firstReportsCard}
              </div>
              <PaginationControls
                page={firstPage}
                totalPages={firstTotalPages}
                onChange={setFirstPage}
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
                <SectionHeader title={title2} count={secondReports.length} />
              </div>

              {reportsLoading ? (
                <div className="hidden md:flex">
                  <Preloader theme={theme} />
                </div>
              ) : secondReports.length > 0 ? (
                <div className="hidden md:flex md:flex-col items-center w-full">
                  <div className="flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-6 justify-center w-full flex-wrap py-4 px-4">
                    {secondReportsCard}
                  </div>
                  <PaginationControls
                    page={secondPage}
                    totalPages={secondTotalPages}
                    onChange={setSecondPage}
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
