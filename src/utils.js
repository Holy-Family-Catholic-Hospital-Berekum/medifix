import { jsPDF } from "jspdf";
import logo from "../images/hfch-logo.png";
// Add this function to your src/utils.js file
// It checks all non-terminal reports and marks them overdue if dateDue has passed.
// Call it once on app load from Home.jsx after reports are fetched.

import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  updateDoc,
  doc,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";


export function isMedianApp() {
  return typeof window !== "undefined" && !!window.median;
}

export async function markOverdueReports(user) {
  if (!user || !["admin", "estate"].includes(user.role)) return;

  try {
    const now = new Date();

    const activeStatuses = [
      "incoming",
      "approved",
      "pending",
      "confirmed",
      "procured",
      "assigned",
      "accepted",
      "costDenied",
    ];

    const snapshot = await getDocs(
      query(
        collection(db, "reports"),
        where("status", "in", activeStatuses),
        where("overdue", "==", false),
      ),
    );

    if (snapshot.empty) return;

    const overdueReports = snapshot.docs.filter((docSnap) => {
      const data = docSnap.data();
      if (!data.dateDue) return false;
      const due = data.dateDue?.toDate
        ? data.dateDue.toDate()
        : new Date(data.dateDue);
      return due < now;
    });

    if (overdueReports.length === 0) return;

    const batch = writeBatch(db);
    overdueReports.forEach((docSnap) => {
      batch.update(doc(db, "reports", docSnap.id), { overdue: true });
    });
    await batch.commit();

    console.log(`Marked ${overdueReports.length} report(s) as overdue.`);
  } catch (err) {
    console.error("markOverdueReports failed:", err);
  }
}

export async function markReportViewed(reportId, userId, status) {
  if (!reportId || !userId || !status) return;
  try {
    await updateDoc(doc(db, "reports", reportId), {
      [`lastViewedStatus.${userId}`]: status,
    });
  } catch (err) {
    console.error("markReportViewed failed:", err);
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
export const generatePDFReport = (
  report,
  workerName,
  workerPhone,
  estateManagerName,
  estateManagerPhone,
) => {
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
  // Logo
  try {
    // logo must be a base64 data URL or an imported asset URL
    const img = new Image();
    img.src = logo;
    // jsPDF addImage: (imageData, format, x, y, width, height)
    doc.addImage(logo, "PNG", margin, y, 60, 60);
  } catch (e) {
    console.warn("Logo could not be added to PDF:", e);
  }

  // Hospital name block — positioned to the right of the logo
  const logoRight = margin + 70; // 60px logo + 10px gap
  const headerTopY = y;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(180, 80, 0); // orange-brown to match hospital brand
  doc.text("Holy Family Catholic Hospital", logoRight, headerTopY + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("Berekum, Bono Region, Ghana", logoRight, headerTopY + 33);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text("Maintenance Department", logoRight, headerTopY + 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Materials / Items Request Form", logoRight, headerTopY + 60);

  // Move y below the logo block
  y = headerTopY + 72;

  doc.setDrawColor(180, 80, 0); // orange divider line
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(1); // reset
  doc.setDrawColor(180, 180, 180);
  addSectionGap(20);

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

  doc.setTextColor(0, 0, 0); // reset to black for body

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
  if (report.cost != null) {
    addSectionGap(6);
    addLine("Cost of Materials", 11, true);
    addLine(`₵${Number(report.cost).toLocaleString()}`);
  }

  const confirmationAlert =
    [...(report.alerts || [])]
      .filter(
        (a) =>
          a.sentBy === "admin" &&
          a.sentTo === "estate" &&
          a.type === "pending" &&
          a.subtype === "confirmed",
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

  if (confirmationAlert?.content) {
    addSectionGap(4);
    addLine("Admin Confirmation Note", 11, true);
    addLine(confirmationAlert.content);
    addLine(
      `Note Date: ${confirmationAlert.date ? new Date(confirmationAlert.date).toLocaleDateString() : "N/A"}`,
    );
  }

  if (workerName) {
    addSectionGap(6);
    addLine("Assigned Technician", 11, true);
    addLine(workerName);
    if (workerPhone) addLine(`${workerPhone}`);
  }

  if (report.feedback) {
    addSectionGap(6);
    addLine("Feedback", 11, true);
    addLine(report.feedback);
    addLine(`Feedback Date: ${formatDate(report.feedbackDate)}`);
  }

  if (report.cost != null || report.maintenanceCost != null) {
    addSectionGap(6);
    addLine("Cost Summary", 11, true);
    if (report.cost != null) {
      addLine(`Materials Cost: ₵${Number(report.cost).toLocaleString()}`, 10);
    }
    if (report.maintenanceCost != null) {
      addLine(
        `Maintenance Cost: ₵${Number(report.maintenanceCost).toLocaleString()}`,
        10,
      );
    }
    const total =
      (Number(report.cost) || 0) + (Number(report.maintenanceCost) || 0);
    addLine(`Total Cost: ₵${total.toLocaleString()}`, 11, true);
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
    ["Procured", report.dateProcured],
    ["Assigned", report.dateAssigned],
    ["Accepted", report.dateAccepted],
    ["Rejected", report.dateRejected],
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
  doc.text(estateManagerName || "", margin, sigY + 14);
  if (estateManagerPhone) {
    doc.text(`${estateManagerPhone}`, margin, sigY + 26);
  }
  doc.line(margin, sigY + 40, margin + 200, sigY + 40);
  doc.setFontSize(8);
  doc.text("Signature & Date", margin, sigY + 52);

  y = sigY + 70;
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

export const generateDashboardStatsPDF = (
  stats,
  roleLabel,
  userName = "User",
  period = "month",
) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = 595.28;
  const pageHeight = 842;
  const margin = 40;
  const now = new Date();

  // ── period metadata ──────────────────────────────────────────────────────
  const PERIOD_LABELS = {
    month: "This Month",
    year: "This Year",
    lastYear: "Last Year",
    overall: "Overall (All Time)",
  };
  const PERIOD_FILE_TAGS = {
    month: "Monthly",
    year: "Yearly",
    lastYear: "LastYear",
    overall: "Overall",
  };

  const periodLabel = PERIOD_LABELS[period] || PERIOD_LABELS.month;
  const periodName = PERIOD_FILE_TAGS[period] || PERIOD_FILE_TAGS.month;

  // stats.periodStats holds { overall, month, year, lastYear }, each built
  // via buildPeriodStats() — falls back to the legacy monthStats/overall shape
  // if periodStats isn't present (older callers), so this stays backwards compatible.
  const selectedStats =
    stats?.periodStats?.[period] ??
    (period === "year"
      ? stats?.yearStats
      : period === "lastYear"
        ? stats?.lastYearStats
        : period === "overall"
          ? null
          : stats?.monthStats) ??
    {};

  const overallStats = stats?.periodStats?.overall ?? {
    total: stats?.total ?? 0,
    completed: stats?.completed ?? 0,
    active: stats?.active ?? 0,
    overdue: stats?.overdue ?? 0,
    avgResolutionDays: stats?.avgResolutionDays ?? null,
    totalCost: stats?.totalCost ?? 0,
    avgCost: stats?.avgCost ?? null,
    maxCost: stats?.maxCost ?? null,
    costByPriority: stats?.costByPriority ?? {},
    byStatus: stats?.byStatus ?? {},
    catCount: stats?.catCount ?? {},
  };

  const displayMonth = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const yearLabel = now.getFullYear();

  const addText = (text, x, y, options = {}) => {
    const {
      fontSize = 11,
      isBold = false,
      color = [0, 0, 0],
      lineHeight = 14,
    } = options;
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);

    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(lines, x, y);
    return lines.length * lineHeight;
  };

  const addInfoBox = (title, items, accent = [248, 147, 76]) => {
    const estimatedHeight = 28 + items.length * 18;
    if (y + estimatedHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(
      margin - 6,
      y,
      pageWidth - margin * 2 + 12,
      estimatedHeight,
      8,
      8,
      "F",
    );
    doc.setDrawColor(...accent);
    doc.setLineWidth(1);
    doc.roundedRect(
      margin - 6,
      y,
      pageWidth - margin * 2 + 12,
      estimatedHeight,
      8,
      8,
      "S",
    );

    doc.setFillColor(...accent);
    doc.roundedRect(margin - 6, y, pageWidth - margin * 2 + 12, 22, 8, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, margin, y + 14);

    y += 30;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (items.length === 0) {
      doc.setTextColor(148, 163, 184);
      doc.text("No data for this period.", margin, y);
      y += 14;
    } else {
      items.forEach((item) => {
        const lines = doc.splitTextToSize(item, pageWidth - margin * 2 - 12);
        doc.text(lines, margin, y);
        y += lines.length * 14;
      });
    }

    y += 8;
  };

  const formatCedis = (value) =>
    `₵${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;

  const statusEntries = Object.entries(
    selectedStats.byStatus || stats?.byStatus || {},
  )
    .filter(([, count]) => Number(count) > 0)
    .map(([status, count]) => `• ${status}: ${count}`);
  const categoryEntries = Object.entries(
    selectedStats.catCount || stats?.catCount || {},
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count]) => `• ${category}: ${count}`);
  const trend = Array.isArray(stats?.trend) ? stats.trend : [];

  doc.setFillColor(255, 245, 235);
  doc.rect(0, 0, pageWidth, 100, "F");
  doc.setDrawColor(248, 147, 76);
  doc.setLineWidth(1.5);
  doc.line(margin, 72, pageWidth - margin, 72);

  let y = 48;
  y += addText("Holy Family Catholic Hospital", margin, y, {
    fontSize: 16,
    isBold: true,
    color: [180, 80, 0],
  });
  y += addText("Maintenance Dashboard Statistics Report", margin, y + 8, {
    fontSize: 12,
    isBold: true,
  });
  y += addText(`Role: ${roleLabel}`, margin, y + 8, { fontSize: 10 });
  y += addText(`Generated by: ${userName}`, margin, y + 8, { fontSize: 10 });
  y += addText(`Period: ${periodLabel} • ${displayMonth}`, margin, y + 8, {
    fontSize: 10,
  });

  y += 22;

  const completion = selectedStats.total
    ? Math.round((selectedStats.completed / selectedStats.total) * 100)
    : 0;
  const overallCompletion = overallStats.total
    ? Math.round((overallStats.completed / overallStats.total) * 100)
    : 0;

  addInfoBox(`Selected Period Summary — ${periodLabel}`, [
    `Total submissions: ${selectedStats.total ?? 0}`,
    `Completed: ${selectedStats.completed ?? 0}`,
    `Active: ${selectedStats.active ?? 0}`,
    `Overdue: ${selectedStats.overdue ?? 0}`,
    `Completion rate: ${completion}%`,
    `Average resolution: ${selectedStats.avgResolutionDays ?? "—"} days`,
    `Total spend: ${formatCedis(selectedStats.totalCost ?? 0)}`,
  ]);

  // Only show the separate "Overall" comparison box when a narrower period
  // was selected — for "overall" itself it would just duplicate the box above.
  if (period !== "overall") {
    addInfoBox(
      "Overall Comparison (All Time)",
      [
        `Total submissions: ${overallStats.total ?? 0}`,
        `Completed: ${overallStats.completed ?? 0}`,
        `Active: ${overallStats.active ?? 0}`,
        `Overdue: ${overallStats.overdue ?? 0}`,
        `Completion rate: ${overallCompletion}%`,
        `Average resolution: ${overallStats.avgResolutionDays ?? "—"} days`,
        `Total spend: ${formatCedis(overallStats.totalCost ?? 0)}`,
      ],
      [30, 64, 175],
    );
  }

  addInfoBox(
    `Financial Summary — ${periodLabel}`,
    [
      `Total spend: ${formatCedis(selectedStats.totalCost ?? 0)}`,
      `Average cost per completed work: ${formatCedis(selectedStats.avgCost ?? 0)}`,
      `Highest work cost: ${formatCedis(selectedStats.maxCost ?? 0)}`,
      `Emergency: ${formatCedis(selectedStats.costByPriority?.emergency ?? 0)}`,
      `Urgent: ${formatCedis(selectedStats.costByPriority?.urgent ?? 0)}`,
      `Routine: ${formatCedis(selectedStats.costByPriority?.routine ?? 0)}`,
    ],
    [127, 29, 29],
  );

  addInfoBox(`Status Breakdown — ${periodLabel}`, statusEntries, [34, 197, 94]);
  addInfoBox(
    `Top Work Categories — ${periodLabel}`,
    categoryEntries,
    [76, 29, 149],
  );

  addInfoBox(
    "Last 6 Months Submissions",
    trend.map((item) => `• ${item.label}: ${item.value}`),
    [15, 23, 42],
  );

  const safeMonth = now.toLocaleString("default", {
    month: "long",
  });
  doc.save(`Maintenance_Dashboard_${periodName}_${safeMonth}_${yearLabel}.pdf`);
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
    procured: "bg-teal-500 text-white",
    assigned: "bg-purple-400 text-white",
    accepted: "bg-cyan-500 text-white",
    rejected: "bg-rose-600 text-white",
    reopened: "bg-amber-500 text-white",
    completed: "bg-green-600 text-white",
    closed: "bg-slate-500 text-white", // ← add this
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
    ["approved", "costDenied", "reopened"].includes(report?.status)
  );
};

// New: only procurement, only when materials are confirmed and awaiting purchase
export const canUserMarkProcured = (user, report) => {
  return user?.role === "procurement" && report?.status === "confirmed";
};

// Estate can (re)assign while approved/procured, and can reassign to a
// different worker if the current assignee rejected the job.
export const canUserAssignWorker = (user, report) => {
  return (
    user?.role === "estate" &&
    ["approved", "procured", "assigned", "rejected", "reopened"].includes(
      report?.status,
    )
  );
};

export const canUserSubmitCost = (user, report) => {
  return (
    user?.role === "estate" &&
    ["completed", "closed"].includes(report?.status) &&
    (report?.maintenanceCost === null || report?.maintenanceCost === undefined)
  );
};

// New: worker may accept or reject a job only while it's freshly assigned
// and not yet actioned.
export const canUserAcceptOrRejectJob = (user, report) => {
  return (
    user?.role === "worker" &&
    report?.status === "assigned" &&
    report?.assignedTo === user?.ID
  );
};

// Completing work now requires the worker to have accepted the job first.
export const canUserComplete = (user, report) => {
  return (
    user?.role === "worker" &&
    ["accepted", "reopened"].includes(report?.status) &&
    report?.assignedTo === user?.ID
  );
};

export const canUserReopenReport = (user, report) => {
  return (
    user?.role === "staff" &&
    report?.status === "completed" &&
    report?.reporterId === user?.ID
  );
};

export const canUserCloseReopenedReport = (user, report) => {
  return (
    user?.role === "staff" &&
    report?.status === "reopened" &&
    report?.reporterId === user?.ID
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
  const TERMINAL = ["completed", "closed"];

  if (user?.role === "admin") return true;

  if (user?.role === "estate") {
    return [
      "confirmed",
      "procured",
      "assigned",
      "accepted",
      ...TERMINAL,
    ].includes(report?.status);
  }

  if (user?.role === "procurement") {
    return ["confirmed", "procured", ...TERMINAL].includes(report?.status);
  }

  return false;
};

export const getTotalCost = (report) => {
  const materials = Number(report?.cost) || 0;
  const maintenance = Number(report?.maintenanceCost) || 0;
  return materials + maintenance;
};
