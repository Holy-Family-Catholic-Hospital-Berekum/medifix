import { useState, useEffect } from "react";
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
  canUserDropJob, // add this
} from "../src/utils";

const EMPTY_MATERIAL = { description: "", quantity: "", specification: "" };

// How long we'll wait for a completion-photo upload before giving up and
// showing an explicit error, instead of spinning forever.

// ADD this (same pattern as ReportForm's compressImage):
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

// Denial reasons now live in the report's `notes` array instead of the old
// `alerts` field (alerts were being written but never really read anywhere
// useful, so they were dropped from the flow). A note entry looks like:
// { type: "denial", content: "<reason>", date: <JS Date>, by: "<name>" }
//
// NOTE: the date on this entry is a plain `new Date()`, not
// serverTimestamp() — Firestore rejects serverTimestamp() sentinels inside
// array elements passed to arrayUnion(), so a client-side Date is the only
// option here.
function getDenialNote(report) {
  if (!report || report.status !== "denied") return null;
  const denialNotes = (report.notes || []).filter((n) => n?.type === "denial");
  return denialNotes.length
    ? denialNotes[denialNotes.length - 1].content
    : null;
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

  // New: reason a worker gives when dropping a job they can't finish.
  const [dropReason, setDropReason] = useState("");

  // New: reason a worker gives when rejecting a freshly assigned job.
  const [rejectReason, setRejectReason] = useState("");

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

  // Reset the completion-photo picker, drop reason, and reject reason
  // whenever the panel closes so stale input doesn't carry over to the
  // next report opened.
  useEffect(() => {
    if (!displayDetails) {
      setCompletionImage(null);
      setCompletionImagePreview(null);
      setUploadError("");
      setDropReason("");
      setRejectReason("");
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

  if (!visible || !currentReport || currentReport.length === 0) return null;

  const report = currentReport[0];
  const denialReason = getDenialNote(report);

  const assignedWorker = workers.find((w) => w.ID === report.assignedTo);

  // New: is the current user the worker this job is assigned to?
  const isAssignedWorker =
    user?.role === "worker" && report?.assignedTo === user?.ID;

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

    // A denial reason is now required — it's saved into the report's
    // `notes` array (see getDenialNote above) and shown to the reporter,
    // replacing the old `alerts`-based approach.
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
      // assignment. We track that via dateReAssigned so the history shows
      // both the original assignment date and the reassignment date.
      // `droppedBy` is checked too because dropping clears `assignedTo`
      // back to null, so `report.assignedTo` alone can't tell us this was
      // previously assigned to someone.
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

      // If assigning directly from approved (no materials), also hide the add materials section
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

  // A reject reason is now required — saved into `rejectReason`/`rejectedBy`
  // fields on the report (same shape as the drop-job fields below) and
  // shown to estate/admin in the report details.
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

  // New: worker drops a job they've already accepted (or a reopened job)
  // but can't finish. Clears assignedTo so it goes back to the estate's
  // reassignment pool, and requires a reason so estate has context.
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

      // Write the photo FIRST, while the report is still 'accepted' or
      // 'reopened' — the reportImages security rule checks the report's
      // current status, so this must happen before the report itself
      // flips to 'completed' below. setDoc+merge handles both "no
      // before-photo doc exists yet" and "doc already has one" in one call.
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

      {report.reportsThisMonth != null && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Reports This Month:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {report.reportsThisMonth}
          </p>
        </div>
      )}

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

      {reportImagesData?.image && (
        <div className="flex flex-col gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Attached Image:
          </h2>
          <img
            src={reportImagesData.image}
            alt="Report attachment"
            className="w-full max-h-96 object-contain rounded-xl shadow border border-gray-200 cursor-pointer"
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

      {/* New: Reject Reason / Rejected By — the worker's reason for
          rejecting a freshly assigned job, kept visible to estate/admin
          so it's available as context when reassigning to someone new. */}
      {report.rejectReason && (
        <div className="flex flex-col gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Reject Reason:
          </h2>
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-700 md:text-lg">{report.rejectReason}</p>
            {report.rejectedBy && (
              <p className="text-red-500 text-sm mt-1">
                — Rejected by {report.rejectedBy}
              </p>
            )}
          </div>
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

      {/* New: Date Dropped / Drop Reason / Dropped By — the previous
          worker's reason for being unable to finish, kept visible to
          estate/admin so it's available as context when reassigning to
          someone new. */}
      {report.dateDropped && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Dropped:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateDropped)}
          </p>
        </div>
      )}
      {report.dropReason && (
        <div className="flex flex-col gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Drop Reason:
          </h2>
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <p className="text-orange-700 md:text-lg">{report.dropReason}</p>
            {report.droppedBy && (
              <p className="text-orange-500 text-sm mt-1">
                — Dropped by {report.droppedBy}
              </p>
            )}
          </div>
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

      {/* Reopen reason + date reopened — the report already carries these
          as dedicated fields (set when staff reopens a completed job), this
          panel just wasn't showing them before. */}
      {report.dateReopened && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Date Reopened:
          </h2>
          <p className={`text-red-400 md:text-lg ${theme.detailsValueColor}`}>
            {formatDate(report.dateReopened)}
          </p>
        </div>
      )}
      {report.reopenReason && (
        <div className="flex flex-col gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Reopen Reason:
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-amber-700 md:text-lg">{report.reopenReason}</p>
          </div>
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

      {/* Technician rating — now visible to every role viewing this panel,
          not just the staff member who submitted it. */}
      {report.technicianRating && (
        <div className="flex items-center gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Technician Rating:
          </h2>
          <StarRating value={report.technicianRating} readOnly size="text-xl" />
        </div>
      )}

      {/* New: read-only view of the completion photo once the job is done */}
      {reportImagesData?.completionImage && (
        <div className="flex flex-col gap-2">
          <h2
            className={`text-lg md:text-xl ${theme.detailsLabelColor} whitespace-nowrap`}
          >
            Completion Photo:
          </h2>
          <img
            src={reportImagesData.completionImage}
            alt="Completed work"
            className="w-full max-h-96 object-contain rounded-xl shadow border border-gray-200 cursor-pointer"
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
            placeholder="Add a note… (required if denying)"
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            className="w-full p-2 border border-gray-400 rounded"
            rows="3"
          />
          <p className="text-xs text-gray-400 -mt-2">
            A reason is required to deny a report — it's shown to the reporter.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDeny}
              disabled={loading}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              {loading ? "Processing..." : "Deny"}
            </button>
            <button
              onClick={handleApprove}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              {loading ? "Processing..." : "Approve"}
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
              onClick={handleDenyCost}
              disabled={loading}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Deny"}
            </button>
            <button
              onClick={handleConfirmCost}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Confirm"}
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
          {report.status === "dropped" && (
            <p className="text-sm text-orange-600 bg-orange-50 rounded px-3 py-2">
              This job was dropped by the previously assigned worker. Review the
              drop reason above before reassigning.
            </p>
          )}
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
          <textarea
            placeholder="Reason for rejecting this job (required)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full p-2 border border-gray-400 rounded"
            rows="3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRejectJob}
              disabled={loading || !rejectReason.trim()}
              className={`font-bold py-2 px-4 rounded flex-1 text-white transition ${
                loading || !rejectReason.trim()
                  ? "bg-red-300 cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-700 cursor-pointer"
              }`}
            >
              {loading ? "Processing..." : "Reject Job"}
            </button>
            <button
              onClick={handleAcceptJob}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex-1"
            >
              {loading ? "Processing..." : "Accept Job"}
            </button>
          </div>
        </div>
      )}

      {/* WORKER ACTIONS - Drop Job */}
      {canUserDropJob(user, report) && (
        <div className="bg-white rounded-lg p-5 space-y-3">
          <h3 className="font-bold text-gray-800">Worker Actions — Drop Job</h3>
          <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
            If you're unable to complete this job, you can drop it. It will be
            unassigned from you and returned to Estate for reassignment to
            another worker.
          </p>
          <textarea
            placeholder="Reason for dropping this job (required)..."
            value={dropReason}
            onChange={(e) => setDropReason(e.target.value)}
            className="w-full p-2 border border-gray-400 rounded"
            rows="3"
          />
          <button
            onClick={handleDropWork}
            disabled={loading || !dropReason.trim()}
            className={`font-bold py-2 px-4 rounded w-full text-white transition ${
              loading || !dropReason.trim()
                ? "bg-orange-300 cursor-not-allowed"
                : "bg-orange-600 hover:bg-orange-800 cursor-pointer"
            }`}
          >
            {loading ? "Processing..." : "Drop Job"}
          </button>
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
