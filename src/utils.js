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
import { notifyOnStatusChange } from "./notifications/notifyOnStatusChange";

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
      "rejected",
      "dropped",
    ];

    const snapshot = await getDocs(
      query(
        collection(db, "reports"),
        where("status", "in", activeStatuses),
        where("overdue", "==", false),
      ),
    );

    if (snapshot.empty) return;

    // Keep both the doc snapshot and its data around — the data is needed
    // afterward to notify (reporterId/assignedTo/status), not just to
    // decide which docs are overdue.
    const overdueReports = snapshot.docs
      .map((docSnap) => ({ docSnap, data: docSnap.data() }))
      .filter(({ data }) => {
        if (!data.dateDue) return false;
        const due = data.dateDue?.toDate
          ? data.dateDue.toDate()
          : new Date(data.dateDue);
        return due < now;
      });

    if (overdueReports.length === 0) return;

    const batch = writeBatch(db);
    overdueReports.forEach(({ docSnap }) => {
      batch.update(doc(db, "reports", docSnap.id), { overdue: true });
    });
    await batch.commit();

    console.log(`Marked ${overdueReports.length} report(s) as overdue.`);

    // Notify the estate manager and the assigned worker (if any) for each
    // report that JUST became overdue. This only fires once per report:
    // the query above is scoped to overdue == false, so a report that's
    // already marked overdue won't be re-fetched (and re-notified) on a
    // later page load. `newStatus: "overdue"` is a synthetic value used
    // purely to key into the "*->overdue" rule in resolvedTargets.js — it
    // is never written back to the report's real `status` field.

    overdueReports.forEach(({ docSnap, data }) => {
      notifyOnStatusChange(data.status, "overdue", {
        id: docSnap.id,
        reporterId: data.reporterId,
        assignedTo: data.assignedTo,
        priorityLevel: data.priorityLevel,
        status: data.status,
      }).catch((err) =>
        console.error(
          `notifyOnStatusChange failed for overdue report ${docSnap.id}:`,
          err,
        ),
      );
    });
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
  try {
    const img = new Image();
    img.src = logo;

    doc.addImage(logo, "PNG", margin, y, 60, 60);
  } catch (e) {
    console.warn("Logo could not be added to PDF:", e);
  }

  // Hospital name block
  const logoRight = margin + 70;
  const headerTopY = y;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(180, 80, 0);

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

  doc.setDrawColor(180, 80, 0);
  doc.setLineWidth(1.5);

  doc.line(margin, y, pageWidth - margin, y);

  doc.setLineWidth(1);
  doc.setDrawColor(180, 180, 180);

  addSectionGap(20);

  // ── Work Information ────────────────────────────────────────────────────────

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

  doc.setTextColor(0, 0, 0);

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

  // ── Materials Table ─────────────────────────────────────────────────────────

  const materials = Array.isArray(report.materials) ? report.materials : [];

  if (materials.length > 0) {
    addLine("Materials / Items Required", 11, true);

    addSectionGap(6);

    // Column widths
    const colWidths = [30, 220, 80, 110];

    const headers = [
      "S/N",
      "Description of Material/Item",
      "Qty Required",
      "Specification / Size",
    ];

    const rowHeight = 22;

    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    // Header row
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

    addLine(`GHS ${Number(report.cost).toLocaleString()}`);
  }

  // ── Confirmation Alert ─────────────────────────────────────────────────────

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
      `Note Date: ${
        confirmationAlert.date
          ? new Date(confirmationAlert.date).toLocaleDateString()
          : "N/A"
      }`,
    );
  }

  // ── Assigned Technician ─────────────────────────────────────────────────────

  if (workerName) {
    addSectionGap(6);

    addLine("Assigned Technician", 11, true);

    addLine(workerName);

    if (workerPhone) {
      addLine(`${workerPhone}`);
    }
  }

  // ── Feedback ─────────────────────────────────────────────────────────────────

  if (report.feedback) {
    addSectionGap(6);

    addLine("Feedback", 11, true);

    addLine(report.feedback);

    addLine(`Feedback Date: ${formatDate(report.feedbackDate)}`);
  }

  // ── Cost Summary ────────────────────────────────────────────────────────────

  if (report.cost != null || report.maintenanceCost != null) {
    addSectionGap(6);

    addLine("Cost Summary", 11, true);

    if (report.cost != null) {
      addLine(
        `Materials Cost: GHS ${Number(report.cost).toLocaleString()}`,
        10,
      );
    }

    if (report.maintenanceCost != null) {
      addLine(
        `Maintenance Cost: GHS ${Number(
          report.maintenanceCost,
        ).toLocaleString()}`,
        10,
      );
    }

    const total =
      (Number(report.cost) || 0) + (Number(report.maintenanceCost) || 0);

    addLine(`Total Cost: GHS ${total.toLocaleString()}`, 11, true);
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
    if (date) {
      addLine(`${label}: ${formatDate(date)}`, 10);
    }
  });

  // ── Signatures ───────────────────────────────────────────────────────────────

  addSectionGap(20);

  doc.line(margin, y, pageWidth - margin, y);

  addSectionGap(12);

  const sigY = y;

  // Requested by
  doc.setFont("helvetica", "bold");

  doc.setFontSize(10);

  doc.text("Generated by:", margin, sigY);

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

  // ── Procurement Section ─────────────────────────────────────────────────────

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

  // ── Save ─────────────────────────────────────────────────────────────────────

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
  const pageHeight = 841.89;

  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const COLORS = {
    primary: [180, 80, 0],
    primaryLight: [255, 245, 235],

    navy: [15, 23, 42],
    slate: [71, 85, 105],
    muted: [100, 116, 139],
    lightText: [148, 163, 184],

    border: [226, 232, 240],
    background: [248, 250, 252],
    white: [255, 255, 255],

    green: [22, 163, 74],
    blue: [37, 99, 235],
    orange: [234, 88, 12],
    red: [220, 38, 38],
    purple: [124, 58, 237],
    teal: [13, 148, 136],
  };

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

  const now = new Date();

  const displayMonth = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // ---------------------------------------------------------------------------
  // PERIOD DATA
  // ---------------------------------------------------------------------------

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
    // "closed" wasn't in this fallback before — it's only reached if
    // stats.periodStats.overall is somehow missing, but omitting it here
    // would silently zero out the resolved-count fallback below too.
    closed: stats?.closed ?? 0,
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

  // ---------------------------------------------------------------------------
  // CURRENCY
  // ---------------------------------------------------------------------------

  // Use GHS instead of the ₵ symbol because jsPDF's default Helvetica
  // font does not reliably support the Ghana cedi Unicode character.
  const formatCedis = (value) =>
    `GHS ${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;

  // ---------------------------------------------------------------------------
  // CALCULATIONS
  // ---------------------------------------------------------------------------

  // "Resolved" mirrors the Dashboard tab's own completionRate definition
  // (see buildPeriodStats in Dashboard.js) — it is NOT just
  // status === "completed". "completed" is an interim status (technician
  // finished the work, still awaiting reporter confirmation); "closed" is
  // what the reporter confirms once satisfied, and is the actual terminal,
  // successfully-resolved outcome. This file used to compute completion
  // off `selectedStats.completed` alone, so once every report had
  // progressed to "closed" (the normal steady state) the completion rate
  // stayed stuck at 0% even though the department had resolved everything.
  const getResolvedCount = (s) =>
    (Number(s?.completed) || 0) + (Number(s?.closed) || 0);

  const completion = selectedStats.total
    ? Math.round(
        (getResolvedCount(selectedStats) / Number(selectedStats.total || 1)) *
          100,
      )
    : 0;

  const overallCompletion = overallStats.total
    ? Math.round(
        (getResolvedCount(overallStats) / Number(overallStats.total || 1)) *
          100,
      )
    : 0;

  const statusEntries = Object.entries(
    selectedStats.byStatus || stats?.byStatus || {},
  )
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  const categoryEntries = Object.entries(
    selectedStats.catCount || stats?.catCount || {},
  )
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 6);

  const trend = Array.isArray(stats?.trend) ? stats.trend : [];

  let y = 0;

  // ---------------------------------------------------------------------------
  // FONT HELPER
  // ---------------------------------------------------------------------------

  const setFont = (size, bold = false, color = COLORS.navy) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");

    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  // ---------------------------------------------------------------------------
  // PAGE SPACE
  // ---------------------------------------------------------------------------

  const ensureSpace = (height) => {
    if (y + height > pageHeight - 55) {
      addPage();
      return true;
    }

    return false;
  };

  // ---------------------------------------------------------------------------
  // PAGE HEADER
  // ---------------------------------------------------------------------------

  const addPageHeader = () => {
    doc.setFillColor(...COLORS.white);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    // Top orange strip
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 6, "F");

    // Hospital logo
    try {
      doc.addImage(logo, "PNG", margin, 24, 46, 46);
    } catch (error) {
      console.warn("Dashboard PDF logo could not be added:", error);
    }

    setFont(15, true, COLORS.primary);

    doc.text("Holy Family Catholic Hospital", margin + 58, 40);

    setFont(9, false, COLORS.muted);

    doc.text("Berekum, Bono Region, Ghana", margin + 58, 54);

    setFont(8, true, COLORS.slate);

    doc.text("MAINTENANCE DEPARTMENT", pageWidth - margin, 39, {
      align: "right",
    });

    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(1);

    doc.line(margin, 82, pageWidth - margin, 82);

    y = 105;
  };

  // ---------------------------------------------------------------------------
  // FOOTER
  // ---------------------------------------------------------------------------

  const addFooter = () => {
    const pageCount = doc.internal.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);

      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.7);

      doc.line(margin, pageHeight - 38, pageWidth - margin, pageHeight - 38);

      setFont(7.5, false, COLORS.lightText);

      doc.text(
        "Holy Family Catholic Hospital • Maintenance Dashboard",
        margin,
        pageHeight - 22,
      );

      doc.text(
        `Page ${page} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 22,
        {
          align: "right",
        },
      );
    }
  };

  // ---------------------------------------------------------------------------
  // NEW PAGE
  // ---------------------------------------------------------------------------

  const addPage = () => {
    doc.addPage();
    addPageHeader();
  };

  // ---------------------------------------------------------------------------
  // SECTION TITLE
  // ---------------------------------------------------------------------------

  const addSectionTitle = (title, subtitle = "") => {
    ensureSpace(40);

    setFont(12, true, COLORS.navy);

    doc.text(title, margin, y);

    if (subtitle) {
      setFont(8, false, COLORS.muted);

      doc.text(subtitle, margin, y + 13);

      y += 13;
    }

    y += 20;
  };

  // ---------------------------------------------------------------------------
  // CARD
  // ---------------------------------------------------------------------------

  const drawRoundedCard = (x, cardY, width, height, fill = COLORS.white) => {
    doc.setFillColor(...fill);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.8);

    doc.roundedRect(x, cardY, width, height, 7, 7, "FD");
  };

  // ---------------------------------------------------------------------------
  // KPI CARD
  // ---------------------------------------------------------------------------

  const addKpiCard = (
    x,
    cardY,
    width,
    height,
    label,
    value,
    accent,
    subText = "",
  ) => {
    drawRoundedCard(x, cardY, width, height);

    // Accent bar
    doc.setFillColor(...accent);

    doc.roundedRect(x, cardY, 4, height, 2, 2, "F");

    setFont(8.5, false, COLORS.muted);

    doc.text(label, x + 15, cardY + 20);

    setFont(20, true, COLORS.navy);

    doc.text(String(value), x + 15, cardY + 43);

    if (subText) {
      setFont(7.5, false, COLORS.muted);

      doc.text(subText, x + 15, cardY + 57);
    }
  };

  // ---------------------------------------------------------------------------
  // SMALL METRIC CARD
  // ---------------------------------------------------------------------------

  const addMiniMetric = (x, metricY, width, label, value, accent) => {
    drawRoundedCard(x, metricY, width, 54);

    doc.setFillColor(...accent);

    doc.circle(x + 15, metricY + 18, 4, "F");

    setFont(8, false, COLORS.muted);

    doc.text(label, x + 26, metricY + 21);

    setFont(12, true, COLORS.navy);

    doc.text(String(value), x + 15, metricY + 42);
  };

  // ---------------------------------------------------------------------------
  // PROGRESS BAR
  // ---------------------------------------------------------------------------

  const drawProgressBar = (x, barY, width, percentage, accent) => {
    doc.setFillColor(...COLORS.border);

    doc.roundedRect(x, barY, width, 6, 3, 3, "F");

    const progressWidth = Math.max(
      0,
      Math.min(width, (percentage / 100) * width),
    );

    if (progressWidth > 0) {
      doc.setFillColor(...accent);

      doc.roundedRect(x, barY, progressWidth, 6, 3, 3, "F");
    }
  };

  // ===========================================================================
  // START PDF
  // ===========================================================================

  addPageHeader();

  // ---------------------------------------------------------------------------
  // TITLE
  // ---------------------------------------------------------------------------

  setFont(20, true, COLORS.navy);

  doc.text("Maintenance Dashboard", margin, y);

  setFont(10, false, COLORS.muted);

  doc.text(
    `${periodLabel} performance and operational overview`,
    margin,
    y + 17,
  );

  // Period pill
  const pillText = periodLabel;

  const pillWidth = doc.getTextWidth(pillText) + 22;

  doc.setFillColor(...COLORS.primaryLight);

  doc.roundedRect(
    pageWidth - margin - pillWidth,
    y - 13,
    pillWidth,
    24,
    12,
    12,
    "F",
  );

  setFont(8, true, COLORS.primary);

  doc.text(pillText, pageWidth - margin - pillWidth / 2, y + 2, {
    align: "center",
  });

  y += 42;

  // ---------------------------------------------------------------------------
  // REPORT METADATA
  // ---------------------------------------------------------------------------

  drawRoundedCard(margin, y, contentWidth, 58, COLORS.background);

  setFont(8, false, COLORS.muted);

  doc.text("REPORT PERIOD", margin + 15, y + 18);

  setFont(9, true, COLORS.navy);

  doc.text(displayMonth, margin + 15, y + 34);

  setFont(8, false, COLORS.muted);

  doc.text("GENERATED BY", margin + 180, y + 18);

  setFont(9, true, COLORS.navy);

  doc.text(userName || "User", margin + 180, y + 34);

  setFont(8, false, COLORS.muted);

  doc.text("ROLE", margin + 345, y + 18);

  setFont(9, true, COLORS.navy);

  doc.text(roleLabel || "User", margin + 345, y + 34);

  y += 78;

  // ---------------------------------------------------------------------------
  // KEY PERFORMANCE INDICATORS
  // ---------------------------------------------------------------------------

  addSectionTitle(
    "Key Performance Indicators",
    `Performance for ${periodLabel.toLowerCase()}`,
  );

  const gap = 10;

  const cardWidth = (contentWidth - gap * 3) / 4;

  const cardHeight = 72;

  const kpiY = y;

  addKpiCard(
    margin,
    kpiY,
    cardWidth,
    cardHeight,
    "TOTAL REPORTS",
    selectedStats.total ?? 0,
    COLORS.blue,
  );

  addKpiCard(
    margin + cardWidth + gap,
    kpiY,
    cardWidth,
    cardHeight,
    "COMPLETED",
    getResolvedCount(selectedStats),
    COLORS.green,
    `${completion}% completion`,
  );

  addKpiCard(
    margin + (cardWidth + gap) * 2,
    kpiY,
    cardWidth,
    cardHeight,
    "ACTIVE",
    selectedStats.active ?? 0,
    COLORS.orange,
  );

  addKpiCard(
    margin + (cardWidth + gap) * 3,
    kpiY,
    cardWidth,
    cardHeight,
    "OVERDUE",
    selectedStats.overdue ?? 0,
    COLORS.red,
  );

  y += cardHeight + 22;

  // ---------------------------------------------------------------------------
  // COMPLETION PERFORMANCE
  // ---------------------------------------------------------------------------

  drawRoundedCard(margin, y, contentWidth, 64, COLORS.white);

  setFont(9, true, COLORS.navy);

  doc.text("Completion Performance", margin + 15, y + 20);

  setFont(9, true, COLORS.green);

  doc.text(`${completion}%`, pageWidth - margin - 15, y + 20, {
    align: "right",
  });

  drawProgressBar(
    margin + 15,
    y + 34,
    contentWidth - 30,
    completion,
    COLORS.green,
  );

  setFont(7.5, false, COLORS.muted);

  doc.text(
    `${getResolvedCount(selectedStats)} completed out of ${selectedStats.total ?? 0} total reports`,
    margin + 15,
    y + 53,
  );

  y += 84;

  // ---------------------------------------------------------------------------
  // FINANCIAL OVERVIEW
  // ---------------------------------------------------------------------------

  addSectionTitle(
    "Financial Overview",
    "Maintenance expenditure for the selected period",
  );

  const financialWidth = (contentWidth - gap * 2) / 3;

  addMiniMetric(
    margin,
    y,
    financialWidth,
    "Total Spend",
    formatCedis(selectedStats.totalCost),
    COLORS.primary,
  );

  addMiniMetric(
    margin + financialWidth + gap,
    y,
    financialWidth,
    "Average Cost",
    formatCedis(selectedStats.avgCost),
    COLORS.blue,
  );

  addMiniMetric(
    margin + (financialWidth + gap) * 2,
    y,
    financialWidth,
    "Highest Cost",
    formatCedis(selectedStats.maxCost),
    COLORS.red,
  );

  y += 68;

  // ---------------------------------------------------------------------------
  // SPEND BY PRIORITY
  // ---------------------------------------------------------------------------

  drawRoundedCard(margin, y, contentWidth, 78, COLORS.background);

  setFont(8.5, true, COLORS.navy);

  doc.text("Spend by Priority", margin + 15, y + 19);

  const priorities = [
    ["Emergency", selectedStats.costByPriority?.emergency ?? 0, COLORS.red],
    ["Urgent", selectedStats.costByPriority?.urgent ?? 0, COLORS.orange],
    ["Routine", selectedStats.costByPriority?.routine ?? 0, COLORS.blue],
  ];

  const priorityWidth = (contentWidth - 30 - 20) / 3;

  priorities.forEach(([label, value, accent], index) => {
    const x = margin + 15 + index * (priorityWidth + 10);

    setFont(7.5, false, COLORS.muted);

    doc.text(label, x, y + 38);

    setFont(10, true, COLORS.navy);

    doc.text(formatCedis(value), x, y + 53);

    const totalSpend = Number(selectedStats.totalCost || 0);

    const percentage = totalSpend
      ? Math.round((Number(value || 0) / totalSpend) * 100)
      : 0;

    drawProgressBar(x, y + 61, priorityWidth - 8, percentage, accent);
  });

  y += 100;

  // ---------------------------------------------------------------------------
  // OPERATIONAL BREAKDOWN
  // ---------------------------------------------------------------------------

  ensureSpace(220);

  addSectionTitle(
    "Operational Breakdown",
    "Distribution of reports by status and work category",
  );

  const columnGap = 14;

  const columnWidth = (contentWidth - columnGap) / 2;

  const breakdownY = y;

  const breakdownHeight = 190;

  // STATUS
  drawRoundedCard(
    margin,
    breakdownY,
    columnWidth,
    breakdownHeight,
    COLORS.white,
  );

  setFont(10, true, COLORS.navy);

  doc.text("Status Breakdown", margin + 15, breakdownY + 22);

  setFont(7.5, false, COLORS.muted);

  doc.text(periodLabel, margin + 15, breakdownY + 35);

  if (statusEntries.length === 0) {
    setFont(8, false, COLORS.lightText);

    doc.text("No status data available.", margin + 15, breakdownY + 65);
  } else {
    const maxStatus = Math.max(
      ...statusEntries.map(([, count]) => Number(count)),
      1,
    );

    statusEntries.slice(0, 7).forEach(([status, count], index) => {
      const rowY = breakdownY + 55 + index * 19;

      const normalizedStatus =
        String(status).charAt(0).toUpperCase() + String(status).slice(1);

      setFont(7.5, false, COLORS.slate);

      doc.text(normalizedStatus, margin + 15, rowY);

      setFont(7.5, true, COLORS.navy);

      doc.text(String(count), margin + columnWidth - 15, rowY, {
        align: "right",
      });

      drawProgressBar(
        margin + 15,
        rowY + 5,
        columnWidth - 30,
        (Number(count) / maxStatus) * 100,
        COLORS.green,
      );
    });
  }

  // CATEGORIES
  const categoryX = margin + columnWidth + columnGap;

  drawRoundedCard(
    categoryX,
    breakdownY,
    columnWidth,
    breakdownHeight,
    COLORS.white,
  );

  setFont(10, true, COLORS.navy);

  doc.text("Top Work Categories", categoryX + 15, breakdownY + 22);

  setFont(7.5, false, COLORS.muted);

  doc.text(
    "Highest number of submitted reports",
    categoryX + 15,
    breakdownY + 35,
  );

  if (categoryEntries.length === 0) {
    setFont(8, false, COLORS.lightText);

    doc.text("No category data available.", categoryX + 15, breakdownY + 65);
  } else {
    const maxCategory = Math.max(
      ...categoryEntries.map(([, count]) => Number(count)),
      1,
    );

    categoryEntries.forEach(([category, count], index) => {
      const rowY = breakdownY + 55 + index * 21;

      const categoryText =
        String(category).length > 24
          ? `${String(category).slice(0, 22)}…`
          : String(category);

      setFont(7.5, false, COLORS.slate);

      doc.text(categoryText, categoryX + 15, rowY);

      setFont(7.5, true, COLORS.navy);

      doc.text(String(count), categoryX + columnWidth - 15, rowY, {
        align: "right",
      });

      drawProgressBar(
        categoryX + 15,
        rowY + 5,
        columnWidth - 30,
        (Number(count) / maxCategory) * 100,
        COLORS.purple,
      );
    });
  }

  y = breakdownY + breakdownHeight + 25;

  // ---------------------------------------------------------------------------
  // SUBMISSION TREND
  // ---------------------------------------------------------------------------

  ensureSpace(210);

  addSectionTitle(
    "Submission Trend",
    "Reports submitted over the last six months",
  );

  const chartHeight = 145;

  const chartX = margin;
  const chartY = y;
  const chartWidth = contentWidth;

  drawRoundedCard(chartX, chartY, chartWidth, chartHeight, COLORS.white);

  if (trend.length === 0) {
    setFont(9, false, COLORS.lightText);

    doc.text(
      "No trend data available.",
      chartX + chartWidth / 2,
      chartY + chartHeight / 2,
      {
        align: "center",
      },
    );
  } else {
    const chartLeft = chartX + 38;

    const chartRight = chartX + chartWidth - 18;

    const chartTop = chartY + 22;

    const chartBottom = chartY + chartHeight - 28;

    const values = trend.map((item) => Number(item.value || 0));

    const maxValue = Math.max(...values, 1);

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const gridY = chartBottom - ((chartBottom - chartTop) / 4) * i;

      doc.setDrawColor(...COLORS.border);

      doc.setLineWidth(0.5);

      doc.line(chartLeft, gridY, chartRight, gridY);

      setFont(6.5, false, COLORS.lightText);

      const gridValue = Math.round((maxValue / 4) * i);

      doc.text(String(gridValue), chartLeft - 7, gridY + 2, {
        align: "right",
      });
    }

    const usableWidth = chartRight - chartLeft;

    trend.forEach((item, index) => {
      const x =
        trend.length === 1
          ? chartLeft + usableWidth / 2
          : chartLeft + (usableWidth / (trend.length - 1)) * index;

      const value = Number(item.value || 0);

      const pointY =
        chartBottom - (value / maxValue) * (chartBottom - chartTop);

      const barWidth = Math.min(24, usableWidth / trend.length / 2);

      doc.setFillColor(...COLORS.primaryLight);

      doc.roundedRect(
        x - barWidth / 2,
        pointY,
        barWidth,
        chartBottom - pointY,
        3,
        3,
        "F",
      );

      // Value
      setFont(7, true, COLORS.primary);

      doc.text(String(value), x, pointY - 7, {
        align: "center",
      });

      // Label
      setFont(6.5, false, COLORS.muted);

      const label = String(item.label || "");

      doc.text(
        label.length > 12 ? `${label.slice(0, 11)}…` : label,
        x,
        chartBottom + 15,
        {
          align: "center",
        },
      );
    });
  }

  y += chartHeight + 25;

  // ---------------------------------------------------------------------------
  // OVERALL COMPARISON
  // ---------------------------------------------------------------------------

  if (period !== "overall") {
    ensureSpace(125);

    addSectionTitle(
      "Overall Performance",
      "All-time comparison against the selected reporting period",
    );

    const comparisonY = y;

    const comparisonHeight = 82;

    drawRoundedCard(
      margin,
      comparisonY,
      contentWidth,
      comparisonHeight,
      COLORS.background,
    );

    const comparisonItems = [
      ["Total Reports", selectedStats.total ?? 0, overallStats.total ?? 0],
      [
        "Completed",
        getResolvedCount(selectedStats),
        getResolvedCount(overallStats),
      ],
      ["Active", selectedStats.active ?? 0, overallStats.active ?? 0],
      ["Completion", `${completion}%`, `${overallCompletion}%`],
    ];

    const comparisonWidth = contentWidth / 4;

    comparisonItems.forEach(([label, selected, overall], index) => {
      const x = margin + index * comparisonWidth;

      setFont(7.5, false, COLORS.muted);

      doc.text(label, x + 15, comparisonY + 20);

      setFont(13, true, COLORS.navy);

      doc.text(String(selected), x + 15, comparisonY + 41);

      setFont(7, false, COLORS.lightText);

      doc.text(`Overall: ${overall}`, x + 15, comparisonY + 57);
    });

    y += comparisonHeight + 20;
  }

  // ---------------------------------------------------------------------------
  // REPORT SUMMARY
  // ---------------------------------------------------------------------------

  ensureSpace(100);

  addSectionTitle("Report Summary");

  const summaryText =
    `During ${periodLabel.toLowerCase()}, the Maintenance Department ` +
    `recorded ${selectedStats.total ?? 0} maintenance report(s). ` +
    `${getResolvedCount(selectedStats)} report(s) were completed, representing ` +
    `a completion rate of ${completion}%. ` +
    `There are currently ${selectedStats.active ?? 0} active report(s) ` +
    `and ${selectedStats.overdue ?? 0} overdue report(s). ` +
    `Total recorded expenditure for the period was ` +
    `${formatCedis(selectedStats.totalCost ?? 0)}.`;

  drawRoundedCard(margin, y, contentWidth, 64, COLORS.primaryLight);

  setFont(8.5, false, COLORS.slate);

  const summaryLines = doc.splitTextToSize(summaryText, contentWidth - 30);

  doc.text(summaryLines, margin + 15, y + 20);

  y += 84;

  // ---------------------------------------------------------------------------
  // FINAL METADATA
  // ---------------------------------------------------------------------------

  setFont(7.5, false, COLORS.lightText);

  doc.text(`Generated on ${now.toLocaleString()}`, margin, y);

  doc.text(`Report period: ${periodLabel}`, pageWidth - margin, y, {
    align: "right",
  });

  // ---------------------------------------------------------------------------
  // FOOTER
  // ---------------------------------------------------------------------------

  addFooter();

  // ---------------------------------------------------------------------------
  // SAVE
  // ---------------------------------------------------------------------------

  doc.save(
    `Maintenance_Dashboard_${periodName}_${displayMonth.replace(
      /\s+/g,
      "_",
    )}.pdf`,
  );
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
    [
      "approved",
      "procured",
      "assigned",
      "rejected",
      "reopened",
      "dropped",
    ].includes(report?.status)
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

export function canUserDropJob(user, report) {
  return (
    user?.role === "worker" &&
    report?.assignedTo === user?.ID &&
    ["accepted", "reopened"].includes(report?.status)
  );
}

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
