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
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300 bg-red-950/70 border border-red-700/40 px-2 py-0.5 rounded-full tracking-wide">
        <span className="material-symbols-outlined text-[12px] leading-none">
          warning
        </span>
        Overdue
      </span>
    );
  return (
    <div
      className={`flex items-center gap-1.5 ${bgColor} border border-white/10 px-2 py-1 rounded-lg`}
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

// Quiet, dismissible toast — no confetti, no bounce. A single restrained
// fade/slide on entry is enough to draw the eye without turning a work
// dashboard into a party popper.
function BirthdayBanner({ name, onDismiss }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed top-0 inset-x-0 z-[120] flex justify-center px-4 pt-4 pointer-events-none">
      <div
        className={`pointer-events-auto relative max-w-md w-full rounded-xl overflow-hidden shadow-md border border-white/20 bg-slate-900/95 text-white px-4 py-3 flex items-center gap-3 transition-all duration-300 ${
          entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"
        }`}
      >
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-[18px] leading-none">
            cake
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">
            Happy birthday, {name}
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            Wishing you a great day from the whole team.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/60 hover:text-white transition-colors flex-shrink-0"
          aria-label="Dismiss birthday message"
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            close
          </span>
        </button>
      </div>
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
// because the values themselves are restrained and consistent.
function makeTheme({ accent, accentDark, accentSoft, ring }) {
  return {
    // ─── Page ─────────────────────────────────────────────
    pageBg: "bg-slate-50",
    sidebarBg: "bg-white/90 backdrop-blur-xl",
    sidebarBorder: "border border-slate-200 shadow-sm",
    contentBg: "bg-transparent",

    // ─── Navbar ──────────────────────────────────────────
    navBg: `bg-gradient-to-r ${accent}`,
    navBorder: "border border-white/10 shadow-sm",
    logoFrom: "from-white",
    logoTo: "to-white",
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
    sideNavActive: `text-slate-900 ${accentSoft} border border-slate-200 shadow-sm`,
    sideNavIdle:
      "text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent",
    sideNavDotActive: accentDark,
    sideNavDotIdle: "bg-slate-300 group-hover:bg-slate-400",
    sideNavLabel: "text-slate-400",

    // ─── Section headers ─────────────────────────────────
    sectionAccentBar: accent,
    sectionLabel: "text-slate-400",
    sectionTitle: "text-slate-900",
    sectionCountBg: "bg-white border border-slate-200",
    sectionCountBorder: "border-slate-200",
    sectionCountDot: accentDark,
    sectionCountText: "text-slate-700",
    sectionDivider: "border-slate-200",

    // ─── Cards ───────────────────────────────────────────
    cardBg: "bg-white border border-slate-200",

    cardNormalBorder: "border-l-emerald-400",
    cardNormalBadge: "bg-emerald-600 text-white",
    cardNormalDot: "bg-emerald-400",
    cardNormalAccent: "bg-emerald-400",
    cardNormalPriority: "text-emerald-600",

    cardEmergencyBorder: "border-l-red-500",
    cardEmergencyBadge: "bg-red-600 text-white",
    cardEmergencyDot: "bg-red-500",
    cardEmergencyAccent: "bg-red-500",
    cardEmergencyPriority: "text-red-600",

    cardUrgentBorder: "border-l-amber-400",
    cardUrgentBadge: "bg-amber-500 text-white",
    cardUrgentDot: "bg-amber-400",
    cardUrgentAccent: "bg-amber-400",
    cardUrgentPriority: "text-amber-600",

    cardDateLabel: "text-slate-400",
    cardDateValue: "text-slate-700",

    cardStatusBg: "bg-slate-100",
    cardStatusBorder: "border-slate-200",
    cardStatusText: "text-slate-600",

    // ─── Feedback badge ──────────────────────────────────
    feedbackBadge: `${ring} text-white shadow-sm`,

    // ─── Mobile toggle ───────────────────────────────────
    mobileToggleBg: "bg-white",
    mobileToggleBorder: "border-slate-200",
    mobileToggleText: "text-slate-700",
    mobileToggleHover: "hover:bg-slate-50",

    mobileBottomBg: "bg-white",
    mobileBottomBorder: "border-slate-200",
    mobileBottomDot: accentDark,
    mobileBottomText: "text-slate-700",

    // ─── Bottom sheet ────────────────────────────────────
    sheetBg: "bg-white",
    sheetBorder: "border-slate-200",
    sheetTopBar: accent,
    titleColor: "text-slate-900",
    emptyText: "text-slate-400",

    // ─── Slide panel ─────────────────────────────────────
    slideBg: "bg-white",
    slideBorder: "border-slate-200",
    slideTopBar: accent,

    linkActiveBg: accentSoft,
    linkActiveBorder: "border-slate-200",
    linkActiveText: "text-slate-900",

    linkIdleBorder: "border-transparent",
    linkIdleText: "text-slate-500",

    linkHoverText: "hover:text-slate-900",
    linkHoverBorder: "hover:border-slate-200",
    linkHoverBg: "hover:bg-slate-50",

    // ─── Spinner ─────────────────────────────────────────
    spinnerOuter: `border-t-${ring.replace("bg-", "")}`,
    spinnerInner: "border-t-slate-300",
    dotColor: ring,
    textColor: "text-slate-400",

    // ─── Report details ──────────────────────────────────
    detailsBg: "bg-white",
    detailsCloseText: "text-slate-500",
    detailsLabelColor: "text-slate-500",
    detailsValueColor: "text-slate-800",
  };
}

// Per-role identity lives in exactly four values. Everything else is
// derived by makeTheme() above, so the whole theme system fits on one
// screen instead of being spread across hundreds of hand-tuned lines.
export const THEMES = {
  admin: makeTheme({
    accent: "from-emerald-600 to-emerald-500",
    accentDark: "bg-emerald-500",
    accentSoft: "bg-emerald-50",
    ring: "bg-emerald-500",
  }),
  estate: makeTheme({
    accent: "from-sky-600 to-sky-500",
    accentDark: "bg-sky-500",
    accentSoft: "bg-sky-50",
    ring: "bg-sky-500",
  }),
  worker: makeTheme({
    accent: "from-amber-500 to-amber-400",
    accentDark: "bg-amber-500",
    accentSoft: "bg-amber-50",
    ring: "bg-amber-500",
  }),
  manager: makeTheme({
    accent: "from-orange-500 to-orange-400",
    accentDark: "bg-orange-500",
    accentSoft: "bg-orange-50",
    ring: "bg-orange-500",
  }),
  procurement: makeTheme({
    accent: "from-rose-600 to-rose-500",
    accentDark: "bg-rose-500",
    accentSoft: "bg-rose-50",
    ring: "bg-rose-500",
  }),
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
        className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border ${theme.sectionCountBg} ${theme.sectionCountBorder} ${theme.sectionCountText} transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50`}
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
        className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border ${theme.sectionCountBg} ${theme.sectionCountBorder} ${theme.sectionCountText} transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50`}
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
  droppedRedirect,
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

  // Clears every "New" and "Feedback" badge across this user's reports for
  // the statuses shown on this page (bounded to the badge data's fetch
  // window — see BADGE_FETCH_LIMIT). Two separate batches are used because
  // the Firestore rules only allow a report update to touch
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
  // A single restrained hover state (subtle lift, no scale/rotate stacking),
  // a left accent bar instead of a full glow, and status badges that appear
  // once via a short fade/scale-in rather than looping forever.
  const ReportCard = ({ report, reportDate }) => {
    const cfg = cardConfig(report.status, report.priorityLevel, theme);
    const { label: dateLabel, value: dateValue } = getDisplayDate(report);
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
          <span className="absolute -top-2 -left-2 bg-sky-600 text-white text-[10px] font-semibold pl-1.5 pr-2 py-0.5 rounded-full z-10 tracking-wide flex items-center gap-0.5 animate-badge-in">
            <span className="material-symbols-outlined text-[12px] leading-none">
              fiber_new
            </span>
            New
          </span>
        )}
        <div
          className={`relative group select-none border-l-4 ${cfg.border} ${theme.cardBg} flex flex-col gap-3 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 rounded-xl w-full max-w-[250px] md:max-w-[280px] p-4 overflow-hidden`}
          onClick={() => displayReportDetails(report)}
        >
          {/* Priority row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`}
              />
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
          <div className="h-px bg-slate-100" />
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
            <div className="flex flex-col gap-1 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
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
            className={`text-[10px] ${theme.sectionLabel} tracking-[0.2em] uppercase font-medium`}
          >
            Reports
          </p>
          <h1
            className={`text-lg md:text-xl font-semibold tracking-tight ${theme.sectionTitle} leading-tight`}
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
            className={`w-1.5 h-1.5 rounded-full ${theme.sectionCountDot}`}
          />
          <span
            className={`text-xs ${theme.sectionCountText} font-medium tabular-nums`}
          >
            {count}
          </span>
        </span>
      )}
      <div className="flex-1 h-px bg-slate-200 ml-2 hidden md:block" />
    </div>
  );

  // ─── Empty state ───────────────────────────────────────────────────────────
  const EmptyState = ({ filtered }) => (
    <div className="flex flex-col items-center gap-3 my-16">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
        <span className="material-symbols-outlined text-2xl">inbox</span>
      </div>
      <p className="text-slate-400 text-sm tracking-wide font-medium">
        {filtered
          ? "No reports match your search"
          : "Nothing to display here yet"}
      </p>
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

      {showBirthdayBanner && (
        <BirthdayBanner
          name={getFirstName(user)}
          onDismiss={dismissBirthdayBanner}
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
                className={`${theme.sectionCountBg} border ${theme.sectionCountBorder} ${theme.sectionCountText} rounded-full px-4 py-2 text-sm font-medium outline-none cursor-pointer`}
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
                  className={`flex items-center justify-center gap-1.5 ${theme.sectionCountBg} border ${theme.sectionCountBorder} ${theme.sectionCountText} rounded-full px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap`}
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
