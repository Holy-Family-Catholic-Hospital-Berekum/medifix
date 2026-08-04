import { useState, useEffect, useMemo } from "react";
import { nanoid } from "nanoid";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../src/firebase";
import NavBar from "../components/navBar";
import { generateDashboardStatsPDF } from "../src/utils";

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
  assigned: {
    label: "Assigned",
    color: "#8b5cf6",
    bg: "#ede9fe",
    text: "#4c1d95",
  },
  completed: {
    label: "Completed",
    color: "#22c55e",
    bg: "#dcfce7",
    text: "#14532d",
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

const ALLOWED_ROLES = ["admin", "manager", "estate"];

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
  return `${m}m ago`;
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

// ─── Generate Registration ID modal ──────────────────────────────────────────
function GenIDModal({ role, onClose }) {
  const allowedTypes =
    role === "admin"
      ? ["manager", "estate", "staff", "worker"]
      : ["estate", "staff", "worker"]; // manager

  const [genType, setGenType] = useState(allowedTypes[0]);
  const [genLoading, setGenLoading] = useState(false);
  const [generatedID, setGeneratedID] = useState("");

  const handleGenerate = async () => {
    if (genLoading) return;
    setGenLoading(true);
    try {
      const id = nanoid();
      await setDoc(doc(db, "registrationIDs", id), {
        type: genType,
        used: false,
      });
      setGeneratedID(id);
    } catch (e) {
      console.error("Failed to generate ID:", e);
      alert("Failed to generate registration ID. Please try again.");
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-800">
          Generate Registration ID
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
                    className={`px-4 py-2 rounded-full capitalize text-sm font-medium border transition cursor-pointer ${
                      genType === type
                        ? "bg-red-400 text-white border-red-400"
                        : "bg-white text-gray-700 border-gray-300 hover:border-red-300"
                    }`}
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
                className={`flex-1 py-2 rounded-lg text-white font-medium transition cursor-pointer ${genLoading ? "bg-red-300 cursor-not-allowed" : "bg-red-400 hover:bg-red-500"}`}
              >
                {genLoading ? "Generating..." : "Generate"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Share this ID with the new{" "}
              <span className="font-semibold capitalize">{genType}</span>:
            </p>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm font-mono text-gray-800 break-all">
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

// ─── Access Denied screen ────────────────────────────────────────────────────
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
        {/* Debug helper — remove before production if desired */}
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
// IMPORTANT: ALL hooks must be called unconditionally before any early return.
// Moving the access guard after hooks fixes the React rules-of-hooks violation
// that caused managers to see "Access Denied" despite having the correct role.
export default function EstateDashboard() {
  // ── state — ALL hooks first, no early returns before this block ──────────
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [userFilter, setUserFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [showGenID, setShowGenID] = useState(false);

  // ── read user from localStorage — done once outside effects ─────────────
  // Safe parse: handles null / malformed JSON gracefully.
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
  const canDownloadDashboardPDF = ["admin", "manager", "estate"].includes(role);

  // ── Firestore subscriptions — always called, but skip work if no access ──
  useEffect(() => {
    if (!hasAccess) return;
    const unsub = onSnapshot(
      collection(db, "reports"),
      (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (error) => {
        console.error("Firestore reports error:", error);
      },
    );
    return unsub;
  }, [hasAccess]);

  useEffect(() => {
    if (!hasAccess) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [hasAccess]);

  // ── derived stats — always computed, safe when arrays are empty ──────────
  const stats = useMemo(() => {
    const total = reports.length;
    const completed = reports.filter((r) => r.status === "completed").length;
    const overdue = reports.filter(
      (r) => r.overdue && r.status !== "completed",
    ).length;
    const active = reports.filter(
      (r) => !["completed", "denied"].includes(r.status),
    ).length;

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

    const monthReports = reports.filter((r) => {
      const sent = r.dateSent?.toDate
        ? r.dateSent.toDate()
        : new Date(r.dateSent);
      if (Number.isNaN(sent.getTime())) return false;
      return sent >= monthStart && sent < nextMonthStart;
    });

    const yearReports = reports.filter((r) => {
      const sent = r.dateSent?.toDate
        ? r.dateSent.toDate()
        : new Date(r.dateSent);
      if (Number.isNaN(sent.getTime())) return false;
      return sent >= yearStart && sent < nextYearStart;
    });

    const monthCompleted = monthReports.filter(
      (r) => r.status === "completed",
    ).length;
    const monthOverdue = monthReports.filter(
      (r) => r.overdue && r.status !== "completed",
    ).length;
    const monthActive = monthReports.filter(
      (r) => !["completed", "denied"].includes(r.status),
    ).length;
    const yearCompleted = yearReports.filter(
      (r) => r.status === "completed",
    ).length;
    const yearOverdue = yearReports.filter(
      (r) => r.overdue && r.status !== "completed",
    ).length;
    const yearActive = yearReports.filter(
      (r) => !["completed", "denied"].includes(r.status),
    ).length;

    const trend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        label: d.toLocaleString("default", { month: "short" }),
        value: reports.filter((r) => {
          const rd = r.dateSent?.toDate
            ? r.dateSent.toDate()
            : new Date(r.dateSent);
          if (Number.isNaN(rd.getTime())) return false;
          return (
            rd.getFullYear() === d.getFullYear() &&
            rd.getMonth() === d.getMonth()
          );
        }).length,
      };
    });

    const workers = users.filter((u) => u.role === "worker");
    const workerStats = workers
      .map((w) => {
        const assigned = reports.filter((r) => r.assignedTo === w.ID).length;
        const done = reports.filter(
          (r) => r.assignedTo === w.ID && r.status === "completed",
        ).length;
        return {
          name: w.name,
          assigned,
          done,
          rate: assigned ? Math.round((done / assigned) * 100) : 0,
        };
      })
      .sort((a, b) => b.done - a.done);

    const recent = [...reports]
      .sort(
        (a, b) =>
          (b.dateSent?.toDate?.() ?? new Date(0)) -
          (a.dateSent?.toDate?.() ?? new Date(0)),
      )
      .slice(0, 10);

    const staffCount = users.filter((u) => u.role === "staff").length;
    const workerCount = workers.length;
    const estateCount = users.filter((u) => u.role === "estate").length;
    const adminCount = users.filter((u) => u.role === "admin").length;
    const managerCount = users.filter((u) => u.role === "manager").length;
    const deactivatedCount = users.filter((u) => u.deactivated).length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    const avgResolutionDays = (() => {
      const resolved = reports.filter((r) => r.dateCompleted && r.dateSent);
      if (!resolved.length) return null;
      const t = resolved.reduce((s, r) => {
        const sent = r.dateSent?.toDate
          ? r.dateSent.toDate()
          : new Date(r.dateSent);
        const done = r.dateCompleted?.toDate
          ? r.dateCompleted.toDate()
          : new Date(r.dateCompleted);
        return s + (done - sent) / 86400000;
      }, 0);
      return (t / resolved.length).toFixed(1);
    })();

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

    // ── Cost analytics ──────────────────────────────────────────────────────
    const reportsWithCost = reports.filter(
      (r) => r.cost != null && !isNaN(r.cost),
    );
    const totalCost = reportsWithCost.reduce((s, r) => s + r.cost, 0);
    const avgCost = reportsWithCost.length
      ? totalCost / reportsWithCost.length
      : null;
    const maxCost = reportsWithCost.length
      ? Math.max(...reportsWithCost.map((r) => r.cost))
      : null;

    // Cost by category
    const costByCategory = {};
    reportsWithCost.forEach((r) => {
      costByCategory[r.category] = (costByCategory[r.category] || 0) + r.cost;
    });

    // Monthly cost trend (last 6 months)
    const costTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const monthReports = reportsWithCost.filter((r) => {
        const rd = r.dateSent?.toDate
          ? r.dateSent.toDate()
          : new Date(r.dateSent);
        return (
          rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth()
        );
      });
      return {
        label: d.toLocaleString("default", { month: "short" }),
        value: monthReports.reduce((s, r) => s + r.cost, 0),
      };
    });

    // Cost by priority
    const costByPriority = { emergency: 0, urgent: 0, routine: 0 };
    reportsWithCost.forEach((r) => {
      if (r.priorityLevel in costByPriority)
        costByPriority[r.priorityLevel] += r.cost;
    });

    return {
      total,
      completed,
      overdue,
      active,
      byStatus,
      byPriority,
      catCount,
      trend,
      workerStats,
      recent,
      staffCount,
      workerCount,
      estateCount,
      adminCount,
      managerCount,
      deactivatedCount,
      completionRate,
      avgResolutionDays,
      recentUsers,
      reportsWithCost: reportsWithCost.length,
      totalCost,
      avgCost,
      maxCost,
      costByCategory,
      costTrend,
      costByPriority,
      monthStats: {
        total: monthReports.length,
        completed: monthCompleted,
        overdue: monthOverdue,
        active: monthActive,
        avgResolutionDays,
      },
      yearStats: {
        total: yearReports.length,
        completed: yearCompleted,
        overdue: yearOverdue,
        active: yearActive,
      },
    };
  }, [reports, users]);

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

  // ── toast helper ─────────────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const handleDownloadDashboardPDF = () => {
    generateDashboardStatsPDF(
      stats,
      role?.toUpperCase?.() || role,
      user?.name || "User",
    );
  };

  // ── user action helpers ───────────────────────────────────────────────────
  const canActOnUser = (u) => {
    if (u.id === user?.uid) return false;
    if (isAdmin) return true;
    if (isManager) return u.role !== "admin";
    return false;
  };

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
    return ["overview", "reports", "workers", "activity"]; // estate
  })();

  const filterRoles = isAdmin
    ? ["all", "admin", "manager", "estate", "staff", "worker"]
    : ["all", "manager", "estate", "staff", "worker"];

  // ── NOW it is safe to do early returns (all hooks are done) ──────────────

  // Access guard — rendered AFTER all hooks.
  if (!hasAccess) return <AccessDenied role={role} />;

  if (loading)
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
    <div style={{ minHeight: "100vh" }} className="bg-blue-100">
      <NavBar
        homeRedirect="/estateHome"
        dashboardRedirect="/estateDashboard"
        theme={{
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
        }}
      />

      {showGenID && (
        <GenIDModal role={role} onClose={() => setShowGenID(false)} />
      )}

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
            maxWidth: 300,
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
        .kpi-3   { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
        .kpi-6   { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
        .two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .user-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; }
        @media(max-width:900px){ .kpi-5{grid-template-columns:repeat(3,1fr);} .kpi-6{grid-template-columns:repeat(3,1fr);} }
        @media(max-width:640px){ .kpi-5{grid-template-columns:repeat(2,1fr);} .kpi-3{grid-template-columns:repeat(2,1fr);} .kpi-6{grid-template-columns:repeat(2,1fr);} .two-col{grid-template-columns:1fr;} }
        @media(max-width:400px){ .kpi-5{grid-template-columns:1fr;} .kpi-3{grid-template-columns:1fr;} .kpi-6{grid-template-columns:1fr;} }
      `}</style>

      <div
        style={{ maxWidth: 1120, margin: "0 auto", padding: "88px 16px 64px" }}
      >
        {/* ── header ────────────────────────────────────────────────── */}
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
                color: "#ef4444",
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
                  className="bg-red-400 hover:bg-red-500 cursor-pointer transition text-white font-bold py-2 px-4 rounded text-sm"
                >
                  + Generate Registration ID
                </button>
              )}
              {canDownloadDashboardPDF && (
                <button
                  onClick={handleDownloadDashboardPDF}
                  className="bg-slate-900 hover:bg-slate-700 cursor-pointer transition text-white font-bold py-2 px-4 rounded text-sm"
                >
                  Download Dashboard PDF
                </button>
              )}
            </div>
          </div>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
        </div>

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
            <SectionTitle>Report summary</SectionTitle>
            <div className="kpi-5" style={{ marginBottom: 20 }}>
              <StatCard
                label="Total"
                value={stats.total}
                icon="📋"
                accent="#3b82f6"
                sub="All time"
              />
              <StatCard
                label="Active"
                value={stats.active}
                icon="⚙️"
                accent="#f97316"
                sub="In pipeline"
              />
              <StatCard
                label="Completed"
                value={stats.completed}
                icon="✅"
                accent="#22c55e"
                sub={`${stats.completionRate}% rate`}
              />
              <StatCard
                label="Overdue"
                value={stats.overdue}
                icon="⚠️"
                accent="#ef4444"
                sub="Needs attention"
              />
              <StatCard
                label="Avg Resolution"
                value={
                  stats.avgResolutionDays ? `${stats.avgResolutionDays}d` : "—"
                }
                icon="⏱️"
                accent="#8b5cf6"
                sub="Days to close"
              />
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
            </div>

            <SectionTitle>Status breakdown</SectionTitle>
            <Card style={{ padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(stats.byStatus).map(([status, count]) => {
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
                })}
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
                    slices={Object.entries(stats.byPriority).map(([k, v]) => ({
                      value: v,
                      color: PRIORITY_META[k].color,
                    }))}
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
                    {Object.entries(stats.byPriority).map(([k, v]) => (
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
                {Object.keys(stats.catCount).length > 0 ? (
                  <BarChart
                    data={Object.entries(stats.catCount).map(
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

            <SectionTitle>Submissions last 6 months</SectionTitle>
            <Card style={{ padding: "18px 20px" }}>
              <BarChart data={stats.trend} color="#3b82f6" height={130} />
            </Card>

            <SectionTitle>Cost analytics</SectionTitle>
            <div className="kpi-3" style={{ marginBottom: 20 }}>
              <StatCard
                label="Total Spend"
                value={
                  stats.totalCost
                    ? `₵${stats.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—"
                }
                icon="💰"
                accent="#10b981"
                sub={`${stats.reportsWithCost} reports with cost`}
              />
              <StatCard
                label="Avg Cost / Job"
                value={
                  stats.avgCost
                    ? `₵${stats.avgCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—"
                }
                icon="📊"
                accent="#3b82f6"
                sub="Per completed job"
              />
              <StatCard
                label="Highest Job"
                value={
                  stats.maxCost
                    ? `₵${stats.maxCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
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
                  Monthly spend — last 6 months
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
                {Object.keys(stats.costByCategory).length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {Object.entries(stats.costByCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, total], i) => {
                        const pct = stats.totalCost
                          ? Math.round((total / stats.totalCost) * 100)
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
                {Object.entries(stats.costByPriority).map(([k, v]) => {
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

        {/* ══════════════════ REPORTS (admin + estate only) ══════════════════ */}
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
                {[...reports]
                  .sort(
                    (a, b) =>
                      (b.dateSent?.toDate?.() ?? new Date(0)) -
                      (a.dateSent?.toDate?.() ?? new Date(0)),
                  )
                  .map((r, i) => {
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
                          {r.overdue && r.status !== "completed" ? (
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
                {stats.workerStats.map((w, i) => (
                  <Card
                    key={i}
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: i === 0 ? "#f59e0b" : "#94a3b8",
                        width: 22,
                        flexShrink: 0,
                        textAlign: "center",
                      }}
                    >
                      {i === 0
                        ? "🥇"
                        : i === 1
                          ? "🥈"
                          : i === 2
                            ? "🥉"
                            : `#${i + 1}`}
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
                      </div>
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
                            width: `${w.rate}%`,
                            background:
                              w.rate >= 80
                                ? "#22c55e"
                                : w.rate >= 50
                                  ? "#f59e0b"
                                  : "#ef4444",
                            transition: "width .5s ease",
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                      {[
                        ["Assigned", w.assigned, "#64748b"],
                        ["Done", w.done, "#22c55e"],
                        [
                          "Rate",
                          `${w.rate}%`,
                          w.rate >= 80
                            ? "#22c55e"
                            : w.rate >= 50
                              ? "#f59e0b"
                              : "#ef4444",
                        ],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 9,
                              color: "#94a3b8",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: ".05em",
                            }}
                          >
                            {l}
                          </div>
                          <div
                            style={{ fontSize: 17, fontWeight: 800, color: c }}
                          >
                            {v}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}

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
                          {r.overdue && r.status !== "completed" && (
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

        {/* ══════════════════ USERS (admin + manager only) ══════════════════ */}
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
                {filteredUsers.map((u, i) => {
                  const rm = ROLE_META[u.role];
                  const isSelf = u.id === user?.uid;
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
                            {isSelf && (
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
                      <td style={{ padding: "11px 14px", background: rowBg }}>
                        {rm ? (
                          <Badge bg={rm.bg} text={rm.text}>
                            {rm.label}
                          </Badge>
                        ) : (
                          u.role
                        )}
                      </td>
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
                      <td style={{ padding: "11px 14px", background: rowBg }}>
                        {u.deactivated ? (
                          <Badge bg="#f1f5f9" text="#94a3b8">
                            🚫 Deactivated
                          </Badge>
                        ) : (
                          <Badge bg="#d1fae5" text="#065f46">
                            ● Active
                          </Badge>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", background: rowBg }}>
                        {canAct ? (
                          <div style={{ display: "flex", gap: 6 }}>
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
                        ) : isSelf ? (
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
            <p
              style={{
                fontSize: 12,
                color: "#94a3b8",
                margin: "10px 0 0",
                textAlign: "right",
              }}
            >
              Showing {filteredUsers.length} of{" "}
              {isManager
                ? users.filter((u) => u.role !== "admin").length
                : users.length}{" "}
              users
            </p>
          </>
        )}
      </div>
    </div>
  );
}
