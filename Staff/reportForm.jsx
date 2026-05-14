import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../src/firebase";

export default function ReportForm({ formPopup, onClose }) {
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    category: "Plumbing",
    priorityLevel: "routine",
    location: "",
    reportDescription: "",
    costDescription: "",
    ID: "",
  });

  // Get current user from localStorage
  const storedUser = JSON.parse(localStorage.getItem("user"));
  const currentUser = storedUser?.data;

  // ✅ When formPopup goes false, play slide-down before hiding
  useEffect(() => {
    if (!formPopup) {
      setClosing(true);
      const t = setTimeout(() => setClosing(false), 300);
      return () => clearTimeout(t);
    }
  }, [formPopup]);

  // Validate user is staff
  if (currentUser && currentUser.role !== "staff") {
    return null; // Only staff can see and use this form
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const calculateDueDate = (priorityLevel) => {
    const now = new Date();
    if (priorityLevel === "urgent") {
      // 12 hours from now
      return new Date(now.getTime() + 12 * 60 * 60 * 1000);
    } else if (priorityLevel === "emergency") {
      return new Date(now.getTime() + 60 * 60 * 1000);
    } else {
      // 2 days from now
      return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate required fields
    if (
      !formData.category ||
      !formData.location ||
      !formData.reportDescription
    ) {
      setError("Please fill in all required fields");
      return;
    }

    if (!currentUser) {
      setError("User not authenticated");
      return;
    }

    if (currentUser.role !== "staff") {
      setError("Only staff members can submit reports");
      return;
    }

    try {
      setLoading(true);

      // Get the count of reports this month for this reporter.
      // Use a single-field query to avoid requiring a composite Firestore index.
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const reporterReportsQuery = query(
        collection(db, "reports"),
        where("reporterId", "==", currentUser.ID),
      );
      const reporterReportsSnapshot = await getDocs(reporterReportsQuery);
      const reportsThisMonthCount =
        reporterReportsSnapshot.docs
          .map((doc) => {
            const data = doc.data();
            const dateSent = data.dateSent;
            let sentDate = null;

            if (dateSent?.toDate) {
              sentDate = dateSent.toDate();
            } else if (dateSent instanceof Date) {
              sentDate = dateSent;
            } else if (typeof dateSent === "string") {
              sentDate = new Date(dateSent);
            }

            return sentDate;
          })
          .filter((sentDate) => sentDate && sentDate >= thisMonth).length + 1;

      // Create the report document
      const reportData = {
        // Status tracking
        status: "incoming",
        overdue: false,

        // Date fields
        dateSent: serverTimestamp(),
        dateReportDenied: null,
        dateApproved: null,
        dateCostAdded: null,
        dateCostDenied: null,
        dateConfirmed: null,
        dateAssigned: null,
        dateCompleted: null,

        dateDue: calculateDueDate(formData.priorityLevel),

        // Report content
        reportDescription: formData.reportDescription,
        costDescription: formData.costDescription || "",
        category: formData.category,
        priorityLevel: formData.priorityLevel,
        location: formData.location,

        // Assignment & tracking
        assignedTo: null,
        reporter: currentUser.name,
        reporterId: currentUser.ID,
        reportsThisMonth: reportsThisMonthCount,

        // Additional fields
        feedback: "",
        feedbackViewedBy: [],
        instructions: "",
        notes: [],
        alerts: [],

        // Metadata
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        reporterContact: currentUser.phoneNumber,
      };

      // Add report to Firestore
      const docRef = await addDoc(collection(db, "reports"), reportData);

      // Success
      alert("Report submitted successfully!");
      setFormData({
        category: "Plumbing",
        priorityLevel: "routine",
        location: "",
        reportDescription: "",
        costDescription: "",
      });
      onClose();
    } catch (err) {
      console.error("Error submitting report:", err);
      setError("Failed to submit report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!formPopup && !closing) return null;

  return (
    <div className="z-50 fixed inset-0 flex items-end justify-center bg-black/40">
      <form
        className={`bg-red-300 w-full h-full overflow-y-auto pt-24 flex flex-col items-center gap-4 rounded-t-2xl ${
          closing ? "slide-down" : "slide-up"
        }`}
        onSubmit={handleSubmit}
      >
        <div className="w-full max-w-[300px] md:max-w-[600px] pt-5 md:pt-10">
          <label htmlFor="category" className="text-lg">
            Category <span className="text-red-600">*</span>
          </label>
          <select
            name="category"
            id="category"
            value={formData.category}
            onChange={handleInputChange}
            className="px-2 w-full border border-red-400 rounded py-2 cursor-pointer"
            required
          >
            <option value="Plumbing">Plumbing</option>
            <option value="Electricity">Electricity</option>
            <option value="Carpentry">Carpentry</option>
            <option value="Masonery">Masonery</option>
            <option value="Refrigerator">Refrigerator</option>
            <option value="Air-conditioner">Air-conditioner</option>
          </select>
        </div>

        <div className="w-full max-w-[300px] md:max-w-[600px]">
          <label htmlFor="priorityLevel" className="text-lg">
            Priority Level <span className="text-red-600">*</span>
          </label>
          <select
            name="priorityLevel"
            id="priorityLevel"
            value={formData.priorityLevel}
            onChange={handleInputChange}
            className="px-2 w-full border border-red-400 rounded py-2 cursor-pointer"
            required
          >
            <option value="routine">Routine (Due in 1 to 2 days)</option>
            <option value="urgent">Urgent (Due in 12 hours)</option>
            <option value="emergency">Emergency (Emmediate responds)</option>
          </select>
        </div>

        <div className="w-full max-w-[300px] md:max-w-[600px]">
          <label htmlFor="location" className="text-lg">
            Location <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleInputChange}
            className="bg-red-400 w-full p-2 rounded"
            placeholder="Enter Your Hostel/Department/Room"
            required
          />
        </div>

        <div className="w-full max-w-[300px] md:max-w-[600px]">
          <label htmlFor="reportDescription" className="text-lg">
            Problem Description <span className="text-red-600">*</span>
          </label>
          <textarea
            name="reportDescription"
            id="reportDescription"
            value={formData.reportDescription}
            onChange={handleInputChange}
            className="bg-red-400 w-full p-2 rounded"
            placeholder="Briefly describe the problem"
            rows="4"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-yellow-400 w-full max-w-[300px] md:max-w-[600px] w-full rounded py-2 text-lg hover:shadow hover:bg-yellow-500 shadow-white cursor-pointer mt-10 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Submit Report"}
        </button>
      </form>
    </div>
  );
}
