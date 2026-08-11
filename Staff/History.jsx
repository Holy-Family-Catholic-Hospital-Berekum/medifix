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

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="h-2 bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </div>
    </div>
  );
}

// ─── Report Card ──────────────────────────────────────────────────────────────
function HistoryCard({ report, onClick, needsFeedback }) {
  const icon = getCategoryIcon(report.category);

  const priorityColor =
    report.priorityLevel === "emergency"
      ? { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" }
      : report.priorityLevel === "urgent"
        ? { bg: "#fff7ed", text: "#ea580c", dot: "#f97316" }
        : { bg: "#f0fdf4", text: "#16a34a", dot: "#22c55e" };

  return (
    <div
      onClick={onClick}
      className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden select-none"
    >
      {/* top accent bar — orange if needs feedback, green if done */}
      <div
        style={{
          height: 3,
          background: needsFeedback
            ? `linear-gradient(90deg, ${ORANGE}, #ffb347)`
            : "linear-gradient(90deg, #22c55e, #86efac)",
        }}
      />

      <div className="p-4">
        {/* top row: icon + category + priority */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: priorityColor.bg }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">
              {report.category}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: priorityColor.dot }}
              />
              <span
                className="text-xs font-medium capitalize"
                style={{ color: priorityColor.text }}
              >
                {report.priorityLevel}
              </span>
            </div>
          </div>
        </div>

        {/* location */}
        {report.location && (
          <p className="text-xs text-gray-400 truncate mb-3">
            📍 {report.location}
          </p>
        )}

        {/* date */}
        <p className="text-xs text-gray-400 mb-3">
          🗓 Completed {formatDate(report.dateCompleted)}
        </p>

        {/* feedback banner — only shows if feedback not yet given */}
        {needsFeedback ? (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: "#11ee74", color: ORANGE }}
          >
            <span>💬</span>
            <span>Feedback?</span>
            <span className="ml-auto text-blue-100 font-normal">
              Tap to review →
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium bg-green-50 text-green-600">
            <span>✓</span>
            <span>Feedback given</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function History() {
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

  const displayReportDetails = (id) => {
    setDisplayDetails(true);
    setCurrentReport(reports.filter((r) => r.id === id));
  };

  // When StaffReportDetails submits feedback it updates Firestore,
  // but we also patch local state so the banner disappears immediately.
  const handleFeedbackSent = (reportId, feedbackText) => {
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

  const HistoryContent = (
    <div className="min-h-screen bg-gray-50 py-24 px-4 md:px-8 lg:px-16">
      {/* ── Header ───────────────────────────────────────── */}

      {/* ── Welcome message ──────────────────────────────────────── */}
      {!loading && userData && (
        <p className="text-gray-500 font-semibold mb-2">
          {getGreeting()}, {getFormalName(userData)} 👋
        </p>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900">Completed Reports</h1>
        <p className="text-gray-400 text-sm mt-1">
          All maintenance jobs completed for you.
        </p>
      </div>

      {/* ── Feedback nudge banner ─────────────────────────── */}
      {!loading && pendingFeedbackCount > 0 && (
        <div
          className="flex items-center gap-3 rounded-2xl px-5 py-4 mb-6 shadow-sm"
          style={{ background: "#fff7ed", border: `1.5px solid ${ORANGE}30` }}
        >
          <span className="text-2xl">💬</span>
          <div>
            <p className="text-sm font-bold" style={{ color: ORANGE }}>
              {pendingFeedbackCount} report
              {pendingFeedbackCount > 1 ? "s need" : " needs"} your feedback
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Tap any card with the feedback banner to share your thoughts.
            </p>
          </div>
        </div>
      )}

      {/* ── Filters + Search ─────────────────────────────── */}
      {!loading && reports.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          {/* filter pills */}
          <div className="flex gap-2">
            {[
              { id: "all", label: `All (${reports.length})` },
              { id: "pending", label: `Feedback? (${pendingFeedbackCount})` },
              {
                id: "reviewed",
                label: `Done (${reports.length - pendingFeedbackCount})`,
              },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className="text-xs font-bold px-4 py-2 rounded-full border-2 transition-all duration-150"
                style={
                  activeFilter === f.id
                    ? { background: ORANGE, borderColor: ORANGE, color: "#fff" }
                    : {
                        background: "#fff",
                        borderColor: "#e5e7eb",
                        color: "#6b7280",
                      }
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* search */}
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search category or location…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-4 py-2 rounded-full border-2 border-gray-100 focus:border-orange-300 outline-none text-sm text-gray-600 bg-white"
            />
          </div>

          {/* sort */}
          <div className="flex gap-2">
            {["newest", "oldest"].map((order) => (
              <button
                key={order}
                onClick={() => setSortOrder(order)}
                className="text-xs font-bold px-3 py-2 rounded-full border-2 transition-all duration-150"
                style={
                  sortOrder === order
                    ? {
                        background: "#111827",
                        borderColor: "#111827",
                        color: "#fff",
                      }
                    : {
                        background: "#fff",
                        borderColor: "#e5e7eb",
                        color: "#6b7280",
                      }
                }
              >
                {order === "newest" ? "↓ Newest" : "↑ Oldest"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cards grid ───────────────────────────────────── */}
      {loading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : !userData ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-gray-500 font-medium">
            Please log in to view your history.
          </p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((report) => (
            <HistoryCard
              key={report.id}
              report={report}
              onClick={() => displayReportDetails(report.id)}
              needsFeedback={needsFeedback(report)}
            />
          ))}
        </div>
      ) : searchQuery || activeFilter !== "all" ? (
        <div className="text-center py-24">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="text-lg font-bold text-gray-700 mb-1">No matches</h2>
          <p className="text-gray-400 text-sm">
            Try a different filter or search term.
          </p>
        </div>
      ) : (
        <div className="text-center py-24">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-lg font-bold text-gray-700 mb-1">
            No completed reports yet
          </h2>
          <p className="text-gray-400 text-sm">
            Completed jobs will appear here once work is done.
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
