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

const EMPTY_MATERIAL = { description: "", quantity: "", specification: "" };

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
      <div className="overflow-x-auto rounded border border-gray-300">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="border border-gray-300 px-3 py-2 text-left w-10">
                S/N
              </th>
              <th className="border border-gray-300 px-3 py-2 text-left">
                Description of Material/Item
              </th>
              <th className="border border-gray-300 px-3 py-2 text-left w-24">
                Qty Required
              </th>
              <th className="border border-gray-300 px-3 py-2 text-left w-36">
                Specification / Size
              </th>
            </tr>
          </thead>
          <tbody>
            {materials.map((row, idx) => (
              <tr
                key={idx}
                className={idx % 2 === 1 ? "bg-gray-50" : "bg-white"}
              >
                <td className="border border-gray-300 px-3 py-2 text-center text-gray-500">
                  {idx + 1}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-red-500 font-medium">
                  {row.description}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-red-500 text-center">
                  {row.quantity}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-red-500">
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
      <div className="overflow-x-auto rounded border border-gray-300">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="border border-gray-300 px-2 py-2 text-left w-10">
                S/N
              </th>
              <th className="border border-gray-300 px-2 py-2 text-left">
                Description of Material/Item
              </th>
              <th className="border border-gray-300 px-2 py-2 text-left w-24">
                Qty Required
              </th>
              <th className="border border-gray-300 px-2 py-2 text-left w-36">
                Specification / Size
              </th>
              <th className="border border-gray-300 px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((row, idx) => (
              <tr key={idx}>
                <td className="border border-gray-300 px-2 py-1 text-center text-gray-400 text-xs">
                  {idx + 1}
                </td>
                <td className="border border-gray-300 px-1 py-1">
                  <input
                    type="text"
                    placeholder="e.g. Silicone"
                    value={row.description}
                    onChange={(e) =>
                      updateCell(idx, "description", e.target.value)
                    }
                    className="w-full px-2 py-1 text-sm outline-none bg-transparent"
                  />
                </td>
                <td className="border border-gray-300 px-1 py-1">
                  <input
                    type="number"
                    placeholder="0"
                    value={row.quantity}
                    onChange={(e) =>
                      updateCell(idx, "quantity", e.target.value)
                    }
                    className="w-full px-2 py-1 text-sm outline-none bg-transparent text-center"
                  />
                </td>
                <td className="border border-gray-300 px-1 py-1">
                  <input
                    type="text"
                    placeholder='e.g. 4"'
                    value={row.specification}
                    onChange={(e) =>
                      updateCell(idx, "specification", e.target.value)
                    }
                    className="w-full px-2 py-1 text-sm outline-none bg-transparent"
                  />
                </td>
                <td className="border border-gray-300 px-1 py-1 text-center">
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
  const [materials, setMaterials] = useState([{ ...EMPTY_MATERIAL }]);
  const [formData, setFormData] = useState({
    note: "",
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

  useEffect(() => {
    if (!displayDetails || !currentReport || currentReport.length === 0) return;
    const report = currentReport[0];
    if (report.status !== "overdue") return;
    if (!report.overdueViewedBy?.includes(user?.ID)) {
      updateDoc(doc(db, "reports", report.id), {
        overdueViewedBy: arrayUnion(user?.ID),
      }).catch((err) => console.error("overdueViewedBy update failed:", err));
    }
  }, [displayDetails, currentReport]);

  if (!visible || !currentReport || currentReport.length === 0) return null;

  const report = currentReport[0];

  const assignedWorker = workers.find((w) => w.ID === report.assignedTo);

  const handleApprove = async () => {
    if (!canUserApprove(user, report)) return;
    setLoading(true);
    try {
      const noteContent = formData.note || "Report approved";
      await updateDoc(doc(db, "reports", report.id), {
        status: "approved",
        dateApproved: serverTimestamp(),
        dateDue: null, // ← add this
        alerts: arrayUnion(
          createAlert(noteContent, "admin", "estate", report.status),
        ),
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
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "denied",
        alerts: arrayUnion(
          createAlert(reason, "admin", report.reporterId, report.status),
        ),
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
        preOverdueStatus: null,
      });
      alert("Materials submitted for admin confirmation!");
      setMaterials([{ ...EMPTY_MATERIAL }]);
      setDisplayDetails(false);
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
      const noteContent = formData.note || "Materials confirmed by admin";
      await updateDoc(doc(db, "reports", report.id), {
        status: "confirmed",
        dateConfirmed: serverTimestamp(),
        preOverdueStatus: null,
        alerts: arrayUnion(
          createAlert(noteContent, "admin", "estate", report.status),
        ),
      });
      alert("Materials confirmed!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error confirming materials:", error);
      alert("Failed to confirm materials");
    } finally {
      setLoading(false);
    }
  };

  const handleDenyCost = async () => {
    if (!canUserConfirmCost(user, report)) return;
    const reason = formData.note || "Materials denied by admin";
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "costDenied",
        dateCostDenied: serverTimestamp(),
        alerts: arrayUnion(
          createAlert(reason, "admin", "estate", report.status),
        ),
      });
      alert("Materials denied!");
      setFormData({ ...formData, note: "" });
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error denying materials:", error);
      alert("Failed to deny materials");
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
      const updatePayload = {
        assignedTo: formData.selectedWorker,
        status: "assigned",
        dateAssigned: serverTimestamp(),
        preOverdueStatus: null,
        alerts: arrayUnion(
          createAlert(
            `Worker assigned: ${formData.selectedWorker}`,
            "estate",
            formData.selectedWorker,
            report.status,
          ),
        ),
      };

      if (formData.instructions.trim()) {
        updatePayload.instructions = formData.instructions.trim();
      }

      await updateDoc(doc(db, "reports", report.id), updatePayload);
      alert("Work assigned to worker!");
      setFormData({ ...formData, selectedWorker: "", instructions: "" });
      setDisplayDetails(false);
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
        alerts: arrayUnion(
          createAlert(
            `Instructions: ${formData.instructions.trim()}`,
            "estate",
            report.assignedTo,
            report.status,
          ),
        ),
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

  const handleCompleteWork = async () => {
    if (!canUserComplete(user, report)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "completed",
        dateCompleted: serverTimestamp(),
        preOverdueStatus: null,
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
        alerts: arrayUnion(
          createAlert(formData.feedback, "staff", "admin", report.status),
        ),
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

  const getRelevantAlert = () => {
    if (!report.alerts?.length) return null;

    switch (report.status) {
      case "approved":
        return (
          report.alerts.find(
            (a) =>
              a.sentBy === "admin" &&
              a.sentTo === "estate" &&
              a.type === "incoming",
          ) || null
        );

      case "confirmed":
        return (
          [...report.alerts]
            .filter(
              (a) =>
                a.sentBy === "admin" &&
                a.sentTo === "estate" &&
                a.type === "pending",
            )
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null
        );

      case "costDenied":
        return (
          [...report.alerts]
            .filter(
              (a) =>
                a.sentBy === "admin" &&
                a.sentTo === "estate" &&
                a.type === "pending",
            )
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null
        );

      case "assigned":
        return (
          report.alerts.find(
            (a) => a.sentTo === report.assignedTo && a.type === "confirmed",
          ) || null
        );

      case "denied":
        return (
          report.alerts.find(
            (a) => a.sentTo === user?.ID && a.type === "incoming",
          ) || null
        );

      default:
        return null;
    }
  };

  const relevantAlert = getRelevantAlert();

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
        <h2 className="text-lg md:text-xl whitespace-nowrap">Description:</h2>
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
        <a
          href={`tel:${report.reporterContact}`}
          className="text-red-700 md:text-lg border-b"
        >
          {report.reporterContact}
        </a>
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

      {report.dateCostAdded && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Date Materials Added:
          </h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateCostAdded)}
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
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Date Assigned:
          </h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateAssigned)}
          </p>
        </div>
      )}

      {report.assignedTo && ["admin", "estate"].includes(user?.role) && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">Technician:</h2>
          <div className="flex flex-col">
            <p className="text-red-400 md:text-lg">{assignedWorker?.name}</p>
            {assignedWorker?.phoneNumber && (
              <a
                href={`tel:${assignedWorker.phoneNumber}`}
                className="text-red-700 md:text-lg border-b w-fit"
              >
                {assignedWorker.phoneNumber}
              </a>
            )}
          </div>
        </div>
      )}

      {report.dateCompleted && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Date Completed:
          </h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateCompleted)}
          </p>
        </div>
      )}

      {report.dateCostDenied && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Date Materials Denied:
          </h2>
          <p className="text-red-400 md:text-lg">
            {formatDate(report.dateCostDenied)}
          </p>
        </div>
      )}

      {/* Materials table — shown to admin & estate when materials exist */}
      {Array.isArray(report.materials) &&
        report.materials.length > 0 &&
        ["admin", "estate"].includes(user.role) && (
          <div className="flex flex-col gap-2">
            <h2 className="text-lg md:text-xl whitespace-nowrap">
              Materials Required:
            </h2>
            <MaterialsTable
              materials={report.materials}
              onChange={() => {}}
              readOnly
            />
          </div>
        )}

      {relevantAlert && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            {report.status === "denied"
              ? "Denial Reason:"
              : report.status === "costDenied"
                ? "Materials Denial Reason:"
                : "Note:"}
          </h2>
          <p className="text-red-400 md:text-lg">{relevantAlert.content}</p>
        </div>
      )}

      {report.instructions && user?.role !== "staff" && (
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

      {/* ADMIN ACTIONS - Approve/Deny */}
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

      {/* ESTATE ACTIONS - Add Materials */}
      {canUserAddCost(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-4">
          <h3 className="font-bold text-gray-800">
            {report.status === "costDenied"
              ? "Estate Actions - Resubmit Materials"
              : "Estate Actions - Add Materials"}
          </h3>

          {report.status === "costDenied" && (
            <p className="text-sm text-red-500">
              Your previous submission was denied. Please review and resubmit.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Materials / Items Required
            </label>
            <MaterialsTable materials={materials} onChange={setMaterials} />
          </div>

          <button
            onClick={handleAddMaterials}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            {loading ? "Processing..." : "Submit for Admin Confirmation"}
          </button>
        </div>
      )}

      {/* ADMIN ACTIONS - Confirm/Deny Materials */}
      {canUserConfirmCost(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-4">
          <h3 className="font-bold text-gray-800">
            Admin Actions - Review & Confirm Materials
          </h3>

          {Array.isArray(report.materials) && report.materials.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">
                Materials Requested:
              </p>
              <MaterialsTable
                materials={report.materials}
                onChange={() => {}}
                readOnly
              />
            </div>
          )}

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
              {loading ? "Processing..." : "Confirm Materials"}
            </button>
            <button
              onClick={handleDenyCost}
              disabled={loading}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Deny Materials"}
            </button>
          </div>
        </div>
      )}

      {/* ESTATE ACTIONS - Assign Worker */}
      {canUserAssignWorker(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">
            Estate Actions - Assign Worker
          </h3>
          <label className="block text-sm font-medium text-gray-700">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instructions{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              placeholder="Add work instructions for the worker..."
              value={formData.instructions}
              onChange={(e) =>
                setFormData({ ...formData, instructions: e.target.value })
              }
              className="w-full p-2 border border-gray-400 rounded"
              rows="4"
            />
          </div>

          <button
            onClick={handleAssignWorker}
            disabled={loading || !formData.selectedWorker}
            className={`font-bold py-2 px-4 rounded w-full text-white transition ${
              loading || !formData.selectedWorker
                ? "bg-purple-300 cursor-not-allowed"
                : "bg-purple-500 hover:bg-purple-700 cursor-pointer"
            }`}
          >
            {loading ? "Processing..." : "Assign Worker"}
          </button>

          {report.assignedTo && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <h4 className="font-bold text-gray-800">Update Instructions</h4>
              <textarea
                placeholder="Replace or add new instructions for the worker..."
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
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
              >
                {loading ? "Processing..." : "Save Instructions"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* WORKER ACTIONS - Complete Work */}
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

      {/* STAFF ACTIONS - Send Feedback */}
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

      {/* ESTATE ACTIONS - Download PDF */}
      {canUserDownloadPDF(user, report) && (
        <div className="bg-white rounded-lg p-5">
          <button
            onClick={() => generatePDFReport(report)}
            className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            Download Report (PDF)
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
