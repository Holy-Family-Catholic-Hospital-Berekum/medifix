import { useState, useEffect } from "react";
import {
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate, canUserSendFeedback, createAlert } from "../src/utils";

// Reusable, UX-friendly "call" button — bigger tap target, icon, clear affordance
function PhoneCallButton({ phoneNumber, label }) {
  if (!phoneNumber) return null;
  return (
    <a
      href={`tel:${phoneNumber}`}
      aria-label={
        label ? `Call ${label} at ${phoneNumber}` : `Call ${phoneNumber}`
      }
      className="inline-flex items-center gap-2 rounded-full bg-white/90 hover:bg-white active:bg-white
                 border border-white/40 text-orange-600 px-4 py-2 min-h-[44px] text-sm md:text-base font-semibold
                 transition-colors duration-150 shadow-sm active:scale-[0.98]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-4 h-4 md:w-5 md:h-5 shrink-0"
        aria-hidden="true"
      >
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.4 21 3 13.6 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
      </svg>
      <span>{phoneNumber}</span>
    </a>
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

  const user = JSON.parse(localStorage.getItem("user"))?.data;

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

  if (!visible || !currentReport || currentReport.length === 0) return null;

  const report = currentReport[0];

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
        alerts: arrayUnion(
          createAlert(reopenReason.trim(), "staff", "estate", report.status),
        ),
      });

      // Tell the parent the report moved out of "completed" so it can drop
      // it from the local list immediately instead of waiting for a refresh.
      onFeedbackSent?.(report.id, null, "reopened");

      setReopenReason("");
      setShowReopenForm(false);
      setDisplayDetails(false);
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
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "closed",
        feedback: feedback.trim(),
        feedbackDate: serverTimestamp(),
        dateClosed: serverTimestamp(),
      });

      // The report just moved from "completed" to "closed" — pass the new
      // status along so whatever list is showing it (e.g. a "completed,
      // awaiting feedback" page) can remove it instead of leaving a stale
      // card around until the next refresh.
      onFeedbackSent?.(report.id, feedback.trim(), "closed");

      setFeedback("");
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error sending feedback:", error);
      alert("Failed to send feedback");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
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
              {assignedWorker?.name && (
                <p className="text-blue-100 md:text-lg">
                  {assignedWorker.name}
                </p>
              )}
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

        {/* location */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">Location:</h2>
          <p className="text-blue-100 md:text-lg">{report.location}</p>
        </div>

        {/* before / after images */}
        {(report.image || report.completionImage) && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg md:text-xl">Photos:</h2>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <span className="text-xs font-bold text-orange-100 uppercase tracking-wide">
                  Before
                </span>
                {report.image ? (
                  <img
                    src={report.image}
                    alt="Reported issue"
                    className="w-full max-h-64 object-contain rounded-xl border border-white/20 bg-black/10 cursor-pointer"
                    onClick={() => window.open(report.image, "_blank")}
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
                {report.completionImage ? (
                  <img
                    src={report.completionImage}
                    alt="Completed work"
                    className="w-full max-h-64 object-contain rounded-xl border border-white/20 bg-black/10 cursor-pointer"
                    onClick={() =>
                      window.open(report.completionImage, "_blank")
                    }
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
          <div className="flex gap-2">
            <h2 className="text-lg md:text-xl whitespace-nowrap">
              Your Feedback:
            </h2>
            <p className="text-blue-100 md:text-lg">{report.feedback}</p>
          </div>
        )}

        {/* feedback form — only shown if feedback not yet given */}
        {canUserSendFeedback(user, report) && (
          <div className="bg-white rounded-xl p-5 space-y-4">
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
                  {loading ? "Submitting…" : "✅ Resolved — Submit Feedback"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowReopenForm(true)}
                  className="w-full py-2.5 rounded-lg border border-red-300 text-red-600 font-bold text-sm hover:bg-red-50 transition"
                >
                  ❌ Not satisfied — Reopen this job
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
