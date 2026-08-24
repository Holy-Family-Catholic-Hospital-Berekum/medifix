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
  updateDoc,
  serverTimestamp,
  doc,
} from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate } from "../src/utils";

// ─── design tokens ───────────────────────────────────────────────────────────
const ORANGE = "#FF8825";
const INK = "#131B26";
const TEAL = "#0E7C86";

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
  .ff-display { font-family: 'Sora', sans-serif; }
  .ff-mono { font-family: 'JetBrains Mono', monospace; }
  @keyframes cardRise {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .card-rise { animation: cardRise .45s cubic-bezier(.22,1,.36,1) both; }
`;

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

// Converts any of the date shapes we store (Firestore Timestamp, JS Date,
// ISO string) into a plain JS Date, or null if there's nothing usable.
function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// A report can pick up new "activity" dates well after it was first sent
// (approved, reassigned, reopened, etc). Sorting purely by dateSent leaves
// recently-reopened or recently-updated reports buried under old ones, so
// instead we take whichever tracked date is the most recent.
const ACTIVITY_DATE_FIELDS = [
  "dateReopened",
  "dateRejected",
  "dateAccepted",
  "dateCompleted",
  "dateAssigned",
  "dateProcured",
  "dateConfirmed",
  "dateCostDenied",
  "dateCostAdded",
  "dateApproved",
  "dateSent",
];

function getLastActivityDate(report) {
  let latest = null;
  for (const field of ACTIVITY_DATE_FIELDS) {
    const d = toDate(report?.[field]);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest ?? new Date(0);
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
    "You reopened this job. It's back with the Estate Manager for further action.",
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

// Short, chart-style reference code derived from the report's own id —
// gives each card a clinical "record number" instead of a bare category
// name floating with nothing to anchor it.
function getRefCode(id) {
  if (!id) return "———";
  return `#${id.slice(-5).toUpperCase()}`;
}

// ─── status & priority config ─────────────────────────────────────────────
const STATUS_CONFIG = {
  incoming: {
    label: "Incoming",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
    spine: "#F59E0B",
    icon: "📥",
  },
  approved: {
    label: "Approved",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    spine: "#3B82F6",
    icon: "✅",
  },
  pending: {
    label: "Pending",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    dot: "bg-yellow-500",
    spine: "#EAB308",
    icon: "⏳",
  },
  confirmed: {
    label: "Confirmed",
    bg: "bg-teal-50",
    text: "text-teal-700",
    dot: "bg-teal-500",
    spine: TEAL,
    icon: "🔒",
  },
  assigned: {
    label: "Assigned",
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
    spine: "#8B5CF6",
    icon: "👷",
  },
  denied: {
    label: "Denied",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
    spine: "#DC2626",
    icon: "❌",
  },
  completed: {
    label: "Completed",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
    spine: "#16A34A",
    icon: "🏁",
  },
  reopened: {
    label: "Reopened",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    spine: "#F59E0B",
    icon: "🔁",
  },
  closed: {
    label: "Closed",
    bg: "bg-gray-100",
    text: "text-gray-700",
    dot: "bg-gray-500",
    spine: "#64748B",
    icon: "📁",
  },
};

const PRIORITY_CONFIG = {
  emergency: { label: "Emergency", solid: "#DC2626" },
  urgent: { label: "Urgent", solid: "#F97316" },
  routine: { label: "Routine", solid: "#16A34A" },
};

// ─── pipeline stepper — the page's signature element ──────────────────────
// The workflow genuinely IS a fixed sequence, so a discrete step tracker
// encodes real information about where a report sits — unlike a smooth
// percentage bar, which implies granularity that doesn't exist. Only
// rendered for reports still moving forward through the sequence; denied
// and reopened reports get their own note blocks below instead.
const PIPELINE_STAGES = [
  "incoming",
  "approved",
  "pending",
  "confirmed",
  "procured",
  "assigned",
];

function PipelineStepper({ status }) {
  const idx = PIPELINE_STAGES.indexOf(status);
  if (idx === -1) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em]">
          Pipeline
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wide ff-mono"
          style={{ color: INK }}
        >
          {STATUS_CONFIG[status]?.label}
        </span>
      </div>
      <div className="flex items-center">
        {PIPELINE_STAGES.map((key, i) => {
          const done = i <= idx;
          const isLast = i === PIPELINE_STAGES.length - 1;
          return (
            <div key={key} className="flex items-center flex-1 last:flex-none">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300"
                style={{ backgroundColor: done ? ORANGE : "#E4E8EE" }}
                title={STATUS_CONFIG[key]?.label}
              />
              {!isLast && (
                <span
                  className="h-[2px] flex-1 mx-1 transition-colors duration-300"
                  style={{ backgroundColor: i < idx ? ORANGE : "#E4E8EE" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Report Card ──────────────────────────────────────────────────────────────
function ReportCard({
  report,
  workerMap,
  estateManagers,
  user,
  getDenialNote,
  onCancelReport,
  onCloseReport,
  onDismissReport,
  index,
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
  const canClose =
    user?.role === "staff" &&
    report?.reporterId === user?.ID &&
    report?.status === "reopened";
  const canDismiss =
    user?.role === "staff" &&
    report?.reporterId === user?.ID &&
    report?.status === "denied";

  return (
    <div
      className="card-rise relative flex bg-white rounded-2xl border border-[#E4E8EE] shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* triage spine — the "chart tab" left edge, colored by status */}
      <div
        className="w-1.5 flex-shrink-0"
        style={{ backgroundColor: sc.spine }}
      />

      <div className="flex-1 p-5 min-w-0">
        {/* header row — ref code + category + priority stamp */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <span className="ff-mono text-[10px] font-semibold text-gray-400 tracking-wide">
              {getRefCode(report.id)}
            </span>
            <h3
              className="ff-display font-bold text-lg leading-tight truncate"
              style={{ color: INK }}
            >
              {report.category}
            </h3>
          </div>
          <span
            className="flex-shrink-0 -rotate-2 inline-flex items-center text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border border-dashed ff-mono"
            style={{ color: pc.solid, borderColor: pc.solid }}
          >
            {pc.label}
          </span>
        </div>

        {/* status badge */}
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full mb-4 ${sc.bg} ${sc.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
          {sc.label}
        </span>

        {/* signature pipeline stepper */}
        <PipelineStepper status={report.status} />

        {/* status detail message */}
        {getStatusMessage(report) && (
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            {getStatusMessage(report)}
          </p>
        )}

        {/* description */}
        <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3">
          {report.reportDescription}
        </p>

        {/* meta chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 border border-gray-100 px-2.5 py-1 rounded-full font-medium">
            📍 {report.location}
          </span>
          <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 border border-gray-100 px-2.5 py-1 rounded-full font-medium ff-mono">
            🗓 {formatDate(report.dateSent)}
          </span>
        </div>

        {/* overdue banner */}
        {report.overdue && report.status !== "completed" && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
            <span className="text-base">⚠️</span>
            <div>
              <p className="text-[10px] font-black text-red-700 uppercase tracking-wide">
                Overdue
              </p>
              {report.dateDue && (
                <p className="text-xs text-red-500 ff-mono">
                  Due {overdueLabel}
                </p>
              )}
            </div>
          </div>
        )}

        {/* assigned worker */}
        {report.status === "assigned" && (
          <div className="border-t border-gray-100 pt-4 mt-2">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Assigned Technician
            </p>
            {assignedWorker ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white flex-shrink-0"
                    style={{ backgroundColor: ORANGE }}
                  >
                    {assignedWorker.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <span className="text-sm font-bold text-gray-800 truncate">
                    {assignedWorker.name}
                  </span>
                </div>
                {assignedWorker.phoneNumber && (
                  
                   <a href={`tel:${assignedWorker.phoneNumber}`}
                    className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-white transition hover:opacity-90 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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

        {/* estate managers — emergency or overdue, teal accent to
            distinguish "contact" actions from the orange primary CTA */}
        {(report.priorityLevel === "emergency" || report.overdue) &&
          estateManagers.length > 0 && (
            <div className="border-t border-gray-100 pt-4 mt-4">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                Call Estate Manager
              </p>
              <div className="flex flex-col gap-2">
                {estateManagers.map((em, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                        style={{ backgroundColor: `${TEAL}1A`, color: TEAL }}
                      >
                        {em.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {em.name}
                      </span>
                    </div>
                    {em.phoneNumber && (
                      
                       <a href={`tel:${em.phoneNumber}`}
                        className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        style={{ backgroundColor: `${TEAL}1A`, color: TEAL }}
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
            <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">
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
            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">
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
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: "#dc2626" }}
            >
              <span className="material-symbols-outlined text-base">
                cancel
              </span>
              Cancel Report
            </button>
          </div>
        )}

        {/* Staff can close a report they previously reopened once they're
            satisfied it's been sorted out some other way (e.g. handled
            outside the app), without waiting on the Estate Manager. */}
        {canClose && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <button
              type="button"
              onClick={() => onCloseReport?.(report)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: "#16a34a" }}
            >
              <span className="material-symbols-outlined text-base">
                task_alt
              </span>
              Close Report
            </button>
          </div>
        )}

        {/* Staff can dismiss a denied report from their own list. This is
            a SOFT delete — the report doc is kept (flagged
            dismissedByReporter) rather than removed from Firestore, so it
            still counts toward denial-rate and other Dashboard metrics.
            It just stops showing up here. */}
        {canDismiss && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <button
              type="button"
              onClick={() => onDismissReport?.(report)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: "#6B7280" }}
            >
              <span className="material-symbols-outlined text-base">
                archive
              </span>
              Dismiss Report
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
    <div className="flex bg-white rounded-2xl border border-[#E4E8EE] shadow-sm overflow-hidden animate-pulse">
      <div className="w-1.5 flex-shrink-0 bg-gray-200" />
      <div className="flex-1 p-5 space-y-3">
        <div className="flex justify-between">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="h-5 bg-gray-200 rounded w-1/4" />
        </div>
        <div className="h-2 bg-gray-100 rounded w-full" />
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
          // Denied reports the reporter has already dismissed are kept in
          // Firestore (see the soft-delete `dismissedByReporter` flow —
          // firestore.rules and handleDismissReport below) purely so
          // Dashboard.jsx's denial-rate metrics keep counting them. They
          // just shouldn't clutter this list anymore, so filter them out
          // client-side rather than excluding them from the query itself.
          .filter((r) => !(r.status === "denied" && r.dismissedByReporter))
          .sort((a, b) => getLastActivityDate(b) - getLastActivityDate(a));
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
    const denialNotes = (report.notes || []).filter(
      (n) => n?.type === "denial",
    );
    return denialNotes.length
      ? denialNotes[denialNotes.length - 1].content
      : null;
  };

  const handleCancelReport = async (report) => {
    if (!report?.id || report.status !== "incoming") return;

    const confirmed = window.confirm(
      `Are you sure you want to cancel this report? This action will permanently delete the report.`,
    );

    if (!confirmed) return;

    try {
      // Best-effort — an incoming report may or may not have a "before"
      // photo attached. Remove it first: the reportImages delete rule
      // reads the parent report doc, so it has to go before the report
      // itself is deleted.
      await deleteDoc(doc(db, "reportImages", report.id)).catch(() => {});
      await deleteDoc(doc(db, "reports", report.id));
      alert("Report cancelled and removed successfully.");
    } catch (error) {
      console.error("Error cancelling report:", error);
      alert("Failed to cancel report. Please try again.");
    }
  };

  // Staff closing a report they reopened. This is a distinct outcome from
  // "completed" — it just means the staff member is done with it without
  // going through another feedback cycle. The onSnapshot listener above
  // will drop it from this list automatically once its status is no longer
  // one of the ones in the query's "in" filter.
  const handleCloseReport = async (report) => {
    if (
      !report?.id ||
      report.status !== "reopened" ||
      user?.role !== "staff" ||
      report?.reporterId !== user?.ID
    )
      return;

    const confirmed = window.confirm(
      "Close this report? This marks it as resolved and moves it out of your open reports.",
    );

    if (!confirmed) return;

    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "closed",
        dateClosed: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error closing report:", error);
      alert("Failed to close report. Please try again.");
    }
  };

  // Staff dismissing a denied report. This is a SOFT delete: the report
  // doc is flagged (dismissedByReporter) and kept in Firestore instead of
  // being removed, so Dashboard.jsx's denial-rate / recentDenials metrics
  // (which read the full `reports` collection) keep counting it forever.
  // The onSnapshot listener above filters dismissed reports out of this
  // list client-side, so it still disappears from the reporter's view —
  // it just isn't gone from the system's records.
  //
  // The associated "before" photo, if any, is still hard-deleted here —
  // nothing depends on it existing once the report is dismissed, so
  // there's no reason to keep paying storage for it.
  const handleDismissReport = async (report) => {
    if (
      !report?.id ||
      report.status !== "denied" ||
      user?.role !== "staff" ||
      report?.reporterId !== user?.ID
    )
      return;

    const confirmed = window.confirm(
      "Dismiss this denied report? It'll disappear from your list here, but stays on record for reporting purposes.",
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "reportImages", report.id)).catch(() => {});
      await updateDoc(doc(db, "reports", report.id), {
        dismissedByReporter: true,
        dateDismissed: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error dismissing report:", error);
      alert("Failed to dismiss report. Please try again.");
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
    <div className="min-h-screen bg-[#F5F7FA] py-24 px-4 md:px-8 lg:px-16">
      <style>{FONTS}</style>

      {/* ── Hero header ──────────────────────────────────────────── */}
      <p className="text-gray-400 font-medium text-sm mb-2">
        {getGreeting()},{" "}
        <span className="text-gray-700 font-semibold">
          {getFormalName(user)}
        </span>
      </p>

      <div className="mb-8">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.25em] uppercase px-3 py-1.5 rounded-full text-white mb-3"
          style={{ backgroundColor: ORANGE }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
          My Reports
        </span>
        <h1
          className="ff-display font-extrabold text-4xl md:text-5xl leading-[1.05] tracking-tight"
          style={{ color: INK }}
        >
          Pending Reports
        </h1>
        <p className="text-gray-400 mt-2 max-w-md">
          Every maintenance report you've filed, tracked stage by stage.
        </p>
      </div>

      {/* ── Status tally strip ──────────────────────────────────────── */}
      {!loading && reports.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Object.entries(countByStatus).map(([status, count]) => {
            const sc = STATUS_CONFIG[status];
            if (!sc) return null;
            return (
              <div
                key={status}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border border-black/5 flex-shrink-0 ${sc.bg} ${sc.text}`}
              >
                <span>{sc.icon}</span>
                <span>{sc.label}</span>
                <span className="ff-mono text-[11px] font-semibold opacity-70">
                  {count}
                </span>
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
                className={`text-xs font-bold px-4 py-2 rounded-full border-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 ${
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
          {filtered.map((report, i) => (
            <ReportCard
              key={report.id}
              report={report}
              workerMap={workerMap}
              estateManagers={estateManagers}
              user={user}
              getDenialNote={getDenialNote}
              onCancelReport={handleCancelReport}
              onCloseReport={handleCloseReport}
              onDismissReport={handleDismissReport}
              index={i}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-24">
          <div className="text-6xl mb-4">📭</div>
          <h2
            className="ff-display font-extrabold text-xl mb-2"
            style={{ color: INK }}
          >
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