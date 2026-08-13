import { useState, useEffect } from "react";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate, canUserSendFeedback } from "../src/utils";

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

  if (!visible || !currentReport || currentReport.length === 0) return null;

  const report = currentReport[0];

  const handleSendFeedback = async () => {
    if (!canUserSendFeedback(user, report)) return;
    if (!feedback.trim()) {
      alert("Please enter feedback");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        feedback: feedback.trim(),
        feedbackDate: serverTimestamp(),
      });

      // Patch parent state immediately so the banner disappears without a refresh
      onFeedbackSent?.(report.id, feedback.trim());

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
          <div className="bg-white rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-gray-800">How did the work go?</h3>
            <p className="text-xs text-gray-400">
              Your feedback helps us improve maintenance quality.
            </p>
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
                background: loading || !feedback.trim() ? "#fdba74" : "#FF8825",
                cursor: loading || !feedback.trim() ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Submitting…" : "Submit Feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
