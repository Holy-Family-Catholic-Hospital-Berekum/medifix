import { useState, useEffect } from "react";
import {
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate, canUserSendFeedback } from "../src/utils";

export default function StaffReportDetails({
  displayDetails,
  setDisplayDetails,
  currentReport,
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ feedback: "" });

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
      setFormData({ feedback: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error sending feedback:", error);
      alert("Failed to send feedback");
    } finally {
      setLoading(false);
    }
  };

  const reportDetails = (
    <div className="flex flex-col px-10 gap-10 pb-20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl whitespace-nowrap">
          Priority Level:
        </h2>
        <p className="text-red-400 md:text-lg">{report.priorityLevel}</p>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl">Category:</h2>
        <p className="text-red-400 md:text-lg">{report.category}</p>
      </div>

      <div className="flex gap-2">
        <h2 className="text-lg md:text-xl whitespace-nowrap">
          Report Description:
        </h2>
        <p className="text-red-400 md:text-lg">{report.reportDescription}</p>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl">Date Sent:</h2>
        <p className="text-red-400 md:text-lg">{formatDate(report.dateSent)}</p>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl whitespace-nowrap">Location:</h2>
        <p className="text-red-400 md:text-lg">{report.location}</p>
      </div>

      {report.dateApproved && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Date Approved:</h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateApproved)}
          </p>
        </div>
      )}

      {report.dateConfirmed && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Date Confirmed:</h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateConfirmed)}
          </p>
        </div>
      )}

      {report.dateAssigned && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Date Assigned:</h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateAssigned)}
          </p>
        </div>
      )}

      {report.dateCompleted && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Date Completed:</h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateCompleted)}
          </p>
        </div>
      )}

      {report.feedback && (
        <div className="flex gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">Feedback:</h2>
          <p className="text-red-400 md:text-lg">{report.feedback}</p>
        </div>
      )}

      {canUserSendFeedback(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">Send Feedback</h3>
          <textarea
            placeholder="Enter your feedback about the completed work..."
            value={formData.feedback}
            onChange={(e) => setFormData({ feedback: e.target.value })}
            className="w-full p-2 border border-gray-400 rounded"
            rows="4"
          />
          <button
            onClick={handleSendFeedback}
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            {loading ? "Processing..." : "Submit Feedback"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`fixed top-0 md:top-[10%] py-24 md:py-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden right-0 w-full md:max-w-[700px] h-screen md:max-h-[80%] md:right-5 md:rounded-xl bg-green-300 z-80 md:shadow-xl overflow-y-auto ${
        closing ? "slide-out-right" : "slide-in-right"
      }`}
    >
      <span
        className="fixed top-20 md:top-5 right-5 cursor-pointer text-xl font-bold"
        onClick={() => setDisplayDetails(false)}
      >
        X
      </span>

      {reportDetails}
    </div>
  );
}
