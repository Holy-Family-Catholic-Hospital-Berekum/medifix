import { markOverdueReports } from "../src/utils";
import NavBar from "./navBar";
import { useState, useEffect } from "react";
import SlideInRight from "../components/slideInRight";
import { NavLink } from "react-router";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";
import { collection, query, where, onSnapshot } from "firebase/firestore";
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

function Countdown({ dateDue, status, bgColor }) {
  const t = useCountdown(dateDue);
  if (status === "completed" || !t) return null;
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

  if (status !== "completed" && priority === "emergency")
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
  if (status !== "completed" && priority === "urgent")
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
};

// ─── Main Home component ──────────────────────────────────────────────────────
export default function Home({
  completedRedirect,
  assignedRedirect,
  title1,
  title2,
  reportDate1,
  reportDate2,
  firstReportsStatus,
  secondReportsStatus,
  reportsHiddenOnMobileTitle,
  specificReportsPage,
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

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  useEffect(() => {
    markOverdueReports(user);
  }, []);

  const handleClose = () => {
    setTimeout(() => SetShowReportsHiddenOnMobile(false), 300);
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

  const firstReports = sortByDate(
    reports.filter((r) =>
      Array.isArray(firstReportsStatus)
        ? firstReportsStatus.includes(r.status)
        : r.status === firstReportsStatus,
    ),
    "dateSent",
  );
  const secondReports = sortByDate(
    reports.filter((r) =>
      Array.isArray(secondReportsStatus)
        ? secondReportsStatus.includes(r.status)
        : r.status === secondReportsStatus,
    ),
    "dateSent",
  );

  const displayReportDetails = (id) => {
    setCurrentReportId(id);
    setDisplayDetails(true);
  };
  const currentReport = reports.filter((r) => r.id === currentReportId);

  const hasFeedback = (report) =>
    report.feedback && !report.feedbackViewedBy?.includes(user?.ID);
  const completedWithFeedback = reports.filter(
    (r) => r.status === "completed" && hasFeedback(r),
  ).length;

  const PRIORITY_BG = {
    emergency: "bg-red-500",
    urgent: "bg-yellow-400",
    routine: "bg-green-500",
  };

  // ─── Report Card ───────────────────────────────────────────────────────────
  const ReportCard = ({ report, reportDate }) => {
    const cfg = cardConfig(report.status, report.priorityLevel, theme);
    return (
      <div className="relative w-full max-w-[250px] md:max-w-[300px] flex justify-center">
        {/* Feedback badge */}
        {hasFeedback(report) && (
          <span
            className={`absolute -top-1 -right-1 ${theme.feedbackBadge} text-[10px] font-black px-2 py-0.5 rounded-full  animate-bounce z-10 tracking-wide`}
          >
            💬 Feedback
          </span>
        )}
        <div
          className={`relative group select-none border ${cfg.border} ${cfg.glow} ${theme.cardBg} flex flex-col gap-3 cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 rounded-2xl w-full max-w-[250px] md:max-w-[280px] p-4 overflow-hidden`}
          onClick={() => displayReportDetails(report.id)}
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

          {/* Overdue */}
          {report.overdue && (
            <div className="flex flex-col gap-1 bg-red-950/50 border border-red-800/40 rounded-xl px-3 py-2">
              <span className="text-[10px] font-black text-red-500 tracking-widest uppercase flex items-center gap-1">
                <span>⚠</span> Overdue
              </span>
              {report.dateDue && report.status !== "completed" && (
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
  const EmptyState = () => (
    <div className="flex flex-col items-center gap-3 my-16">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl opacity-40">
        📋
      </div>
      <p
        className={`${theme.sectionCountText} text-sm tracking-widest uppercase font-semibold`}
      >
        Nothing to display here...yet
      </p>
    </div>
  );

  return (
    <>
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
        completedRedirect={completedRedirect}
        completedWithFeedback={completedWithFeedback}
        dashboardRedirect={dashboardRedirect}
        theme={theme}
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
                </>
              )}
            </NavLink>
          )}

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
        </div>

        {/* Content area */}
        <div className="w-full h-screen [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-auto pt-20 pb-16 flex flex-col items-center z-0 gap-8">
          {/* First reports section */}
          <div className={`w-full py-6 border-b ${theme.sectionDivider}`}>
            <SectionHeader title={title1} count={firstReports.length} />
          </div>

          {reportsLoading ? (
            <Preloader theme={theme} />
          ) : firstReports.length > 0 ? (
            <div className="flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-6 justify-center w-full flex-wrap py-4 px-4">
              {firstReportsCard}
            </div>
          ) : (
            <EmptyState />
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
                <div className="hidden md:flex lg:max-w-[80%] md:pl-[200px] gap-4 md:gap-6 justify-center w-full flex-wrap py-4 px-4">
                  {secondReportsCard}
                </div>
              ) : (
                <div className="hidden md:flex">
                  <EmptyState />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
