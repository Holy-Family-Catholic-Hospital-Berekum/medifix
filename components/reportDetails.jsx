import { useState, useEffect, useRef } from "react";
import { notifyOnStatusChange } from "../src/notifications/notifyOnStatusChange";
import PhoneCallButton from "./phoneCallButton";
import {
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  getDocs,
  collection,
  query,
  getDoc,
  setDoc,
  where,
  deleteDoc,
} from "firebase/firestore";

import { db } from "../src/firebase";
import {
  formatDate,
  generatePDFReport,
  canUserApprove,
  canUserConfirmCost,
  canUserAddCost,
  canUserAssignWorker,
  canUserComplete,
  canUserSendFeedback,
  canUserDownloadPDF,
  canUserSubmitCost,
  canUserMarkProcured,
  getTotalCost,
  canUserAcceptOrRejectJob,
  canUserDropJob,
} from "../src/utils";

const EMPTY_MATERIAL = { description: "", quantity: "", specification: "" };

// ─── Status / priority presentation ────────────────────────────────────────
const STATUS_CONFIG = {
  incoming: {
    label: "Incoming",
    color: "bg-slate-100 text-slate-700 border-slate-300",
  },
  approved: {
    label: "Approved",
    color: "bg-blue-100 text-blue-700 border-blue-300",
  },
  denied: { label: "Denied", color: "bg-red-100 text-red-700 border-red-300" },
  pending: {
    label: "Pending Confirmation",
    color: "bg-amber-100 text-amber-700 border-amber-300",
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-blue-100 text-blue-700 border-blue-300",
  },
  costDenied: {
    label: "Cost Denied",
    color: "bg-red-100 text-red-700 border-red-300",
  },
  procured: {
    label: "Procured",
    color: "bg-teal-100 text-teal-700 border-teal-300",
  },
  assigned: {
    label: "Assigned",
    color: "bg-purple-100 text-purple-700 border-purple-300",
  },
  accepted: {
    label: "Accepted",
    color: "bg-green-100 text-green-700 border-green-300",
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-100 text-red-700 border-red-300",
  },
  dropped: {
    label: "Dropped",
    color: "bg-orange-100 text-orange-700 border-orange-300",
  },
  reopened: {
    label: "Reopened",
    color: "bg-amber-100 text-amber-700 border-amber-300",
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-700 border-green-300",
  },
  closed: {
    label: "Closed",
    color: "bg-gray-200 text-gray-700 border-gray-300",
  },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    color: "bg-gray-100 text-gray-700 border-gray-300",
  };
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ level }) {
  if (!level) return null;
  const lvl = String(level).toLowerCase();
  const color =
    lvl.includes("high") || lvl.includes("urgent")
      ? "bg-red-100 text-red-700 border-red-300"
      : lvl.includes("medium")
        ? "bg-amber-100 text-amber-700 border-amber-300"
        : lvl.includes("low")
          ? "bg-green-100 text-green-700 border-green-300"
          : "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${color}`}
    >
      {level} priority
    </span>
  );
}

// Small label/value pair used in the compact info grid. Renders nothing if
// there's no value, so the grid never shows empty cells.
function InfoItem({ label, children }) {
  if (children === null || children === undefined || children === "")
    return null;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <div className="text-sm md:text-base text-gray-800 font-medium break-words">
        {children}
      </div>
    </div>
  );
}

function SectionCard({ title, children, innerRef }) {
  return (
    <div
      ref={innerRef}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3"
    >
      {title && <h3 className="font-bold text-gray-800">{title}</h3>}
      {children}
    </div>
  );
}

// Actions get a distinct visual treatment (accent bar) so it's obvious
// what needs input from *this* viewer vs. what's just read-only history.
function ActionSection({ innerRef, title, hint, children }) {
  return (
    <div
      ref={innerRef}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 w-1.5 h-5 rounded-full bg-red-400 shrink-0" />
        <div>
          <h3 className="font-bold text-gray-800 leading-tight">{title}</h3>
          {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// Denial reasons live in the report's `notes` array instead of the old
// `alerts` field. A note entry looks like:
// { type: "denial", content: "<reason>", date: <JS Date>, by: "<name>" }
function getLatestNote(report, type) {
  if (!report) return null;
  const notes = (report.notes || []).filter((n) => n?.type === type);
  return notes.length ? notes[notes.length - 1] : null;
}

function getDenialNote(report) {
  if (!report || report.status !== "denied") return null;
  return getLatestNote(report, "denial")?.content || null;
}

// ─── Timeline ───────────────────────────────────────────────────────────
// Consolidates every "date + optional note" pair scattered across the old
// layout into a single chronological activity log.
function toMillis(d) {
  if (!d) return 0;
  if (typeof d.toMillis === "function") return d.toMillis();
  if (typeof d.seconds === "number") return d.seconds * 1000;
  if (d instanceof Date) return d.getTime();
  const parsed = new Date(d).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function buildTimelineEntries(report) {
  const entries = [];
  const push = (date, label, opts = {}) => {
    if (!date) return;
    entries.push({ date, label, ...opts });
  };

  push(report.dateSent, "Report submitted");
  push(report.dateApproved, "Approved");

  if (report.status === "denied") {
    const denial = getLatestNote(report, "denial");
    push(denial?.date, "Denied", {
      note: denial?.content,
      by: denial?.by,
      tone: "danger",
    });
  }

  push(report.dateCostAdded, "Materials submitted");
  push(report.dateCostDenied, "Materials denied");
  push(report.dateConfirmed, "Materials confirmed");
  push(report.dateProcured, "Materials procured", {
    note:
      report.cost != null
        ? `Cost: ₵${Number(report.cost).toLocaleString()}`
        : null,
  });
  push(report.dateAssigned, "Worker assigned");
  push(report.dateReAssigned, "Worker reassigned");
  push(report.dateRejected, "Job rejected", {
    note: report.rejectReason,
    by: report.rejectedBy,
    tone: "danger",
  });
  push(report.dateAccepted, "Job accepted");
  push(report.dateDropped, "Job dropped", {
    note: report.dropReason,
    by: report.droppedBy,
    tone: "warning",
  });
  push(report.dateCompleted, "Work completed");
  push(report.dateReopened, "Reopened", {
    note: report.reopenReason,
    tone: "warning",
  });
  push(report.dateMaintenanceCostAdded, "Maintenance cost submitted", {
    note:
      report.maintenanceCost != null
        ? `₵${Number(report.maintenanceCost).toLocaleString()}`
        : null,
  });
  push(report.feedbackDate, "Feedback submitted");

  return entries.sort((a, b) => toMillis(a.date) - toMillis(b.date));
}

function Timeline({ entries }) {
  if (!entries.length) return null;
  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />
      <div className="space-y-5">
        {entries.map((e, i) => (
          <div key={i} className="relative">
            <span
              className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white ring-2 ${
                e.tone === "danger"
                  ? "bg-red-500 ring-red-200"
                  : e.tone === "warning"
                    ? "bg-orange-500 ring-orange-200"
                    : "bg-blue-500 ring-blue-200"
              }`}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-semibold text-gray-800">{e.label}</p>
              <p className="text-xs text-gray-400 whitespace-nowrap">
                {formatDate(e.date)}
              </p>
            </div>
            {e.note && (
              <p
                className={`text-sm mt-1 rounded-lg px-3 py-2 ${
                  e.tone === "danger"
                    ? "bg-red-50 text-red-700"
                    : e.tone === "warning"
                      ? "bg-orange-50 text-orange-700"
                      : "bg-gray-50 text-gray-600"
                }`}
              >
                {e.note}
                {e.by ? ` — ${e.by}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Click-to-zoom viewer for report / completion photos.
function ImageLightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Full size preview"
        className="max-w-full max-h-full rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-5 right-5 text-white text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
      >
        ×
      </button>
    </div>
  );
}

// How long we'll wait for a completion-photo upload before giving up and
// showing an explicit error, instead of spinning forever.
const compressImageToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();

      // Without this, a corrupt/unsupported file leaves the promise
      // pending forever — the "mark as completed" button would spin
      // indefinitely with no error shown.
      img.onerror = () =>
        reject(
          new Error("Could not process the image. Please try another photo."),
        );

      img.src = event.target.result;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxWidth = 800;
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
    };
  });
};

// ─── Auto-scroll targeting ─────────────────────────────────────────────────
// Maps (role, report status) → which action section to auto-scroll to when
// the details panel opens. Deliberately omits any (role, status) pair where
// the viewer is seeing the report for the first time at a stage that
// requires reading the full report before deciding — e.g. admin+incoming
// (approve/deny needs context) or estate+approved (materials-needed vs.
// direct-assign needs context). Every entry here is either a repeat
// exposure (the role already reviewed this report earlier in its
// lifecycle) or a mechanical action that doesn't need the incident
// description to perform.
//
// "assignWorker" doubles as the reassignment target for estate on
// rejected/dropped/reopened reports — same section, since reassigning is
// just picking a (possibly different) worker via the same UI.
//
// Note: worker's Drop Job section (dropJob) has a ref for future use but
// is intentionally NOT wired up as an auto-scroll target here — it shares
// its visible statuses (accepted/reopened) with Complete Work, and
// completing the job is treated as the expected default action, not
// dropping it. Only one target can be chosen per view.
function getScrollTarget(user, report, refs) {
  if (!user || !report) return null;

  // Unread feedback takes priority over the status-based target below,
  // for any role that didn't write it themselves — staff write their own
  // feedback via a separate flow (StaffReportDetails.jsx) and don't need
  // to be scrolled to their own past input.
  if (
    report.feedback &&
    user.role !== "staff" &&
    !report.feedbackViewedBy?.includes(user.ID)
  ) {
    return refs.feedback;
  }

  const SCROLL_MAP = {
    admin: {
      pending: refs.confirmCost,
    },
    estate: {
      procured: refs.assignWorker,
      rejected: refs.assignWorker,
      dropped: refs.assignWorker,
      reopened: refs.assignWorker,
      costDenied: refs.addMaterials,
      completed: refs.submitCost,
      closed: refs.submitCost,
    },
    procurement: {
      confirmed: refs.markProcured,
    },
    worker: {
      assigned: refs.acceptReject,
      accepted: refs.completeWork,
      reopened: refs.completeWork,
    },
  };

  return SCROLL_MAP[user.role]?.[report.status] ?? null;
}

// Read-only star display for the technician rating, so any role viewing
// this panel (not just the staff member who submitted it) can see it.
function StarRating({ value, onChange, readOnly = false, size = "text-2xl" }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div
      className="flex gap-1"
      role="radiogroup"
      aria-label="Technician rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = readOnly ? star <= value : star <= (hovered || value);
        return (
          <button
            key={star}
            type="button"
            role={readOnly ? undefined : "radio"}
            aria-checked={!readOnly && star === value}
            disabled={readOnly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className={`${size} leading-none p-0 bg-transparent border-0 select-none transition-transform ${
              readOnly ? "cursor-default" : "cursor-pointer hover:scale-110"
            } ${filled ? "text-yellow-400" : "text-gray-300"}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function MaterialsTable({ materials, onChange, readOnly = false }) {
  const addRow = () => onChange([...materials, { ...EMPTY_MATERIAL }]);
  const removeRow = (idx) => onChange(materials.filter((_, i) => i !== idx));
  const updateCell = (idx, field, value) => {
    const updated = materials.map((row, i) =>
      i === idx ? { ...row, [field]: value } : row,
    );
    onChange(updated);
  };

  if (readOnly) {
    if (!materials || materials.length === 0) return null;
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="border-b border-gray-200 px-3 py-2 text-left w-10">
                S/N
              </th>
              <th className="border-b border-gray-200 px-3 py-2 text-left">
                Description
              </th>
              <th className="border-b border-gray-200 px-3 py-2 text-left w-24">
                Qty
              </th>
              <th className="border-b border-gray-200 px-3 py-2 text-left w-36">
                Spec / Size
              </th>
            </tr>
          </thead>
          <tbody>
            {materials.map((row, idx) => (
              <tr
                key={idx}
                className={idx % 2 === 1 ? "bg-gray-50" : "bg-white"}
              >
                <td className="border-b border-gray-100 px-3 py-2 text-center text-gray-400">
                  {idx + 1}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 text-gray-800 font-medium">
                  {row.description}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 text-gray-800 text-center">
                  {row.quantity}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 text-gray-800">
                  {row.specification}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="border-b border-gray-200 px-2 py-2 text-left w-10">
                S/N
              </th>
              <th className="border-b border-gray-200 px-2 py-2 text-left">
                Description
              </th>
              <th className="border-b border-gray-200 px-2 py-2 text-left w-24">
                Qty
              </th>
              <th className="border-b border-gray-200 px-2 py-2 text-left w-36">
                Spec / Size
              </th>
              <th className="border-b border-gray-200 px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((row, idx) => (
              <tr key={idx}>
                <td className="border-b border-gray-100 px-2 py-1 text-center text-gray-400 text-xs">
                  {idx + 1}
                </td>
                <td className="border-b border-gray-100 px-1 py-1">
                  <input
                    type="text"
                    placeholder="e.g. Silicone"
                    value={row.description}
                    onChange={(e) =>
                      updateCell(idx, "description", e.target.value)
                    }
                    className="w-full px-2 py-1.5 text-sm outline-none bg-transparent rounded focus:bg-blue-50"
                  />
                </td>
                <td className="border-b border-gray-100 px-1 py-1">
                  <input
                    type="number"
                    placeholder="0"
                    value={row.quantity}
                    onChange={(e) =>
                      updateCell(idx, "quantity", e.target.value)
                    }
                    className="w-full px-2 py-1.5 text-sm outline-none bg-transparent text-center rounded focus:bg-blue-50"
                  />
                </td>
                <td className="border-b border-gray-100 px-1 py-1">
                  <input
                    type="text"
                    placeholder='e.g. 4"'
                    value={row.specification}
                    onChange={(e) =>
                      updateCell(idx, "specification", e.target.value)
                    }
                    className="w-full px-2 py-1.5 text-sm outline-none bg-transparent rounded focus:bg-blue-50"
                  />
                </td>
                <td className="border-b border-gray-100 px-1 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="text-red-400 hover:text-red-600 font-bold text-base leading-none"
                    title="Remove row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
      >
        <span className="text-lg leading-none">+</span> Add item
      </button>
    </div>
  );
}

// Lets a worker take a photo with the device camera or pick one from
// their gallery, and shows a live preview before submission.
function CompletionImageUploader({ preview, onChange }) {
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onChange(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Photo of Completed Work
      </label>

      {preview && (
        <img
          src={preview}
          alt="Completed work preview"
          className="w-full max-h-64 object-contain rounded-lg border border-gray-200"
        />
      )}

      <div className="flex gap-2">
        <label className="flex-1 cursor-pointer text-center bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg py-2 px-3 text-sm font-medium text-gray-700 transition-colors">
          {preview ? "Retake Photo" : "Take Photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        <label className="flex-1 cursor-pointer text-center bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg py-2 px-3 text-sm font-medium text-gray-700 transition-colors">
          Upload from Gallery
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {!preview && (
        <p className="text-xs text-gray-400">
          A photo of the completed work is required before you can mark this job
          as completed.
        </p>
      )}
    </div>
  );
}

export default function ReportDetailsContainer({
  displayDetails,
  setDisplayDetails,
  currentReport,
  reportDetailsBgColor,
  theme,
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [materials, setMaterials] = useState([{ ...EMPTY_MATERIAL }]);
  const [procurementCost, setProcurementCost] = useState("");
  const [formData, setFormData] = useState({
    note: "",
    instructions: "",
    feedback: "",
    selectedWorker: "",
  });

  const [actualCost, setActualCost] = useState("");
  const [completionImage, setCompletionImage] = useState(null);
  const [completionImagePreview, setCompletionImagePreview] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [maintenanceCost, setMaintenanceCost] = useState("");
  const [dropReason, setDropReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  // ── Auto-scroll refs ──────────────────────────────────────────────────
  const panelRef = useRef(null);
  const feedbackRef = useRef(null);
  const approveDenyRef = useRef(null);
  const addMaterialsRef = useRef(null);
  const confirmCostRef = useRef(null);
  const markProcuredRef = useRef(null);
  const assignWorkerRef = useRef(null);
  const submitCostRef = useRef(null);
  const acceptRejectRef = useRef(null);
  const completeWorkRef = useRef(null);
  const dropJobRef = useRef(null);
  const sendFeedbackRef = useRef(null);

  useEffect(() => {
    if (displayDetails) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [displayDetails]);

  useEffect(() => {
    if (!displayDetails) {
      setCompletionImage(null);
      setCompletionImagePreview(null);
      setUploadError("");
      setDropReason("");
      setRejectReason("");
      setLightboxSrc(null);
    }
  }, [displayDetails]);

  useEffect(() => {
    return () => {
      if (completionImagePreview) URL.revokeObjectURL(completionImagePreview);
    };
  }, [completionImagePreview]);

  useEffect(() => {
    const loadWorkers = async () => {
      try {
        const workersQuery = query(
          collection(db, "users"),
          where("role", "==", "worker"),
          where("deactivated", "==", false),
        );
        const snapshot = await getDocs(workersQuery);
        const loadedWorkers = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setWorkers(loadedWorkers);
      } catch (error) {
        console.error("Failed to load workers:", error);
      }
    };

    if (displayDetails) {
      loadWorkers();
    }
  }, [displayDetails]);

  useEffect(() => {
    if (!displayDetails || !currentReport || currentReport.length === 0) return;
    const report = currentReport[0];
    if (!report.feedback) return;
    if (!report.feedbackViewedBy?.includes(user?.ID)) {
      updateDoc(doc(db, "reports", report.id), {
        feedbackViewedBy: arrayUnion(user?.ID),
      }).catch((err) => console.error("feedbackViewedBy update failed:", err));
    }
  }, [displayDetails, currentReport]);

  // Images live in a separate reportImages/{reportId} doc so list-view
  // snapshots on `reports` never download photo payloads — they're only
  // fetched here, once, when this detail panel opens.
  const [reportImagesData, setReportImagesData] = useState(null);

  useEffect(() => {
    if (!displayDetails || !currentReport || currentReport.length === 0) {
      setReportImagesData(null);
      return;
    }
    const reportId = currentReport[0].id;
    let cancelled = false;
    getDoc(doc(db, "reportImages", reportId))
      .then((snap) => {
        if (!cancelled) setReportImagesData(snap.exists() ? snap.data() : {});
      })
      .catch((err) => {
        console.error("Failed to load report images:", err);
        if (!cancelled) setReportImagesData({});
      });
    return () => {
      cancelled = true;
    };
  }, [displayDetails, currentReport]);

  // ── Auto-scroll to the section the viewer is expected to act on next ──
  useEffect(() => {
    if (!displayDetails || !currentReport || currentReport.length === 0) return;
    const rep = currentReport[0];

    const t = setTimeout(() => {
      const target = getScrollTarget(user, rep, {
        feedback: feedbackRef,
        approveDeny: approveDenyRef,
        addMaterials: addMaterialsRef,
        confirmCost: confirmCostRef,
        markProcured: markProcuredRef,
        assignWorker: assignWorkerRef,
        submitCost: submitCostRef,
        acceptReject: acceptRejectRef,
        completeWork: completeWorkRef,
        dropJob: dropJobRef,
      });

      if (target?.current) {
        target.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (panelRef.current) {
        panelRef.current.scrollTo({ top: 0, behavior: "auto" });
      }
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayDetails, currentReport?.[0]?.id, currentReport?.[0]?.status]);

  if (!visible || !currentReport || currentReport.length === 0) return null;

  const report = currentReport[0];
  const assignedWorker = workers.find((w) => w.ID === report.assignedTo);
  const timelineEntries = buildTimelineEntries(report);

  const handleApprove = async () => {
    if (!canUserApprove(user, report)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "approved",
        dateApproved: serverTimestamp(),
      });
      alert("Report approved!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
      notifyOnStatusChange("incoming", "approved", report);
    } catch (error) {
      console.error("Error approving report:", error);
      alert("Failed to approve report");
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!canUserApprove(user, report)) return;
    const reason = formData.note.trim();
    if (!reason) {
      alert("Please provide a reason for denying this report.");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "denied",
        // NOTE: this MUST be a plain `new Date()`, not serverTimestamp() —
        // Firestore rejects serverTimestamp() sentinels inside array
        // elements passed to arrayUnion().
        notes: arrayUnion({
          type: "denial",
          content: reason,
          date: new Date(),
          by: user?.name || user?.role || "",
        }),
      });
      alert("Report denied!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
      notifyOnStatusChange("incoming", "denied", report);
    } catch (error) {
      console.error("Error denying report:", error);
      alert("Failed to deny report");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMaterials = async () => {
    if (!canUserAddCost(user, report)) return;
    const validMaterials = materials.filter((m) => m.description.trim());
    if (validMaterials.length === 0) {
      alert("Please add at least one material item");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        materials: validMaterials,
        status: "pending",
        dateCostAdded: serverTimestamp(),
      });
      alert("Materials submitted for admin confirmation!");
      setMaterials([{ ...EMPTY_MATERIAL }]);
      setDisplayDetails(false);
      notifyOnStatusChange(report.status, "pending", report);
    } catch (error) {
      console.error("Error adding materials:", error);
      alert("Failed to submit materials");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCost = async () => {
    if (!canUserConfirmCost(user, report)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "confirmed",
        dateConfirmed: serverTimestamp(),
      });
      alert("Materials confirmed!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
      notifyOnStatusChange("pending", "confirmed", report);
    } catch (error) {
      console.error("Error confirming materials:", error);
      alert("Failed to confirm materials");
    } finally {
      setLoading(false);
    }
  };

  const handleDenyCost = async () => {
    if (!canUserConfirmCost(user, report)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "costDenied",
        dateCostDenied: serverTimestamp(),
      });
      alert("Materials denied!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
      notifyOnStatusChange("pending", "costDenied", report);
    } catch (error) {
      console.error("Error denying materials:", error);
      alert("Failed to deny materials");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkProcured = async () => {
    if (!canUserMarkProcured(user, report)) return;
    const parsed = parseFloat(procurementCost);
    if (!procurementCost || isNaN(parsed) || parsed <= 0) {
      alert("Please enter a valid cost amount");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "procured",
        cost: parsed,
        dateProcured: serverTimestamp(),
      });
      alert("Materials marked as procured!");
      setProcurementCost("");
      setDisplayDetails(false);
      notifyOnStatusChange("confirmed", "procured", report);
    } catch (error) {
      console.error("Error marking procured:", error);
      alert("Failed to mark as procured");
    } finally {
      setLoading(false);
    }
  };

  const handleAssignWorker = async () => {
    if (!canUserAssignWorker(user, report)) return;
    if (!formData.selectedWorker) {
      alert("Please select a worker");
      return;
    }
    setLoading(true);
    try {
      // If the report already has (or previously had) an assigned worker
      // — e.g. that worker rejected/dropped the job, or staff reopened a
      // completed report — this is a reassignment rather than a first-time
      // assignment. `droppedBy` is checked too because dropping clears
      // `assignedTo` back to null.
      const isReassignment =
        Boolean(report.assignedTo) || Boolean(report.droppedBy);

      const updatePayload = {
        assignedTo: formData.selectedWorker,
        status: "assigned",
        ...(isReassignment
          ? { dateReAssigned: serverTimestamp() }
          : { dateAssigned: serverTimestamp() }),
      };

      if (formData.instructions.trim()) {
        updatePayload.instructions = formData.instructions.trim();
      }

      await updateDoc(doc(db, "reports", report.id), updatePayload);

      const msg =
        report.status === "approved"
          ? "Work assigned directly (no materials required)!"
          : isReassignment
            ? "Work reassigned to worker!"
            : "Work assigned to worker!";
      alert(msg);
      setFormData({ ...formData, selectedWorker: "", instructions: "" });
      setDisplayDetails(false);
      notifyOnStatusChange(report.status, "assigned", {
        ...report,
        assignedTo: formData.selectedWorker,
      });
    } catch (error) {
      console.error("Error assigning worker:", error);
      alert("Failed to assign worker");
    } finally {
      setLoading(false);
    }
  };

  const handleAddInstructions = async () => {
    if (!formData.instructions.trim()) {
      alert("Please enter instructions");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        instructions: formData.instructions.trim(),
      });
      alert("Instructions saved!");
      setFormData({ ...formData, instructions: "" });
    } catch (error) {
      console.error("Error adding instructions:", error);
      alert("Failed to add instructions");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCost = async () => {
    if (!canUserSubmitCost(user, report)) return;
    const parsed = parseFloat(actualCost);
    if (!actualCost || isNaN(parsed) || parsed <= 0) {
      alert("Please enter a valid cost amount");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        maintenanceCost: parsed,
        dateMaintenanceCostAdded: serverTimestamp(),
      });
      alert("Maintenance cost submitted successfully!");
      setActualCost("");
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error submitting maintenance cost:", error);
      alert("Failed to submit maintenance cost");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptJob = async () => {
    if (!canUserAcceptOrRejectJob(user, report)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "accepted",
        dateAccepted: serverTimestamp(),
      });
      alert("Job accepted!");
      setDisplayDetails(false);
      notifyOnStatusChange("assigned", "accepted", report);
    } catch (error) {
      console.error("Error accepting job:", error);
      alert("Failed to accept job");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectJob = async () => {
    if (!canUserAcceptOrRejectJob(user, report)) return;
    const reason = rejectReason.trim();
    if (!reason) {
      alert("Please provide a reason for rejecting this job.");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "rejected",
        rejectReason: reason,
        rejectedBy: user?.name || user?.role || "",
        dateRejected: serverTimestamp(),
      });
      alert("Job rejected.");
      setRejectReason("");
      setDisplayDetails(false);
      notifyOnStatusChange("assigned", "rejected", report);
    } catch (error) {
      console.error("Error rejecting job:", error);
      alert("Failed to reject job");
    } finally {
      setLoading(false);
    }
  };

  const handleDropWork = async () => {
    if (!canUserDropJob(user, report)) return;
    const reason = dropReason.trim();
    if (!reason) {
      alert("Please provide a reason for dropping this job.");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "dropped",
        assignedTo: null,
        dropReason: reason,
        droppedBy: user?.name || user?.role || "",
        dateDropped: serverTimestamp(),
      });
      alert("Job dropped. It's been returned to Estate for reassignment.");
      setDropReason("");
      setDisplayDetails(false);
      notifyOnStatusChange(report.status, "dropped", report);
    } catch (error) {
      console.error("Error dropping job:", error);
      alert("Failed to drop job");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitMaintenanceCost = async () => {
    if (!canUserSubmitCost(user, report)) return;
    const cost = parseFloat(maintenanceCost);
    if (isNaN(cost) || cost < 0) {
      alert("Please enter a valid cost");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        maintenanceCost: cost,
        dateMaintenanceCostAdded: serverTimestamp(),
      });
      alert("Maintenance cost submitted!");
      setMaintenanceCost("");
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error submitting cost:", error);
      alert("Failed to submit cost");
    } finally {
      setLoading(false);
    }
  };

  const handleCompletionImageChange = (file) => {
    if (completionImagePreview) URL.revokeObjectURL(completionImagePreview);
    setCompletionImage(file);
    setCompletionImagePreview(URL.createObjectURL(file));
    setUploadError("");
  };

  const handleCompleteWork = async () => {
    if (!canUserComplete(user, report)) return;
    if (!completionImage) {
      alert("Please take or upload a completion photo before marking as done");
      return;
    }

    setLoading(true);
    setUploadError("");

    try {
      const base64Image = await compressImageToBase64(completionImage);

      // Write the photo FIRST, while the report is still 'accepted' or
      // 'reopened' — the reportImages security rule checks the report's
      // current status, so this must happen before the report itself
      // flips to 'completed' below.
      await setDoc(
        doc(db, "reportImages", report.id),
        { completionImage: base64Image },
        { merge: true },
      );

      await updateDoc(doc(db, "reports", report.id), {
        status: "completed",
        dateCompleted: serverTimestamp(),
      });

      alert("Work marked as completed!");
      setDisplayDetails(false);
      notifyOnStatusChange(report.status, "completed", report);
    } catch (error) {
      console.error("Error completing work:", error);
      const msg = error.message || "Failed to complete work";
      setUploadError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReport = async () => {
    if (
      user?.role !== "staff" ||
      report?.reporterId !== user?.ID ||
      report?.status !== "incoming"
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to cancel this report? This will permanently delete it from Firestore.",
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      // Clean up the orphaned image doc first — the rule needs the report
      // to still exist (to check ownership/status), so it must be deleted
      // before the report itself.
      try {
        await deleteDoc(doc(db, "reportImages", report.id));
      } catch (imgError) {
        console.warn("No report image to delete (or delete failed):", imgError);
      }
      await deleteDoc(doc(db, "reports", report.id));
      alert("Report cancelled and removed successfully.");
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error cancelling report:", error);
      alert("Failed to cancel report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!canUserSendFeedback(user, report)) return;
    if (!formData.feedback) {
      alert("Please enter feedback");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        feedback: formData.feedback,
        feedbackDate: serverTimestamp(),
      });
      alert("Feedback submitted!");
      setFormData({ ...formData, feedback: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error sending feedback:", error);
      alert("Failed to send feedback");
    } finally {
      setLoading(false);
    }
  };

  const showCostSummary =
    (report.cost != null || report.maintenanceCost != null) &&
    ["admin", "estate"].includes(user?.role);

  const showMaterials =
    Array.isArray(report.materials) &&
    report.materials.length > 0 &&
    ["admin", "estate", "procurement"].includes(user.role);

  return (
    <div
      ref={panelRef}
      className={`fixed top-0 md:top-[10%] pt-18 md:pt-0 pb-24 md:pb-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden right-0 w-full md:max-w-[700px] h-screen md:max-h-[80%] md:right-5 md:rounded-xl ${reportDetailsBgColor} z-80 md:shadow-xl ${theme.detailsBg} overflow-y-auto ${
        closing ? "slide-out-right" : "slide-in-right"
      }`}
    >
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* Sticky header: status + priority always visible while scrolling */}
      <div className="sticky top-0 z-10 backdrop-blur bg-white/90 border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <StatusBadge status={report.status} />
          <PriorityBadge level={report.priorityLevel} />
        </div>
        <button
          onClick={() => setDisplayDetails(false)}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-lg font-bold"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col px-6 py-6 gap-5">
        {/* Overview */}
        <SectionCard title="Report Overview">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <InfoItem label="Sent By">{report.reporter}</InfoItem>
            <InfoItem label="Date Sent">{formatDate(report.dateSent)}</InfoItem>
            <InfoItem label="Category">{report.category}</InfoItem>
            {report.reportsThisMonth != null && (
              <InfoItem label="Reports This Month">
                {report.reportsThisMonth}
              </InfoItem>
            )}
            <InfoItem label="Location">{report.location}</InfoItem>
            <InfoItem label="Sender Contact">
              <PhoneCallButton
                phoneNumber={report.reporterContact}
                label={report.reporter}
              />
            </InfoItem>
            {report.assignedTo && ["admin", "estate"].includes(user?.role) && (
              <InfoItem label="Technician">
                <PhoneCallButton
                  phoneNumber={assignedWorker?.phoneNumber}
                  label={assignedWorker?.name}
                />
              </InfoItem>
            )}
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Description
            </span>
            <p className="text-sm md:text-base text-gray-800 mt-1 whitespace-pre-wrap">
              {report.reportDescription}
            </p>
          </div>

          {report.instructions && user?.role !== "staff" && (
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Instructions
              </span>
              <p className="text-sm md:text-base text-gray-800 mt-1 whitespace-pre-wrap">
                {report.instructions}
              </p>
            </div>
          )}

          {reportImagesData?.image && (
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Attached Image
              </span>
              <img
                src={reportImagesData.image}
                alt="Report attachment"
                onClick={() => setLightboxSrc(reportImagesData.image)}
                className="mt-1 w-full max-h-72 object-contain rounded-xl border border-gray-200 cursor-zoom-in"
              />
            </div>
          )}
        </SectionCard>

        {/* Unified activity timeline — replaces the old wall of individual
            "Date X" rows and standalone reject/drop/reopen reason boxes. */}
        {timelineEntries.length > 0 && (
          <SectionCard title="Activity">
            <Timeline entries={timelineEntries} />
          </SectionCard>
        )}

        {/* Materials & cost */}
        {(showMaterials || showCostSummary) && (
          <SectionCard title="Materials & Cost">
            {showMaterials && (
              <MaterialsTable
                materials={report.materials}
                onChange={() => {}}
                readOnly
              />
            )}
            {showCostSummary && (
              <div className="pt-1 space-y-1 border-t border-gray-100 mt-1">
                {report.cost != null && (
                  <p className="text-sm text-gray-600">
                    Materials cost: ₵{Number(report.cost).toLocaleString()}
                  </p>
                )}
                {report.maintenanceCost != null && (
                  <p className="text-sm text-gray-600">
                    Maintenance cost: ₵
                    {Number(report.maintenanceCost).toLocaleString()}
                  </p>
                )}
                <p className="font-semibold text-gray-900">
                  Total: ₵{getTotalCost(report).toLocaleString()}
                </p>
              </div>
            )}
          </SectionCard>
        )}

        {/* Feedback — kept as its own prominent card since it's the
            scroll target for "you have unread feedback". */}
        {report.feedback && (
          <SectionCard title="Feedback" innerRef={feedbackRef}>
            <p className="text-sm md:text-base text-gray-800 whitespace-pre-wrap">
              {report.feedback}
            </p>
            {report.technicianRating && (
              <div className="pt-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 block mb-1">
                  Technician Rating
                </span>
                <StarRating
                  value={report.technicianRating}
                  readOnly
                  size="text-xl"
                />
              </div>
            )}
          </SectionCard>
        )}

        {reportImagesData?.completionImage && (
          <SectionCard title="Completion Photo">
            <img
              src={reportImagesData.completionImage}
              alt="Completed work"
              onClick={() => setLightboxSrc(reportImagesData.completionImage)}
              className="w-full max-h-72 object-contain rounded-xl border border-gray-200 cursor-zoom-in"
            />
          </SectionCard>
        )}

        {/* ── Actions ─────────────────────────────────────────────────── */}
        {(canUserApprove(user, report) ||
          canUserAddCost(user, report) ||
          canUserConfirmCost(user, report) ||
          canUserMarkProcured(user, report) ||
          canUserAssignWorker(user, report) ||
          canUserSubmitCost(user, report) ||
          canUserAcceptOrRejectJob(user, report) ||
          canUserDropJob(user, report) ||
          canUserComplete(user, report) ||
          canUserSendFeedback(user, report) ||
          (user?.role === "staff" &&
            report?.reporterId === user?.ID &&
            report?.status === "incoming")) && (
          <div className="pt-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Action Needed
            </h2>
            <div className="space-y-4">
              {/* ADMIN — Approve/Deny */}
              {canUserApprove(user, report) && (
                <ActionSection
                  innerRef={approveDenyRef}
                  title="Approve or Deny"
                  hint="A reason is required to deny — it will be shown to the reporter."
                >
                  <textarea
                    placeholder="Add a note… (required if denying)"
                    value={formData.note}
                    onChange={(e) =>
                      setFormData({ ...formData, note: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                    rows="3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeny}
                      disabled={loading}
                      className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg flex-1"
                    >
                      {loading ? "Processing..." : "Deny"}
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={loading}
                      className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg flex-1"
                    >
                      {loading ? "Processing..." : "Approve"}
                    </button>
                  </div>
                </ActionSection>
              )}

              {/* ESTATE — Add / Resubmit Materials */}
              {canUserAddCost(user, report) && (
                <ActionSection
                  innerRef={addMaterialsRef}
                  title={
                    report.status === "costDenied"
                      ? "Resubmit Materials"
                      : "Add Materials"
                  }
                  hint={
                    report.status === "approved"
                      ? "If no materials are needed, skip this and use Assign Worker below."
                      : report.status === "costDenied"
                        ? "Your previous submission was denied — review and resubmit."
                        : undefined
                  }
                >
                  <MaterialsTable
                    materials={materials}
                    onChange={setMaterials}
                  />
                  <button
                    onClick={handleAddMaterials}
                    disabled={loading}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg w-full"
                  >
                    {loading
                      ? "Processing..."
                      : "Submit for Admin Confirmation"}
                  </button>
                </ActionSection>
              )}

              {/* ADMIN — Confirm/Deny Materials */}
              {canUserConfirmCost(user, report) && (
                <ActionSection
                  innerRef={confirmCostRef}
                  title="Review & Confirm Materials"
                >
                  {Array.isArray(report.materials) &&
                    report.materials.length > 0 && (
                      <MaterialsTable
                        materials={report.materials}
                        onChange={() => {}}
                        readOnly
                      />
                    )}
                  <textarea
                    placeholder="Add optional note for estate..."
                    value={formData.note}
                    onChange={(e) =>
                      setFormData({ ...formData, note: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                    rows="3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDenyCost}
                      disabled={loading}
                      className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg flex-1"
                    >
                      {loading ? "Processing..." : "Deny"}
                    </button>
                    <button
                      onClick={handleConfirmCost}
                      disabled={loading}
                      className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg flex-1"
                    >
                      {loading ? "Processing..." : "Confirm"}
                    </button>
                  </div>
                </ActionSection>
              )}

              {/* PROCUREMENT — Purchase Materials */}
              {canUserMarkProcured(user, report) && (
                <ActionSection
                  innerRef={markProcuredRef}
                  title="Purchase Materials"
                >
                  {Array.isArray(report.materials) &&
                    report.materials.length > 0 && (
                      <MaterialsTable
                        materials={report.materials}
                        onChange={() => {}}
                        readOnly
                      />
                    )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cost of Materials (₵)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 450.00"
                      value={procurementCost}
                      onChange={(e) => setProcurementCost(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <button
                    onClick={handleMarkProcured}
                    disabled={loading}
                    className="bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg w-full"
                  >
                    {loading ? "Processing..." : "Mark as Procured"}
                  </button>
                </ActionSection>
              )}

              {/* ESTATE — Assign / Reassign Worker */}
              {canUserAssignWorker(user, report) && (
                <ActionSection
                  innerRef={assignWorkerRef}
                  title="Assign Worker"
                  hint={
                    report.status === "dropped"
                      ? "This job was dropped by the previous worker — see the Activity log above for the reason."
                      : undefined
                  }
                >
                  <label className="block text-sm font-medium text-gray-700">
                    Select a registered worker
                  </label>
                  <select
                    value={formData.selectedWorker}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        selectedWorker: e.target.value,
                      })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Choose worker</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.ID || worker.id}>
                        {worker.name}{" "}
                        {worker.profession ? `(${worker.profession})` : ""}
                      </option>
                    ))}
                  </select>
                  {workers.length === 0 && (
                    <p className="text-sm text-gray-500">
                      No registered workers found. Please add workers first.
                    </p>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Instructions{" "}
                      <span className="text-gray-400 font-normal">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      placeholder="Add work instructions for the worker..."
                      value={formData.instructions}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          instructions: e.target.value,
                        })
                      }
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      rows="4"
                    />
                  </div>

                  <button
                    onClick={handleAssignWorker}
                    disabled={loading || !formData.selectedWorker}
                    className={`font-semibold py-2 px-4 rounded-lg w-full text-white transition ${
                      loading || !formData.selectedWorker
                        ? "bg-purple-300 cursor-not-allowed"
                        : "bg-purple-500 hover:bg-purple-600 cursor-pointer"
                    }`}
                  >
                    {loading ? "Processing..." : "Assign Worker"}
                  </button>

                  {report.assignedTo && (
                    <div className="pt-3 border-t border-gray-100 space-y-2">
                      <h4 className="font-semibold text-gray-800 text-sm">
                        Update Instructions
                      </h4>
                      <textarea
                        placeholder="Replace or add new instructions for the worker..."
                        value={formData.instructions}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            instructions: e.target.value,
                          })
                        }
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                        rows="4"
                      />
                      <button
                        onClick={handleAddInstructions}
                        disabled={loading}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg w-full"
                      >
                        {loading ? "Processing..." : "Save Instructions"}
                      </button>
                    </div>
                  )}
                </ActionSection>
              )}

              {/* ESTATE — Submit Maintenance Cost */}
              {canUserSubmitCost(user, report) && (
                <ActionSection
                  innerRef={submitCostRef}
                  title="Submit Maintenance Cost"
                  hint="This is added to the materials cost for the total."
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maintenance Cost (₵)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 150.00"
                      value={actualCost}
                      onChange={(e) => setActualCost(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <button
                    onClick={handleSubmitCost}
                    disabled={loading}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 px-4 rounded-lg w-full"
                  >
                    {loading ? "Submitting..." : "Submit Maintenance Cost"}
                  </button>
                </ActionSection>
              )}

              {/* WORKER — Accept / Reject */}
              {canUserAcceptOrRejectJob(user, report) && (
                <ActionSection
                  innerRef={acceptRejectRef}
                  title="Respond to Assignment"
                >
                  {report.instructions && (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                      <span className="font-semibold">Instructions: </span>
                      {report.instructions}
                    </div>
                  )}
                  <textarea
                    placeholder="Reason for rejecting this job (required)..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                    rows="3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleRejectJob}
                      disabled={loading || !rejectReason.trim()}
                      className={`font-semibold py-2 px-4 rounded-lg flex-1 text-white transition ${
                        loading || !rejectReason.trim()
                          ? "bg-red-300 cursor-not-allowed"
                          : "bg-red-500 hover:bg-red-600 cursor-pointer"
                      }`}
                    >
                      {loading ? "Processing..." : "Reject Job"}
                    </button>
                    <button
                      onClick={handleAcceptJob}
                      disabled={loading}
                      className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg flex-1"
                    >
                      {loading ? "Processing..." : "Accept Job"}
                    </button>
                  </div>
                </ActionSection>
              )}

              {/* WORKER — Drop Job */}
              {canUserDropJob(user, report) && (
                <ActionSection
                  innerRef={dropJobRef}
                  title="Drop Job"
                  hint="If you can't complete this job, dropping it returns it to Estate for reassignment."
                >
                  <textarea
                    placeholder="Reason for dropping this job (required)..."
                    value={dropReason}
                    onChange={(e) => setDropReason(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                    rows="3"
                  />
                  <button
                    onClick={handleDropWork}
                    disabled={loading || !dropReason.trim()}
                    className={`font-semibold py-2 px-4 rounded-lg w-full text-white transition ${
                      loading || !dropReason.trim()
                        ? "bg-orange-300 cursor-not-allowed"
                        : "bg-orange-600 hover:bg-orange-700 cursor-pointer"
                    }`}
                  >
                    {loading ? "Processing..." : "Drop Job"}
                  </button>
                </ActionSection>
              )}

              {/* WORKER — Complete Work */}
              {canUserComplete(user, report) && (
                <ActionSection innerRef={completeWorkRef} title="Complete Work">
                  <CompletionImageUploader
                    preview={completionImagePreview}
                    onChange={handleCompletionImageChange}
                  />
                  {uploadError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      ⚠ {uploadError}
                    </p>
                  )}
                  <button
                    onClick={handleCompleteWork}
                    disabled={loading || !completionImage}
                    className={`font-semibold py-2 px-4 rounded-lg w-full text-white transition ${
                      loading || !completionImage
                        ? "bg-green-300 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 cursor-pointer"
                    }`}
                  >
                    {loading ? "Processing..." : "Mark Work as Completed"}
                  </button>
                </ActionSection>
              )}

              {/* STAFF — Cancel Incoming Report */}
              {user?.role === "staff" &&
                report?.reporterId === user?.ID &&
                report?.status === "incoming" && (
                  <ActionSection
                    title="Cancel Report"
                    hint="Only available while the report is still incoming. This permanently deletes it."
                  >
                    <button
                      onClick={handleCancelReport}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg w-full"
                    >
                      {loading ? "Processing..." : "Cancel Report"}
                    </button>
                  </ActionSection>
                )}

              {/* STAFF — Send Feedback */}
              {canUserSendFeedback(user, report) && (
                <ActionSection innerRef={sendFeedbackRef} title="Send Feedback">
                  <textarea
                    placeholder="Enter your feedback about the completed work..."
                    value={formData.feedback}
                    onChange={(e) =>
                      setFormData({ ...formData, feedback: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                    rows="4"
                  />
                  <button
                    onClick={handleSendFeedback}
                    disabled={loading}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg w-full"
                  >
                    {loading ? "Processing..." : "Submit Feedback"}
                  </button>
                </ActionSection>
              )}
            </div>
          </div>
        )}

        {/* Download PDF — kept separate, always at the bottom */}
        {canUserDownloadPDF(user, report) && (
          <button
            onClick={() => {
              const workerName =
                assignedWorker?.name || report.assignedTo || "";
              const workerPhone = assignedWorker?.phoneNumber || "";
              const estateManagerName = user?.name || "";
              const estateManagerPhone = user?.phoneNumber || "";
              generatePDFReport(
                report,
                workerName,
                workerPhone,
                estateManagerName,
                estateManagerPhone,
              );
            }}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-lg w-full"
          >
            Download Report (PDF)
          </button>
        )}
      </div>
    </div>
  );
}
