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

// Denial reasons now live in the report's `notes` array instead of the old
// `alerts` field (alerts were being written but never really read anywhere
// useful, so they were dropped from the flow). A note entry looks like:
// { type: "denial", content: "<reason>", date: <JS Date>, by: "<name>" }
function getDenialNote(report) {
  if (!report || report.status !== "denied") return null;
  const denialNotes = (report.notes || []).filter((n) => n?.type === "denial");
  return denialNotes.length
    ? denialNotes[denialNotes.length - 1].content
    : null;
}

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
            } ${filled ? "text-yellow-400" : "text-gray-300"}`}
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
  useEffect(() => {
    const assignedTo = currentReport?.[0]?.assignedTo;
    if (!displayDetails || !assignedTo) {
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
  const denialReason = getDenialNote(report);

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
      className={`fixed top-0 md:top-[12%] py-24 md:py-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden right-0 w-full md:max-w-[700px] h-screen md:max-h-[80%] md:right-5 md:rounded-xl bg-[#FF8825] z-80 md:shadow-xl overflow-y-auto ${
        closing ? "slide-out-right" : "slide-in-right"
      }`}
    >
      {/* close button */}
      <button
        className="fixed top-20 md:top-5 right-5 cursor-pointer text-xl font-bold bg-black/20 hover:bg-black/30 transition rounded-full w-8 h-8 flex items-center justify-center text-white"
        onClick={() => setDisplayDetails(false)}
      >
        ✕
      </button>

      <div className="flex flex-col px-10 gap-8 pb-20">
        {/* priority */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Priority Level:
          </h2>
          <p className="text-blue-100 md:text-lg capitalize">
            {report.priorityLevel}
          </p>
        </div>

        {/* category */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Category:</h2>
          <p className="text-blue-100 md:text-lg">{report.category}</p>
        </div>

        {/* description */}
        <div className="flex gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">Description:</h2>
          <p className="text-blue-100 md:text-lg">{report.reportDescription}</p>
        </div>

        {/* location */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">Location:</h2>
          <p className="text-blue-100 md:text-lg">{report.location}</p>
        </div>

        {/* date sent */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Date Sent:</h2>
          <p className="text-blue-100 md:text-lg">
            {formatDate(report.dateSent)}
          </p>
        </div>

        {/* denial reason — read from report.notes (see getDenialNote
            above). Only present while status is "denied". */}
        {denialReason && (
          <div className="flex flex-col gap-2">
            <h2 className="text-lg md:text-xl whitespace-nowrap">
              Denial Reason:
            </h2>
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <p className="text-blue-100 md:text-lg">{denialReason}</p>
            </div>
          </div>
        )}

        {report.dateApproved && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl">Date Approved:</h2>
            <p className="text-blue-100 md:text-lg">
              {formatDate(report.dateApproved)}
            </p>
          </div>
        )}

        {report.dateConfirmed && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl">Date Confirmed:</h2>
            <p className="text-blue-100 md:text-lg">
              {formatDate(report.dateConfirmed)}
            </p>
          </div>
        )}

        {report.dateAssigned && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl">Date Assigned:</h2>
            <p className="text-blue-100 md:text-lg">
              {formatDate(report.dateAssigned)}
            </p>
          </div>
        )}

        {/* date reassigned — this panel was missing it even though the
            field is already tracked on the report */}
        {report.dateReAssigned && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl whitespace-nowrap">
              Date Re-Assigned:
            </h2>
            <p className="text-blue-100 md:text-lg">
              {formatDate(report.dateReAssigned)}
            </p>
          </div>
        )}

        {report.dateCompleted && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl">Date Completed:</h2>
            <p className="text-blue-100 md:text-lg">
              {formatDate(report.dateCompleted)}
            </p>
          </div>
        )}

        {report.dateReopened && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl">Date Reopened:</h2>
            <p className="text-blue-100 md:text-lg">
              {formatDate(report.dateReopened)}
            </p>
          </div>
        )}

        {/* reopen reason — this panel was showing the date but not the
            reason itself */}
        {report.reopenReason && (
          <div className="flex flex-col gap-2">
            <h2 className="text-lg md:text-xl whitespace-nowrap">
              Reopen Reason:
            </h2>
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <p className="text-blue-100 md:text-lg">{report.reopenReason}</p>
            </div>
          </div>
        )}

        {report.dateClosed && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl">Date Closed:</h2>
            <p className="text-blue-100 md:text-lg">
              {formatDate(report.dateClosed)}
            </p>
          </div>
        )}

        {report.assignedTo && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl whitespace-nowrap">
              Technician:
            </h2>
            <div className="flex flex-col gap-1">
              {assignedWorker?.phoneNumber ? (
                <PhoneCallButton
                  phoneNumber={assignedWorker.phoneNumber}
                  label={assignedWorker.name}
                />
              ) : loadingWorker ? (
                <p className="text-orange-100 text-sm italic">
                  Loading technician…
                </p>
              ) : (
                <p className="text-orange-100 text-sm italic">
                  No contact number on file
                </p>
              )}
            </div>
          </div>
        )}

        {/* before / after images */}
        {(reportImagesData?.image || reportImagesData?.completionImage) && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg md:text-xl">Photos:</h2>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <span className="text-xs font-bold text-orange-100 uppercase tracking-wide">
                  Before
                </span>
                {reportImagesData?.image ? (
                  <img
                    src={reportImagesData.image}
                    alt="Reported issue"
                    className="w-full max-h-64 object-contain rounded-xl border border-white/20 bg-black/10 cursor-pointer"
                  />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center rounded-xl border border-dashed border-white/30 text-orange-100 text-xs">
                    No image attached
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <span className="text-xs font-bold text-orange-100 uppercase tracking-wide">
                  After
                </span>
                {reportImagesData?.completionImage ? (
                  <img
                    src={reportImagesData.completionImage}
                    alt="Completed work"
                    className="w-full max-h-64 object-contain rounded-xl border border-white/20 bg-black/10 cursor-pointer"
                  />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center rounded-xl border border-dashed border-white/30 text-orange-100 text-xs">
                    {report.status === "completed"
                      ? "No completion photo"
                      : "Not completed yet"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* date sent */}
        <div className="flex items-center gap-2"></div>

        {/* existing feedback (read-only once submitted) */}
        {report.feedback && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <h2 className="text-lg md:text-xl whitespace-nowrap">
                Your Feedback:
              </h2>
              <p className="text-blue-100 md:text-lg">{report.feedback}</p>
            </div>
            {report.technicianRating && (
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl whitespace-nowrap">
                  Your Rating:
                </h2>
                <StarRating
                  value={report.technicianRating}
                  readOnly
                  size="text-xl"
                />
              </div>
            )}
          </div>
        )}

        {/* feedback form — only shown if feedback not yet given */}
        {canUserSendFeedback(user, report) && (
          <div
            ref={feedbackFormRef}
            className="bg-white rounded-xl p-5 space-y-4"
          >
            <h3 className="font-bold text-gray-800">How did the work go?</h3>
            <p className="text-xs text-gray-400">
              Your feedback helps us improve maintenance quality.
            </p>

            {!showReopenForm ? (
              <>
                <textarea
                  placeholder="Describe the quality of work done…"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-700 outline-none focus:border-orange-300 resize-none"
                  rows="4"
                />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
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
                  className="w-full py-2.5 rounded-lg text-white font-bold text-sm transition"
                  style={{
                    background:
                      loading || !feedback.trim() ? "#fdba74" : "#FF8825",
                    cursor:
                      loading || !feedback.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Submitting…" : "✅ Resolved. Submit Feedback"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowReopenForm(true)}
                  className="w-full py-2.5 rounded-lg border border-red-300 text-red-600 font-bold text-sm hover:bg-red-50 transition"
                >
                  ❌ Not satisfied? Reopen this job
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                  This sends the report back to the Estate Manager for further
                  action or reassignment.
                </p>
                <textarea
                  placeholder="What's still wrong with the work?"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full p-3 border border-red-200 rounded-lg text-sm text-gray-700 outline-none focus:border-red-400 resize-none"
                  rows="4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReopenReport}
                    disabled={reopening || !reopenReason.trim()}
                    className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm transition"
                    style={{
                      background:
                        reopening || !reopenReason.trim()
                          ? "#fca5a5"
                          : "#dc2626",
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
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-bold text-sm hover:bg-gray-50 transition"
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
