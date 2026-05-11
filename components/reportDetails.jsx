import { useState, useEffect } from "react";
import {
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  getDocs,
  collection,
  query,
  where,
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
  createAlert,
} from "../src/utils";

export default function ReportDetailsContainer({
  displayDetails,
  setDisplayDetails,
  currentReport,
  reportDetailsBgColor,
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [formData, setFormData] = useState({
    note: "",
    cost: "",
    costDescription: "",
    instructions: "",
    feedback: "",
    selectedWorker: "",
  });

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

  useEffect(() => {
    const loadWorkers = async () => {
      try {
        const workersQuery = query(
          collection(db, "users"),
          where("role", "==", "worker"),
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

  if (!visible || !currentReport || currentReport.length === 0) return null;

  const report = currentReport[0];

  const handleApprove = async () => {
    if (!canUserApprove(user, report)) return;
    setLoading(true);
    try {
      const noteContent = formData.note || "Report approved";
      await updateDoc(doc(db, "reports", report.id), {
        status: "approved",
        dateApproved: serverTimestamp(),
        alerts: arrayUnion(createAlert(noteContent, "admin", "estate")),
      });
      alert("Report approved!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error approving report:", error);
      alert("Failed to approve report");
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!canUserApprove(user, report)) return;
    const reason = formData.note || "Report denied";
    if (!reason || reason === "") {
      alert("Please provide a reason for denial");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "denied",
        alerts: arrayUnion(createAlert(reason, "admin", report.reporterId)),
      });
      alert("Report denied!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error denying report:", error);
      alert("Failed to deny report");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCost = async () => {
    if (!canUserAddCost(user, report)) return;
    if (!formData.cost || !formData.costDescription) {
      alert("Please fill in both cost and description");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        cost: parseFloat(formData.cost),
        costDescription: formData.costDescription,
        status: "pending",
      });
      alert("Cost information submitted for admin confirmation!");
      setFormData({ ...formData, cost: "", costDescription: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error adding cost:", error);
      alert("Failed to add cost information");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCost = async () => {
    if (!canUserConfirmCost(user, report)) return;
    setLoading(true);
    try {
      const noteContent = formData.note || "Cost confirmed by admin";
      await updateDoc(doc(db, "reports", report.id), {
        status: "confirmed",
        dateConfirmed: serverTimestamp(),
        alerts: arrayUnion(createAlert(noteContent, "admin", "estate")),
      });
      alert("Cost confirmed!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error confirming cost:", error);
      alert("Failed to confirm cost");
    } finally {
      setLoading(false);
    }
  };

  const handleDenyCost = async () => {
    if (!canUserConfirmCost(user, report)) return;
    const reason = formData.note || "Cost denied by admin";
    if (!reason || reason === "") {
      alert("Please provide a reason for denial");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "pending",
        alerts: arrayUnion(createAlert(reason, "admin", "estate")),
      });
      alert("Cost denied!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error denying cost:", error);
      alert("Failed to deny cost");
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
      await updateDoc(doc(db, "reports", report.id), {
        assignedTo: formData.selectedWorker,
        status: "assigned",
        dateAssigned: serverTimestamp(),
        alerts: arrayUnion(
          createAlert(
            `Worker assigned: ${formData.selectedWorker}`,
            "estate",
            formData.selectedWorker,
          ),
        ),
      });
      alert("Work assigned to worker!");
      setFormData({ ...formData, selectedWorker: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error assigning worker:", error);
      alert("Failed to assign worker");
    } finally {
      setLoading(false);
    }
  };

  const handleAddInstructions = async () => {
    if (!formData.instructions) {
      alert("Please enter instructions");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        instructions: formData.instructions,
        alerts: arrayUnion(
          createAlert(
            `Instructions: ${formData.instructions}`,
            "estate",
            report.assignedTo,
          ),
        ),
      });
      alert("Instructions added!");
      setFormData({ ...formData, instructions: "" });
    } catch (error) {
      console.error("Error adding instructions:", error);
      alert("Failed to add instructions");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteWork = async () => {
    if (!canUserComplete(user, report)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "completed",
        dateCompleted: serverTimestamp(),
      });
      alert("Work marked as completed!");
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error completing work:", error);
      alert("Failed to complete work");
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
        alerts: arrayUnion(createAlert(formData.feedback, "staff", "admin")),
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

  const reportDetails = (
    <div className="flex flex-col px-10 gap-10 pb-20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl">Sent By:</h2>
        <p className="text-red-400 md:text-lg">{report.reporter}</p>
      </div>

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
        <h2 className="text-lg md:text-xl whitespace-nowrap">
          Sender Contact:
        </h2>
        <p className="text-red-400 md:text-lg">{report.reporterContact}</p>
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

      {report.cost && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Cost:</h2>
          <p className="text-red-400 md:text-lg">₵{report.cost}</p>
        </div>
      )}

      {report.costDescription && (
        <div className="flex gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Cost Description:
          </h2>
          <p className="text-red-400 md:text-lg">{report.costDescription}</p>
        </div>
      )}

      {report.instructions && (
        <div className="flex gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Instructions:
          </h2>
          <p className="text-red-400 md:text-lg">{report.instructions}</p>
        </div>
      )}

      {report.feedback && (
        <div className="flex gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">Feedback:</h2>
          <p className="text-red-400 md:text-lg">{report.feedback}</p>
        </div>
      )}

      {/* ADMIN ACTIONS */}
      {canUserApprove(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">
            Admin Actions - Approve/Deny
          </h3>
          <textarea
            placeholder="Add optional note..."
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            className="w-full p-2 border border-gray-400 rounded"
            rows="3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              {loading ? "Processing..." : "Approve"}
            </button>
            <button
              onClick={handleDeny}
              disabled={loading}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              {loading ? "Processing..." : "Deny"}
            </button>
          </div>
        </div>
      )}

      {/* ESTATE ACTIONS - ADD COST */}
      {canUserAddCost(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">Estate Actions - Add Cost</h3>
          <input
            type="number"
            placeholder="Cost amount"
            value={formData.cost}
            onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            className="w-full p-2 border border-gray-400 rounded"
          />
          <textarea
            placeholder="Cost description"
            value={formData.costDescription}
            onChange={(e) =>
              setFormData({ ...formData, costDescription: e.target.value })
            }
            className="w-full p-2 border border-gray-400 rounded"
            rows="3"
          />
          <button
            onClick={handleAddCost}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            {loading ? "Processing..." : "Submit Cost for Confirmation"}
          </button>
        </div>
      )}

      {/* ADMIN ACTIONS - CONFIRM COST */}
      {canUserConfirmCost(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">
            Admin Actions - Confirm Cost
          </h3>
          <textarea
            placeholder="Add optional note for estate..."
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            className="w-full p-2 border border-gray-400 rounded"
            rows="3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirmCost}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Confirm Cost"}
            </button>
            <button
              onClick={handleDenyCost}
              disabled={loading}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Deny Cost"}
            </button>
          </div>
        </div>
      )}

      {/* ESTATE ACTIONS - ASSIGN WORKER & INSTRUCTIONS */}
      {canUserAssignWorker(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">
            Estate Actions - Assign Worker
          </h3>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select a registered worker
          </label>
          <select
            value={formData.selectedWorker}
            onChange={(e) =>
              setFormData({ ...formData, selectedWorker: e.target.value })
            }
            className="w-full p-2 border border-gray-400 rounded"
          >
            <option value="">Choose worker</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.ID || worker.id}>
                {worker.name} {worker.ID ? `(${worker.ID})` : ""}
              </option>
            ))}
          </select>
          {workers.length === 0 && (
            <p className="text-sm text-gray-500">
              No registered workers found. Please add workers first.
            </p>
          )}
          <button
            onClick={handleAssignWorker}
            disabled={loading}
            className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            {loading ? "Processing..." : "Assign Worker"}
          </button>

          {report.assignedTo && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="font-bold text-gray-800 mb-2">
                Add Work Instructions
              </h4>
              <textarea
                placeholder="Enter detailed work instructions for the worker..."
                value={formData.instructions}
                onChange={(e) =>
                  setFormData({ ...formData, instructions: e.target.value })
                }
                className="w-full p-2 border border-gray-400 rounded"
                rows="4"
              />
              <button
                onClick={handleAddInstructions}
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full mt-2"
              >
                {loading ? "Processing..." : "Save Instructions"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* WORKER ACTIONS - COMPLETE WORK */}
      {canUserComplete(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">Worker Actions</h3>
          <button
            onClick={handleCompleteWork}
            disabled={loading}
            className="bg-green-600 hover:bg-green-800 text-white font-bold py-2 px-4 rounded w-full"
          >
            {loading ? "Processing..." : "Mark Work as Completed"}
          </button>
        </div>
      )}

      {/* STAFF ACTIONS - SEND FEEDBACK */}
      {canUserSendFeedback(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">
            Staff Actions - Send Feedback
          </h3>
          <textarea
            placeholder="Enter your feedback about the completed work..."
            value={formData.feedback}
            onChange={(e) =>
              setFormData({ ...formData, feedback: e.target.value })
            }
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

      {/* ESTATE ACTIONS - DOWNLOAD PDF */}
      {canUserDownloadPDF(user, report) && (
        <div className="bg-white rounded-lg p-5">
          <button
            onClick={() => generatePDFReport(report)}
            className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            Download Report as Evidence (PDF)
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`fixed top-0 md:top-[10%] py-24 md:py-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden right-0 w-full md:max-w-[700px] h-screen md:max-h-[80%] md:right-5 md:rounded-xl ${reportDetailsBgColor} z-80 md:shadow-xl overflow-y-auto ${
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
