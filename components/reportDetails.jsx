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
  createAlert,
  canUserAcceptOrRejectJob, // add this
} from "../src/utils";

const EMPTY_MATERIAL = { description: "", quantity: "", specification: "" };

// How long we'll wait for a completion-photo upload before giving up and
// showing an explicit error, instead of spinning forever.

// ADD this (same pattern as ReportForm's compressImage):
const compressImageToBase64 = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
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

// Reusable, UX-friendly "call" button — bigger tap target, icon, clear affordance
function PhoneCallButton({ phoneNumber, label }) {
  if (!phoneNumber) return null;
  return (
    <a
      href={`tel:${phoneNumber}`}
      aria-label={
        label ? `Call ${label} at ${phoneNumber}` : `Call ${phoneNumber}`
      }
      className="inline-flex items-center gap-2 rounded-full bg-green-50 hover:bg-green-100 active:bg-green-200
                 border border-green-300 text-green-700 px-4 py-2 min-h-[44px] text-sm md:text-base font-medium
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

// New: lets a worker take a photo with the device camera or pick one from
// their gallery, and shows a live preview before submission.
function CompletionImageUploader({ preview, onChange }) {
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onChange(file);
    // allow re-selecting the same file
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
          className="w-full max-h-64 object-contain rounded-lg border border-gray-300"
        />
      )}

      <div className="flex gap-2">
        <label className="flex-1 cursor-pointer text-center bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded py-2 px-3 text-sm font-medium text-gray-700">
          {preview ? "Retake Photo" : "Take Photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        <label className="flex-1 cursor-pointer text-center bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded py-2 px-3 text-sm font-medium text-gray-700">
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

  // New: completion-photo state for the worker's "mark as completed" flow
  const [completionImage, setCompletionImage] = useState(null);
  const [completionImagePreview, setCompletionImagePreview] = useState(null);

  const [uploadError, setUploadError] = useState("");
  const [maintenanceCost, setMaintenanceCost] = useState("");
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

  // Reset the completion-photo picker whenever the panel closes so a stale
  // photo doesn't carry over to the next report opened.
  useEffect(() => {
    if (!displayDetails) {
      setCompletionImage(null);
      setCompletionImagePreview(null);
      setUploadError("");
    }
  }, [displayDetails]);

  // Revoke the object URL used for the preview whenever it changes/unmounts
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

  if (!visible || !currentReport || currentReport.length === 0) return null;

  const report = currentReport[0];

  const assignedWorker = workers.find((w) => w.ID === report.assignedTo);

  // New: is the current user the worker this job is assigned to?
  const isAssignedWorker =
    user?.role === "worker" && report?.assignedTo === user?.ID;

  const handleApprove = async () => {
    if (!canUserApprove(user, report)) return;
    setLoading(true);
    try {
      const noteContent = formData.note || "Report approved";
      await updateDoc(doc(db, "reports", report.id), {
        status: "approved",
        dateApproved: serverTimestamp(),

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
        alerts: arrayUnion({
          ...createAlert(noteContent, "admin", "estate", report.status),
          subtype: "confirmed",
        }),
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
        alerts: arrayUnion({
          ...createAlert(reason, "admin", "estate", report.status),
          subtype: "denied",
        }),
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
        alerts: arrayUnion(
          createAlert(
            `Materials procured at ₵${parsed.toLocaleString()}`,
            "procurement",
            "estate",
            report.status,
          ),
        ),
      });
      alert("Materials marked as procured!");
      setProcurementCost("");
      setDisplayDetails(false);
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
      const updatePayload = {
        assignedTo: formData.selectedWorker,
        status: "assigned",
        dateAssigned: serverTimestamp(),
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

      // If assigning directly from approved (no materials), also hide the add materials section
      const msg =
        report.status === "approved"
          ? "Work assigned directly (no materials required)!"
          : "Work assigned to worker!";
      alert(msg);
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
        alerts: arrayUnion(
          createAlert(
            "Job accepted by worker",
            report.assignedTo,
            "estate",
            report.status,
          ),
        ),
      });
      alert("Job accepted!");
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error accepting job:", error);
      alert("Failed to accept job");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectJob = async () => {
    if (!canUserAcceptOrRejectJob(user, report)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "rejected",
        dateRejected: serverTimestamp(),
        alerts: arrayUnion(
          createAlert(
            "Job rejected by worker",
            report.assignedTo,
            "estate",
            report.status,
          ),
        ),
      });
      alert("Job rejected.");
      setDisplayDetails(false);
    } catch (error) {
      console.error("Error rejecting job:", error);
      alert("Failed to reject job");
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
  // New: capture the chosen file + generate a preview
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

      await updateDoc(doc(db, "reports", report.id), {
        status: "completed",
        dateCompleted: serverTimestamp(),
        completionImage: base64Image,
      });

      alert("Work marked as completed!");
      setDisplayDetails(false);
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

      // New: surface the worker's note/reason once they've accepted or rejected
      case "accepted":
      case "rejected":
        return (
          [...report.alerts]
            .filter(
              (a) =>
                a.sentBy === "worker" &&
                a.sentTo === "estate" &&
                a.type === "assigned",
            )
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null
        );

      default:
        return null;
    }
  };

  const relevantAlert = getRelevantAlert();

  const reportDetails = (
    <div className={`flex flex-col px-10 gap-10 pb-20`}>
      <div className="flex items-center gap-2">
        <h2 className={`text-lg md:text-xl ${theme.detailsLabelColor}`}>
          Sent By:
        </h2>
        <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
          {report.reporter}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <h2
          className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
        >
          Priority Level:
        </h2>
        <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
          {report.priorityLevel}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <h2
          className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
        >
          Category:
        </h2>
        <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
          {report.category}
        </p>
      </div>

      <div className="flex gap-2">
        <h2
          className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
        >
          Description:
        </h2>
        <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
          {report.reportDescription}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <h2
          className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
        >
          Date Sent:
        </h2>
        <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
          {formatDate(report.dateSent)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <h2
          className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
        >
          Sender Contact:
        </h2>
        <PhoneCallButton
          phoneNumber={report.reporterContact}
          label={report.reporter}
        />
      </div>

      <div className="flex items-center gap-2">
        <h2
          className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
        >
          Location:
        </h2>
        <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
          {report.location}
        </p>
      </div>

      {report.image && (
        <div className="flex flex-col gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Attached Image:
          </h2>
          <img
            src={report.image}
            alt="Report attachment"
            className="w-full max-h-96 object-contain rounded-xl shadow border border-gray-200 cursor-pointer"
            onClick={() => window.open(report.image, "_blank")}
          />
        </div>
      )}

      {report.dateApproved && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Approved:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateApproved)}
          </p>
        </div>
      )}

      {report.dateCostAdded && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Materials Added:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateCostAdded)}
          </p>
        </div>
      )}

      {report.dateConfirmed && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Confirmed:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateConfirmed)}
          </p>
        </div>
      )}

      {report.dateProcured && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Procured:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateProcured)}
          </p>
        </div>
      )}

      {report.dateAssigned && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Assigned:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateAssigned)}
          </p>
        </div>
      )}
      {/* New: Date Accepted / Date Rejected */}
      {report.dateRejected && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Rejected:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateRejected)}
          </p>
        </div>
      )}
      {report.dateReAssigned && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Re-Assigned:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateReAssigned)}
          </p>
        </div>
      )}
      {report.dateAccepted && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Accepted:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateAccepted)}
          </p>
        </div>
      )}

      {report.assignedTo && ["admin", "estate"].includes(user?.role) && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Technician:
          </h2>
          <div className="flex flex-col gap-1">
            <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
              {assignedWorker?.name}
            </p>
            <PhoneCallButton
              phoneNumber={assignedWorker?.phoneNumber}
              label={assignedWorker?.name}
            />
          </div>
        </div>
      )}

      {report.dateCompleted && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Completed:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateCompleted)}
          </p>
        </div>
      )}

      {report.dateCostDenied && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Materials Denied:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateCostDenied)}
          </p>
        </div>
      )}

      {/* Materials table — shown to admin & estate when materials exist */}
      {Array.isArray(report.materials) &&
        report.materials.length > 0 &&
        ["admin", "estate", "procurement"].includes(user.role) && (
          <div className="flex flex-col gap-2">
            <h2
              className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
            >
              Materials Required:
            </h2>
            <MaterialsTable
              materials={report.materials}
              onChange={() => {}}
              readOnly
            />
          </div>
        )}

      {(report.cost != null || report.maintenanceCost != null) &&
        ["admin", "estate"].includes(user?.role) && (
          <div className="flex flex-col gap-1">
            <h2
              className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
            >
              Cost Summary:
            </h2>
            <div className="pl-2 space-y-1">
              {report.cost != null && (
                <p className={`text-red-400 ${theme.detailsValueColor}`}>
                  Materials Cost: ₵{Number(report.cost).toLocaleString()}
                </p>
              )}
              {report.maintenanceCost != null && (
                <p className={`text-red-400 ${theme.detailsValueColor}`}>
                  Maintenance Cost: ₵
                  {Number(report.maintenanceCost).toLocaleString()}
                </p>
              )}
              <p
                className={`font-semibold text-red-400 md:text-lg ${theme.detailsValueColor}`}
              >
                Total Cost: ₵{getTotalCost(report).toLocaleString()}
              </p>
            </div>
          </div>
        )}

      {relevantAlert && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            {report.status === "denied"
              ? "Denial Reason:"
              : report.status === "costDenied"
                ? "Denial Note:"
                : report.status === "rejected"
                  ? "Rejection Reason:"
                  : "Note:"}
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {relevantAlert.content}
          </p>
        </div>
      )}

      {report.instructions && user?.role !== "staff" && (
        <div className="flex gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Instructions:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {report.instructions}
          </p>
        </div>
      )}

      {report.feedback && (
        <div className="flex gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Feedback:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {report.feedback}
          </p>
        </div>
      )}

      {/* New: read-only view of the completion photo once the job is done */}
      {report.completionImage && (
        <div className="flex flex-col gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Completion Photo:
          </h2>
          <img
            src={report.completionImage}
            alt="Completed work"
            className="w-full max-h-96 object-contain rounded-xl shadow border border-gray-200 cursor-pointer"
            onClick={() => window.open(report.completionImage, "_blank")}
          />
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
          {report.status === "approved" && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              If no materials are needed, skip this and use the{" "}
              <span className="font-semibold">Assign Worker</span> section below
              to assign work directly.
            </p>
          )}

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

      {/* PROCUREMENT ACTIONS - Enter Cost & Mark Procured */}
      {canUserMarkProcured(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-4">
          <h3 className="font-bold text-gray-800">
            Procurement Actions - Purchase Materials
          </h3>

          {Array.isArray(report.materials) && report.materials.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">
                Materials to Procure:
              </p>
              <MaterialsTable
                materials={report.materials}
                onChange={() => {}}
                readOnly
              />
            </div>
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
              className="w-full p-2 border border-gray-400 rounded"
              min="0"
              step="0.01"
            />
          </div>

          <button
            onClick={handleMarkProcured}
            disabled={loading}
            className="bg-teal-500 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            {loading ? "Processing..." : "Mark as Procured"}
          </button>
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

      {/* ESTATE ACTIONS - Submit Maintenance Cost */}
      {canUserSubmitCost(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">
            Estate Actions - Submit Maintenance Cost
          </h3>
          <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
            Enter any additional labor/maintenance cost for the completed work.
            This will be added to the materials cost to give the total cost.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maintenance Cost (₵)
            </label>
            <input
              type="number"
              placeholder="e.g. 150.00"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              className="w-full p-2 border border-gray-400 rounded"
              min="0"
              step="0.01"
            />
          </div>
          <button
            onClick={handleSubmitCost}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded w-full"
          >
            {loading ? "Submitting..." : "Submit Maintenance Cost"}
          </button>
        </div>
      )}

      {/* WORKER ACTIONS - Accept / Reject */}
      {canUserAcceptOrRejectJob(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">
            Worker Actions — Respond to Assignment
          </h3>
          {report.instructions && (
            <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">
              <span className="font-semibold">Instructions: </span>
              {report.instructions}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAcceptJob}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Accept Job"}
            </button>
            <button
              onClick={handleRejectJob}
              disabled={loading}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Reject Job"}
            </button>
          </div>
        </div>
      )}

      {/* WORKER ACTIONS - Complete Work */}
      {canUserComplete(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-4">
          <h3 className="font-bold text-gray-800">
            Worker Actions — Complete Work
          </h3>

          <CompletionImageUploader
            preview={completionImagePreview}
            onChange={handleCompletionImageChange}
          />

          {uploadError && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
              ⚠ {uploadError}
            </p>
          )}

          <button
            onClick={handleCompleteWork}
            disabled={loading || !completionImage}
            className={`font-bold py-2 px-4 rounded w-full text-white transition ${
              loading || !completionImage
                ? "bg-green-300 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-800 cursor-pointer"
            }`}
          >
            {loading ? "Processing..." : "Mark Work as Completed"}
          </button>
        </div>
      )}

      {/* STAFF ACTIONS - Cancel Incoming Report */}
      {user?.role === "staff" &&
        report?.reporterId === user?.ID &&
        report?.status === "incoming" && (
          <div className="bg-white rounded-lg p-5 space-y-3">
            <h3 className="font-bold text-gray-800">Staff Actions</h3>
            <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              Cancel this report only while it is still incoming. This
              permanently deletes the report from Firestore.
            </p>
            <button
              onClick={handleCancelReport}
              disabled={loading}
              className="bg-red-600 hover:bg-red-800 text-white font-bold py-2 px-4 rounded w-full"
            >
              {loading ? "Processing..." : "Cancel Report"}
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
      className={`fixed top-0 md:top-[10%] py-24 md:py-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden right-0 w-full md:max-w-[700px] h-screen md:max-h-[80%] md:right-5 md:rounded-xl ${reportDetailsBgColor} z-80 md:shadow-xl ${theme.detailsBg} overflow-y-auto ${
        closing ? "slide-out-right" : "slide-in-right"
      }`}
    >
      <span
        className={`fixed top-20 md:top-5 right-5 ${theme.detailsCloseText} cursor-pointer text-xl font-bold`}
        onClick={() => setDisplayDetails(false)}
      >
        X
      </span>

      {reportDetails}
    </div>
  );
}
