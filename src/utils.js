import { jsPDF } from "jspdf";

// Add this function to your src/utils.js file
// It checks all non-terminal reports and marks them overdue if dateDue has passed.
// Call it once on app load from Home.jsx after reports are fetched.

import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";

export async function markOverdueReports() {
  try {
    const now = new Date();

    // Fetch all active reports whose due date has passed
    // We query for each non-terminal status separately since
    // Firestore 'not-in' has a limit of 10 values
    const activeStatuses = [
      "incoming",
      "approved",
      "pending",
      "confirmed",
      "assigned",
      "costDenied",
    ];

    const snapshot = await getDocs(
      query(collection(db, "reports"), where("status", "in", activeStatuses)),
    );

    if (snapshot.empty) return;

    const overdue = snapshot.docs.filter((docSnap) => {
      const data = docSnap.data();
      if (!data.dateDue) return false;
      // dateDue may be a Firestore Timestamp or a plain JS Date
      const due = data.dateDue?.toDate
        ? data.dateDue.toDate()
        : new Date(data.dateDue);
      return due < now;
    });

    if (overdue.length === 0) return;

    // Batch update all overdue reports
    const batch = writeBatch(db);
    overdue.forEach((docSnap) => {
      batch.update(doc(db, "reports", docSnap.id), { status: "overdue" });
    });
    await batch.commit();

    console.log(`Marked ${overdue.length} report(s) as overdue.`);
  } catch (err) {
    console.error("markOverdueReports failed:", err);
  }
}

// Utility functions for the maintenance app

/**
 * Format a Firestore timestamp to a readable date string
 *
 *
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return "N/A";
  try {
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
    if (timestamp instanceof Date) return timestamp.toLocaleDateString();
    return new Date(timestamp).toLocaleDateString();
  } catch (e) {
    return "Invalid date";
  }
};

/**
 * Create an alert object for notifications
 */
export const createAlert = (content, sentBy, sentTo, type) => {
  return {
    content,
    sentBy,
    sentTo,
    date: new Date().toISOString(),
    type,
  };
};

/**
 * Generate a PDF report with a materials table and signatures
 */
export const generatePDFReport = (report) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = 595.28;
  const margin = 40;
  let y = 40;

  const addLine = (text, fontSize = 12, isBold = false, color = [0, 0, 0]) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * (fontSize + 4);
  };

  const addSectionGap = (size = 10) => {
    y += size;
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  addLine("MAINTENANCE DEPARTMENT", 14, true);
  addLine("MATERIALS / ITEMS REQUEST FORM", 11, false, [80, 80, 80]);
  addSectionGap(6);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageWidth - margin, y);
  addSectionGap(8);

  // Work title & category on one line
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Work Title:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(report.category || "N/A", margin + 62, y);
  doc.setFont("helvetica", "bold");
  doc.text("Work Category:", margin + 250, y);
  doc.setFont("helvetica", "normal");
  doc.text(report.location || "N/A", margin + 336, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Priority:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(report.priorityLevel || "N/A", margin + 48, y);
  doc.setFont("helvetica", "bold");
  doc.text("Report ID:", margin + 250, y);
  doc.setFont("helvetica", "normal");
  doc.text(report.id || "N/A", margin + 306, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Reporter:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${report.reporter || "N/A"}  |  ${report.reporterContact || ""}`,
    margin + 52,
    y,
  );
  y += 18;

  addSectionGap(4);
  doc.line(margin, y, pageWidth - margin, y);
  addSectionGap(10);

  // ── Description ─────────────────────────────────────────────────────────────
  addLine("Problem Description", 11, true);
  addSectionGap(2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const descLines = doc.splitTextToSize(
    report.reportDescription || "N/A",
    pageWidth - margin * 2,
  );
  doc.text(descLines, margin, y);
  y += descLines.length * 14;
  addSectionGap(10);

  // ── Materials Table ──────────────────────────────────────────────────────────
  const materials = Array.isArray(report.materials) ? report.materials : [];

  if (materials.length > 0) {
    addLine("Materials / Items Required", 11, true);
    addSectionGap(6);

    // Column widths
    const colWidths = [30, 220, 80, 110]; // S/N | Description | Qty | Spec/Size
    const headers = [
      "S/N",
      "Description of Material/Item",
      "Qty Required",
      "Specification / Size",
    ];
    const rowHeight = 22;
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    // Header row background
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, tableWidth, rowHeight, "F");
    doc.setDrawColor(160, 160, 160);
    doc.rect(margin, y, tableWidth, rowHeight, "S");

    // Header text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    let colX = margin;
    headers.forEach((h, i) => {
      doc.text(h, colX + 4, y + 14);
      colX += colWidths[i];
    });
    y += rowHeight;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    materials.forEach((item, idx) => {
      // Alternate row shading
      if (idx % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y, tableWidth, rowHeight, "F");
      }
      doc.setDrawColor(200, 200, 200);
      doc.rect(margin, y, tableWidth, rowHeight, "S");

      const cells = [
        String(idx + 1),
        item.description || "",
        String(item.quantity || ""),
        item.specification || "",
      ];
      colX = margin;
      cells.forEach((cell, i) => {
        const clipped = doc.splitTextToSize(cell, colWidths[i] - 8)[0] || "";
        doc.text(clipped, colX + 4, y + 14);
        colX += colWidths[i];
      });
      y += rowHeight;
    });

    addSectionGap(12);
  }

  // ── Cost ────────────────────────────────────────────────────────────────────
  if (report.cost && ["admin", "estate"].includes(report._userRole)) {
    addLine("Cost Information", 11, true);
    addSectionGap(2);
    addLine(`Total Estimated Cost: ₵${report.cost}`);
  }

  // ── Admin confirmation note ──────────────────────────────────────────────────
  const confirmationAlert = report.alerts?.find(
    (a) =>
      a.sentBy === "admin" && a.sentTo === "estate" && a.type === "pending",
  );
  if (confirmationAlert?.content) {
    addSectionGap(4);
    addLine("Admin Confirmation Note", 11, true);
    addLine(confirmationAlert.content);
    addLine(
      `Note Date: ${confirmationAlert.date ? new Date(confirmationAlert.date).toLocaleDateString() : "N/A"}`,
    );
  }

  // ── Instructions / Feedback ──────────────────────────────────────────────────
  if (report.instructions) {
    addSectionGap(6);
    addLine("Work Instructions", 11, true);
    addLine(report.instructions);
  }

  if (report.assignedTo) {
    addSectionGap(6);
    addLine("Assigned Worker", 11, true);
    addLine(`Worker ID: ${report.assignedTo}`);
  }

  if (report.feedback) {
    addSectionGap(6);
    addLine("Feedback", 11, true);
    addLine(report.feedback);
    addLine(`Feedback Date: ${formatDate(report.feedbackDate)}`);
  }

  // ── Dates ────────────────────────────────────────────────────────────────────
  addSectionGap(10);
  doc.line(margin, y, pageWidth - margin, y);
  addSectionGap(8);
  addLine("Timeline", 11, true);
  addSectionGap(2);
  [
    ["Submitted", report.dateSent],
    ["Approved", report.dateApproved],
    ["Confirmation Request", report.dateCostAdded],
    ["Confirmed", report.dateConfirmed],
    ["Assigned", report.dateAssigned],
    ["Completed", report.dateCompleted],
  ].forEach(([label, date]) => {
    if (date) addLine(`${label}: ${formatDate(date)}`, 10);
  });

  // ── Signatures ───────────────────────────────────────────────────────────────
  addSectionGap(20);
  doc.line(margin, y, pageWidth - margin, y);
  addSectionGap(12);

  const sigY = y;
  // Left signature only (Requested by Maintenance Manager)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Requested by Maintenance Manager:", margin, sigY);
  doc.setFont("helvetica", "normal");
  doc.text(report.reporter || "", margin, sigY + 14);
  doc.line(margin, sigY + 30, margin + 200, sigY + 30);
  doc.setFontSize(8);
  doc.text("Signature & Date", margin, sigY + 42);

  y = sigY + 60;
  addSectionGap(14);

  // Procurement section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("FOR PROCUREMENT OFFICE", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Procurement Manager's Signature:", margin, y);
  doc.line(margin + 200, y, pageWidth - margin, y);
  y += 20;
  doc.text("Date Received:", margin, y);
  doc.line(margin + 80, y, margin + 220, y);
  doc.text("Cost of Materials:", margin + 240, y);
  doc.line(margin + 330, y, pageWidth - margin, y);
  y += 20;
  doc.text("Remarks:", margin, y);
  doc.line(margin + 52, y, pageWidth - margin, y);

  doc.save(`Maintenance_Report_${report.id || "unknown"}.pdf`);
};

/**
 * Status display helper
 */
export const getStatusColor = (status) => {
  const colors = {
    incoming: "bg-yellow-400 text-gray-900",
    approved: "bg-blue-400 text-white",
    pending: "bg-orange-400 text-white",
    confirmed: "bg-green-400 text-white",
    assigned: "bg-purple-400 text-white",
    completed: "bg-green-600 text-white",
    denied: "bg-red-600 text-white",
    costDenied: "bg-red-400 text-white",
  };
  return colors[status] || "bg-gray-400 text-white";
};

export const canUserApprove = (user, report) => {
  return user?.role === "admin" && report?.status === "incoming";
};

export const canUserConfirmCost = (user, report) => {
  return user?.role === "admin" && report?.status === "pending";
};

export const canUserAddCost = (user, report) => {
  return (
    user?.role === "estate" &&
    (report?.status === "approved" || report?.status === "costDenied")
  );
};

export const canUserAssignWorker = (user, report) => {
  return (
    user?.role === "estate" &&
    ["confirmed", "assigned"].includes(report?.status)
  );
};

export const canUserComplete = (user, report) => {
  return (
    user?.role === "worker" &&
    report?.status === "assigned" &&
    report?.assignedTo === user?.ID
  );
};

export const canUserSendFeedback = (user, report) => {
  return (
    user?.role === "staff" &&
    report?.status === "completed" &&
    report?.reporterId === user?.ID &&
    !report?.feedback
  );
};

export const canUserDownloadPDF = (user, report) => {
  return (
    user?.role === "estate" &&
    (report?.status === "confirmed" ||
      report?.status === "assigned" ||
      report?.status === "completed")
  );
};
