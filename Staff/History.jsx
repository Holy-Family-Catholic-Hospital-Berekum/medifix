import { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "../src/firebase";
import PageLayout from "./pageLayout";
import StaffReportDetails from "./staffReportDetails";
import { formatDate } from "../src/utils";

const ORANGE = "#FF8825";
const INK = "#231F1A";
const INK_MUTED = "#7A7267";
const PAPER = "#FBF7F0";
const RULE = "#E8E1D3";
const RESOLVED_GREEN = "#2F7D4F";
const REOPENED_AMBER = "#B4740E";

const FONTS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

  .hist-root { font-family: 'DM Sans', sans-serif; }
  .hist-serif { font-family: 'Fraunces', serif; }
  .hist-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }

  .hist-card {
    transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
  }
  .hist-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 14px 32px -14px rgba(35,31,26,.22);
    border-color: #d8cfbf;
  }

  .hist-stamp {
    transform: rotate(-3deg);
    letter-spacing: .14em;
  }

  .hist-pill:focus-visible,
  .hist-input:focus-visible,
  .hist-btn:focus-visible {
    outline: 2px solid ${ORANGE};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .hist-card, .hist-card * { transition: none !important; }
  }
`;

const CATEGORY_ICONS = {
  Electrical: "⚡",
  Plumbing: "🔧",
  Carpentry: "🪚",
  Masonry: "🧱",
  Refrigerator: "❄️",
  "Air Conditioner": "🌬️",
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFormalName(userObj) {
  if (!userObj) return "";
  const surname = userObj.name?.trim().split(" ").slice(-1)[0] || "";
  const title = userObj.profession?.trim();
  return title ? `${title} ${surname}` : surname;
}

function getCategoryIcon(category = "") {
  const key = Object.keys(CATEGORY_ICONS).find((k) =>
    category.toLowerCase().includes(k.toLowerCase()),
  );
  return key ? CATEGORY_ICONS[key] : "🛠️";
}

// A closed report reached that state one of two ways: the staff member was
// satisfied and gave feedback (feedback is set), or they reopened it and
// later closed it out themselves (no feedback, just a reopen/close cycle).
function wasResolvedWithFeedback(report) {
  return !!report.feedback;
}

// Prefer the date the report was actually closed; fall back to the
// completion date for anything that predates dateClosed being tracked.
function getClosedDate(report) {
  return report.dateClosed ?? report.dateCompleted;
}

const PRIORITY_META = {
  emergency: { text: "#B42318", dot: "#EF4444" },
  urgent: { text: "#B45309", dot: "#F97316" },
  routine: { text: "#166534", dot: "#22C55E" },
};

// ─── Skeleton ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="bg-white rounded-2xl border overflow-hidden animate-pulse"
      style={{ borderColor: RULE }}
    >
      <div className="h-[3px]" style={{ background: RULE }} />
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl"
            style={{ background: "#F1EBE0" }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-3.5 rounded w-2/3"
              style={{ background: "#F1EBE0" }}
            />
            <div
              className="h-3 rounded w-1/3"
              style={{ background: "#F1EBE0" }}
            />
          </div>
        </div>
        <div className="h-3 rounded w-full" style={{ background: "#F1EBE0" }} />
        <div className="h-3 rounded w-3/4" style={{ background: "#F1EBE0" }} />
        <div
          className="h-8 rounded-lg w-28"
          style={{ background: "#F1EBE0" }}
        />
      </div>
    </div>
  );
}

// ─── Case Card ──────────────────────────────────────────────────────────────
function CaseCard({ report, onClick }) {
  const icon = getCategoryIcon(report.category);
  const resolved = wasResolvedWithFeedback(report);
  const pm = PRIORITY_META[report.priorityLevel] || PRIORITY_META.routine;
  const outcomeColor = resolved ? RESOLVED_GREEN : REOPENED_AMBER;

  return (
    <div
      onClick={onClick}
      className="hist-card group relative bg-white rounded-2xl border cursor-pointer overflow-hidden select-none"
      style={{ borderColor: RULE }}
    >
      {/* top accent — encodes outcome, not decoration */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${outcomeColor}, transparent 160%)`,
        }}
      />

      <div className="p-5">
        {/* icon + category + priority */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: "#FFF3E6" }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="hist-serif font-semibold text-[15px] leading-tight truncate"
              style={{ color: INK }}
            >
              {report.category}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: pm.dot }}
              />
              <span
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: pm.text }}
              >
                {report.priorityLevel}
              </span>
            </div>
          </div>
        </div>

        {/* location */}
        {report.location && (
          <div
            className="flex items-center gap-1.5 text-xs mb-2"
            style={{ color: INK_MUTED }}
          >
            <span className="material-symbols-outlined text-[15px]">
              location_on
            </span>
            <span className="truncate">{report.location}</span>
          </div>
        )}

        {/* closed date — ledger-style, monospaced */}
        <div
          className="flex items-center gap-1.5 text-xs mb-5"
          style={{ color: INK_MUTED }}
        >
          <span className="material-symbols-outlined text-[15px]">
            event_available
          </span>
          <span>
            Closed{" "}
            <span className="hist-mono" style={{ color: INK }}>
              {formatDate(getClosedDate(report))}
            </span>
          </span>
        </div>

        {/* signature element — ink-stamp outcome badge */}
        <div className="flex justify-end">
          <div
            className="hist-stamp inline-flex items-center gap-1.5 px-3 py-1 rounded-sm border-2 text-[10px] font-bold uppercase"
            style={{
              color: outcomeColor,
              borderColor: outcomeColor,
              background: `${outcomeColor}0D`,
            }}
          >
            <span className="material-symbols-outlined text-[13px]">
              {resolved ? "verified" : "cached"}
            </span>
            {resolved ? "Resolved" : "Reopened"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────
export default function History() {
  const [sidePopup, setSidePopup] = useState(false);
  const [userData, setUserData] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes "we checked and there's genuinely nothing" from "the
  // fetch failed" — without this, a network blip or a not-yet-built
  // composite index silently renders the same friendly empty state as a
  // brand-new user with zero history, hiding real failures in production.
  const [loadError, setLoadError] = useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReport, setCurrentReport] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [activeFilter, setActiveFilter] = useState("all");

  const auth = getAuth();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        setLoadError(false);
        try {
          const userSnap = await getDoc(doc(db, "users", authUser.uid));
          if (userSnap.exists()) {
            const profile = userSnap.data();
            setUserData(profile);
            const snap = await getDocs(
              query(
                collection(db, "reports"),
                where("reporterId", "==", profile.ID),
                where("status", "==", "closed"),
              ),
            );
            const data = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort(
                (a, b) =>
                  (getClosedDate(b)?.toDate?.() ?? new Date(0)) -
                  (getClosedDate(a)?.toDate?.() ?? new Date(0)),
              );
            setReports(data);
          }
        } catch (e) {
          console.error(e);
          setLoadError(true);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
        setUserData(null);
        setReports([]);
      }
    });
    return unsub;
  }, []);

  const resolvedCount = reports.filter(wasResolvedWithFeedback).length;
  const reopenedCount = reports.length - resolvedCount;

  const displayReportDetails = (id) => {
    setDisplayDetails(true);
    setCurrentReport(reports.filter((r) => r.id === id));
  };

  // Closed reports are a terminal state — StaffReportDetails won't show any
  // feedback/reopen actions for them (those only apply to "completed"), so
  // this callback is effectively unused here. Kept as a no-op so the prop
  // is always defined.
  const handleFeedbackSent = () => {};

  const clearFilters = () => {
    setSearchQuery("");
    setActiveFilter("all");
  };

  const filtered = reports
    .filter((r) => {
      if (activeFilter === "feedback") return wasResolvedWithFeedback(r);
      if (activeFilter === "reopened") return !wasResolvedWithFeedback(r);
      return true;
    })
    .filter(
      (r) =>
        !searchQuery ||
        r.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.location?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      const aT = getClosedDate(a)?.toDate?.() ?? new Date(0);
      const bT = getClosedDate(b)?.toDate?.() ?? new Date(0);
      return sortOrder === "newest" ? bT - aT : aT - bT;
    });

  const FILTER_TABS = [
    { id: "all", label: "All", count: reports.length },
    { id: "feedback", label: "Resolved", count: resolvedCount },
    { id: "reopened", label: "Reopened", count: reopenedCount },
  ];

  const HistoryContent = (
    <div
      className="hist-root min-h-screen py-24 px-4 md:px-8 lg:px-16"
      style={{ background: PAPER }}
    >
      <style>{FONTS_CSS}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      {!loading && userData && (
        <p className="text-sm font-medium mb-3" style={{ color: INK_MUTED }}>
          {getGreeting()}, {getFormalName(userData)}
        </p>
      )}

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-2 h-2 rounded-sm flex-shrink-0"
            style={{ background: ORANGE }}
          />
          <span
            className="hist-mono text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: INK_MUTED }}
          >
            Staff Records
          </span>
        </div>
        <h1
          className="hist-serif text-4xl md:text-5xl font-medium leading-[1.05]"
          style={{ color: INK }}
        >
          Case <span style={{ fontStyle: "italic" }}>Archive</span>
        </h1>
        <p className="text-sm mt-3 max-w-md" style={{ color: INK_MUTED }}>
          Every maintenance report you've closed out, kept on record.
        </p>
      </div>

      {/* ── Ledger stat strip ────────────────────────────────── */}
      {!loading && !loadError && reports.length > 0 && (
        <div
          className="flex flex-wrap bg-white rounded-2xl border mb-8 overflow-hidden"
          style={{ borderColor: RULE }}
        >
          {[
            { label: "Total Closed", value: reports.length },
            { label: "Resolved", value: resolvedCount, color: RESOLVED_GREEN },
            { label: "Reopened", value: reopenedCount, color: REOPENED_AMBER },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="flex-1 min-w-[140px] px-6 py-5"
              style={i > 0 ? { borderLeft: `1px solid ${RULE}` } : undefined}
            >
              <div
                className="hist-mono text-3xl font-semibold"
                style={{ color: stat.color || INK }}
              >
                {String(stat.value).padStart(2, "0")}
              </div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wide mt-1"
                style={{ color: INK_MUTED }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters + Search ─────────────────────────────────── */}
      {!loading && !loadError && reports.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-7 items-center">
          <div className="flex gap-2">
            {FILTER_TABS.map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className="hist-pill text-xs font-semibold px-4 py-2 rounded-full border-2 transition-colors duration-150"
                  style={
                    active
                      ? {
                          background: ORANGE,
                          borderColor: ORANGE,
                          color: "#fff",
                        }
                      : {
                          background: "#fff",
                          borderColor: RULE,
                          color: INK_MUTED,
                        }
                  }
                >
                  {f.label} <span className="hist-mono">({f.count})</span>
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px]"
              style={{ color: INK_MUTED }}
            >
              search
            </span>
            <input
              type="text"
              placeholder="Search category or location…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="hist-input w-full pl-9 pr-4 py-2.5 rounded-full border-2 outline-none text-sm bg-white"
              style={{ borderColor: RULE, color: INK }}
            />
          </div>

          <div className="flex gap-2">
            {["newest", "oldest"].map((order) => (
              <button
                key={order}
                onClick={() => setSortOrder(order)}
                className="hist-btn flex items-center gap-1 text-xs font-semibold px-3 py-2.5 rounded-full border-2 transition-colors duration-150"
                style={
                  sortOrder === order
                    ? { background: INK, borderColor: INK, color: "#fff" }
                    : {
                        background: "#fff",
                        borderColor: RULE,
                        color: INK_MUTED,
                      }
                }
              >
                <span className="material-symbols-outlined text-[15px]">
                  {order === "newest" ? "arrow_downward" : "arrow_upward"}
                </span>
                {order === "newest" ? "Newest" : "Oldest"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────── */}
      {loading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : !userData ? (
        <div className="text-center py-24">
          <span
            className="material-symbols-outlined text-5xl mb-4 block"
            style={{ color: INK_MUTED }}
          >
            lock
          </span>
          <p className="font-medium" style={{ color: INK }}>
            Log in to view your case archive.
          </p>
        </div>
      ) : loadError ? (
        <div className="text-center py-24">
          <span
            className="material-symbols-outlined text-5xl mb-4 block"
            style={{ color: REOPENED_AMBER }}
          >
            error
          </span>
          <h2
            className="hist-serif text-lg font-semibold mb-1"
            style={{ color: INK }}
          >
            Couldn't load your records
          </h2>
          <p className="text-sm mb-5" style={{ color: INK_MUTED }}>
            Check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="hist-btn text-xs font-bold px-5 py-2.5 rounded-full text-white"
            style={{ background: ORANGE }}
          >
            Retry
          </button>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((report) => (
            <CaseCard
              key={report.id}
              report={report}
              onClick={() => displayReportDetails(report.id)}
            />
          ))}
        </div>
      ) : searchQuery || activeFilter !== "all" ? (
        <div className="text-center py-24">
          <span
            className="material-symbols-outlined text-4xl mb-4 block"
            style={{ color: INK_MUTED }}
          >
            manage_search
          </span>
          <h2
            className="hist-serif text-lg font-semibold mb-1"
            style={{ color: INK }}
          >
            No matching cases
          </h2>
          <p className="text-sm mb-5" style={{ color: INK_MUTED }}>
            Try a different filter or search term.
          </p>
          <button
            onClick={clearFilters}
            className="hist-btn text-xs font-bold px-5 py-2.5 rounded-full border-2"
            style={{ borderColor: RULE, color: INK }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="text-center py-24">
          <span
            className="material-symbols-outlined text-5xl mb-4 block"
            style={{ color: INK_MUTED }}
          >
            inventory_2
          </span>
          <h2
            className="hist-serif text-lg font-semibold mb-1"
            style={{ color: INK }}
          >
            Nothing closed yet
          </h2>
          <p className="text-sm" style={{ color: INK_MUTED }}>
            Reports you resolve or close will land here as part of your record.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <>
      <span
        className="material-symbols-outlined md:hidden z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 right-0 text-white shadow-lg"
        style={{ backgroundColor: ORANGE }}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>

      <StaffReportDetails
        displayDetails={displayDetails}
        setDisplayDetails={setDisplayDetails}
        currentReport={currentReport}
        setCurrentReport={setCurrentReport}
        onFeedbackSent={handleFeedbackSent}
      />

      <PageLayout content={HistoryContent} sidePopup={sidePopup} />
    </>
  );
}
