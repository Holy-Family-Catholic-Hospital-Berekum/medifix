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
    // Page
    pageBg: "bg-blue-100",
    sidebarBg: "bg-sky-600",
    sidebarBorder: "border-sky-900/50",
    contentBg: "bg-slate-950",

    // Nav
    navBg: "bg-sky-600",
    navBorder: "border-sky-900/60",
    logoFrom: "from-sky-300",
    logoTo: "to-blue-100",
    logoSub: "text-slate-600",
    liveColor: "bg-emerald-400",
    liveShadow: "shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]",
    liveText: "text-blue-100",
    linkActive: "text-sky-300",
    linkHover: "hover:text-sky-200",
    linkBar: "bg-sky-400",
    logoutBorder: "border-sky-900",
    logoutText: "text-slate-900",
    logoutHoverBorder: "hover:border-red-500/60",
    logoutHoverText: "hover:text-red-400",
    logoutHoverBg: "hover:bg-red-500/5",
    accent: "shadow-[0_1px_0_0_rgba(125,211,252,0.15)]",
    glowLine: "via-sky-400/20",

    // Sidebar nav links
    sideNavActive: "text-slate-900 bg-sky-500/10 border border-sky-500/25",
    sideNavIdle:
      "text-slate-800 hover:text-slate-200 hover:bg-sky-900/30 border border-transparent",
    sideNavDotActive: "bg-sky-200 shadow-[0_0_5px_rgba(125,211,252,0.7)]",
    sideNavDotIdle: "bg-slate-700 group-hover:bg-slate-500",
    sideNavLabel: "text-sky-600/60",

    // Section header
    sectionAccentBar: "from-sky-400 to-cyan-500",
    sectionLabel: "text-sky-500/70",
    sectionTitle: "text-slate-800",
    sectionCountBg: "bg-slate-800/60",
    sectionCountBorder: "border-slate-700/50",
    sectionCountDot: "bg-sky-500 shadow-[0_0_4px_rgba(125,211,252,0.7)]",
    sectionCountText: "text-slate-400",
    sectionDivider: "border-sky-900/40",

    // Cards
    cardBg: "bg-slate-900/80 backdrop-blur-sm",

    cardNormalBorder: "border-green-500",
    cardNormalGlow: "shadow-[0_0_16px_rgba(56,189,248,0.12)]",
    cardNormalDot: "bg-green-500 shadow-[0_0_6px_rgba(125,211,252,0.7)]",
    cardNormalAccent: "from-sky-600/15 to-transparent",
    cardNormalPriority: "text-green-500",
    cardEmergencyBorder: "border-red-600/60",
    cardEmergencyGlow: "shadow-[0_0_20px_rgba(220,38,38,0.25)]",
    cardEmergencyDot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]",
    cardEmergencyAccent: "from-red-600/20 to-transparent",
    cardEmergencyPriority: "text-red-400",
    cardUrgentBorder: "border-amber-500/50",
    cardUrgentGlow: "shadow-[0_0_16px_rgba(245,158,11,0.2)]",
    cardUrgentDot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
    cardUrgentAccent: "from-amber-500/15 to-transparent",
    cardUrgentPriority: "text-amber-400",
    cardDateLabel: "text-slate-500",
    cardDateValue: "text-slate-300",
    cardStatusBg: "bg-slate-800/80",
    cardStatusBorder: "border-slate-700/50",
    cardStatusText: "text-slate-400",

    // Feedback badge
    feedbackBadge: "bg-sky-400 text-sky-950",

    // Mobile toggle button
    mobileToggleBg: "bg-slate-900",
    mobileToggleBorder: "border-sky-800",
    mobileToggleText: "text-sky-400",
    mobileToggleHover: "hover:bg-slate-800",
    mobileBottomBg: "bg-slate-900",
    mobileBottomBorder: "border-sky-800",
    mobileBottomDot: "bg-sky-400",
    mobileBottomText: "text-slate-200",

    // Bottom mobile sheet
    sheetBg: "bg-slate-950",
    sheetBorder: "border-sky-900",
    sheetTopBar: "from-sky-400 via-cyan-400",
    titleColor: "text-sky-100",
    emptyText: "text-sky-500/50",

    // Slide-in panel
    slideBg: "bg-slate-950/95",
    slideBorder: "border-sky-900",
    slideTopBar: "from-sky-400 via-cyan-400",
    linkActiveBg: "bg-sky-500/12",
    linkActiveBorder: "border-sky-400/40",
    linkActiveText: "text-sky-300",
    linkIdleBorder: "border-white/8",
    linkIdleText: "text-white/35",
    linkHoverText: "hover:text-sky-200",
    linkHoverBorder: "hover:border-sky-400/30",
    linkHoverBg: "hover:bg-sky-500/8",

    // Spinner
    spinnerOuter: "border-t-sky-400",
    spinnerInner: "border-t-cyan-500/60",
    dotColor: "bg-sky-400",
    textColor: "text-sky-500/60",

    // Report details panel
    detailsBg: "bg-slate-900",
    detailsCloseText: "text-slate-300",
    detailsLabelColor: "text-slate-200",
    detailsValueColor: "text-sky-400",
  },

  estate: {
    pageBg: "bg-blue-200",
    sidebarBg: "bg-blue-950",
    sidebarBorder: "border-blue-800/50",
    contentBg: "bg-blue-950",

    navBg: "bg-blue-950",
    navBorder: "border-blue-800/60",
    logoFrom: "from-blue-300",
    logoTo: "to-yellow-300",
    logoSub: "text-blue-500",
    liveColor: "bg-yellow-400",
    liveShadow: "shadow-[0_0_8px_2px_rgba(250,204,21,0.6)]",
    liveText: "text-yellow-400",
    linkActive: "text-yellow-300",
    linkHover: "hover:text-yellow-200",
    linkBar: "bg-yellow-400",
    logoutBorder: "border-blue-800",
    logoutText: "text-blue-400",
    logoutHoverBorder: "hover:border-red-500/60",
    logoutHoverText: "hover:text-red-400",
    logoutHoverBg: "hover:bg-red-500/5",
    accent: "shadow-[0_1px_0_0_rgba(250,204,21,0.15)]",
    glowLine: "via-yellow-400/20",

    sideNavActive:
      "text-yellow-300 bg-yellow-500/10 border border-yellow-500/25",
    sideNavIdle:
      "text-blue-400 hover:text-blue-100 hover:bg-blue-800/30 border border-transparent",
    sideNavDotActive: "bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]",
    sideNavDotIdle: "bg-blue-800 group-hover:bg-blue-600",
    sideNavLabel: "text-blue-500/60",

    sectionAccentBar: "from-blue-400 to-yellow-400",
    sectionLabel: "text-blue-400/70",
    sectionTitle: "text-blue-400",
    sectionCountBg: "bg-blue-900/60",
    sectionCountBorder: "border-blue-700/50",
    sectionCountDot: "bg-yellow-400 shadow-[0_0_4px_rgba(250,204,21,0.7)]",
    sectionCountText: "text-blue-300",
    sectionDivider: "border-blue-800/50",

    cardBg: "bg-blue-900/60 backdrop-blur-sm",

    cardNormalBorder: "border-green-500",
    cardNormalGlow: "shadow-[0_0_16px_rgba(59,130,246,0.15)]",
    cardNormalDot: "bg-green-500 shadow-[0_0_6px_rgba(250,204,21,0.8)]",
    cardNormalAccent: "from-blue-600/15 to-transparent",
    cardNormalPriority: "text-green-500",
    cardEmergencyBorder: "border-red-500/60",
    cardEmergencyGlow: "shadow-[0_0_20px_rgba(239,68,68,0.25)]",
    cardEmergencyDot: "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)]",
    cardEmergencyAccent: "from-red-500/20 to-transparent",
    cardEmergencyPriority: "text-red-400",
    cardUrgentBorder: "border-yellow-500/50",
    cardUrgentGlow: "shadow-[0_0_16px_rgba(234,179,8,0.2)]",
    cardUrgentDot: "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]",
    cardUrgentAccent: "from-yellow-500/15 to-transparent",
    cardUrgentPriority: "text-yellow-400",
    cardDateLabel: "text-blue-400",
    cardDateValue: "text-blue-200",
    cardStatusBg: "bg-blue-900/80",
    cardStatusBorder: "border-blue-700/50",
    cardStatusText: "text-blue-300",

    feedbackBadge: "bg-yellow-400 text-blue-950",

    mobileToggleBg: "bg-blue-900",
    mobileToggleBorder: "border-blue-700",
    mobileToggleText: "text-yellow-400",
    mobileToggleHover: "hover:bg-blue-800",
    mobileBottomBg: "bg-blue-900",
    mobileBottomBorder: "border-blue-700",
    mobileBottomDot: "bg-yellow-400",
    mobileBottomText: "text-blue-100",

    sheetBg: "bg-blue-950",
    sheetBorder: "border-blue-800",
    sheetTopBar: "from-blue-400 via-yellow-400",
    titleColor: "text-blue-100",
    emptyText: "text-blue-500/50",

    slideBg: "bg-blue-950/95",
    slideBorder: "border-blue-800",
    slideTopBar: "from-blue-400 via-yellow-400",
    linkActiveBg: "bg-yellow-500/10",
    linkActiveBorder: "border-yellow-400/40",
    linkActiveText: "text-yellow-300",
    linkIdleBorder: "border-white/8",
    linkIdleText: "text-white/30",
    linkHoverText: "hover:text-yellow-200",
    linkHoverBorder: "hover:border-yellow-400/30",
    linkHoverBg: "hover:bg-yellow-500/6",

    spinnerOuter: "border-t-blue-400",
    spinnerInner: "border-t-yellow-400/60",
    dotColor: "bg-yellow-400",
    textColor: "text-blue-400/60",

    detailsBg: "bg-blue-900",
    detailsCloseText: "text-blue-200",
    detailsLabelColor: "text-blue-100",
    detailsValueColor: "text-yellow-400",
  },

  worker: {
    pageBg: "bg-violet-950",
    sidebarBg: "bg-violet-950",
    sidebarBorder: "border-violet-800/50",
    contentBg: "bg-violet-950",

    navBg: "bg-violet-950",
    navBorder: "border-violet-800/60",
    logoFrom: "from-violet-300",
    logoTo: "to-rose-300",
    logoSub: "text-violet-500",
    liveColor: "bg-rose-400",
    liveShadow: "shadow-[0_0_8px_2px_rgba(251,113,133,0.6)]",
    liveText: "text-rose-400",
    linkActive: "text-rose-300",
    linkHover: "hover:text-rose-200",
    linkBar: "bg-rose-400",
    logoutBorder: "border-violet-800",
    logoutText: "text-violet-400",
    logoutHoverBorder: "hover:border-red-500/60",
    logoutHoverText: "hover:text-red-400",
    logoutHoverBg: "hover:bg-red-500/5",
    accent: "shadow-[0_1px_0_0_rgba(251,113,133,0.2)]",
    glowLine: "via-rose-400/20",

    sideNavActive: "text-rose-300 bg-rose-500/10 border border-rose-500/25",
    sideNavIdle:
      "text-violet-400 hover:text-violet-100 hover:bg-violet-800/30 border border-transparent",
    sideNavDotActive: "bg-rose-400 shadow-[0_0_5px_rgba(251,113,133,0.8)]",
    sideNavDotIdle: "bg-violet-800 group-hover:bg-violet-600",
    sideNavLabel: "text-violet-500/60",

    sectionAccentBar: "from-violet-400 to-rose-400",
    sectionLabel: "text-violet-400/70",
    sectionTitle: "text-violet-50",
    sectionCountBg: "bg-violet-900/60",
    sectionCountBorder: "border-violet-700/50",
    sectionCountDot: "bg-rose-400 shadow-[0_0_4px_rgba(251,113,133,0.7)]",
    sectionCountText: "text-violet-300",
    sectionDivider: "border-violet-800/50",

    cardBg: "bg-violet-900/60 backdrop-blur-sm",

    normalTimeLeftBg: "bg-green-500",
    cardNormalBorder: "border-green-500",
    cardNormalGlow: "shadow-[0_0_16px_rgba(139,92,246,0.15)]",
    cardNormalDot: "bg-green-500 shadow-[0_0_6px_rgba(251,113,133,0.8)]",
    cardNormalAccent: "from-violet-600/15 to-transparent",
    cardNormalPriority: "text-green-500",
    cardEmergencyBorder: "border-red-500/60",
    cardEmergencyGlow: "shadow-[0_0_20px_rgba(239,68,68,0.25)]",
    cardEmergencyDot: "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)]",
    cardEmergencyAccent: "from-red-500/20 to-transparent",
    cardEmergencyPriority: "text-red-400",
    cardUrgentBorder: "border-fuchsia-500/50",
    cardUrgentGlow: "shadow-[0_0_16px_rgba(232,121,249,0.2)]",
    cardUrgentDot: "bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.8)]",
    cardUrgentAccent: "from-fuchsia-500/15 to-transparent",
    cardUrgentPriority: "text-fuchsia-400",
    cardDateLabel: "text-violet-400",
    cardDateValue: "text-violet-200",
    cardStatusBg: "bg-violet-900/80",
    cardStatusBorder: "border-violet-700/50",
    cardStatusText: "text-violet-300",

    feedbackBadge: "bg-rose-400 text-violet-950",

    mobileToggleBg: "bg-violet-900",
    mobileToggleBorder: "border-violet-700",
    mobileToggleText: "text-rose-400",
    mobileToggleHover: "hover:bg-violet-800",
    mobileBottomBg: "bg-violet-900",
    mobileBottomBorder: "border-violet-700",
    mobileBottomDot: "bg-rose-400",
    mobileBottomText: "text-violet-100",

    sheetBg: "bg-violet-950",
    sheetBorder: "border-violet-800",
    sheetTopBar: "from-violet-400 via-rose-400",
    titleColor: "text-violet-100",
    emptyText: "text-violet-500/50",

    slideBg: "bg-violet-950/95",
    slideBorder: "border-violet-800",
    slideTopBar: "from-violet-400 via-rose-400",
    linkActiveBg: "bg-rose-500/10",
    linkActiveBorder: "border-rose-400/40",
    linkActiveText: "text-rose-300",
    linkIdleBorder: "border-white/8",
    linkIdleText: "text-white/30",
    linkHoverText: "hover:text-rose-200",
    linkHoverBorder: "hover:border-rose-400/30",
    linkHoverBg: "hover:bg-rose-500/6",

    spinnerOuter: "border-t-violet-400",
    spinnerInner: "border-t-rose-400/60",
    dotColor: "bg-rose-400",
    textColor: "text-violet-400/60",

    detailsBg: "bg-violet-900",
    detailsCloseText: "text-violet-200",
    detailsLabelColor: "text-violet-100",
    detailsValueColor: "text-rose-400",
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
              <span className="text-[10px] font-black text-red-400 tracking-widest uppercase flex items-center gap-1">
                <span>⚠</span> Overdue
              </span>
              {report.dateDue && report.status !== "completed" && (
                <span className="text-[10px] text-red-400/60 font-mono">
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
          className={`w-full fixed inset-y-0 z-10 max-w-[20%] h-screen ${theme.sidebarBg} border-r ${theme.sidebarBorder} md:flex flex-col pt-28 px-6 gap-1.5 hidden`}
        >
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
