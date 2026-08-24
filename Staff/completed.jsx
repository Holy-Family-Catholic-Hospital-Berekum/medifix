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
const REVIEWED_GREEN = "#2F7D4F";

const FONTS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

  .rq-root { font-family: 'DM Sans', sans-serif; }
  .rq-serif { font-family: 'Fraunces', serif; }
  .rq-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }

  .rq-card {
    transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
  }
  .rq-card:hover, .rq-card:focus-visible {
    transform: translateY(-3px);
    box-shadow: 0 14px 32px -14px rgba(35,31,26,.22);
    border-color: #d8cfbf;
  }
  .rq-card:focus-visible {
    outline: 2px solid ${ORANGE};
    outline-offset: 2px;
  }

  .rq-tear-hole {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 9999px;
    background: ${PAPER};
    border: 1px solid ${RULE};
    top: -8px;
  }

  .rq-pill:focus-visible,
  .rq-input:focus-visible,
  .rq-btn:focus-visible {
    outline: 2px solid ${ORANGE};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .rq-card, .rq-card * { transition: none !important; }
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
        <div
          className="h-9 rounded-lg w-full mt-4"
          style={{ background: "#F1EBE0" }}
        />
      </div>
    </div>
  );
}

// ─── Job Ticket Card ────────────────────────────────────────────────────
function TicketCard({ report, onClick, needsFeedback }) {
  const icon = getCategoryIcon(report.category);
  const pm = PRIORITY_META[report.priorityLevel] || PRIORITY_META.routine;
  const accent = needsFeedback ? ORANGE : REVIEWED_GREEN;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      className="rq-card group relative bg-white rounded-2xl border cursor-pointer overflow-hidden select-none"
      style={{ borderColor: RULE }}
    >
      {/* status bar */}
      <div style={{ height: 3, background: accent }} />

      <div className="p-5">
        {/* icon + category + priority */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: "#FFF3E6" }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="rq-serif font-semibold text-[15px] leading-tight truncate"
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
            className="flex items-center gap-1.5 text-xs mb-1.5"
            style={{ color: INK_MUTED }}
          >
            <span className="material-symbols-outlined text-[15px]">
              location_on
            </span>
            <span className="truncate">{report.location}</span>
          </div>
        )}

        {/* completed date */}
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: INK_MUTED }}
        >
          <span className="material-symbols-outlined text-[15px]">
            task_alt
          </span>
          <span>
            Completed{" "}
            <span className="rq-mono" style={{ color: INK }}>
              {formatDate(report.dateCompleted)}
            </span>
          </span>
        </div>

        {/* ── tear-off perforation ── */}
        <div
          className="relative -mx-5 mt-4"
          style={{ borderTop: `2px dashed ${RULE}` }}
        >
          <span className="rq-tear-hole" style={{ left: -8 }} />
          <span className="rq-tear-hole" style={{ right: -8 }} />
        </div>

        {/* stub / action area */}
        <div className="pt-4">
          {needsFeedback ? (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{ background: "#FFF3E6" }}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ color: ORANGE }}
              >
                rate_review
              </span>
              <span className="text-xs font-bold" style={{ color: ORANGE }}>
                Feedback needed
              </span>
              <span
                className="ml-auto text-[11px] font-semibold flex items-center gap-0.5"
                style={{ color: ORANGE }}
              >
                Review
                <span className="material-symbols-outlined text-[14px]">
                  arrow_forward
                </span>
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{ background: "#F0F7F2" }}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ color: REVIEWED_GREEN }}
              >
                check_circle
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: REVIEWED_GREEN }}
              >
                Feedback submitted
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────
export default function StaffCompleted() {
  const [sidePopup, setSidePopup] = useState(false);
  const [userData, setUserData] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReport, setCurrentReport] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [activeFilter, setActiveFilter] = useState("all");

  const auth = getAuth();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userSnap = await getDoc(doc(db, "users", authUser.uid));
          if (userSnap.exists()) {
            const profile = userSnap.data();
            setUserData(profile);
            const snap = await getDocs(
              query(
                collection(db, "reports"),
                where("reporterId", "==", profile.ID),
                where("status", "==", "completed"),
              ),
            );
            const data = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort(
                (a, b) =>
                  (b.dateCompleted?.toDate?.() ?? new Date(0)) -
                  (a.dateCompleted?.toDate?.() ?? new Date(0)),
              );
            setReports(data);
          }
        } catch (e) {
          console.error(e);
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

  // A report needs feedback if the feedback field is empty/falsy
  const needsFeedback = (r) => !r.feedback;

  const pendingFeedbackCount = reports.filter(needsFeedback).length;
  const reviewedCount = reports.length - pendingFeedbackCount;

  const displayReportDetails = (id) => {
    setDisplayDetails(true);
    setCurrentReport(reports.filter((r) => r.id === id));
  };

  // When StaffReportDetails submits feedback or reopens a job it updates
  // Firestore, but this page's `reports` list was loaded once via getDocs
  // (not a live listener), so we also patch local state here.
  //
  // - Feedback submission: the report stays "completed", just patch the
  //   `feedback` field so the banner disappears.
  // - Reopening: the report's status moves away from "completed", so it no
  //   longer belongs in this list at all — remove it immediately instead of
  //   leaving a stale "completed" card until the next full page load.
  const handleFeedbackSent = (reportId, feedbackText, newStatus) => {
    if (newStatus && newStatus !== "completed") {
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setCurrentReport((prev) => prev.filter((r) => r.id !== reportId));
      return;
    }

    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, feedback: feedbackText } : r,
      ),
    );
    setCurrentReport((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, feedback: feedbackText } : r,
      ),
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setActiveFilter("all");
  };

  const filtered = reports
    .filter((r) => {
      if (activeFilter === "pending") return needsFeedback(r);
      if (activeFilter === "reviewed") return !needsFeedback(r);
      return true;
    })
    .filter(
      (r) =>
        !searchQuery ||
        r.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.location?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      const aT = a.dateCompleted?.toDate?.() ?? new Date(0);
      const bT = b.dateCompleted?.toDate?.() ?? new Date(0);
      return sortOrder === "newest" ? bT - aT : aT - bT;
    });

  const FILTER_TABS = [
    { id: "all", label: "All", count: reports.length },
    { id: "pending", label: "Needs Feedback", count: pendingFeedbackCount },
    { id: "reviewed", label: "Reviewed", count: reviewedCount },
  ];

  const HistoryContent = (
    <div
      className="rq-root min-h-screen py-24 px-4 md:px-8 lg:px-16"
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
            className="rq-mono text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: INK_MUTED }}
          >
            Awaiting Sign-Off
          </span>
        </div>
        <h1
          className="rq-serif text-4xl md:text-5xl font-medium leading-[1.05]"
          style={{ color: INK }}
        >
          Review <span style={{ fontStyle: "italic" }}>Queue</span>
        </h1>
        <p className="text-sm mt-3 max-w-md" style={{ color: INK_MUTED }}>
          Jobs completed on your reports — confirm the work, or reopen it if
          something's still wrong.
        </p>
      </div>

      {/* ── Ledger stat strip ────────────────────────────────── */}
      {!loading && reports.length > 0 && (
        <div
          className="flex flex-wrap bg-white rounded-2xl border mb-6 overflow-hidden"
          style={{ borderColor: RULE }}
        >
          {[
            { label: "Total Completed", value: reports.length },
            {
              label: "Needs Feedback",
              value: pendingFeedbackCount,
              color: ORANGE,
            },
            { label: "Reviewed", value: reviewedCount, color: REVIEWED_GREEN },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="flex-1 min-w-[140px] px-6 py-5"
              style={i > 0 ? { borderLeft: `1px solid ${RULE}` } : undefined}
            >
              <div
                className="rq-mono text-3xl font-semibold"
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

      {/* ── Feedback nudge — doubles as a shortcut into the pending filter ── */}
      {!loading && pendingFeedbackCount > 0 && (
        <button
          onClick={() => setActiveFilter("pending")}
          className="rq-btn w-full flex items-center gap-3 rounded-2xl px-5 py-4 mb-7 text-left transition-colors"
          style={{ background: "#FFF3E6", border: `1.5px solid ${ORANGE}40` }}
        >
          <span
            className="material-symbols-outlined text-2xl flex-shrink-0"
            style={{ color: ORANGE }}
          >
            rate_review
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: ORANGE }}>
              {pendingFeedbackCount} report
              {pendingFeedbackCount > 1 ? "s are" : " is"} waiting on your
              feedback
            </p>
            <p className="text-xs mt-0.5" style={{ color: INK_MUTED }}>
              Tap here to jump straight to them.
            </p>
          </div>
          <span
            className="material-symbols-outlined flex-shrink-0"
            style={{ color: ORANGE }}
          >
            arrow_forward
          </span>
        </button>
      )}

      {/* ── Filters + Search ─────────────────────────────────── */}
      {!loading && reports.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-7 items-center">
          <div className="flex gap-2">
            {FILTER_TABS.map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className="rq-pill text-xs font-semibold px-4 py-2 rounded-full border-2 transition-colors duration-150"
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
                  {f.label} <span className="rq-mono">({f.count})</span>
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
              className="rq-input w-full pl-9 pr-4 py-2.5 rounded-full border-2 outline-none text-sm bg-white"
              style={{ borderColor: RULE, color: INK }}
            />
          </div>

          <div className="flex gap-2">
            {["newest", "oldest"].map((order) => (
              <button
                key={order}
                onClick={() => setSortOrder(order)}
                className="rq-btn flex items-center gap-1 text-xs font-semibold px-3 py-2.5 rounded-full border-2 transition-colors duration-150"
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
            Log in to view your review queue.
          </p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((report) => (
            <TicketCard
              key={report.id}
              report={report}
              onClick={() => displayReportDetails(report.id)}
              needsFeedback={needsFeedback(report)}
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
            className="rq-serif text-lg font-semibold mb-1"
            style={{ color: INK }}
          >
            No matching jobs
          </h2>
          <p className="text-sm mb-5" style={{ color: INK_MUTED }}>
            Try a different filter or search term.
          </p>
          <button
            onClick={clearFilters}
            className="rq-btn text-xs font-bold px-5 py-2.5 rounded-full border-2"
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
            className="rq-serif text-lg font-semibold mb-1"
            style={{ color: INK }}
          >
            No completed jobs yet
          </h2>
          <p className="text-sm" style={{ color: INK_MUTED }}>
            Jobs will land here once a technician marks your report complete.
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
