import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "../src/firebase";
import NavBar from "./navBar";
import { THEMES } from "./Home";
import { generateDashboardStatsPDF } from "../src/utils";

// ─── status classification ────────────────────────────────────────────────
// "Terminal" = the job is fully done and out of anyone's queue.
// "reopened" is intentionally NOT terminal — it's back in the pipeline and
// needs action — but it also must never show as overdue (per product
// decision: reopened jobs don't carry a due-date countdown), so overdue
// exclusion is a separate, slightly larger list.
// "dropped" is also intentionally NOT terminal, for the same reason as
// "rejected": a worker dropping a job just returns it to Estate for
// reassignment, it doesn't reset or pause the original due date, so it's
// deliberately left OUT of OVERDUE_EXCLUDED_STATUSES (same treatment as
// "rejected") — a dropped job can still show as overdue.
const TERMINAL_STATUSES = ["completed", "closed", "denied"];
const OVERDUE_EXCLUDED_STATUSES = ["completed", "closed", "denied", "reopened"];

const isActive = (status) => !TERMINAL_STATUSES.includes(status);
const isOverdueEligible = (report) =>
  report.overdue && !OVERDUE_EXCLUDED_STATUSES.includes(report.status);

// ─── worker performance weights ──────────────────────────────────────────
// "Performance" blends three independent signals into one score:
//  - quality: customer star rating (Bayesian-weighted)
//  - reliability: inverse of how often a completed job gets reopened
//  - speed: accepted→completed time relative to the rest of the fleet
// Raw completion rate (done/assigned) is deliberately NOT a component:
// every assigned job gets completed eventually (or reassigned), so it
// isn't a meaningful signal on its own.
const PERFORMANCE_WEIGHTS = {
  quality: 0.5,
  reliability: 0.3,
  speed: 0.2,
};

// ─── data-volume caps ───────────────────────────────────────────────────────
// The dashboard used to hold a LIVE, UNBOUNDED listener on the entire
// `reports` and `users` collections. That meant every dashboard load (and
// every subsequent write anywhere in the app, since it was live) re-read
// every document ever created — cost and load time that only ever grow,
// with no ceiling. This is a real-time-analytics dashboard, not a page that
// needs to reflect every write within milliseconds, so it's switched to a
// bounded, explicitly-refreshed fetch instead (see loadReports/loadUsers
// below). Adjust these caps to your real data volume; they're meant to be
// generous, not a hard product constraint.
const DASHBOARD_REPORTS_CAP = 5000;
const DASHBOARD_USERS_CAP = 5000;

// ─── table pagination ────────────────────────────────────────────────────────
// Purely client-side paging over the already-fetched (bounded) arrays above
// — this just controls how many rows render in the Reports/Users tables at
// once, so a large data set doesn't render hundreds of DOM rows in one go.
const REPORTS_PAGE_SIZE = 20;
const USERS_PAGE_SIZE = 20;

const paginate = (arr, page, pageSize) =>
  arr.slice((page - 1) * pageSize, page * pageSize);

// ─── registration PIN generation ───────────────────────────────────────────
// Registration IDs used to be a nanoid() — long enough that a collision was
// astronomically unlikely, so nothing ever checked for one. A 6-digit
// numeric PIN only has 1,000,000 possible values, so two things change:
//
// 1. Uniqueness has to be actively checked before writing (see
//    generateUniqueRegistrationId below), not just assumed.
// 2. registrationIDs/{id} is publicly readable (`allow get: if true` in
//    firestore.rules) because SignUp.jsx has to validate a PIN before the
//    person has an account/auth token yet — a short PIN is guessable in a
//    way a long one never practically was. `createdAt` (a real server
//    timestamp, enforced by firestore.rules) gives SignUp.jsx something to
//    check a 48-hour expiry against, so a guessed or leaked PIN stops being
//    claimable well before someone could brute-force the ~1M keyspace.
const REG_ID_LENGTH = 6;
const REG_ID_MAX_GENERATION_ATTEMPTS = 10;

async function generateUniqueRegistrationId() {
  for (let attempt = 0; attempt < REG_ID_MAX_GENERATION_ATTEMPTS; attempt++) {
    const candidate = Array.from({ length: REG_ID_LENGTH }, () =>
      Math.floor(Math.random() * 10),
    ).join("");
    const snap = await getDoc(doc(db, "registrationIDs", candidate));
    if (!snap.exists()) return candidate;
  }
  // Vanishingly unlikely at 1M possible codes and normal generation
  // volume, but fail loudly rather than silently overwriting an existing
  // active PIN if it ever does happen.
  throw new Error(
    "Could not generate a unique registration PIN please try again.",
  );
}

// ─── meta maps ───────────────────────────────────────────────────────────────
const STATUS_META = {
  incoming: {
    label: "Incoming",
    color: "#f59e0b",
    bg: "#fef3c7",
    text: "#92400e",
  },
  approved: {
    label: "Approved",
    color: "#3b82f6",
    bg: "#dbeafe",
    text: "#1e40af",
  },
  pending: {
    label: "Pending",
    color: "#f97316",
    bg: "#ffedd5",
    text: "#9a3412",
  },
  confirmed: {
    label: "Confirmed",
    color: "#10b981",
    bg: "#d1fae5",
    text: "#065f46",
  },
  procured: {
    label: "Procured",
    color: "#14b8a6",
    bg: "#ccfbf1",
    text: "#0f766e",
  },
  assigned: {
    label: "Assigned",
    color: "#8b5cf6",
    bg: "#ede9fe",
    text: "#4c1d95",
  },
  accepted: {
    label: "Accepted",
    color: "#06b6d4",
    bg: "#cffafe",
    text: "#155e75",
  },
  rejected: {
    label: "Job Rejected",
    color: "#f43f5e",
    bg: "#ffe4e6",
    text: "#881337",
  },
  // New: worker accepted a job, then dropped it before finishing — cleared
  // back to unassigned and returned to Estate for reassignment. Given its
  // own distinct orange tone (matching the orange bg-orange-50/text-orange-700
  // treatment ReportDetailsContainer.jsx already uses for the drop reason
  // banner) so it doesn't get visually confused with "Job Rejected" (rose),
  // even though both land the report back with Estate for reassignment.
  dropped: {
    label: "Dropped",
    color: "#ea580c",
    bg: "#fff7ed",
    text: "#9a3412",
  },
  completed: {
    label: "Completed",
    color: "#22c55e",
    bg: "#dcfce7",
    text: "#14532d",
  },
  reopened: {
    label: "Reopened",
    color: "#f59e0b",
    bg: "#fef9c3",
    text: "#854d0e",
  },
  closed: {
    label: "Closed",
    color: "#64748b",
    bg: "#f1f5f9",
    text: "#334155",
  },
  denied: { label: "Denied", color: "#ef4444", bg: "#fee2e2", text: "#7f1d1d" },
  costDenied: {
    label: "Cost Denied",
    color: "#f43f5e",
    bg: "#ffe4e6",
    text: "#881337",
  },
};

const PRIORITY_META = {
  emergency: {
    label: "Emergency",
    color: "#dc2626",
    bg: "#fee2e2",
    text: "#991b1b",
  },
  urgent: { label: "Urgent", color: "#f97316", bg: "#ffedd5", text: "#9a3412" },
  routine: {
    label: "Routine",
    color: "#22c55e",
    bg: "#dcfce7",
    text: "#14532d",
  },
};

const ROLE_META = {
  admin: { label: "Admin", bg: "#fef3c7", text: "#92400e", color: "#f59e0b" },
  manager: {
    label: "Manager",
    bg: "#fce7f3",
    text: "#9d174d",
    color: "#ec4899",
  },
  estate: {
    label: "Estate Manager",
    bg: "#dbeafe",
    text: "#1e40af",
    color: "#3b82f6",
  },
  procurement: {
    label: "Procurement",
    bg: "#ede9fe",
    text: "#5b21b6",
    color: "#8b5cf6",
  },
  staff: { label: "Staff", bg: "#ede9fe", text: "#4c1d95", color: "#8b5cf6" },
  worker: { label: "Worker", bg: "#d1fae5", text: "#065f46", color: "#10b981" },
};

const CAT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];
const ALLOWED_ROLES = ["admin", "manager", "estate", "procurement"];

// ─── period selector options (shared by overview display + PDF download) ────
const PERIOD_OPTIONS = [
  { value: "overall", label: "Overall" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "lastYear", label: "Last Year" },
];

const DOWNLOAD_PERIOD_LABELS = {
  month: "Monthly",
  year: "Yearly",
  lastYear: "Last Year's",
  overall: "Overall",
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return "";
  const d = date?.toDate ? date.toDate() : new Date(date);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (day > 0) return `${day}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function formatDate(date) {
  if (!date) return "—";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Denial reasons for "denied" reports live in the report's `notes` array
// (written by ReportDetailsContainer.jsx's handleDeny as
// { type: "denial", content, date, by }) — NOT in a top-level
// `denialReason` field, which never existed on any report document. This
// mirrors ReportDetailsContainer.jsx's own getDenialNote helper so both
// places read the same shape the same way. Scoped deliberately to
// "denied" (incoming → denied) only — costDenied is a separate flow and
// out of scope for this feed.
function getDenialReasonText(report) {
  if (!report || report.status !== "denied") return null;
  const denialNotes = (report.notes || []).filter((n) => n?.type === "denial");
  return denialNotes.length
    ? denialNotes[denialNotes.length - 1].content
    : null;
}

// Sort key for the denial feed: prefer the date on the denial note itself
// (a plain client-side Date, since serverTimestamp() sentinels aren't
// allowed inside arrayUnion() array elements) and fall back to dateSent if
// that's ever missing.
function getDenialSortDate(report) {
  const denialNotes = (report.notes || []).filter((n) => n?.type === "denial");
  if (denialNotes.length) {
    const raw = denialNotes[denialNotes.length - 1].date;
    const d = raw?.toDate ? raw.toDate() : new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return report.dateSent?.toDate ? report.dateSent.toDate() : new Date(0);
}

// Computes report + cost stats for an arbitrary subset of reports.
// Used to build the "overall / month / year / lastYear" period breakdowns
// that drive the Overview tab and the PDF download period select.
function buildPeriodStats(subset) {
  const toDate = (v) => (v?.toDate ? v.toDate() : new Date(v));
  const diffDays = (from, to) =>
    (toDate(to).getTime() - toDate(from).getTime()) / 86400000;

  const total = subset.length;
  const completed = subset.filter((r) => r.status === "completed").length;
  const closed = subset.filter((r) => r.status === "closed").length;
  const reopened = subset.filter((r) => r.status === "reopened").length;
  const rejectedJobs = subset.filter((r) => r.status === "rejected").length;
  // New: current live count of reports sitting in "dropped" — same shape
  // as rejectedJobs above (a snapshot of THIS status within the selected
  // period, not a cumulative/ever-dropped count).
  const droppedJobs = subset.filter((r) => r.status === "dropped").length;
  const overdue = subset.filter(isOverdueEligible).length;
  const active = subset.filter((r) => isActive(r.status)).length;

  const byStatus = Object.fromEntries(
    Object.keys(STATUS_META).map((s) => [s, 0]),
  );
  subset.forEach((r) => {
    if (r.status in byStatus) byStatus[r.status]++;
  });

  const byPriority = { emergency: 0, urgent: 0, routine: 0 };
  subset.forEach((r) => {
    if (r.priorityLevel in byPriority) byPriority[r.priorityLevel]++;
  });

  const catCount = {};
  subset.forEach((r) => {
    catCount[r.category] = (catCount[r.category] || 0) + 1;
  });

  const resolved = subset.filter((r) => r.dateCompleted && r.dateSent);
  const avgResolutionDays = resolved.length
    ? (
        resolved.reduce((sum, r) => {
          const sent = r.dateSent?.toDate
            ? r.dateSent.toDate()
            : new Date(r.dateSent);
          const done = r.dateCompleted?.toDate
            ? r.dateCompleted.toDate()
            : new Date(r.dateCompleted);
          return sum + (done - sent) / 86400000;
        }, 0) / resolved.length
      ).toFixed(1)
    : null;

  // "Completion rate" (kept for the PDF export / historical callers that
  // still read it) counts anything the reporter has confirmed done
  // (closed) or that finished the technician's work (completed, even if
  // still awaiting reporter confirmation) as resolved.
  const completionRate = total
    ? Math.round(((completed + closed) / total) * 100)
    : 0;

  // "Closure rate" is the terminal-only figure the dashboard now surfaces
  // at the top level: closed = the reporter has confirmed the job was
  // done well. Completed on its own is still just a pending-feedback
  // state, not a finished job — so it doesn't count toward this rate.
  const closureRate = total ? Math.round((closed / total) * 100) : 0;

  const getReportTotalCost = (r) =>
    (Number(r.cost) || 0) + (Number(r.maintenanceCost) || 0);

  const reportsWithCost = subset.filter(
    (r) =>
      (r.cost != null && !isNaN(r.cost)) ||
      (r.maintenanceCost != null && !isNaN(r.maintenanceCost)),
  );
  const totalCost = reportsWithCost.reduce(
    (s, r) => s + getReportTotalCost(r),
    0,
  );
  const totalMaterialsCost = reportsWithCost.reduce(
    (s, r) => s + (Number(r.cost) || 0),
    0,
  );
  const totalMaintenanceCost = reportsWithCost.reduce(
    (s, r) => s + (Number(r.maintenanceCost) || 0),
    0,
  );
  const avgCost = reportsWithCost.length
    ? totalCost / reportsWithCost.length
    : null;
  const maxCost = reportsWithCost.length
    ? Math.max(...reportsWithCost.map(getReportTotalCost))
    : null;

  const costByCategory = {};
  reportsWithCost.forEach((r) => {
    costByCategory[r.category] =
      (costByCategory[r.category] || 0) + getReportTotalCost(r);
  });

  const costByPriority = { emergency: 0, urgent: 0, routine: 0 };
  reportsWithCost.forEach((r) => {
    if (r.priorityLevel in costByPriority)
      costByPriority[r.priorityLevel] += getReportTotalCost(r);
  });

  // ── 1. denial rate ──────────────────────────────────────────────────
  // "denied" (admin rejects the report outright) and "costDenied" (admin
  // rejects the submitted materials list) are both dead-ends the staff
  // member has to act on, so both count toward one denial rate.
  const deniedCount = subset.filter((r) => r.status === "denied").length;
  const costDeniedCount = subset.filter(
    (r) => r.status === "costDenied",
  ).length;
  const denialRate = total
    ? Math.round(((deniedCount + costDeniedCount) / total) * 100)
    : 0;

  // ── 2. pipeline stage duration ───────────────────────────────────────
  // Average days spent in each stage transition, computed only over
  // reports that actually have both timestamps — a report that skipped a
  // stage (e.g. assigned directly with no materials) simply doesn't
  // contribute a data point for that stage rather than skewing it toward
  // zero.
  const avgStageDays = (fromKey, toKey) => {
    const diffs = subset
      .filter((r) => r[fromKey] && r[toKey])
      .map((r) => diffDays(r[fromKey], r[toKey]))
      .filter((d) => d >= 0);
    return diffs.length
      ? diffs.reduce((s, d) => s + d, 0) / diffs.length
      : null;
  };
  const stageDurations = [
    {
      label: "Incoming → Approved",
      days: avgStageDays("dateSent", "dateApproved"),
    },
    {
      label: "Approved → Assigned",
      days: avgStageDays("dateApproved", "dateAssigned"),
    },
    {
      label: "Assigned → Accepted",
      days: avgStageDays("dateAssigned", "dateAccepted"),
    },
    {
      label: "Accepted → Completed",
      days: avgStageDays("dateAccepted", "dateCompleted"),
    },
  ];

  // ── 3. reassignment rate ─────────────────────────────────────────────
  // Distinct from "Jobs Declined by Worker" (a live count of reports
  // currently sitting in "rejected") — this is the share of every job
  // that was EVER assigned that needed a reassignment at some point,
  // whether that was triggered by a worker rejecting it, a worker
  // dropping it, or a reopen. dateReAssigned is set by
  // ReportDetailsContainer.jsx's handleAssignWorker whenever
  // report.assignedTo OR report.droppedBy is already present — so a
  // dropped-then-reassigned job is already captured here without any
  // change needed in this function.
  const everAssignedCount = subset.filter((r) => r.dateAssigned).length;
  const reassignedCount = subset.filter((r) => r.dateReAssigned).length;
  const reassignmentRate = everAssignedCount
    ? Math.round((reassignedCount / everAssignedCount) * 100)
    : 0;

  // ── 4. overdue by priority ───────────────────────────────────────────
  const overdueByPriority = { emergency: 0, urgent: 0, routine: 0 };
  subset.forEach((r) => {
    if (isOverdueEligible(r) && r.priorityLevel in overdueByPriority) {
      overdueByPriority[r.priorityLevel]++;
    }
  });

  // ── 5. location hotspots ─────────────────────────────────────────────
  const locationCounts = {};
  subset.forEach((r) => {
    const loc = (r.location || "").trim();
    if (loc) locationCounts[loc] = (locationCounts[loc] || 0) + 1;
  });
  const topLocations = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([location, count]) => ({ location, count }));

  // ── 6. first-time-fix rate (fleet-wide) ──────────────────────────────
  // Share of every job that reached "completed" at least once which was
  // closed WITHOUT ever being reopened. dateReopened is set once, the
  // first time a report is reopened, and never cleared — same "counts
  // forever" convention used for the per-worker rework figure below, so a
  // job that was eventually fixed after a reopen still counts against
  // this rate rather than disappearing once it's closed.
  const everCompletedCount = subset.filter((r) => r.dateCompleted).length;
  const everReworkedCount = subset.filter(
    (r) => r.dateCompleted && r.dateReopened,
  ).length;
  const firstTimeFixRate = everCompletedCount
    ? Math.round(
        ((everCompletedCount - everReworkedCount) / everCompletedCount) * 100,
      )
    : 0;

  return {
    total,
    completed,
    closed,
    reopened,
    rejectedJobs,
    droppedJobs,
    overdue,
    active,
    byStatus,
    byPriority,
    catCount,
    completionRate,
    closureRate,
    avgResolutionDays,
    reportsWithCost: reportsWithCost.length,
    totalCost,
    totalMaterialsCost,
    totalMaintenanceCost,
    avgCost,
    maxCost,
    costByCategory,
    costByPriority,
    deniedCount,
    costDeniedCount,
    denialRate,
    stageDurations,
    everAssignedCount,
    reassignedCount,
    reassignmentRate,
    overdueByPriority,
    topLocations,
    everCompletedCount,
    firstTimeFixRate,
  };
}

// ─── primitives ──────────────────────────────────────────────────────────────
function Badge({ bg, text, children }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 6,
        padding: "2px 8px",
        background: bg,
        color: text,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #f1f5f9",
        boxShadow: "0 1px 6px rgba(0,0,0,.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#9ca3af",
        margin: "28px 0 12px",
        letterSpacing: ".08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </h2>
  );
}

function PeriodSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        background: "#fff",
        color: "#374151",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        outline: "none",
      }}
    >
      {PERIOD_OPTIONS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

// Simple prev/next + "page X of Y" control, styled to match the rest of
// this file's inline-style primitives. Renders nothing when there's only
// one page, so it never adds visual clutter for small data sets.
function PaginationControls({
  page,
  totalPages,
  onChange,
  totalItems,
  pageSize,
}) {
  if (totalPages <= 1) return null;

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
        padding: "14px 4px 4px",
      }}
    >
      <span style={{ fontSize: 12, color: "#94a3b8" }}>
        Showing {start}–{end} of {totalItems}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#fff",
            color: "#374151",
            fontSize: 12,
            fontWeight: 700,
            cursor: page <= 1 ? "not-allowed" : "pointer",
            opacity: page <= 1 ? 0.4 : 1,
          }}
        >
          ← Prev
        </button>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#fff",
            color: "#374151",
            fontSize: 12,
            fontWeight: 700,
            cursor: page >= totalPages ? "not-allowed" : "pointer",
            opacity: page >= totalPages ? 0.4 : 1,
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, accent, sub }) {
  return (
    <Card
      style={{
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#64748b",
            fontWeight: 700,
            letterSpacing: ".05em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            flexShrink: 0,
            background: accent + "18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
          }}
        >
          {icon}
        </span>
      </div>
      <span
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "#0f172a",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: "#94a3b8" }}>{sub}</span>}
    </Card>
  );
}

// Small centered label/value block used inside the worker leaderboard's
// metrics grid (see WorkerCard below). Pulled out as its own primitive so
// the grid can lay out any number of these responsively without repeating
// the same inline-style block four times per card.
function WorkerMetric({ label, value, sub, color = "#0f172a", empty }) {
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          color: "#94a3b8",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".05em",
        }}
      >
        {label}
      </div>
      {empty ? (
        <span style={{ fontSize: 12, color: "#cbd5e1", fontStyle: "italic" }}>
          {empty}
        </span>
      ) : (
        <>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </div>
          {sub && (
            <span
              style={{
                fontSize: 9,
                color: "#2d2f31",
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sub}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// One leaderboard row for a worker. Split into a header (rank, avatar,
// name, performance bar) and a metrics grid underneath — stacking them
// vertically, and letting the metrics grid re-flow from 4 to 2 columns via
// the ".worker-metrics" CSS rule, is what keeps this readable on narrow
// mobile widths instead of overflowing a single wide row.
function WorkerCard({ w, rank }) {
  const perfColor =
    w.performancePct == null
      ? "#cbd5e1"
      : w.performancePct >= 80
        ? "#22c55e"
        : w.performancePct >= 50
          ? "#f59e0b"
          : "#ef4444";

  return (
    <Card style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: rank === 0 ? "#f59e0b" : "#94a3b8",
            width: 22,
            flexShrink: 0,
            textAlign: "center",
          }}
        >
          {rank === 0
            ? "🥇"
            : rank === 1
              ? "🥈"
              : rank === 2
                ? "🥉"
                : `#${rank + 1}`}
        </span>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "#fef2f2",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {w.name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "#0f172a",
              marginBottom: 6,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {w.name}
            {w.reworked > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#854d0e",
                  background: "#fef9c3",
                  borderRadius: 5,
                  padding: "1px 6px",
                }}
                title="Jobs this worker has had reopened"
              >
                🔁 {w.reworked} reopened
              </span>
            )}
          </div>
          {/* Tracks the blended performance score, not raw completion
              rate — every assigned job gets completed eventually (or
              reassigned), so completion rate alone isn't a meaningful
              signal. */}
          <div
            style={{
              height: 5,
              borderRadius: 999,
              background: "#f1f5f9",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                width: `${w.performancePct ?? 0}%`,
                background: perfColor,
                transition: "width .5s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Metrics grid — deliberately excludes average resolution time,
          which gets its own section (see "Average resolution time" below
          the leaderboard) so this row stays compact and doesn't overflow
          on mobile screens. */}
      <div
        className="worker-metrics"
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #f1f5f9",
        }}
      >
        {w.weightedRating != null ? (
          <WorkerMetric
            label="Rating"
            value={`★ ${w.weightedRating.toFixed(2)}`}
            sub={`${w.avgRating.toFixed(2)} raw · ${w.ratingCount} rated`}
            color="#f59e0b"
          />
        ) : (
          <WorkerMetric label="Rating" empty="No ratings" />
        )}
        <WorkerMetric label="Assigned" value={w.assigned} color="#64748b" />
        <WorkerMetric label="Done" value={w.done} color="#22c55e" />
        <WorkerMetric
          label="Performance"
          value={w.performancePct != null ? `${w.performancePct}%` : "—"}
          color={perfColor}
        />
      </div>
    </Card>
  );
}

function Donut({ slices, size = 88 }) {
  const r = 30,
    cx = 40,
    cy = 40,
    circ = 2 * Math.PI * r;
  let offset = 0;
  const total = slices.reduce((s, sl) => s + sl.value, 0) || 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth="13"
      />
      {slices.map((sl, i) => {
        const dash = (sl.value / total) * circ;
        const gap = circ - dash;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={sl.color}
            strokeWidth="13"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            style={{ transition: "stroke-dasharray .5s" }}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function BarChart({ data, color = "#3b82f6", height = 100 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 5,
        height,
        width: "100%",
      }}
    >
      {data.map((d, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              minHeight: 4,
              height: Math.max((d.value / max) * (height - 22), 4),
              background: color,
              borderRadius: "4px 4px 0 0",
              transition: "height .4s ease",
            }}
            title={`${d.label}: ${d.value}`}
          />
          <span
            style={{
              fontSize: 10,
              color: "#9ca3af",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel, danger }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <Card style={{ padding: 28, maxWidth: 400, width: "100%" }}>
        <p
          style={{
            fontSize: 15,
            color: "#0f172a",
            margin: "0 0 24px",
            lineHeight: 1.7,
          }}
        >
          {message}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: danger ? "#ef4444" : "#3b82f6",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Confirm
          </button>
        </div>
      </Card>
    </div>
  );
}

function TableWrap({ children }) {
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 540,
          }}
        >
          {children}
        </table>
      </div>
    </Card>
  );
}

function THead({ cols }) {
  return (
    <thead>
      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
        {cols.map((c) => (
          <th
            key={c}
            style={{
              padding: "11px 14px",
              textAlign: "left",
              fontWeight: 700,
              color: "#374151",
              whiteSpace: "nowrap",
              fontSize: 12,
            }}
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// Small inline banner used for "data may be incomplete" / "failed to load"
// states — deliberately quiet so it doesn't compete with the KPI cards, but
// visible enough that a real backend problem never looks identical to
// "there's genuinely nothing here yet."
function InlineNotice({ tone = "info", children }) {
  const palette =
    tone === "error"
      ? { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" }
      : { bg: "#fffbeb", border: "#fde68a", text: "#92400e" };
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 12.5,
        color: palette.text,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

// A louder, dedicated banner for the emergency-overdue flag — deliberately
// styled to stand apart from InlineNotice (solid red left bar, larger
// icon) since this specific condition — an emergency-priority job that's
// overdue — is meant to demand attention rather than blend in with routine
// "data may be stale" notices. Shown regardless of which Overview period is
// selected, since "is anything on fire right now" shouldn't depend on the
// dropdown.
function EmergencyOverdueBanner({ count }) {
  if (!count) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderLeft: "4px solid #dc2626",
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>🚨</span>
      <span style={{ fontSize: 13, color: "#991b1b", fontWeight: 700 }}>
        {count} emergency-priority report{count === 1 ? " is" : "s are"} overdue
        right now, needs immediate attention.
      </span>
    </div>
  );
}

// ─── Generate Registration ID modal ──────────────────────────────────────────
function GenIDModal({ role, onClose }) {
  const allowedTypes =
    role === "admin"
      ? ["manager", "estate", "staff", "worker", "procurement"]
      : role === "manager"
        ? ["estate", "staff", "worker", "procurement"]
        : ["estate", "staff", "worker"];

  const [genType, setGenType] = useState(allowedTypes[0]);
  const [genLoading, setGenLoading] = useState(false);
  const [generatedID, setGeneratedID] = useState("");

  const handleGenerate = async () => {
    if (genLoading) return;
    setGenLoading(true);
    try {
      const id = await generateUniqueRegistrationId();
      await setDoc(doc(db, "registrationIDs", id), {
        type: genType,
        used: false,
        // Anchors the 48-hour expiry SignUp.jsx checks at claim time.
        // Must be a real server timestamp — firestore.rules rejects any
        // create where this isn't exactly request.time.
        createdAt: serverTimestamp(),
      });
      setGeneratedID(id);
    } catch (e) {
      console.error("Failed to generate ID:", e);
      alert(
        e?.message || "Failed to generate registration ID. Please try again.",
      );
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-800">
          Generate Registration PIN
        </h2>
        {!generatedID ? (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-600 font-medium">
                Select account type
              </label>
              <div className="flex gap-2 flex-wrap">
                {allowedTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setGenType(type)}
                    className={`px-4 py-2 rounded-full capitalize text-sm font-medium border transition cursor-pointer ${genType === type ? "bg-[#F8934C] text-white border-[#F8934C]" : "bg-white text-gray-700 border-gray-300 hover:border-[#F8934C]"}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={genLoading}
                className={`flex-1 py-2 rounded-lg text-white font-medium transition cursor-pointer ${genLoading ? "bg-[#F8934C] cursor-not-allowed" : "bg-[#F8934C] hover:bg-orange-400"}`}
              >
                {genLoading ? "Generating..." : "Generate"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Share this PIN with the new{" "}
              <span className="font-semibold capitalize">{genType}</span>:
            </p>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-3">
              <span className="flex-1 text-center text-2xl font-mono font-bold tracking-[0.3em] text-gray-800">
                {generatedID}
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(generatedID)}
                className="material-symbols-outlined text-gray-500 hover:text-gray-800 transition cursor-pointer text-lg"
              >
                content_copy
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center -mt-2">
              Expires in 48 hours if not used to register.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  setGeneratedID("");
                  setGenType(allowedTypes[0]);
                }}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Generate Another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-red-400 hover:bg-red-500 text-white font-medium transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Reset Password modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ targetUser, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    if (!targetUser?.email || loading) return;
    setLoading(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, targetUser.email);
      onSuccess(targetUser.name);
    } catch (err) {
      console.error("Password reset failed:", err);
      setError(
        err?.message ??
          "Failed to send password reset instructions. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <Card style={{ padding: 28, maxWidth: 420, width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "#0f172a",
                margin: "0 0 4px",
              }}
            >
              Reset Password
            </h2>
            <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
              Send a secure password reset link to{" "}
              <strong style={{ color: "#0f172a" }}>{targetUser.name}</strong>.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "#94a3b8",
              lineHeight: 1,
              padding: "0 0 0 12px",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 18,
            fontSize: 12,
            color: "#1e40af",
            lineHeight: 1.6,
          }}
        >
          <strong>How it works:</strong> The system sends a one-time password
          reset link to the user’s registered email address. They open the link
          and choose a new password securely.
        </div>

        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 16,
            fontSize: 13,
            color: "#0f172a",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Recipient email
          </div>
          <div>{targetUser.email || "No email on record"}</div>
        </div>

        {error && (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 16,
              fontSize: 12,
              color: "#991b1b",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            style={{
              flex: 2,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: loading ? "#fed7aa" : "#f97316",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
              transition: "background .2s",
            }}
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </button>
        </div>

        <p
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginTop: 14,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          This uses Firebase Auth secure email reset links and does not require
          a paid function deployment.
        </p>
      </Card>
    </div>
  );
}

// ─── Access Denied screen ─────────────────────────────────────────────────────
function AccessDenied({ role }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🚫</div>
        <h2
          style={{
            color: "#0f172a",
            margin: "0 0 8px",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Access Denied
        </h2>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 8 }}>
          You don't have permission to view this page.
        </p>
        {role && (
          <p style={{ color: "#94a3b8", fontSize: 12 }}>
            Your role:{" "}
            <code
              style={{
                background: "#f1f5f9",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {role}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function Dashboard({
  navBarColor,
  homeRedirect,
  dashboardRedirect,
}) {
  // ── all hooks first — no early returns before this block ─────────────────
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);

  // Split loading/error/truncation state per collection so a failure or
  // partial load in one doesn't silently masquerade as the other, and so
  // the page doesn't hang forever if a listener callback never fires (the
  // old onSnapshot error handler never called setLoading(false) on error).
  const [reportsLoading, setReportsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [reportsError, setReportsError] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [reportsTruncated, setReportsTruncated] = useState(false);
  const [usersTruncated, setUsersTruncated] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [activeTab, setActiveTab] = useState("overview");
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [userFilter, setUserFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [showGenID, setShowGenID] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadPeriod, setDownloadPeriod] = useState("month");

  // ── table pagination state ────────────────────────────────────────────────
  const [reportsPage, setReportsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);

  // ── which period's stats to display on the Overview tab ──────────────────
  const [displayPeriod, setDisplayPeriod] = useState("overall");

  // ── password reset modal state ────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState(null); // user object or null

  // ── read user from localStorage ───────────────────────────────────────────
  const stored = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") ?? "null");
    } catch {
      return null;
    }
  }, []);

  const user = stored?.data ?? null;
  const role = user?.role ?? "";
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isEstate = role === "estate";
  const hasAccess = ALLOWED_ROLES.includes(role);
  const canDownloadDashboardPDF = [
    "admin",
    "manager",
    "estate",
    "procurement",
  ].includes(role);
  const roleTheme = THEMES[role] || {};
  const resolvedHomeRedirect =
    homeRedirect ||
    (role === "admin"
      ? "/adminHome"
      : role === "estate"
        ? "/estateHome"
        : role === "manager"
          ? "/manager"
          : role === "procurement"
            ? "/procurementHome"
            : "/Home");
  const resolvedDashboardRedirect =
    dashboardRedirect ||
    (role === "admin"
      ? "/adminDashboard"
      : role === "estate"
        ? "/estateDashboard"
        : role === "manager"
          ? "/manager"
          : role === "procurement"
            ? "/procurementDashboard"
            : "/");

  // ── Bounded, explicitly-refreshed data loads ──────────────────────────────
  // Replaces the old unbounded onSnapshot(collection(db, "reports")) /
  // onSnapshot(collection(db, "users")) listeners. Those stayed live forever
  // and re-downloaded the ENTIRE collection on every write anywhere in the
  // app — cost and load time that only grow, with no ceiling. A dashboard of
  // aggregate stats doesn't need millisecond-fresh data, so this fetches a
  // bounded, most-recent window once per mount/refresh instead, with a
  // manual "Refresh" control (rendered further down) for anyone who wants
  // up-to-the-second numbers.
  //
  // IMPORTANT: because this is explicitly-refreshed rather than live, any
  // action taken elsewhere in the app (e.g. denying a report from
  // ReportDetailsContainer.jsx) will NOT appear here until either this
  // component remounts (e.g. navigating back to the Dashboard) or the
  // "Refresh" button in the header below is clicked. This is by design —
  // see the caps comment above — not a bug.
  const loadReports = useCallback(async () => {
    if (!hasAccess) return;
    setReportsLoading(true);
    setReportsError(false);
    try {
      const q = query(
        collection(db, "reports"),
        orderBy("dateSent", "desc"),
        limit(DASHBOARD_REPORTS_CAP),
      );
      const snap = await getDocs(q);
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setReportsTruncated(snap.docs.length === DASHBOARD_REPORTS_CAP);
    } catch (error) {
      console.error("Firestore reports error:", error);
      setReportsError(true);
    } finally {
      setReportsLoading(false);
    }
  }, [hasAccess]);

  const loadUsers = useCallback(async () => {
    if (!hasAccess) return;
    setUsersLoading(true);
    setUsersError(false);
    try {
      const q = query(
        collection(db, "users"),
        orderBy("createdAt", "desc"),
        limit(DASHBOARD_USERS_CAP),
      );
      const snap = await getDocs(q);
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUsersTruncated(snap.docs.length === DASHBOARD_USERS_CAP);
    } catch (error) {
      console.error("Firestore users error:", error);
      setUsersError(true);
    } finally {
      setUsersLoading(false);
    }
  }, [hasAccess]);

  useEffect(() => {
    loadReports();
  }, [loadReports, refreshKey]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey]);

  useEffect(() => {
    if (!reportsLoading && !usersLoading && !reportsError && !usersError) {
      setLastRefreshed(new Date());
    }
  }, [reportsLoading, usersLoading, reportsError, usersError]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  // ── derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = reports.length;
    const completed = reports.filter((r) => r.status === "completed").length;
    const closed = reports.filter((r) => r.status === "closed").length;
    const reopenedCount = reports.filter((r) => r.status === "reopened").length;
    const rejectedJobsCount = reports.filter(
      (r) => r.status === "rejected",
    ).length;
    // New: current live count of reports sitting in "dropped" — mirrors
    // rejectedJobsCount above.
    const droppedJobsCount = reports.filter(
      (r) => r.status === "dropped",
    ).length;
    const overdue = reports.filter(isOverdueEligible).length;
    const active = reports.filter((r) => isActive(r.status)).length;

    const byStatus = Object.fromEntries(
      Object.keys(STATUS_META).map((s) => [s, 0]),
    );
    reports.forEach((r) => {
      if (r.status in byStatus) byStatus[r.status]++;
    });

    const byPriority = { emergency: 0, urgent: 0, routine: 0 };
    reports.forEach((r) => {
      if (r.priorityLevel in byPriority) byPriority[r.priorityLevel]++;
    });

    const catCount = {};
    reports.forEach((r) => {
      catCount[r.category] = (catCount[r.category] || 0) + 1;
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);

    const getSent = (r) =>
      r.dateSent?.toDate ? r.dateSent.toDate() : new Date(r.dateSent);

    const monthReports = reports.filter((r) => {
      const sent = getSent(r);
      if (Number.isNaN(sent.getTime())) return false;
      return sent >= monthStart && sent < nextMonthStart;
    });

    const yearReports = reports.filter((r) => {
      const sent = getSent(r);
      if (Number.isNaN(sent.getTime())) return false;
      return sent >= yearStart && sent < nextYearStart;
    });

    const lastYearReports = reports.filter((r) => {
      const sent = getSent(r);
      if (Number.isNaN(sent.getTime())) return false;
      return sent >= lastYearStart && sent < yearStart;
    });

    const monthCompleted = monthReports.filter(
      (r) => r.status === "completed",
    ).length;
    const monthOverdue = monthReports.filter(isOverdueEligible).length;
    const monthActive = monthReports.filter((r) => isActive(r.status)).length;
    const yearCompleted = yearReports.filter(
      (r) => r.status === "completed",
    ).length;
    const yearOverdue = yearReports.filter(isOverdueEligible).length;
    const yearActive = yearReports.filter((r) => isActive(r.status)).length;

    const trend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        label: d.toLocaleString("default", { month: "short" }),
        value: reports.filter((r) => {
          const rd = getSent(r);
          if (Number.isNaN(rd.getTime())) return false;
          return (
            rd.getFullYear() === d.getFullYear() &&
            rd.getMonth() === d.getMonth()
          );
        }).length,
      };
    });

    // ── job-completion time helper ──────────────────────────────────────
    const toDate = (v) => (v?.toDate ? v.toDate() : new Date(v));
    const diffDays = (start, end) =>
      (toDate(end).getTime() - toDate(start).getTime()) / 86400000;

    const workers = users.filter((u) => u.role === "worker");

    // "Clean" completions only: accepted → completed, with NO reopen in
    // between. A report that got reopened and re-completed has its
    // dateAccepted/dateCompleted fields overwritten by the SECOND cycle
    // (see firestore.rules), so the elapsed time would include however
    // long it sat waiting on the reporter/estate to reopen it — time that
    // has nothing to do with how fast the worker did the work. Excluding
    // reopened reports trades some sample size for not unfairly
    // penalizing a worker for someone else's delay.
    const isCleanCompletion = (r) =>
      !!r.dateAccepted && !!r.dateCompleted && !r.dateReopened;

    const fleetCleanDurations = reports
      .filter((r) => r.assignedTo && isCleanCompletion(r))
      .map((r) => diffDays(r.dateAccepted, r.dateCompleted));
    const fleetAvgCompletionDays = fleetCleanDurations.length
      ? fleetCleanDurations.reduce((s, d) => s + d, 0) /
        fleetCleanDurations.length
      : null;

    const workerStatsRaw = workers.map((w) => {
      const workerReports = reports.filter((r) => r.assignedTo === w.ID);
      const assigned = workerReports.length;
      const done = workerReports.filter((r) =>
        ["completed", "closed"].includes(r.status),
      ).length;

      // Cumulative reopen count, keyed off `dateReopened` (set once, the
      // first time a report is reopened) — NOT `status === 'reopened'`.
      // The old version checked current status, so a report stopped
      // counting as "reworked" the instant it was completed again or
      // closed out, silently erasing a worker's rework history over
      // time. A report that was reopened, redone, and closed is still a
      // job this worker didn't get right the first time; it should count
      // forever, not just while it happens to still say "reopened".
      const reworked = workerReports.filter(
        (r) => r.dateReopened != null,
      ).length;

      // Ever-completed count, used as the denominator for rework rate.
      // Also driven off a field (dateCompleted) rather than current
      // status, so a job that's back in 'reopened' still counts as
      // having been completed at least once.
      const completedAtLeastOnce = workerReports.filter(
        (r) => r.dateCompleted != null,
      ).length;

      // ── quality: customer star ratings ──────────────────────────────
      const ratedReports = workerReports.filter(
        (r) => typeof r.technicianRating === "number",
      );
      const ratingCount = ratedReports.length;
      const ratingSum = ratedReports.reduce(
        (s, r) => s + r.technicianRating,
        0,
      );
      const avgRating = ratingCount ? ratingSum / ratingCount : null;

      // ── speed: accepted → completed, clean completions only ─────────
      const cleanDurations = workerReports
        .filter(isCleanCompletion)
        .map((r) => diffDays(r.dateAccepted, r.dateCompleted));
      const completionCount = cleanDurations.length;
      const avgCompletionDays = completionCount
        ? cleanDurations.reduce((s, d) => s + d, 0) / completionCount
        : null;

      return {
        id: w.ID,
        name: w.name,
        assigned,
        done,
        reworked,
        completedAtLeastOnce,
        rate: assigned ? Math.round((done / assigned) * 100) : 0,
        avgRating,
        ratingCount,
        ratingSum,
        avgCompletionDays,
        completionCount,
      };
    });

    // ── Bayesian shrinkage, applied to THREE signals ────────────────────
    // Same idea as before — pull a worker's own average toward the
    // fleet-wide average until they've built up enough of a sample to be
    // trusted — now applied to rating, reopen rate, AND completion speed.
    // Each gets its own confidence threshold (m): "enough ratings to
    // trust" and "enough completed jobs to trust a rework rate" aren't
    // the same number.

    // Quality (unchanged from before)
    const ratedWorkers = workerStatsRaw.filter((w) => w.ratingCount > 0);
    const ratingC = ratedWorkers.length
      ? ratedWorkers.reduce((s, w) => s + w.ratingSum, 0) /
        ratedWorkers.reduce((s, w) => s + w.ratingCount, 0)
      : 0;
    const ratingM = ratedWorkers.length
      ? ratedWorkers.reduce((s, w) => s + w.ratingCount, 0) /
        ratedWorkers.length
      : 0;

    // Reliability: fleet-wide pooled rework rate, and average sample size
    // among workers who've completed at least one job.
    const completedWorkers = workerStatsRaw.filter(
      (w) => w.completedAtLeastOnce > 0,
    );
    const fleetReworkRate = completedWorkers.length
      ? completedWorkers.reduce((s, w) => s + w.reworked, 0) /
        completedWorkers.reduce((s, w) => s + w.completedAtLeastOnce, 0)
      : 0;
    const reliabilityM = completedWorkers.length
      ? completedWorkers.reduce((s, w) => s + w.completedAtLeastOnce, 0) /
        completedWorkers.length
      : 0;

    // Speed: average number of clean completions per worker who has any,
    // used as the confidence threshold for shrinking toward
    // fleetAvgCompletionDays.
    const timedWorkers = workerStatsRaw.filter((w) => w.completionCount > 0);
    const speedM = timedWorkers.length
      ? timedWorkers.reduce((s, w) => s + w.completionCount, 0) /
        timedWorkers.length
      : 0;

    const workerStats = workerStatsRaw
      .map((w) => {
        // Quality
        const weightedRating =
          w.ratingCount > 0
            ? (w.ratingCount / (w.ratingCount + ratingM)) * w.avgRating +
              (ratingM / (w.ratingCount + ratingM)) * ratingC
            : null;

        // Reliability — shrink the worker's own rework rate toward the
        // fleet rate, then invert it into a 0–100 "did it right the
        // first time" score. No completions yet → no signal, not 0/100.
        let reliabilityPct = null;
        if (w.completedAtLeastOnce > 0) {
          const ownReworkRate = w.reworked / w.completedAtLeastOnce;
          const n = w.completedAtLeastOnce;
          const weightedReworkRate =
            (n / (n + reliabilityM)) * ownReworkRate +
            (reliabilityM / (n + reliabilityM)) * fleetReworkRate;
          reliabilityPct = Math.round((1 - weightedReworkRate) * 100);
        }

        // Speed — shrink the worker's own average completion time toward
        // the fleet average, then express it as a percentage: the fleet
        // average time scores 100%, faster caps at 100%, slower scores
        // proportionally lower. No clean completions yet → no signal.
        let speedPct = null;
        let weightedCompletionDays = null;
        if (w.completionCount > 0 && fleetAvgCompletionDays != null) {
          const n = w.completionCount;
          weightedCompletionDays =
            (n / (n + speedM)) * w.avgCompletionDays +
            (speedM / (n + speedM)) * fleetAvgCompletionDays;
          speedPct =
            weightedCompletionDays > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(
                      (fleetAvgCompletionDays / weightedCompletionDays) * 100,
                    ),
                  ),
                )
              : 100; // completed essentially instantly
        }

        // ── blended overall performance ──────────────────────────────
        // Only components with actual data contribute, with weight
        // redistributed across whatever IS available — a worker with
        // completions but no ratings yet still gets a performance score
        // from reliability + speed, instead of showing "no data" just
        // because feedback hasn't come in.
        const components = [
          weightedRating != null && {
            value: (weightedRating / 5) * 100,
            weight: PERFORMANCE_WEIGHTS.quality,
          },
          reliabilityPct != null && {
            value: reliabilityPct,
            weight: PERFORMANCE_WEIGHTS.reliability,
          },
          speedPct != null && {
            value: speedPct,
            weight: PERFORMANCE_WEIGHTS.speed,
          },
        ].filter(Boolean);

        const totalWeight = components.reduce((s, c) => s + c.weight, 0);
        const performancePct = totalWeight
          ? Math.round(
              components.reduce((s, c) => s + c.value * c.weight, 0) /
                totalWeight,
            )
          : null;

        return {
          ...w,
          weightedRating,
          reliabilityPct,
          speedPct,
          weightedCompletionDays,
          performancePct,
        };
      })
      .sort((a, b) => b.done - a.done); // default order unchanged; ranking view sorts separately

    const recent = [...reports]
      .sort(
        (a, b) =>
          (b.dateSent?.toDate?.() ?? new Date(0)) -
          (a.dateSent?.toDate?.() ?? new Date(0)),
      )
      .slice(0, 10);

    // ── recent denial reasons (global, not period-scoped) ────────────────
    // Mirrors the "Recent activity" feed's shape: most-recent-first,
    // capped at 15. Scoped ONLY to "denied" (incoming → denied) reports —
    // "costDenied" is a separate flow and intentionally excluded here.
    // Reads the reason out of the report's `notes` array (written by
    // ReportDetailsContainer.jsx's handleDeny as a { type: "denial", ... }
    // entry) via getDenialReasonText/getDenialSortDate above — there is no
    // top-level `denialReason` field on the report document.
    const recentDenials = [...reports]
      .filter((r) => r.status === "denied")
      .map((r) => ({ ...r, resolvedDenialReason: getDenialReasonText(r) }))
      .filter((r) => r.resolvedDenialReason != null)
      .sort((a, b) => getDenialSortDate(b) - getDenialSortDate(a))
      .slice(0, 15);

    const staffCount = users.filter((u) => u.role === "staff").length;
    const workerCount = workers.length;
    const estateCount = users.filter((u) => u.role === "estate").length;
    const adminCount = users.filter((u) => u.role === "admin").length;
    const managerCount = users.filter((u) => u.role === "manager").length;
    const procurementCount = users.filter(
      (u) => u.role === "procurement",
    ).length;
    const deactivatedCount = users.filter((u) => u.deactivated).length;
    const completionRate = total
      ? Math.round(((completed + closed) / total) * 100)
      : 0;
    const closureRate = total ? Math.round((closed / total) * 100) : 0;

    const getResolutionAverage = (subset) => {
      const resolved = subset.filter((r) => r.dateCompleted && r.dateSent);
      if (!resolved.length) return null;
      const totalDays = resolved.reduce((sum, r) => {
        const sent = r.dateSent?.toDate
          ? r.dateSent.toDate()
          : new Date(r.dateSent);
        const done = r.dateCompleted?.toDate
          ? r.dateCompleted.toDate()
          : new Date(r.dateCompleted);
        return sum + (done - sent) / 86400000;
      }, 0);
      return (totalDays / resolved.length).toFixed(1);
    };

    const avgResolutionDays = getResolutionAverage(reports);

    const weekAgo = Date.now() - 7 * 86400000;
    const recentUsers = [...users]
      .filter((u) => {
        const d = u.createdAt?.toDate
          ? u.createdAt.toDate()
          : new Date(u.createdAt);
        return d.getTime() > weekAgo;
      })
      .sort(
        (a, b) =>
          (b.createdAt?.toDate?.() ?? new Date(0)) -
          (a.createdAt?.toDate?.() ?? new Date(0)),
      );

    // ── Cost analytics (overall, used for trend charts) ────────────────────
    const getReportTotalCost = (r) =>
      (Number(r.cost) || 0) + (Number(r.maintenanceCost) || 0);

    const reportsWithCost = reports.filter(
      (r) =>
        (r.cost != null && !isNaN(r.cost)) ||
        (r.maintenanceCost != null && !isNaN(r.maintenanceCost)),
    );
    const totalCost = reportsWithCost.reduce(
      (s, r) => s + getReportTotalCost(r),
      0,
    );
    const totalMaterialsCost = reportsWithCost.reduce(
      (s, r) => s + (Number(r.cost) || 0),
      0,
    );
    const totalMaintenanceCost = reportsWithCost.reduce(
      (s, r) => s + (Number(r.maintenanceCost) || 0),
      0,
    );
    const avgCost = reportsWithCost.length
      ? totalCost / reportsWithCost.length
      : null;
    const maxCost = reportsWithCost.length
      ? Math.max(...reportsWithCost.map(getReportTotalCost))
      : null;

    const costByCategory = {};
    reportsWithCost.forEach((r) => {
      costByCategory[r.category] =
        (costByCategory[r.category] || 0) + getReportTotalCost(r);
    });

    const costTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const monthReportsForTrend = reportsWithCost.filter((r) => {
        const rd = getSent(r);
        return (
          rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth()
        );
      });
      return {
        label: d.toLocaleString("default", { month: "short" }),
        value: monthReportsForTrend.reduce(
          (s, r) => s + getReportTotalCost(r),
          0,
        ),
      };
    });

    const costByPriority = { emergency: 0, urgent: 0, routine: 0 };
    reportsWithCost.forEach((r) => {
      if (r.priorityLevel in costByPriority)
        costByPriority[r.priorityLevel] += getReportTotalCost(r);
    });

    // ── Period breakdowns (drives Overview display select + PDF download) ─
    const periodStats = {
      overall: buildPeriodStats(reports),
      month: buildPeriodStats(monthReports),
      year: buildPeriodStats(yearReports),
      lastYear: buildPeriodStats(lastYearReports),
    };

    return {
      total,
      completed,
      closed,
      reopenedCount,
      rejectedJobsCount,
      droppedJobsCount,
      overdue,
      active,
      byStatus,
      byPriority,
      catCount,
      trend,
      workerStats,
      recent,
      recentDenials,
      staffCount,
      workerCount,
      estateCount,
      adminCount,
      managerCount,
      procurementCount,
      deactivatedCount,
      completionRate,
      closureRate,
      avgResolutionDays,
      recentUsers,
      reportsWithCost: reportsWithCost.length,
      totalCost,
      avgCost,
      maxCost,
      costByCategory,
      costTrend,
      costByPriority,
      totalMaterialsCost,
      totalMaintenanceCost,
      periodStats,
      monthStats: {
        total: monthReports.length,
        completed: monthCompleted,
        overdue: monthOverdue,
        active: monthActive,
        avgResolutionDays: getResolutionAverage(monthReports),
      },
      yearStats: {
        total: yearReports.length,
        completed: yearCompleted,
        overdue: yearOverdue,
        active: yearActive,
        avgResolutionDays: getResolutionAverage(yearReports),
      },
      lastYearStats: {
        total: lastYearReports.length,
        completed: lastYearReports.filter((r) => r.status === "completed")
          .length,
        overdue: lastYearReports.filter(isOverdueEligible).length,
        active: lastYearReports.filter((r) => isActive(r.status)).length,
        avgResolutionDays: getResolutionAverage(lastYearReports),
      },
    };
  }, [reports, users]);

  const rankedWorkerStats = useMemo(() => {
    return [...stats.workerStats].sort((a, b) => {
      const scoreA = a.performancePct ?? -Infinity;
      const scoreB = b.performancePct ?? -Infinity;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.done - a.done; // tie-break for workers without a score yet
    });
  }, [stats.workerStats]);

  // Workers with usable resolution-time data, sorted fastest-first — feeds
  // the standalone "Average resolution time" section on the Workers tab.
  const timedWorkerStats = useMemo(() => {
    return rankedWorkerStats
      .filter((w) => w.avgCompletionDays != null)
      .sort((a, b) => a.avgCompletionDays - b.avgCompletionDays);
  }, [rankedWorkerStats]);

  const maxAvgCompletionDays = useMemo(() => {
    if (!timedWorkerStats.length) return 1;
    return Math.max(...timedWorkerStats.map((w) => w.avgCompletionDays), 1);
  }, [timedWorkerStats]);

  // Stats for whichever period is currently selected on the Overview tab
  const displayStats =
    stats.periodStats[displayPeriod] ?? stats.periodStats.overall;

  // ── Reports tab: sorted (newest first) + paginated ────────────────────────
  const sortedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) =>
          (b.dateSent?.toDate?.() ?? new Date(0)) -
          (a.dateSent?.toDate?.() ?? new Date(0)),
      ),
    [reports],
  );

  const reportsTotalPages = Math.max(
    1,
    Math.ceil(sortedReports.length / REPORTS_PAGE_SIZE),
  );
  const paginatedReports = useMemo(
    () => paginate(sortedReports, reportsPage, REPORTS_PAGE_SIZE),
    [sortedReports, reportsPage],
  );

  // Reset to page 1 whenever the underlying report set changes size (e.g.
  // a manual refresh pulls in new data), so pagination never gets stuck
  // past the end of a shorter list.
  useEffect(() => {
    setReportsPage(1);
  }, [reports.length]);

  const filteredUsers = useMemo(() => {
    let list = isManager ? users.filter((u) => u.role !== "admin") : users;
    return list
      .filter((u) => userFilter === "all" || u.role === userFilter)
      .filter(
        (u) =>
          !userSearch ||
          u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.email?.toLowerCase().includes(userSearch.toLowerCase()),
      )
      .sort(
        (a, b) =>
          (b.createdAt?.toDate?.() ?? new Date(0)) -
          (a.createdAt?.toDate?.() ?? new Date(0)),
      );
  }, [users, userFilter, userSearch, isManager]);

  const usersTotalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / USERS_PAGE_SIZE),
  );
  const paginatedUsers = useMemo(
    () => paginate(filteredUsers, usersPage, USERS_PAGE_SIZE),
    [filteredUsers, usersPage],
  );

  // Reset to page 1 whenever the filtered result set changes — either the
  // search/filter inputs changed, or the underlying data set changed size
  // (e.g. a refresh), in case the filtered count happens to stay the same
  // across a data change.
  useEffect(() => {
    setUsersPage(1);
  }, [userFilter, userSearch, filteredUsers.length]);

  // ── toast helper ──────────────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const handleDownloadDashboardPDF = (period = downloadPeriod) => {
    generateDashboardStatsPDF(
      stats,
      role?.toUpperCase?.() || role,
      user?.name || "User",
      period,
    );
    setShowDownloadMenu(false);
  };

  // ── user identity & action helpers ─────────────────────────────────────────
  // IMPORTANT FIX: the previous version compared `u.id === user?.uid`.
  // `u.id` is the Firestore DOCUMENT id (from `{ id: d.id, ...d.data() }`),
  // while `user?.uid` reads a field that doesn't appear to exist anywhere
  // else in this codebase — the rest of the app (ReportForm, ReportDetails,
  // History) consistently identifies "me" via `user.ID` (a custom field).
  // That mismatch meant this comparison NEVER matched, so admins/managers
  // could deactivate or permanently delete their own account with one
  // click, and the "(you)" label never rendered.
  //
  // This checks both possible identity fields defensively, since it's not
  // possible to confirm from this file alone which one your signup flow
  // uses as the Firestore document id. Please verify by logging in and
  // confirming your own row is correctly excluded from actions.
  const isSelf = useCallback(
    (u) => (!!user?.id && u.id === user.id) || (!!user?.ID && u.ID === user.ID),
    [user?.id, user?.ID],
  );

  const canActOnUser = useCallback(
    (u) => {
      if (isSelf(u)) return false;
      if (isAdmin) return true;
      if (isManager) return u.role !== "admin";
      return false;
    },
    [isSelf, isAdmin, isManager],
  );

  const toggleDeactivate = (u) => {
    if (!canActOnUser(u)) return;
    const action = u.deactivated ? "reactivate" : "deactivate";
    setConfirm({
      message: `Are you sure you want to ${action} ${u.name}'s account?`,
      danger: !u.deactivated,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await updateDoc(doc(db, "users", u.id), {
            deactivated: !u.deactivated,
          });
          setUsers((prev) =>
            prev.map((row) =>
              row.id === u.id ? { ...row, deactivated: !u.deactivated } : row,
            ),
          );
          showToast(
            `Account ${u.deactivated ? "reactivated" : "deactivated"}.`,
          );
        } catch {
          showToast("Failed to update account.", "error");
        }
      },
    });
  };

  const deleteUserDoc = (u) => {
    if (!canActOnUser(u)) return;
    setConfirm({
      message: `Permanently delete ${u.name}'s account? This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteDoc(doc(db, "users", u.id));
          setUsers((prev) => prev.filter((row) => row.id !== u.id));
          showToast(`${u.name} deleted.`);
        } catch {
          showToast("Failed to delete user.", "error");
        }
      },
    });
  };

  // ── tab set per role ──────────────────────────────────────────────────────
  const tabs = (() => {
    if (isAdmin) return ["overview", "reports", "workers", "activity", "users"];
    if (isManager) return ["overview", "workers", "activity", "users"];
    return ["overview", "reports", "workers", "activity"];
  })();

  const filterRoles = isAdmin
    ? ["all", "admin", "manager", "estate", "procurement", "staff", "worker"]
    : ["all", "manager", "estate", "procurement", "staff", "worker"];

  // ── access guard — after all hooks ────────────────────────────────────────
  if (!hasAccess) return <AccessDenied role={role} />;

  // Only show the full-page blocking spinner on the very first load, when
  // there's nothing on screen yet. A manual refresh (or any subsequent
  // load) shows a small inline "Refreshing…" indicator instead — see the
  // header below — so the whole dashboard doesn't flash and reset every
  // time someone clicks Refresh.
  const initialLoading =
    (reportsLoading || usersLoading) &&
    reports.length === 0 &&
    users.length === 0;
  const isRefreshing = (reportsLoading || usersLoading) && !initialLoading;

  if (initialLoading)
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid #ef4444",
              borderTopColor: "transparent",
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 1s linear infinite",
            }}
          />
          <span style={{ color: "#64748b", fontSize: 14 }}>
            Loading dashboard…
          </span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh" }}>
      {showGenID && (
        <GenIDModal role={role} onClose={() => setShowGenID(false)} />
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <ResetPasswordModal
          targetUser={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={(name) => {
            setResetTarget(null);
            showToast(
              `Password reset for ${name}. They'll be prompted to set a new one on next login.`,
            );
          }}
        />
      )}

      <NavBar
        homeRedirect={resolvedHomeRedirect}
        dashboardRedirect={resolvedDashboardRedirect}
        theme={roleTheme}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            top: 80,
            right: 16,
            zIndex: 2000,
            background: toast.type === "error" ? "#ef4444" : "#22c55e",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 10,
            maxWidth: 340,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 24px rgba(0,0,0,.18)",
            animation: "slideIn .25s ease",
          }}
        >
          {toast.msg}
        </div>
      )}
      {confirm && (
        <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} />
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:none; } }
        .tab-btn { background:none; border:none; cursor:pointer; transition:color .2s; white-space:nowrap; }
        .tab-btn:hover { color:#ef4444 !important; }
        .act-btn { opacity:0; transition:opacity .15s; }
        tr:hover .act-btn { opacity:1; }
        .kpi-5   { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
        .kpi-4   { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        .kpi-3   { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
        .kpi-6   { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
        .two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .user-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; }
        .worker-metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        @media(max-width:900px){ .kpi-5{grid-template-columns:repeat(3,1fr);} .kpi-6{grid-template-columns:repeat(3,1fr);} .kpi-4{grid-template-columns:repeat(2,1fr);} }
        @media(max-width:640px){ .kpi-5{grid-template-columns:repeat(2,1fr);} .kpi-3{grid-template-columns:repeat(2,1fr);} .kpi-6{grid-template-columns:repeat(2,1fr);} .kpi-4{grid-template-columns:repeat(2,1fr);} .two-col{grid-template-columns:1fr;} .worker-metrics{grid-template-columns:repeat(2,1fr);} }
        @media(max-width:400px){ .kpi-5{grid-template-columns:1fr;} .kpi-3{grid-template-columns:1fr;} .kpi-6{grid-template-columns:1fr;} .kpi-4{grid-template-columns:1fr;} }
      `}</style>

      <div
        style={{ maxWidth: 1120, margin: "0 auto", padding: "88px 16px 64px" }}
      >
        {/* ── header ───────────────────────────────────────────────── */}
        <div
          style={{
            marginBottom: 24,
            marginTop: 40,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#FF8825",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                margin: "0 0 4px",
              }}
            >
              {role} dashboard
            </p>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#0f172a",
                margin: "0 0 12px",
                lineHeight: 1.25,
              }}
            >
              Welcome back, {user?.name?.split(" ")[0]} 👋
            </h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(isAdmin || isManager) && (
                <button
                  onClick={() => setShowGenID(true)}
                  className="bg-[#F8934C] hover:bg-orange-500 cursor-pointer transition text-white font-bold py-2 px-4 rounded text-sm"
                >
                  + Generate Registration ID
                </button>
              )}
              {canDownloadDashboardPDF && (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setShowDownloadMenu((prev) => !prev)}
                    className="bg-slate-900 hover:bg-slate-700 cursor-pointer transition text-white font-bold py-2 px-4 rounded text-sm"
                  >
                    Download Dashboard PDF
                  </button>

                  {showDownloadMenu && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        left: 0,
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: 12,
                        boxShadow: "0 10px 30px rgba(15,23,42,.12)",
                        width: 250,
                        zIndex: 20,
                      }}
                    >
                      <label
                        style={{
                          display: "block",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#64748b",
                          marginBottom: 8,
                          textTransform: "uppercase",
                          letterSpacing: ".06em",
                        }}
                      >
                        Report period
                      </label>
                      <select
                        value={downloadPeriod}
                        onChange={(e) => setDownloadPeriod(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #cbd5e1",
                          outline: "none",
                          fontSize: 13,
                          marginBottom: 10,
                          background: "#f8fafc",
                        }}
                      >
                        <option value="month">Current month</option>
                        <option value="year">Current year</option>
                        <option value="lastYear">Last year</option>
                        <option value="overall">Overall (all time)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadDashboardPDF(downloadPeriod)
                        }
                        className="bg-[#F8934C] hover:bg-orange-500 cursor-pointer transition text-white font-bold py-2 px-4 rounded text-sm w-full"
                      >
                        Download {DOWNLOAD_PERIOD_LABELS[downloadPeriod]} Report
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                color: isRefreshing ? "#cbd5e1" : "#64748b",
                background: "none",
                border: "1px solid #e2e8f0",
                borderRadius: 999,
                padding: "5px 12px",
                cursor: isRefreshing ? "not-allowed" : "pointer",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 14,
                  animation: isRefreshing ? "spin 1s linear infinite" : "none",
                }}
              >
                refresh
              </span>
              {isRefreshing
                ? "Refreshing…"
                : lastRefreshed
                  ? `Refreshed ${timeAgo(lastRefreshed)}`
                  : "Refresh"}
            </button>
          </div>
        </div>

        {/* ── data-health notices ──────────────────────────────────── */}
        {reportsError && (
          <InlineNotice tone="error">
            Couldn't load reports data — the numbers below may be stale or
            incomplete.{" "}
            <button
              type="button"
              onClick={handleRefresh}
              style={{
                border: "none",
                background: "none",
                color: "inherit",
                fontWeight: 700,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Try again
            </button>
          </InlineNotice>
        )}
        {usersError && (
          <InlineNotice tone="error">
            Couldn't load user data. Worker names, ratings, and the Users tab
            may be incomplete.{" "}
            <button
              type="button"
              onClick={handleRefresh}
              style={{
                border: "none",
                background: "none",
                color: "inherit",
                fontWeight: 700,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Try again
            </button>
          </InlineNotice>
        )}
        {!reportsError && reportsTruncated && (
          <InlineNotice tone="info">
            Showing the most recent {DASHBOARD_REPORTS_CAP.toLocaleString()}{" "}
            reports. "Overall" totals and trends reflect this window, not full
            historical data.
          </InlineNotice>
        )}
        {!usersError && usersTruncated && (
          <InlineNotice tone="info">
            Showing the most recent {DASHBOARD_USERS_CAP.toLocaleString()}{" "}
            users.
          </InlineNotice>
        )}

        {/* 4. Overdue breakdown by priority — a global "is anything on fire"
            banner, independent of the Overview period selector. */}
        <EmergencyOverdueBanner
          count={stats.periodStats.overall.overdueByPriority.emergency}
        />

        {/* ── tab bar ──────────────────────────────────────────────── */}
        <div
          style={{
            overflowX: "auto",
            borderBottom: "2px solid #e2e8f0",
            marginBottom: 24,
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div style={{ display: "flex", gap: 0, minWidth: "max-content" }}>
            {tabs.map((tab) => (
              <button
                key={tab}
                className="tab-btn"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderBottom:
                    activeTab === tab
                      ? "2.5px solid #ef4444"
                      : "2.5px solid transparent",
                  color: activeTab === tab ? "#ef4444" : "#6b7280",
                  marginBottom: -2,
                  textTransform: "capitalize",
                }}
              >
                {tab}
                {tab === "users" && (
                  <span
                    style={{
                      marginLeft: 5,
                      fontSize: 9,
                      background: "#fef3c7",
                      color: "#92400e",
                      borderRadius: 4,
                      padding: "1px 4px",
                      fontWeight: 800,
                      verticalAlign: "middle",
                    }}
                  >
                    {isAdmin ? "ADMIN" : "MGR"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════ OVERVIEW ══════════════════ */}
        {activeTab === "overview" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 28,
              }}
            >
              <SectionTitle>Report summary</SectionTitle>
              <PeriodSelect value={displayPeriod} onChange={setDisplayPeriod} />
            </div>
            <div className="kpi-5" style={{ marginBottom: 20 }}>
              <StatCard
                label="Total"
                value={displayStats.total}
                icon="📋"
                accent="#3b82f6"
                sub={
                  PERIOD_OPTIONS.find((p) => p.value === displayPeriod)?.label
                }
              />
              <StatCard
                label="Active"
                value={displayStats.active}
                icon="⚙️"
                accent="#f97316"
                sub="In pipeline"
              />
              {/* Closed, not Completed — closed is the terminal status
                  where the reporter has confirmed the work was done well.
                  Completed on its own just means the job is awaiting that
                  feedback, so it's a status-breakdown detail rather than a
                  top-level "done" metric. */}
              <StatCard
                label="Closed"
                value={displayStats.closed}
                icon="🔒"
                accent="#22c55e"
                sub={`${displayStats.closureRate}% rate`}
              />
              <StatCard
                label="Overdue"
                value={displayStats.overdue}
                icon="⚠️"
                accent="#ef4444"
                sub="Needs attention"
              />
              <StatCard
                label="Avg Resolution"
                value={
                  displayStats.avgResolutionDays
                    ? `${displayStats.avgResolutionDays}d`
                    : "—"
                }
                icon="⏱️"
                accent="#8b5cf6"
                sub="Days to close"
              />
            </div>

            <SectionTitle>Job lifecycle</SectionTitle>
            {/* kpi-3 → kpi-4 to make room for the new "Jobs Dropped by
                Worker" card alongside the existing three. */}
            <div className="kpi-4" style={{ marginBottom: 20 }}>
              <StatCard
                label="Reopened"
                value={displayStats.reopened ?? 0}
                icon="🔁"
                accent="#f59e0b"
                sub="Reporter wasn't satisfied"
              />
              <StatCard
                label="Awaiting Feedback"
                value={displayStats.completed ?? 0}
                icon="⏳"
                accent="#22c55e"
                sub="Work done, reporter hasn't given feedback yet"
              />
              <StatCard
                label="Jobs Declined by Worker"
                value={displayStats.rejectedJobs ?? 0}
                icon="🙅"
                accent="#f43f5e"
                sub="Awaiting reassignment"
              />
              {/* New: current count of reports sitting in "dropped" — a
                  worker accepted the job, then couldn't finish it. Distinct
                  from "Declined" (rejected before ever being accepted). */}
              <StatCard
                label="Jobs Dropped by Worker"
                value={displayStats.droppedJobs ?? 0}
                icon="📤"
                accent="#ea580c"
                sub="Awaiting reassignment"
              />
            </div>

            {/* 1. Denial rate & 3. reassignment rate & 6. first-time-fix
                rate — three quality/risk signals grouped together since
                they're all "how well is the pipeline working", distinct
                from the raw lifecycle counts above. */}
            <SectionTitle>Quality &amp; risk</SectionTitle>
            <div className="kpi-3" style={{ marginBottom: 20 }}>
              <StatCard
                label="Denial Rate"
                value={`${displayStats.denialRate}%`}
                icon="🚫"
                accent="#ef4444"
                sub={`${displayStats.deniedCount + displayStats.costDeniedCount} of ${displayStats.total} denied`}
              />
              <StatCard
                label="Reassignment Rate"
                value={`${displayStats.reassignmentRate}%`}
                icon="🔄"
                accent="#f59e0b"
                sub={`${displayStats.reassignedCount} of ${displayStats.everAssignedCount} assigned jobs`}
              />
              <StatCard
                label="First-Time Fix Rate"
                value={
                  displayStats.everCompletedCount
                    ? `${displayStats.firstTimeFixRate}%`
                    : "—"
                }
                icon="🎯"
                accent="#22c55e"
                sub="Closed without a reopen"
              />
            </div>

            {/* 1. Recent denial reasons — global feed, not period-scoped,
                so it always shows the most recent activity regardless of
                which Overview period is selected. Scoped to "denied"
                (incoming → denied) only. */}
            <SectionTitle>Recent denial reasons</SectionTitle>
            <Card style={{ padding: "4px 20px 8px", marginBottom: 20 }}>
              {stats.recentDenials.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "32px 0",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  No denial reasons recorded yet.
                </p>
              ) : (
                stats.recentDenials.map((r, i) => (
                  <div
                    key={r.id}
                    style={{
                      padding: "12px 0",
                      borderBottom:
                        i < stats.recentDenials.length - 1
                          ? "1px solid #f1f5f9"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {r.reporter || "Unknown reporter"} · {r.category}
                      </span>
                      <Badge
                        bg={STATUS_META[r.status]?.bg}
                        text={STATUS_META[r.status]?.text}
                      >
                        {STATUS_META[r.status]?.label ?? r.status}
                      </Badge>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.5,
                      }}
                    >
                      {r.resolvedDenialReason}
                    </p>
                  </div>
                ))
              )}
            </Card>

            {/* 4. Overdue breakdown by priority — split out of the single
                "Overdue" number above so an overdue emergency doesn't get
                flattened together with an overdue routine job. */}
            <SectionTitle>Overdue by priority</SectionTitle>
            <div className="kpi-3" style={{ marginBottom: 20 }}>
              {Object.entries(displayStats.overdueByPriority).map(([k, v]) => {
                const m = PRIORITY_META[k];
                return (
                  <StatCard
                    key={k}
                    label={`${m.label} Overdue`}
                    value={v}
                    icon="⏰"
                    accent={m.color}
                    sub={
                      k === "emergency" && v > 0
                        ? "Needs immediate attention"
                        : undefined
                    }
                  />
                );
              })}
            </div>

            <SectionTitle>People</SectionTitle>
            <div className="kpi-3" style={{ marginBottom: 20 }}>
              <StatCard
                label="Staff"
                value={stats.staffCount}
                icon="👤"
                accent="#0ea5e9"
              />
              <StatCard
                label="Workers"
                value={stats.workerCount}
                icon="🔧"
                accent="#f59e0b"
              />
              <StatCard
                label="Estate Managers"
                value={stats.estateCount}
                icon="🏢"
                accent="#10b981"
              />
              <StatCard
                label="Procurement"
                value={stats.procurementCount}
                icon="🛒"
                accent="#f59e0b"
              />
            </div>

            <SectionTitle>Status breakdown</SectionTitle>
            <Card style={{ padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(displayStats.byStatus).map(
                  ([status, count]) => {
                    const m = STATUS_META[status];
                    return (
                      <div
                        key={status}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: m?.bg ?? "#f1f5f9",
                          borderRadius: 10,
                          padding: "10px 14px",
                          flex: "1 1 120px",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: m?.color ?? "#94a3b8",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 10,
                              color: m?.text ?? "#374151",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: ".04em",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {m?.label ?? status}
                          </div>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 800,
                              color: m?.text ?? "#0f172a",
                              lineHeight: 1.2,
                            }}
                          >
                            {count}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </Card>

            <SectionTitle>Analytics</SectionTitle>
            <div className="two-col" style={{ marginBottom: 20 }}>
              <Card style={{ padding: "18px 20px" }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: ".07em",
                    margin: "0 0 16px",
                  }}
                >
                  Priority split
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <Donut
                    slices={Object.entries(displayStats.byPriority).map(
                      ([k, v]) => ({
                        value: v,
                        color: PRIORITY_META[k].color,
                      }),
                    )}
                    size={90}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {Object.entries(displayStats.byPriority).map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: PRIORITY_META[k].color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{ fontSize: 13, color: "#4b5563", flex: 1 }}
                        >
                          {PRIORITY_META[k].label}
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <Card style={{ padding: "18px 20px" }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: ".07em",
                    margin: "0 0 16px",
                  }}
                >
                  By category
                </p>
                {Object.keys(displayStats.catCount).length > 0 ? (
                  <BarChart
                    data={Object.entries(displayStats.catCount).map(
                      ([label, value]) => ({ label: label.slice(0, 7), value }),
                    )}
                    color="#ef4444"
                    height={100}
                  />
                ) : (
                  <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                    No data yet.
                  </p>
                )}
              </Card>
            </div>

            {/* 2. Pipeline stage duration — where jobs actually spend
                their time, broken into the four main handoffs, so a
                bottleneck ("materials confirmation is slow") shows up
                directly instead of hiding inside one end-to-end average. */}
            <SectionTitle>Pipeline stage duration</SectionTitle>
            <Card style={{ padding: "18px 20px", marginBottom: 20 }}>
              {displayStats.stageDurations.some((s) => s.days != null) ? (
                (() => {
                  const maxDays = Math.max(
                    ...displayStats.stageDurations.map((s) => s.days ?? 0),
                    0.0001,
                  );
                  return (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {displayStats.stageDurations.map((s) => {
                        const isBottleneck =
                          s.days != null && s.days === maxDays;
                        const pct =
                          s.days != null
                            ? Math.round((s.days / maxDays) * 100)
                            : 0;
                        return (
                          <div key={s.label}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 4,
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "#374151",
                                }}
                              >
                                {s.label}
                                {isBottleneck && (
                                  <span
                                    style={{
                                      marginLeft: 6,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "#9a3412",
                                      background: "#ffedd5",
                                      borderRadius: 5,
                                      padding: "1px 6px",
                                    }}
                                  >
                                    ⚠ bottleneck
                                  </span>
                                )}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#64748b",
                                  fontFamily: "monospace",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {s.days != null ? `${s.days.toFixed(1)}d` : "—"}
                              </span>
                            </div>
                            <div
                              style={{
                                height: 5,
                                borderRadius: 999,
                                background: "#f1f5f9",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  borderRadius: 999,
                                  width: `${pct}%`,
                                  background: isBottleneck
                                    ? "#ef4444"
                                    : "#3b82f6",
                                  transition: "width .5s ease",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                  No stage timing data yet.
                </p>
              )}
            </Card>

            {/* 5. Location hotspots — recurring problem areas, not just
                one-off repairs. */}
            <SectionTitle>Location hotspots</SectionTitle>
            <Card style={{ padding: "18px 20px", marginBottom: 20 }}>
              {displayStats.topLocations.length > 0 ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {displayStats.topLocations.map((loc, i) => {
                    const maxCount = displayStats.topLocations[0].count;
                    const pct = Math.round((loc.count / maxCount) * 100);
                    const c = CAT_COLORS[i % CAT_COLORS.length];
                    return (
                      <div key={loc.location}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#374151",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {loc.location}
                          </span>
                          <span style={{ fontSize: 12, color: "#64748b" }}>
                            {loc.count}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            borderRadius: 999,
                            background: "#f1f5f9",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 999,
                              width: `${pct}%`,
                              background: c,
                              transition: "width .5s ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                  No location data yet.
                </p>
              )}
            </Card>

            <SectionTitle>Submissions last 6 months</SectionTitle>
            <Card style={{ padding: "18px 20px" }}>
              <BarChart data={stats.trend} color="#3b82f6" height={130} />
            </Card>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <SectionTitle>Cost analytics</SectionTitle>
            </div>
            <div className="kpi-3" style={{ marginBottom: 20 }}>
              <StatCard
                label="Total Spend"
                value={
                  displayStats.totalCost
                    ? `₵${displayStats.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—"
                }
                icon="💰"
                accent="#10b981"
                sub={
                  displayStats.totalCost
                    ? `Materials ₵${displayStats.totalMaterialsCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Maintenance ₵${displayStats.totalMaintenanceCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : `${displayStats.reportsWithCost} reports with cost`
                }
              />
              <StatCard
                label="Avg Cost / Job"
                value={
                  displayStats.avgCost
                    ? `₵${displayStats.avgCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—"
                }
                icon="📊"
                accent="#3b82f6"
                sub="Per completed job"
              />
              <StatCard
                label="Highest Job"
                value={
                  displayStats.maxCost
                    ? `₵${displayStats.maxCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—"
                }
                icon="📈"
                accent="#f97316"
                sub="Single job cost"
              />
            </div>

            <div className="two-col" style={{ marginBottom: 20 }}>
              <Card style={{ padding: "18px 20px" }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: ".07em",
                    margin: "0 0 16px",
                  }}
                >
                  Monthly spend last 6 months
                </p>
                {stats.costTrend.some((d) => d.value > 0) ? (
                  <BarChart
                    data={stats.costTrend.map((d) => ({
                      label: d.label,
                      value: Math.round(d.value),
                    }))}
                    color="#10b981"
                    height={120}
                  />
                ) : (
                  <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                    No cost data yet.
                  </p>
                )}
              </Card>
              <Card style={{ padding: "18px 20px" }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: ".07em",
                    margin: "0 0 16px",
                  }}
                >
                  Spend by category
                </p>
                {Object.keys(displayStats.costByCategory).length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {Object.entries(displayStats.costByCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, total], i) => {
                        const pct = displayStats.totalCost
                          ? Math.round((total / displayStats.totalCost) * 100)
                          : 0;
                        const c = CAT_COLORS[i % CAT_COLORS.length];
                        return (
                          <div key={cat}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 4,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#374151",
                                  fontWeight: 600,
                                }}
                              >
                                {cat}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#64748b",
                                  fontFamily: "monospace",
                                }}
                              >
                                ₵
                                {total.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}
                                <span
                                  style={{ color: "#9ca3af", marginLeft: 6 }}
                                >
                                  {pct}%
                                </span>
                              </span>
                            </div>
                            <div
                              style={{
                                height: 5,
                                borderRadius: 999,
                                background: "#f1f5f9",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  borderRadius: 999,
                                  width: `${pct}%`,
                                  background: c,
                                  transition: "width .5s ease",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                    No cost data yet.
                  </p>
                )}
              </Card>
            </div>

            <Card style={{ padding: "18px 20px", marginBottom: 20 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: ".07em",
                  margin: "0 0 16px",
                }}
              >
                Spend by priority
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {Object.entries(displayStats.costByPriority).map(([k, v]) => {
                  const m = PRIORITY_META[k];
                  return (
                    <div
                      key={k}
                      style={{
                        flex: "1 1 120px",
                        background: m.bg,
                        borderRadius: 10,
                        padding: "12px 16px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: m.text,
                          textTransform: "uppercase",
                          letterSpacing: ".06em",
                          marginBottom: 4,
                        }}
                      >
                        {m.label}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: m.text,
                          lineHeight: 1.2,
                        }}
                      >
                        {v > 0
                          ? `₵${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {/* ══════════════════ REPORTS ══════════════════ */}
        {activeTab === "reports" && (isAdmin || isEstate) && (
          <>
            <SectionTitle>All reports ({reports.length})</SectionTitle>
            <TableWrap>
              <THead
                cols={[
                  "Reporter",
                  "Category",
                  "Priority",
                  "Status",
                  "Overdue",
                  "Sent",
                ]}
              />
              <tbody>
                {paginatedReports.map((r, i) => {
                  const sm = STATUS_META[r.status];
                  const pm = PRIORITY_META[r.priorityLevel];
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: i % 2 ? "#fafafa" : "#fff",
                      }}
                    >
                      <td
                        style={{
                          padding: "11px 14px",
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        {r.reporter}
                      </td>
                      <td style={{ padding: "11px 14px", color: "#64748b" }}>
                        {r.category}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {pm ? (
                          <Badge bg={pm.bg} text={pm.text}>
                            {pm.label}
                          </Badge>
                        ) : (
                          r.priorityLevel
                        )}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {sm ? (
                          <Badge bg={sm.bg} text={sm.text}>
                            {sm.label}
                          </Badge>
                        ) : (
                          r.status
                        )}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {isOverdueEligible(r) ? (
                          <span
                            style={{
                              color: "#ef4444",
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            ⚠ Yes
                          </span>
                        ) : (
                          <span style={{ color: "#22c55e", fontSize: 12 }}>
                            No
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "11px 14px",
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {timeAgo(r.dateSent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <PaginationControls
              page={reportsPage}
              totalPages={reportsTotalPages}
              onChange={setReportsPage}
              totalItems={sortedReports.length}
              pageSize={REPORTS_PAGE_SIZE}
            />
            {reports.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  padding: "48px 0",
                  color: "#94a3b8",
                }}
              >
                No reports yet.
              </p>
            )}
          </>
        )}

        {/* ══════════════════ WORKERS ══════════════════ */}

        {activeTab === "workers" && (
          <>
            <SectionTitle>Leaderboard</SectionTitle>
            {stats.workerStats.length === 0 ? (
              <p
                style={{
                  color: "#94a3b8",
                  textAlign: "center",
                  padding: "60px 0",
                }}
              >
                No workers registered yet.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {rankedWorkerStats.map((w, i) => (
                  <WorkerCard key={w.id ?? i} w={w} rank={i} />
                ))}
              </div>
            )}

            {/* Average resolution time — pulled out of the leaderboard rows
                into its own section. Keeping it here (rather than crammed
                into each card's metrics row) is what lets the leaderboard
                stay a compact, mobile-friendly grid instead of overflowing
                a wide row on narrow screens. */}
            <SectionTitle>Average resolution time</SectionTitle>
            <Card style={{ padding: "18px 20px", marginBottom: 20 }}>
              {timedWorkerStats.length > 0 ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {timedWorkerStats.map((w) => {
                    const pct = Math.min(
                      100,
                      Math.round(
                        (w.avgCompletionDays / maxAvgCompletionDays) * 100,
                      ),
                    );
                    return (
                      <div key={w.id}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#374151",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {w.name}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "#64748b",
                              fontFamily: "monospace",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {w.avgCompletionDays.toFixed(1)}d
                            <span style={{ color: "#9ca3af", marginLeft: 6 }}>
                              · {w.completionCount} timed
                            </span>
                          </span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            borderRadius: 999,
                            background: "#f1f5f9",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 999,
                              width: `${pct}%`,
                              background: "#8b5cf6",
                              transition: "width .5s ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                  No timing data yet.
                </p>
              )}
            </Card>

            <SectionTitle>Category demand</SectionTitle>
            <Card style={{ padding: "18px 20px" }}>
              {Object.keys(stats.catCount).length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                  No data yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(stats.catCount).map(([cat, count], i) => {
                    const c = CAT_COLORS[i % CAT_COLORS.length];
                    return (
                      <div
                        key={cat}
                        style={{
                          borderRadius: 8,
                          padding: "6px 14px",
                          background: c + "18",
                          color: c,
                          fontWeight: 700,
                          fontSize: 13,
                          border: `1px solid ${c}30`,
                        }}
                      >
                        {cat}{" "}
                        <span style={{ fontWeight: 400, opacity: 0.7 }}>
                          ({count})
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}

        {/* ══════════════════ ACTIVITY ══════════════════ */}
        {activeTab === "activity" && (
          <>
            <SectionTitle>Recent activity</SectionTitle>
            <Card style={{ padding: "4px 20px 8px" }}>
              {stats.recent.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "48px 0",
                    color: "#94a3b8",
                  }}
                >
                  No activity yet.
                </p>
              ) : (
                stats.recent.map((r, i) => {
                  const sm = STATUS_META[r.status];
                  const pm = PRIORITY_META[r.priorityLevel];
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        gap: 14,
                        alignItems: "flex-start",
                        padding: "14px 0",
                        borderBottom:
                          i < stats.recent.length - 1
                            ? "1px solid #f1f5f9"
                            : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          paddingTop: 5,
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: sm?.color ?? "#94a3b8",
                          }}
                        />
                        {i < stats.recent.length - 1 && (
                          <div
                            style={{
                              width: 1,
                              background: "#e2e8f0",
                              flex: 1,
                              minHeight: 20,
                              marginTop: 4,
                            }}
                          />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ fontSize: 13, color: "#374151" }}>
                            <span style={{ fontWeight: 700, color: "#0f172a" }}>
                              {r.reporter}
                            </span>
                            {" submitted a "}
                            <span style={{ fontWeight: 600 }}>
                              {r.category}
                            </span>
                            {" report"}
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#94a3b8",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {timeAgo(r.dateSent)}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            marginTop: 7,
                            flexWrap: "wrap",
                          }}
                        >
                          {sm && (
                            <Badge bg={sm.bg} text={sm.text}>
                              {sm.label}
                            </Badge>
                          )}
                          {pm && (
                            <Badge bg={pm.bg} text={pm.text}>
                              {pm.label}
                            </Badge>
                          )}
                          {isOverdueEligible(r) && (
                            <Badge bg="#fee2e2" text="#991b1b">
                              ⚠ overdue
                            </Badge>
                          )}
                        </div>
                        {r.reportDescription && (
                          <p
                            style={{
                              margin: "6px 0 0",
                              fontSize: 12,
                              color: "#94a3b8",
                              lineHeight: 1.5,
                            }}
                          >
                            {r.reportDescription.slice(0, 110)}
                            {r.reportDescription.length > 110 ? "…" : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
          </>
        )}

        {/* ══════════════════ USERS ══════════════════ */}
        {activeTab === "users" && (isAdmin || isManager) && (
          <>
            <SectionTitle>User summary</SectionTitle>
            <div className="kpi-6" style={{ marginBottom: 20 }}>
              <StatCard
                label="Total"
                value={
                  isManager
                    ? users.filter((u) => u.role !== "admin").length
                    : users.length
                }
                icon="👥"
                accent="#3b82f6"
              />
              <StatCard
                label="Staff"
                value={stats.staffCount}
                icon="👤"
                accent="#8b5cf6"
              />
              <StatCard
                label="Workers"
                value={stats.workerCount}
                icon="🔧"
                accent="#f59e0b"
              />
              <StatCard
                label="Estate"
                value={stats.estateCount}
                icon="🏢"
                accent="#10b981"
              />
              <StatCard
                label="Procurement"
                value={stats.procurementCount}
                icon="🛒"
                accent="#f59e0b"
              />
              {isAdmin && (
                <StatCard
                  label="Admins"
                  value={stats.adminCount}
                  icon="🔑"
                  accent="#ef4444"
                />
              )}
              {isAdmin && (
                <StatCard
                  label="Managers"
                  value={stats.managerCount}
                  icon="👔"
                  accent="#ec4899"
                />
              )}
              <StatCard
                label="Deactivated"
                value={stats.deactivatedCount}
                icon="🚫"
                accent="#94a3b8"
                sub="Locked out"
              />
            </div>

            {stats.recentUsers.filter((u) => isAdmin || u.role !== "admin")
              .length > 0 && (
              <>
                <SectionTitle>
                  Joined this week (
                  {
                    stats.recentUsers.filter(
                      (u) => isAdmin || u.role !== "admin",
                    ).length
                  }
                  )
                </SectionTitle>
                <div className="user-grid" style={{ marginBottom: 8 }}>
                  {stats.recentUsers
                    .filter((u) => isAdmin || u.role !== "admin")
                    .map((u) => {
                      const rm = ROLE_META[u.role];
                      return (
                        <Card
                          key={u.id}
                          style={{
                            padding: "14px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: "50%",
                              flexShrink: 0,
                              background: (rm?.color ?? "#94a3b8") + "20",
                              color: rm?.color ?? "#94a3b8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: 14,
                            }}
                          >
                            {u.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 13,
                                color: "#0f172a",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {u.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#94a3b8",
                                marginTop: 2,
                              }}
                            >
                              {formatDate(u.createdAt)}
                            </div>
                          </div>
                          {rm && (
                            <Badge bg={rm.bg} text={rm.text}>
                              {rm.label}
                            </Badge>
                          )}
                        </Card>
                      );
                    })}
                </div>
              </>
            )}

            <SectionTitle>All users ({filteredUsers.length})</SectionTitle>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 14,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="🔍  Search name or email…"
                style={{
                  flex: "1 1 180px",
                  padding: "9px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#0f172a",
                  outline: "none",
                  minWidth: 0,
                }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {filterRoles.map((r) => {
                  const active = userFilter === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setUserFilter(r)}
                      style={{
                        padding: "7px 13px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: `1px solid ${active ? "#ef4444" : "#e2e8f0"}`,
                        background: active ? "#fef2f2" : "#fff",
                        color: active ? "#ef4444" : "#6b7280",
                      }}
                    >
                      {r === "all" ? "All" : (ROLE_META[r]?.label ?? r)}
                    </button>
                  );
                })}
              </div>
            </div>

            <TableWrap>
              <THead
                cols={[
                  "User",
                  "Role",
                  "Email",
                  "Phone",
                  "Joined",
                  "Status",
                  "Actions",
                ]}
              />
              <tbody>
                {paginatedUsers.map((u, i) => {
                  const rm = ROLE_META[u.role];
                  const self = isSelf(u);
                  const canAct = canActOnUser(u);
                  const rowBg = u.deactivated
                    ? "#fafafa"
                    : i % 2
                      ? "#fafafa"
                      : "#fff";
                  return (
                    <tr
                      key={u.id}
                      style={{ borderBottom: "1px solid #f1f5f9" }}
                    >
                      {/* Name */}
                      <td style={{ padding: "11px 14px", background: rowBg }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              flexShrink: 0,
                              background: u.deactivated
                                ? "#f1f5f9"
                                : (rm?.color ?? "#94a3b8") + "20",
                              color: u.deactivated
                                ? "#94a3b8"
                                : (rm?.color ?? "#94a3b8"),
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            {u.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </div>
                          <span
                            style={{
                              fontWeight: 600,
                              color: u.deactivated ? "#94a3b8" : "#0f172a",
                              fontSize: 13,
                            }}
                          >
                            {u.name}
                            {self && (
                              <span
                                style={{
                                  marginLeft: 5,
                                  fontSize: 10,
                                  color: "#94a3b8",
                                }}
                              >
                                (you)
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      {/* Role */}
                      <td style={{ padding: "11px 14px", background: rowBg }}>
                        {rm ? (
                          <Badge bg={rm.bg} text={rm.text}>
                            {rm.label}
                          </Badge>
                        ) : (
                          u.role
                        )}
                      </td>
                      {/* Email */}
                      <td
                        style={{
                          padding: "11px 14px",
                          color: "#64748b",
                          background: rowBg,
                          maxWidth: 160,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.email ?? "—"}
                      </td>
                      {/* Phone */}
                      <td
                        style={{
                          padding: "11px 14px",
                          color: "#64748b",
                          background: rowBg,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.phoneNumber ?? "—"}
                      </td>
                      {/* Joined */}
                      <td
                        style={{
                          padding: "11px 14px",
                          color: "#94a3b8",
                          background: rowBg,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(u.createdAt)}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "11px 14px", background: rowBg }}>
                        {u.requiresPasswordChange ? (
                          <Badge bg="#fef3c7" text="#92400e">
                            🔑 Pw Reset
                          </Badge>
                        ) : u.deactivated ? (
                          <Badge bg="#f1f5f9" text="#94a3b8">
                            🚫 Deactivated
                          </Badge>
                        ) : (
                          <Badge bg="#d1fae5" text="#065f46">
                            ● Active
                          </Badge>
                        )}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "11px 14px", background: rowBg }}>
                        {canAct ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 5,
                              flexWrap: "wrap",
                            }}
                          >
                            {/* Deactivate / Reactivate */}
                            <button
                              className="act-btn"
                              onClick={() => toggleDeactivate(u)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                border: `1px solid ${u.deactivated ? "#d1fae5" : "#fef3c7"}`,
                                background: u.deactivated
                                  ? "#d1fae5"
                                  : "#fef3c7",
                                color: u.deactivated ? "#065f46" : "#92400e",
                              }}
                            >
                              {u.deactivated ? "Reactivate" : "Deactivate"}
                            </button>

                            {/* Reset Password — admin and IT manager */}
                            <button
                              className="act-btn"
                              onClick={() => setResetTarget(u)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                border: "1px solid #fed7aa",
                                background: "#fed7aa",
                                color: "#9a3412",
                              }}
                            >
                              Reset Pw
                            </button>

                            {/* Delete */}
                            <button
                              className="act-btn"
                              onClick={() => deleteUserDoc(u)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                border: "1px solid #fee2e2",
                                background: "#fee2e2",
                                color: "#991b1b",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : self ? (
                          <span
                            style={{
                              fontSize: 11,
                              color: "#cbd5e1",
                              fontStyle: "italic",
                            }}
                          >
                            You
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#cbd5e1" }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <PaginationControls
              page={usersPage}
              totalPages={usersTotalPages}
              onChange={setUsersPage}
              totalItems={filteredUsers.length}
              pageSize={USERS_PAGE_SIZE}
            />

            {filteredUsers.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  padding: "48px 0",
                  color: "#94a3b8",
                }}
              >
                {userSearch || userFilter !== "all"
                  ? "No users match your filters."
                  : "No users yet."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
