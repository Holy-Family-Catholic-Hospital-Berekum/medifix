import { useState, useEffect } from "react";
import { notifyOnStatusChange } from "../src/notifications/notifyOnStatusChange";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  doc,
  setDoc,
  where,
  getCountFromServer,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../src/firebase";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB — guards against reading a huge
// original photo fully into memory via FileReader before any compression
// has happened.

export default function ReportForm({ formPopup, onClose }) {
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  // Get current user from localStorage
  const storedUser = JSON.parse(localStorage.getItem("user"));
  const currentUser = storedUser?.data;

  const [formData, setFormData] = useState({
    category: "Plumbing",
    priorityLevel: "routine",
    // currentUser can be undefined on first render (e.g. before localStorage
    // resolves), so fall back to "" — starting this as undefined would make
    // the location input silently flip from uncontrolled to controlled once
    // currentUser loads, which React warns about.
    location: currentUser?.location ?? "",
    reportDescription: "",
    costDescription: "",
  });

  // ✅ When formPopup goes false, play slide-down before hiding
  useEffect(() => {
    if (!formPopup) {
      setClosing(true);
      const t = setTimeout(() => setClosing(false), 300);
      return () => clearTimeout(t);
    }
  }, [formPopup]);

  // Revoke the current preview's object URL whenever it changes or the
  // component unmounts, so blob references don't accumulate in memory
  // across image swaps / repeated form opens within the same session.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Validate user is staff
  if (currentUser && currentUser.role !== "staff") {
    return null; // Only staff can see and use this form
  }

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () =>
        reject(new Error("Could not read the image file."));
      reader.readAsDataURL(file);

      reader.onload = (event) => {
        const img = new Image();

        // Without this, a corrupt/unsupported file leaves the promise
        // pending forever — the submit button would spin indefinitely with
        // no error shown.
        img.onerror = () =>
          reject(
            new Error("Could not process the image. Please try another photo."),
          );

        img.src = event.target.result;

        img.onload = () => {
          const canvas = document.createElement("canvas");

          const maxWidth = 600;

          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");

          ctx.drawImage(img, 0, 0, width, height);

          // Converts to compressed JPEG
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.5);

          resolve(compressedBase64);
        };
      };
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Reject oversized originals before FileReader loads the whole thing
    // into memory — compression happens after this point, so an
    // uncapped file here means holding a huge base64 string in RAM for no
    // reason.
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large. Please choose a photo under 15MB.");
      return;
    }

    setError("");

    // Revoke the previous preview (if replacing an existing selection)
    // before creating the new one, so we never leak the old blob URL.
    if (imagePreview) URL.revokeObjectURL(imagePreview);

    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview("");
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
      //
      // Bounded to the current month via a `dateSent >=` clause in the
      // query itself, rather than fetching this reporter's ENTIRE report
      // history and filtering client-side. The old approach re-read every
      // report that reporter had ever submitted on every single new
      // submission — cost and latency that grew without bound the longer
      // someone used the app. This reads only this month's reports for
      // them, which stays small and roughly constant over time regardless
      // of their lifetime report count.
      //
      // Uses getCountFromServer rather than getDocs — this is billed as a
      // single lightweight aggregation read and never transfers the
      // matching documents themselves, just the count.
      //
      // Requires a composite index on reports: (reporterId ASC, dateSent
      // ASC). Firestore will show a direct link to auto-create it the
      // first time this runs if it doesn't exist yet, or predeclare it in
      // firestore.indexes.json and run `firebase deploy --only firestore:indexes`.
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const reporterReportsQuery = query(
        collection(db, "reports"),
        where("reporterId", "==", currentUser.ID),
        where("dateSent", ">=", thisMonth),
      );
      const countSnapshot = await getCountFromServer(reporterReportsQuery);
      const reportsThisMonthCount = countSnapshot.data().count + 1;

      let imageBase64 = "";

      if (image) {
        try {
          imageBase64 = await compressImage(image);
        } catch (imgProcessError) {
          console.error("Error processing image:", imgProcessError);
          setError(
            imgProcessError.message ||
              "Failed to process the attached image. Please try a different photo or remove it.",
          );
          setLoading(false);
          return;
        }
      }

      // Create the report document
      const reportData = {
        // Status tracking
        status: "incoming",
        overdue: false,
        cost: null,
        // Date fields
        dateSent: serverTimestamp(),
        dateReportDenied: null,
        dateApproved: null,
        dateCostAdded: null,
        dateCostDenied: null,
        dateConfirmed: null,
        dateProcured: null,
        dateAssigned: null,
        dateRejected: null,
        dateAccepted: null,
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

      notifyOnStatusChange(
        null,
        "incoming",
        {
          id: docRef.id,
          reporterId: reportData.reporterId,
          assignedTo: reportData.assignedTo,
        },
        {
          title: "New maintenance report",
          body: `${formData.category} — ${formData.priorityLevel}`,
        },
      ).catch((err) => console.error("notifyOnStatusChange failed:", err));

      // Photos live in a separate reportImages/{reportId} doc, not on the
      // report itself — this keeps list-view snapshots (which pull every
      // visible report on every load) free of image payloads. Only written
      // if the staff member actually attached a photo.
      //
      // If this write fails, the report itself has already been created
      // successfully — we don't roll that back, since the photo was always
      // optional. Instead we track the failure and surface it in the
      // final success message so the user knows to re-attach it later
      // rather than assuming it went through.
      let imageSaveFailed = false;
      if (imageBase64) {
        try {
          await setDoc(doc(db, "reportImages", docRef.id), {
            image: imageBase64,
          });
        } catch (imgError) {
          console.error("Failed to save report image:", imgError);
          imageSaveFailed = true;
        }
      }

      // Success
      alert(
        imageSaveFailed
          ? "Report submitted successfully, but the attached photo failed to save. You can add it later from the report details."
          : "Report submitted successfully!",
      );
      handleRemoveImage();
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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-center items-end">
      <form
        onSubmit={handleSubmit}
        className={`w-full h-full md:h-auto md:max-w-3xl md:rounded-3xl overflow-hidden shadow-2xl ${
          closing ? "slide-down" : "slide-up"
        }`}
        style={{
          background:
            "linear-gradient(180deg,#FFF7F2 0%,#FFECDD 45%,#FFF 100%)",
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#F88534] to-orange-500 px-8 pt-20 pb-8 md:py-8 text-white">
          <h1 className="text-3xl font-bold">Maintenance Report</h1>

          <p className="mt-2 text-orange-100">
            Report a maintenance issue and our team will attend to it as soon as
            possible.
          </p>
        </div>

        {/* Form */}
        <div className="overflow-y-auto max-h-[75vh] px-8 py-8">
          {error && (
            <div className="mb-6 rounded-xl border border-red-300 bg-red-100 p-4 text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Category */}
            <div>
              <label
                htmlFor="category"
                className="block mb-2 font-semibold text-gray-700"
              >
                🔧 Category
              </label>

              <select
                name="category"
                id="category"
                value={formData.category}
                onChange={handleInputChange}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 focus:border-[#F88534] focus:ring-4 focus:ring-orange-200 outline-none transition"
              >
                <option value="Plumbing">Plumbing</option>
                <option value="Electricity">Electricity</option>
                <option value="Carpentry">Carpentry</option>
                <option value="Masonery">Masonry</option>
                <option value="Refrigerator">Refrigerator</option>
                <option value="Air-conditioner">Air Conditioner</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label
                htmlFor="priorityLevel"
                className="block mb-2 font-semibold text-gray-700"
              >
                ⚠ Priority Level
              </label>

              <select
                name="priorityLevel"
                id="priorityLevel"
                value={formData.priorityLevel}
                onChange={handleInputChange}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 focus:border-[#F88534] focus:ring-4 focus:ring-orange-200 outline-none transition"
              >
                <option value="routine">
                  🟢 Routine (Due within 1–2 days)
                </option>

                <option value="urgent">🟠 Urgent (Due within 12 hours)</option>

                <option value="emergency">
                  🔴 Emergency (Immediate response)
                </option>
              </select>
            </div>

            {/* Location */}
            <div>
              <label
                htmlFor="location"
                className="block mb-2 font-semibold text-gray-700"
              >
                📍 Location
              </label>

              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                required
                placeholder="e.g. Doctors Flat, Room 20"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 focus:border-[#F88534] focus:ring-4 focus:ring-orange-200 outline-none transition"
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="reportDescription"
                className="block mb-2 font-semibold text-gray-700"
              >
                📝 Problem Description
              </label>

              <textarea
                name="reportDescription"
                id="reportDescription"
                value={formData.reportDescription}
                onChange={handleInputChange}
                rows={6}
                required
                placeholder="Describe the issue in as much detail as possible..."
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 resize-none focus:border-[#F88534] focus:ring-4 focus:ring-orange-200 outline-none transition"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                📷 Attach Image (Optional)
              </label>

              <div className="grid grid-cols-2 gap-3">
                {/* Take Photo */}
                <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-orange-300 rounded-2xl bg-orange-50 cursor-pointer hover:bg-orange-100 transition">
                  <span className="text-4xl">📷</span>
                  <p className="text-gray-600 text-sm text-center px-2">
                    Take a photo
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>

                {/* Choose from Library */}
                <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-orange-300 rounded-2xl bg-orange-50 cursor-pointer hover:bg-orange-100 transition">
                  <span className="text-4xl">🖼️</span>
                  <p className="text-gray-600 text-sm text-center px-2">
                    Choose from gallery
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>

              <p className="text-xs text-gray-400 mt-2 text-center">
                Maximum 1 image
              </p>

              {imagePreview && (
                <div className="mt-4">
                  <img
                    src={imagePreview}
                    alt="preview"
                    className="w-full h-48 object-cover rounded-xl shadow"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="mt-2 text-red-500 text-sm"
                  >
                    Remove image
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-10 flex flex-col-reverse md:flex-row gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 py-3 font-semibold text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl py-3 font-semibold text-lg text-white bg-gradient-to-r from-[#F88534] to-orange-600 hover:shadow-xl hover:scale-[1.02] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                  Submitting...
                </span>
              ) : (
                "Submit Report"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
