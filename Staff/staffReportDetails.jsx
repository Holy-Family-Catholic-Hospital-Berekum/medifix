import { useState, useEffect, useRef } from "react";
import { notifyOnStatusChange } from "../src/notifications/notifyOnStatusChange";
import {
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate, canUserSendFeedback } from "../src/utils";
import PhoneCallButton from "../components/phoneCallButton";

const ORANGE = "#FF8825";
const INK = "#231F1A";
const INK_MUTED = "#7A7267";
const PAPER = "#FBF7F0";
const RULE = "#E8E1D3";
const RESOLVED_GREEN = "#2F7D4F";
const REOPENED_AMBER = "#B4740E";
const DENIED_RED = "#B42318";
const GOLD = "#D9A404";
const EXTERNAL_INDIGO = "#4338CA";
const EXTERNAL_INDIGO_BG = "#EEF2FF";

const FONTS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

  .srd-root { font-family: 'DM Sans', sans-serif; }
  .srd-serif { font-family: 'Fraunces', serif; }
  .srd-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }

  .srd-btn:focus-visible,
  .srd-input:focus-visible {
    outline: 2px solid ${ORANGE};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .srd-root, .srd-root * { transition: none !important; }
  }
`;

// Denial reasons live in the report's `notes` array (alerts were being
// written but never really read anywhere useful, so they were dropped from
// the flow). A note entry looks like:
// { type: "denial", content: "<reason>", date: <JS Date>, by: "<name>" }
function getDenialInfo(report) {
  if (!report || report.status !== "denied") return null;
  const denialNotes = (report.notes || []).filter((n) => n?.type === "denial");
  if (!denialNotes.length) return null;
  const last = denialNotes[denialNotes.length - 1];
  return { content: last.content, date: last.date };
}

// Colors per timeline milestone — matched to what the app already uses
// elsewhere for these outcomes (orange = awaiting your feedback, amber =
// reopened, green = closed/resolved, red = denied, muted = routine
// administrative step).
const TIMELINE_COLORS = {
  dateSent: INK_MUTED,
  dateApproved: INK_MUTED,
  denied: DENIED_RED,
  dateConfirmed: INK_MUTED,
  dateAssigned: INK_MUTED,
  dateReAssigned: INK_MUTED,
  dateAccepted: INK_MUTED,
  dateCompleted: ORANGE,
  dateReopened: REOPENED_AMBER,
  dateClosed: RESOLVED_GREEN,
};

// Builds the report's timeline from whatever date fields are present, then
// sorts by the actual timestamp rather than a fixed field order. This
// matters once a report has been reopened and reassigned: dateReAssigned
// and dateCompleted get overwritten on each new cycle, so a fixed display
// order can no longer be trusted to reflect what really happened when —
// sorting by the real date fixes that instead of just reordering rows.
function buildTimeline(report, denialInfo) {
  const raw = [
    {
      key: "dateSent",
      label: "Report Sent",
      icon: "send",
      date: report.dateSent,
    },
    {
      key: "dateApproved",
      label: "Approved",
      icon: "check_circle",
      date: report.dateApproved,
    },
    {
      key: "denied",
      label: "Denied",
      icon: "block",
      date: denialInfo?.date,
      note: denialInfo?.content,
    },
    {
      key: "dateConfirmed",
      label: "Materials Confirmed",
      icon: "inventory_2",
      date: report.dateConfirmed,
    },
    {
      key: "dateAssigned",
      label: "Assigned",
      icon: "engineering",
      date: report.dateAssigned,
    },
    {
      key: "dateReAssigned",
      label: "Re-Assigned",
      icon: "sync_alt",
      date: report.dateReAssigned,
    },
    {
      // Fires for internal jobs once the worker taps Accept, and for
      // external jobs at the same moment they're assigned (there's no
      // worker account to confirm through, so acceptance is immediate).
      key: "dateAccepted",
      label: "Accepted",
      icon: "task_alt",
      date: report.dateAccepted,
    },
    {
      key: "dateCompleted",
      label: "Completed",
      icon: "task_alt",
      date: report.dateCompleted,
    },
    {
      key: "dateReopened",
      label: "Reopened",
      icon: "restart_alt",
      date: report.dateReopened,
      note: report.reopenReason,
    },
    {
      key: "dateClosed",
      label: "Closed",
      icon: "lock",
      date: report.dateClosed,
    },
  ];

  return raw
    .filter((e) => e.date)
    .map((e) => ({
      ...e,
      ts: e.date?.toDate ? e.date.toDate() : new Date(e.date),
      color: TIMELINE_COLORS[e.key] || INK_MUTED,
    }))
    .sort((a, b) => a.ts - b.ts);
}

const STATUS_META = {
  accepted: { label: "Accepted", bg: "#E0F2FE", text: "#0369A1" },
  completed: { label: "Completed", bg: "#FFF3E6", text: ORANGE },
  closed: { label: "Closed", bg: "#EAF3EC", text: RESOLVED_GREEN },
  reopened: { label: "Reopened", bg: "#FBEEDD", text: REOPENED_AMBER },
  denied: { label: "Denied", bg: "#FBEAEA", text: DENIED_RED },
};

const PRIORITY_META = {
  emergency: { text: "#B42318", dot: "#EF4444" },
  urgent: { text: "#B45309", dot: "#F97316" },
  routine: { text: "#166534", dot: "#22C55E" },
};

// Staff only get one actionable section in this panel: giving feedback on
// a completed job. Scroll to it only if they haven't already given
// feedback — once given, the panel just shows their own past input, which
// doesn't need to be jumped to (they already know what they wrote).
function getStaffScrollTarget(report, refs) {
  if (!report) return null;
  if (report.status === "completed" && !report.feedback) {
    return refs.feedbackForm;
  }
  return null;
}

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
            }`}
            style={{ color: filled ? GOLD : "#D9D2C3" }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

export default function StaffReportDetails({
  displayDetails,
  setDisplayDetails,
  currentReport,
  onFeedbackSent, // <-- called after successful submission
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [assignedWorker, setAssignedWorker] = useState(null);
  const [loadingWorker, setLoadingWorker] = useState(false);
  const [rating, setRating] = useState(0);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  // ── Auto-scroll refs ──────────────────────────────────────────────────
  const panelRef = useRef(null);
  const feedbackFormRef = useRef(null);

  useEffect(() => {
    if (displayDetails) {
      setVisible(true);
      setClosing(false);
      setRating(0);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [displayDetails]);

  // Fetch the assigned technician's contact info so it can be shown here —
  // this component doesn't otherwise have access to the workers list.
  // Only relevant for internal jobs — external jobs carry their
  // technician's contact details directly on the report
  // (report.externalTechnician), so there's nothing to fetch for those.
  useEffect(() => {
    const report = currentReport?.[0];
    const assignedTo = report?.assignedTo;
    if (!displayDetails || !assignedTo || report?.serviceType === "external") {
      setAssignedWorker(null);
      setLoadingWorker(false);
      return;
    }

    let cancelled = false;
    setLoadingWorker(true);
    const loadWorker = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users"),
            where("ID", "==", assignedTo),
            limit(1),
          ),
        );
        if (!cancelled) {
          setAssignedWorker(snap.empty ? null : snap.docs[0].data());
        }
      } catch (err) {
        console.error("Failed to load assigned technician:", err);
        if (!cancelled) setAssignedWorker(null);
      } finally {
        if (!cancelled) setLoadingWorker(false);
      }
    };

    loadWorker();
    return () => {
      cancelled = true;
    };
  }, [displayDetails, currentReport]);

  // Images live in a separate reportImages/{reportId} doc so list-view
  // snapshots on `reports` never download photo payloads — they're only
  // fetched here, once, when this detail panel opens.
  const [reportImagesData, setReportImagesData] = useState(null);

  useEffect(() => {
    const reportId = currentReport?.[0]?.id;
    if (!displayDetails || !reportId) {
      setReportImagesData(null);
      return;
    }
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

  // ── Auto-scroll to the feedback form when opening a completed report
  // that doesn't have feedback yet. See getStaffScrollTarget above.
  useEffect(() => {
    if (!displayDetails || !currentReport || currentReport.length === 0) return;
    const rep = currentReport[0];

    const t = setTimeout(() => {
      const target = getStaffScrollTarget(rep, {
        feedbackForm: feedbackFormRef,
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
  const denialInfo = getDenialInfo(report);
  const timeline = buildTimeline(report, denialInfo);
  const statusMeta = STATUS_META[report.status];
  const priorityMeta =
    PRIORITY_META[report.priorityLevel] || PRIORITY_META.routine;
  const isExternalTech = report.serviceType === "external";
  const hasTechnician = isExternalTech
    ? !!report.externalTechnician
    : !!report.assignedTo;

  const handleReopenReport = async () => {
    if (!canUserSendFeedback(user, report)) return; // same reporter/status gate as confirming
    if (!reopenReason.trim()) {
      alert(
        "Please describe what's still wrong so the Estate Manager can act on it.",
      );
      return;
    }
    const confirmed = window.confirm(
      "This will reopen the job and send it back to the Estate Manager for reassignment. Continue?",
    );
    if (!confirmed) return;

    setReopening(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "reopened",
        dateReopened: serverTimestamp(),
        reopenReason: reopenReason.trim(),
      });

      // Tell the parent the report moved out of "completed" so it can drop
      // it from the local list immediately instead of waiting for a refresh.
      onFeedbackSent?.(report.id, null, "reopened");

      setReopenReason("");
      setShowReopenForm(false);
      setDisplayDetails(false);
      notifyOnStatusChange("completed", "reopened", report);
    } catch (error) {
      console.error("Error reopening report:", error);
      alert("Failed to reopen report");
    } finally {
      setReopening(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!canUserSendFeedback(user, report)) return;
    if (!feedback.trim()) {
      alert("Please enter feedback");
      return;
    }
    if (!rating) {
      alert("Please rate the technician's work (1–5 stars)");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "closed",
        feedback: feedback.trim(),
        feedbackDate: serverTimestamp(),
        dateClosed: serverTimestamp(),
        technicianRating: rating,
        technicianRatingDate: serverTimestamp(),
      });

      onFeedbackSent?.(report.id, feedback.trim(), "closed");
      alert("Thanks for your feedback.");

      setFeedback("");
      setRating(0);
      setDisplayDetails(false);
      notifyOnStatusChange("completed", "closed", report);
    } catch (error) {
      console.error("Error sending feedback:", error);
      alert("Failed to send feedback");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className={`srd-root fixed top-0 md:top-[8%] py-24 md:py-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden right-0 w-full md:max-w-[720px] h-screen md:max-h-[86%] md:right-5 md:rounded-2xl border md:shadow-2xl overflow-y-auto z-80 ${
        closing ? "slide-out-right" : "slide-in-right"
      }`}
      style={{ background: PAPER, borderColor: RULE }}
    >
      <style>{FONTS_CSS}</style>

      {/* close button */}
      <button
        className="srd-btn fixed top-20 md:top-6 right-5 cursor-pointer rounded-full w-9 h-9 flex items-center justify-center transition-colors"
        style={{ background: INK, color: PAPER }}
        onClick={() => setDisplayDetails(false)}
        aria-label="Close report details"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>

      <div className="flex flex-col px-6 md:px-10 gap-8 pb-20">
        {/* ── Header ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: ORANGE }}
            />
            <span
              className="srd-mono text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: INK_MUTED }}
            >
              Case File · Ref #{report.id?.slice(-6).toUpperCase()}
            </span>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1
              className="srd-serif text-3xl md:text-4xl font-medium leading-tight"
              style={{ color: INK }}
            >
              {report.category}
            </h1>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {isExternalTech && (
                <span
                  className="text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full"
                  style={{
                    background: EXTERNAL_INDIGO_BG,
                    color: EXTERNAL_INDIGO,
                  }}
                >
                  External Technician
                </span>
              )}
              {statusMeta && (
                <span
                  className="text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full"
                  style={{ background: statusMeta.bg, color: statusMeta.text }}
                >
                  {statusMeta.label}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: priorityMeta.dot }}
            />
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: priorityMeta.text }}
            >
              {report.priorityLevel} priority
            </span>
          </div>
        </div>

        {/* ── Description ────────────────────────────────────── */}
        <div
          className="bg-white rounded-xl border p-5"
          style={{ borderColor: RULE }}
        >
          <p
            className="srd-mono text-[11px] font-semibold uppercase tracking-wide mb-2"
            style={{ color: INK_MUTED }}
          >
            Description
          </p>
          <p className="text-sm leading-relaxed" style={{ color: INK }}>
            {report.reportDescription}
          </p>
          {report.location && (
            <div
              className="flex items-center gap-1.5 text-xs mt-4 pt-4 border-t"
              style={{ color: INK_MUTED, borderColor: RULE }}
            >
              <span className="material-symbols-outlined text-[16px]">
                location_on
              </span>
              {report.location}
            </div>
          )}
        </div>

        {/* ── Timeline ───────────────────────────────────────── */}
        {timeline.length > 0 && (
          <div
            className="bg-white rounded-xl border p-5"
            style={{ borderColor: RULE }}
          >
            <p
              className="srd-mono text-[11px] font-semibold uppercase tracking-wide mb-5"
              style={{ color: INK_MUTED }}
            >
              Timeline
            </p>
            <div className="relative">
              <div
                className="absolute left-4 top-1 bottom-1 w-px"
                style={{ background: RULE }}
              />
              <div className="flex flex-col gap-6">
                {timeline.map((item) => (
                  <div key={item.key} className="relative flex gap-4">
                    <div
                      className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: PAPER,
                        border: `2px solid ${item.color}`,
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-[15px]"
                        style={{ color: item.color }}
                      >
                        {item.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 pt-1.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: INK }}
                        >
                          {item.label}
                        </span>
                        <span
                          className="srd-mono text-xs"
                          style={{ color: INK_MUTED }}
                        >
                          {formatDate(item.date)}
                        </span>
                      </div>
                      {item.note && (
                        <p
                          className="srd-serif italic text-sm mt-1.5 leading-relaxed"
                          style={{ color: INK_MUTED }}
                        >
                          "{item.note}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Technician — internal worker OR external technician ──── */}
        {hasTechnician && (
          <div
            className="bg-white rounded-xl border p-5"
            style={{ borderColor: RULE }}
          >
            <div className="flex items-center justify-between mb-3">
              <p
                className="srd-mono text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: INK_MUTED }}
              >
                Technician
              </p>
              {isExternalTech && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{
                    background: EXTERNAL_INDIGO_BG,
                    color: EXTERNAL_INDIGO,
                  }}
                >
                  External
                </span>
              )}
            </div>

            {isExternalTech ? (
              report.externalTechnician ? (
                <div>
                  <PhoneCallButton
                    phoneNumber={report.externalTechnician.phoneNumber}
                    label={report.externalTechnician.name}
                  />
                  {report.externalTechnician.profession && (
                    <p className="text-xs mt-1.5" style={{ color: INK_MUTED }}>
                      {report.externalTechnician.profession}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm italic" style={{ color: INK_MUTED }}>
                  No technician details on file
                </p>
              )
            ) : assignedWorker?.phoneNumber ? (
              <PhoneCallButton
                phoneNumber={assignedWorker.phoneNumber}
                label={assignedWorker.name}
              />
            ) : loadingWorker ? (
              <p className="text-sm italic" style={{ color: INK_MUTED }}>
                Loading technician…
              </p>
            ) : (
              <p className="text-sm italic" style={{ color: INK_MUTED }}>
                No contact number on file
              </p>
            )}
          </div>
        )}

        {/* ── Photos ─────────────────────────────────────────── */}
        {(reportImagesData?.image || reportImagesData?.completionImage) && (
          <div
            className="bg-white rounded-xl border p-5"
            style={{ borderColor: RULE }}
          >
            <p
              className="srd-mono text-[11px] font-semibold uppercase tracking-wide mb-4"
              style={{ color: INK_MUTED }}
            >
              Photos
            </p>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <span
                  className="srd-mono text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: INK_MUTED }}
                >
                  Before
                </span>
                {reportImagesData?.image ? (
                  <img
                    src={reportImagesData.image}
                    alt="Reported issue"
                    onClick={() =>
                      window.open(reportImagesData.image, "_blank")
                    }
                    className="w-full max-h-64 object-contain rounded-lg border cursor-pointer"
                    style={{ borderColor: RULE, background: PAPER }}
                  />
                ) : (
                  <div
                    className="w-full h-32 flex items-center justify-center rounded-lg border border-dashed text-xs gap-1.5"
                    style={{ borderColor: RULE, color: INK_MUTED }}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      image_not_supported
                    </span>
                    No image attached
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <span
                  className="srd-mono text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: INK_MUTED }}
                >
                  After
                </span>
                {reportImagesData?.completionImage ? (
                  <img
                    src={reportImagesData.completionImage}
                    alt="Completed work"
                    onClick={() =>
                      window.open(reportImagesData.completionImage, "_blank")
                    }
                    className="w-full max-h-64 object-contain rounded-lg border cursor-pointer"
                    style={{ borderColor: RULE, background: PAPER }}
                  />
                ) : (
                  <div
                    className="w-full h-32 flex items-center justify-center rounded-lg border border-dashed text-xs gap-1.5 text-center px-2"
                    style={{ borderColor: RULE, color: INK_MUTED }}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      image_not_supported
                    </span>
                    {report.status === "completed"
                      ? "No completion photo"
                      : "Not completed yet"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Existing feedback (read-only once submitted) ────── */}
        {report.feedback && (
          <div
            className="bg-white rounded-xl border p-5"
            style={{ borderColor: RULE }}
          >
            <p
              className="srd-mono text-[11px] font-semibold uppercase tracking-wide mb-3"
              style={{ color: INK_MUTED }}
            >
              Your Feedback
            </p>
            <p
              className="srd-serif italic text-base leading-relaxed"
              style={{ color: INK }}
            >
              "{report.feedback}"
            </p>
            {report.technicianRating && (
              <div
                className="flex items-center gap-2 mt-4 pt-4 border-t"
                style={{ borderColor: RULE }}
              >
                <span
                  className="srd-mono text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: INK_MUTED }}
                >
                  Your Rating
                </span>
                <StarRating
                  value={report.technicianRating}
                  readOnly
                  size="text-lg"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Feedback form — only shown if feedback not yet given ── */}
        {canUserSendFeedback(user, report) && (
          <div
            ref={feedbackFormRef}
            className="bg-white rounded-xl border p-5 space-y-4"
            style={{ borderColor: RULE }}
          >
            <div>
              <h3
                className="srd-serif text-lg font-semibold"
                style={{ color: INK }}
              >
                How did the work go?
              </h3>
              <p className="text-xs mt-1" style={{ color: INK_MUTED }}>
                Your feedback helps us improve maintenance quality.
              </p>
            </div>

            {!showReopenForm ? (
              <>
                <textarea
                  placeholder="Describe the quality of work done…"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="srd-input w-full p-3 border rounded-lg text-sm outline-none resize-none"
                  style={{ borderColor: RULE, color: INK }}
                  rows="4"
                />
                <div className="space-y-1.5">
                  <p
                    className="srd-mono text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: INK_MUTED }}
                  >
                    Rate the technician
                  </p>
                  <StarRating
                    value={rating}
                    onChange={setRating}
                    size="text-2xl"
                  />
                </div>
                <button
                  onClick={handleSendFeedback}
                  disabled={loading || !feedback.trim()}
                  className="srd-btn w-full py-2.5 rounded-lg font-bold text-sm transition"
                  style={{
                    background:
                      loading || !feedback.trim() ? "#F6C89A" : ORANGE,
                    color: "#fff",
                    cursor:
                      loading || !feedback.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Submitting…" : "Resolved — Submit Feedback"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowReopenForm(true)}
                  className="srd-btn w-full py-2.5 rounded-lg border font-bold text-sm transition"
                  style={{ borderColor: DENIED_RED, color: DENIED_RED }}
                >
                  Not satisfied? Reopen this job
                </button>
              </>
            ) : (
              <>
                <p
                  className="text-xs rounded-lg px-3 py-2"
                  style={{ background: PAPER, color: INK_MUTED }}
                >
                  This sends the report back to the Estate Manager for further
                  action or reassignment.
                </p>
                <textarea
                  placeholder="What's still wrong with the work?"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="srd-input w-full p-3 border rounded-lg text-sm outline-none resize-none"
                  style={{ borderColor: "#E8B8B0", color: INK }}
                  rows="4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReopenReport}
                    disabled={reopening || !reopenReason.trim()}
                    className="srd-btn flex-1 py-2.5 rounded-lg font-bold text-sm transition"
                    style={{
                      background:
                        reopening || !reopenReason.trim()
                          ? "#EBA9A2"
                          : DENIED_RED,
                      color: "#fff",
                      cursor:
                        reopening || !reopenReason.trim()
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {reopening ? "Reopening…" : "Reopen Job"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReopenForm(false);
                      setReopenReason("");
                    }}
                    disabled={reopening}
                    className="srd-btn flex-1 py-2.5 rounded-lg border font-bold text-sm transition"
                    style={{ borderColor: RULE, color: INK_MUTED }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
