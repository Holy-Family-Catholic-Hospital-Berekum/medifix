import { jsPDF } from "jspdf";

// Utility functions for the maintenance app

/**
 * Format a Firestore timestamp to a readable date string
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
 * Generate a PDF report with signatures
 */
export const generatePDFReport = (report) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = 595.28;
  let y = 40;

  const addLine = (text, fontSize = 12, isBold = false) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, pageWidth - 80);
    doc.text(lines, 40, y);
    y += lines.length * (fontSize + 4);
  };

  addLine("Maintenance Report", 18, true);
  y += 10;
  addLine(`Report ID: ${report.id || "N/A"}`);
  addLine(`Status: ${report.status || "N/A"}`);
  y += 10;

  addLine("Report Details", 14, true);
  addLine(`Category: ${report.category || "N/A"}`);
  addLine(`Priority Level: ${report.priorityLevel || "N/A"}`);
  addLine(`Location: ${report.location || "N/A"}`);
  addLine(`Description: ${report.reportDescription || "N/A"}`);
  y += 10;

  addLine("Reporter Information", 14, true);
  addLine(`Name: ${report.reporter || "N/A"}`);
  addLine(`Contact: ${report.reporterContact || "N/A"}`);
  y += 10;

  addLine("Dates", 14, true);
  addLine(`Submitted: ${formatDate(report.dateSent)}`);
  addLine(`Approved: ${formatDate(report.dateApproved)}`);
  addLine(`Assigned: ${formatDate(report.dateAssigned)}`);
  addLine(`Confirmed: ${formatDate(report.dateConfirmed)}`);
  addLine(`Completed: ${formatDate(report.dateCompleted)}`);
  addLine(`Due: ${formatDate(report.dateDue)}`);
  y += 10;

  addLine("Cost Information", 14, true);
  addLine(
    `Estimated Cost: ${report.cost ? `$${report.cost}` : "Not specified"}`,
  );
  addLine(`Cost Description: ${report.costDescription || "N/A"}`);
  y += 10;

  if (report.instructions) {
    addLine("Work Instructions", 14, true);
    addLine(report.instructions);
    y += 10;
  }

  if (report.assignedTo) {
    addLine("Assigned Worker", 14, true);
    addLine(`Worker ID: ${report.assignedTo}`);
    y += 10;
  }

  if (report.feedback) {
    addLine("Feedback", 14, true);
    addLine(report.feedback);
    addLine(`Feedback Date: ${formatDate(report.feedbackDate)}`);
    y += 10;
  }

  y += 30;
  addLine("Estate Manager Signature:", 12, true);
  y += 30;
  doc.line(40, y, pageWidth - 40, y);
  y += 50;
  addLine("Procurement Officer Signature:", 12, true);
  y += 30;
  doc.line(40, y, pageWidth - 40, y);

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
  };
  return colors[status] || "bg-gray-400 text-white";
};

/**
 * Check if current user can perform action on report
 */
export const canUserApprove = (user, report) => {
  return user?.role === "admin" && report?.status === "incoming";
};

export const canUserConfirmCost = (user, report) => {
  return user?.role === "admin" && report?.status === "pending";
};

export const canUserAddCost = (user, report) => {
  return user?.role === "estate" && report?.status === "approved";
};

export const canUserAssignWorker = (user, report) => {
  return (
    user?.role === "estate" &&
    report?.status in { confirmed: true, assigned: true }
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
