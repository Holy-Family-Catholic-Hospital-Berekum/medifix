import PageLayout from "./pageLayout";
import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  limit,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate } from "../src/utils";

const ORANGE = "#FF8825";

// ─── helpers ─────────────────────────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return null;
  let d = date?.toDate
    ? date.toDate()
    : date instanceof Date
      ? date
      : new Date(date);
  if (!d || isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

function useLiveTimeAgo(date) {
  const [label, setLabel] = useState(() => timeAgo(date));
  useEffect(() => {
    setLabel(timeAgo(date));
    const id = setInterval(() => setLabel(timeAgo(date)), 60_000);
    return () => clearInterval(id);
  }, [date]);
  return label;
}

const STATUS_MESSAGES = {
  incoming: "Your report has been sent, waiting for admin approval.",
  approved: "Admin has approved your report, waiting for estate review.",
  pending:
    "Estate has sent a materials request to admin, waiting for confirmation.",
  confirmed:
    "Admin has confirmed the materials request, waiting for procurement.",
  procured: "Materials have been procured, waiting for technician assignment.",
  assigned:
    "Your work has been assigned to the right technician, it will be attended to shortly.",
  denied: "Your report was not approved. See the reason below.",
  reopened:
    "You reopened this job — it's back with the Estate Manager for further action.",
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

function getStatusMessage(report) {
  if (report.status === "completed") {
    return report.feedback
      ? "Your work has been completed. Thanks for your feedback!"
      : "Your work has been completed, waiting for your feedback.";
  }
  return STATUS_MESSAGES[report.status] || "";
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  incoming: {
    label: "Incoming",
    bg: "bg-orange-100",
    text: "text-orange-700",
    dot: "bg-orange-500",
    bar: "bg-orange-400",
    icon: "📥",
  },
  approved: {
    label: "Approved",
    bg: "bg-blue-100",
    text: "text-blue-700",
    dot: "bg-blue-500",
    bar: "bg-blue-400",
    icon: "✅",
  },
  pending: {
    label: "Pending",
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    dot: "bg-yellow-500",
    bar: "bg-yellow-400",
    icon: "⏳",
  },
  confirmed: {
    label: "Confirmed",
    bg: "bg-teal-100",
    text: "text-teal-700",
    dot: "bg-teal-500",
    bar: "bg-teal-400",
    icon: "🔒",
  },
  assigned: {
    label: "Assigned",
    bg: "bg-purple-100",
    text: "text-purple-700",
    dot: "bg-purple-500",
    bar: "bg-purple-400",
    icon: "👷",
  },
  denied: {
    label: "Denied",
    bg: "bg-red-100",
    text: "text-red-700",
    dot: "bg-red-500",
    bar: "bg-red-400",
    icon: "❌",
  },
  completed: {
    label: "Completed",
    bg: "bg-green-100",
    text: "text-green-700",
    dot: "bg-green-500",
    bar: "bg-green-400",
    icon: "🏁",
  },
  reopened: {
    label: "Reopened",
    bg: "bg-amber-100",
    text: "text-amber-700",
    dot: "bg-amber-500",
    bar: "bg-amber-400",
    icon: "🔁",
  },
};

const PRIORITY_CONFIG = {
  emergency: { label: "Emergency", bg: "bg-red-500", text: "text-white" },
  urgent: { label: "Urgent", bg: "bg-orange-500", text: "text-white" },
  routine: { label: "Routine", bg: "bg-green-500", text: "text-white" },
};

// ─── Progress helpers ─────────────────────────────────────────────────────
const STATUS_ORDER = [
  "incoming",
  "approved",
  "pending",
  "confirmed",
  "procured",
  "assigned",
  "completed",
];

function getProgressPercent(status) {
  if (status === "denied" || status === "reopened") return 100;
  const idx = STATUS_ORDER.indexOf(status);
  if (idx === -1) return 0;
  return (idx / (STATUS_ORDER.length - 1)) * 100;
}

// Interpolates from red-500 (#EF4444) to green-500 (#22C55E)
function getProgressColor(percent) {
  const red = { r: 239, g: 68, b: 68 };
  const green = { r: 34, g: 197, b: 94 };
  const t = Math.max(0, Math.min(100, percent)) / 100;
  const r = Math.round(red.r + (green.r - red.r) * t);
  const g = Math.round(red.g + (green.g - red.g) * t);
  const b = Math.round(red.b + (green.b - red.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── Report Card ──────────────────────────────────────────────────────────────
function ReportCard({
  report,
  workerMap,
  estateManagers,
  user,
  getDenialNote,
  onCancelReport,
}) {
  const overdueLabel = useLiveTimeAgo(report.dateDue);
  const denialNote = getDenialNote(report);
  const reopenNote = report.status === "reopened" ? report.reopenReason : null;
  const assignedWorker =
    report.status === "assigned" && report.assignedTo
      ? workerMap[report.assignedTo] || null
      : null;

  const sc = STATUS_CONFIG[report.status] || STATUS_CONFIG.incoming;
  const pc = PRIORITY_CONFIG[report.priorityLevel] || PRIORITY_CONFIG.routine;
  const canCancel =
    user?.role === "staff" &&
    report?.reporterId === user?.ID &&
    report?.status === "incoming";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      {/* coloured top bar */}
      <div className={`h-1.5 w-full ${sc.bar}`} />

      <div className="p-5">
        {/* header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl">{sc.icon}</span>
            <h3 className="font-black text-gray-900 text-lg leading-tight">
              {report.category}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* priority badge */}
            <span
              className={`text-xs font-black px-2.5 py-1 rounded-full ${pc.bg} ${pc.text} uppercase tracking-wide`}
            >
              {report.priorityLevel}
            </span>
            {/* status badge */}
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${sc.bg} ${sc.text} flex items-center gap-1`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${sc.dot} inline-block`}
              />
              {sc.label}
            </span>
          </div>
        </div>

        {/* progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-black text-gray-400 uppercase tracking-wide">
              Progress
            </span>
            <span className="text-xs font-bold text-gray-500">
              {report.status === "denied"
                ? "Denied"
                : report.status === "reopened"
                  ? "Reopened"
                  : `${Math.round(getProgressPercent(report.status))}%`}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${getProgressPercent(report.status)}%`,
                backgroundColor:
                  report.status === "denied"
                    ? "#EF4444"
                    : report.status === "reopened"
                      ? "#F59E0B"
                      : getProgressColor(getProgressPercent(report.status)),
              }}
            />
          </div>
        </div>

        {/* status detail message */}
        {getStatusMessage(report) && (
          <p className="text-xs text-gray-500 leading-relaxed mb-4 -mt-2">
            {getStatusMessage(report)}
          </p>
        )}

        {/* description */}
        <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3">
          {report.reportDescription}
        </p>

        {/* meta chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
            📍 {report.location}
          </span>
          <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
            🗓 {formatDate(report.dateSent)}
          </span>
        </div>

        {/* overdue banner */}
        {report.overdue && report.status !== "completed" && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
            <span className="text-base">⚠️</span>
            <div>
              <p className="text-xs font-black text-red-700 uppercase tracking-wide">
                Overdue
              </p>
              {report.dateDue && (
                <p className="text-xs text-red-500">Due {overdueLabel}</p>
              )}
            </div>
          </div>
        )}

        {/* assigned worker */}
        {report.status === "assigned" && (
          <div className="border-t border-gray-100 pt-4 mt-2">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
              Assigned Technician
            </p>
            {assignedWorker ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white"
                    style={{ backgroundColor: ORANGE }}
                  >
                    {assignedWorker.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <span className="text-sm font-bold text-gray-800">
                    {assignedWorker.name}
                  </span>
                </div>
                {assignedWorker.phoneNumber && (
                  <a
                    href={`tel:${assignedWorker.phoneNumber}`}
                    className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-white transition hover:opacity-90"
                    style={{ backgroundColor: ORANGE }}
                  >
                    <span className="material-symbols-outlined text-sm">
                      call
                    </span>
                    Call
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Loading technician…
              </p>
            )}
          </div>
        )}

        {/* estate managers — emergency or overdue */}
        {(report.priorityLevel === "emergency" || report.overdue) &&
          estateManagers.length > 0 && (
            <div className="border-t border-gray-100 pt-4 mt-4">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                Call Estate Manager
              </p>
              <div className="flex flex-col gap-2">
                {estateManagers.map((em, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-black text-blue-700">
                        {em.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-800">
                        {em.name}
                      </span>
                    </div>
                    {em.phoneNumber && (
                      <a
                        href={`tel:${em.phoneNumber}`}
                        className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
                      >
                        <span className="material-symbols-outlined text-sm">
                          call
                        </span>
                        Call
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* denial note */}
        {denialNote && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <p className="text-xs font-black text-red-400 uppercase tracking-widest mb-1">
              Denial Reason
            </p>
            <div className="bg-red-50 rounded-xl px-3 py-2">
              <p className="text-sm text-red-700">{denialNote}</p>
            </div>
          </div>
        )}

        {/* reopen reason */}
        {reopenNote && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1">
              Why You Reopened This
            </p>
            <div className="bg-amber-50 rounded-xl px-3 py-2">
              <p className="text-sm text-amber-700">{reopenNote}</p>
            </div>
          </div>
        )}

        {canCancel && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <button
              type="button"
              onClick={() => onCancelReport?.(report)}
              className="w-full rounded-xl px-3 py-2 text-sm font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: "#dc2626" }}
            >
              Cancel Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="h-1.5 w-full bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="flex justify-between">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="h-5 bg-gray-200 rounded w-1/4" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
        <div className="flex gap-2">
          <div className="h-6 bg-gray-100 rounded-full w-24" />
          <div className="h-6 bg-gray-100 rounded-full w-20" />
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Pending() {
  const [sidePopup, setSidePopup] = useState(false);
  const [reports, setReports] = useState([]);
  const [workerMap, setWorkerMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [estateManagers, setEstateManagers] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  useEffect(() => {
    getDocs(
      query(collection(db, "users"), where("role", "==", "estate"), limit(10)),
    )
      .then((snap) => setEstateManagers(snap.docs.map((d) => d.data())))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!user?.ID) return;
    const q = query(
      collection(db, "reports"),
      where("reporterId", "==", user.ID),
      where("status", "in", [
        "incoming",
        "approved",
        "pending",
        "confirmed",
        "assigned",
        "denied",
        "reopened",
      ]),
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.dateSent?.toDate?.() ?? new Date(0)) -
              (a.dateSent?.toDate?.() ?? new Date(0)),
          );
        setReports(data);
        setLoading(false);

        const ids = [
          ...new Set(
            data
              .filter((r) => r.status === "assigned" && r.assignedTo)
              .map((r) => r.assignedTo),
          ),
        ];
        for (const id of ids) {
          setWorkerMap((prev) => {
            if (prev[id]) return prev;
            getDocs(
              query(collection(db, "users"), where("ID", "==", id), limit(1)),
            )
              .then((s) => {
                if (!s.empty)
                  setWorkerMap((p) => ({ ...p, [id]: s.docs[0].data() }));
              })
              .catch(console.error);
            return prev;
          });
        }
      },
      console.error,
    );
    return unsub;
  }, [user?.ID]);

  const getDenialNote = (report) => {
    if (report.status !== "denied") return null;
    return (
      report.alerts?.find((a) => a.sentTo === user?.ID && a.type === "incoming")
        ?.content || null
    );
  };

  const handleCancelReport = async (report) => {
    if (!report?.id || report.status !== "incoming") return;

    const confirmed = window.confirm(
      `Are you sure you want to cancel this report? This action will permanently delete the report.`,
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "reports", report.id));
      alert("Report cancelled and removed successfully.");
    } catch (error) {
      console.error("Error cancelling report:", error);
      alert("Failed to cancel report. Please try again.");
    }
  };

  // filter tabs
  const filterTabs = [
    { key: "all", label: "All" },
    { key: "incoming", label: "Incoming" },
    { key: "approved", label: "Approved" },
    { key: "pending", label: "Pending" },
    { key: "confirmed", label: "Confirmed" },
    { key: "assigned", label: "Assigned" },
    { key: "denied", label: "Denied" },
    { key: "reopened", label: "Reopened" },
  ];

  const filtered =
    activeFilter === "all"
      ? reports
      : reports.filter((r) => r.status === activeFilter);

  // count per status for badges
  const countByStatus = reports.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const pendingReports = (
    <div className="min-h-screen bg-white py-24 px-4 md:px-8 lg:px-16">
      {/* ── Page header ──────────────────────────────────────────── */}

      {/* ── Welcome message ──────────────────────────────────────── */}
      <p className="text-gray-500 font-semibold mb-4">
        {getGreeting()}, {getFormalName(user)} 👋
      </p>

      <div className="mb-8">
        <span
          className="inline-block text-xs font-black tracking-[.2em] uppercase px-3 py-1.5 rounded-full text-white mb-3"
          style={{ backgroundColor: ORANGE }}
        >
          My Reports
        </span>
        <h1 className="text-4xl md:text-5xl font-black text-gray-900 leading-tight">
          Pending Reports
        </h1>
        <p className="text-gray-400 mt-2">
          Track every report you've submitted in real-time.
        </p>
      </div>

      {/* ── Summary pills ────────────────────────────────────────── */}
      {!loading && reports.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {Object.entries(countByStatus).map(([status, count]) => {
            const sc = STATUS_CONFIG[status];
            if (!sc) return null;
            return (
              <div
                key={status}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${sc.bg} ${sc.text}`}
              >
                <span>{sc.icon}</span>
                <span>{sc.label}</span>
                <span className="font-black">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Filter tabs ──────────────────────────────────────────── */}
      {!loading && reports.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-8">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            const count =
              tab.key === "all" ? reports.length : countByStatus[tab.key] || 0;
            if (tab.key !== "all" && count === 0) return null;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`text-xs font-bold px-4 py-2 rounded-full border-2 transition-all duration-200 ${
                  isActive
                    ? "text-white border-transparent"
                    : "bg-white text-gray-500 border-gray-200 hover:border-orange-300"
                }`}
                style={
                  isActive
                    ? { backgroundColor: ORANGE, borderColor: ORANGE }
                    : {}
                }
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={`ml-1.5 font-black ${isActive ? "text-white/80" : "text-gray-400"}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              workerMap={workerMap}
              estateManagers={estateManagers}
              user={user}
              getDenialNote={getDenialNote}
              onCancelReport={handleCancelReport}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-24">
          <div className="text-6xl mb-4">📭</div>
          <h2 className="text-xl font-black text-gray-700 mb-2">
            Nothing here yet
          </h2>
          <p className="text-gray-400 text-sm">
            Your reports will appear here once submitted.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <>
      <span
        className="material-symbols-outlined md:hidden z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 text-white shadow-lg"
        style={{ backgroundColor: ORANGE }}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>
      <PageLayout content={pendingReports} sidePopup={sidePopup} />
    </>
  );
}
