// src/notifications/resolvedTargets.js

// Maps a report's current status to the role/person it's sitting with —
// used to make overdue notifications tell people WHERE the report
// actually is right now, since a report moves through several roles and
// the person who last saw it (or the reporter) has no way to know who
// holds it once it's overdue. Keep this in sync with utils.js's
// canUserApprove/canUserConfirmCost/canUserMarkProcured/
// canUserAssignWorker/canUserAcceptOrRejectJob/canUserAddCost — each entry
// here should match whoever those functions say can currently act on the
// report in that status.
const STATUS_HOLDER = {
  incoming: "Admin",
  approved: "the Estate Manager",
  pending: "Admin",
  confirmed: "Procurement",
  procured: "the Estate Manager",
  assigned: "the assigned technician",
  accepted: "the assigned technician",
  dropped: "the Estate Manager",
  rejected: "the Estate Manager",
  costDenied: "the Estate Manager",
};

function holderLabel(status) {
  return STATUS_HOLDER[status] || "the responsible team";
}

// Human-readable status text for notification copy — "pending" on its own
// reads ambiguously, so a couple of statuses get friendlier phrasing.
const STATUS_LABEL = {
  incoming: "incoming",
  approved: "approved",
  pending: "pending materials confirmation",
  confirmed: "confirmed",
  procured: "procured",
  assigned: "assigned",
  accepted: "in progress",
  rejected: "rejected by the assigned technician",
  dropped: "dropped by the technician",
  costDenied: "materials request denied",
};

function statusLabel(status) {
  return STATUS_LABEL[status] || status || "in progress";
}

function priorityPhrase(priorityLevel, subject) {
  if (!priorityLevel)
    return subject === "reporter" ? "Your report" : "A report";
  const article = /^[aeiou]/i.test(priorityLevel) ? "An" : "A";
  return subject === "reporter"
    ? `Your ${priorityLevel} report`
    : `${article} ${priorityLevel} report`;
}

// Shared "where things stand" clause, reused by both the holder-facing and
// reporter-facing overdue copy so the two stay consistent with each other.
function overdueStatusClause(report) {
  return `It's currently ${statusLabel(report?.status)} and with ${holderLabel(report?.status)}.`;
}

// Reopened reports with serviceType "external" live on the Estate role's
// External Jobs page (same feed as the "assigned" external jobs, see
// Home.jsx's newExternalCount, which already treats
// status:"reopened" + serviceType:"external" as an external-jobs item),
// not on the regular Reopened page. Routing an estate user to /ero for
// one of these would land them on a page that doesn't show it.
function estateReopenedRoute(report) {
  return report?.serviceType === "external" ? "/eext" : "/ero";
}

export const TRANSITIONS = {
  "*->incoming": {
    targets: [{ audience: "role", role: "admin", route: () => "/ah" }],
    title: "New Report",
    body: "A new maintenance report was submitted.",
  },
  "incoming->approved": {
    targets: [{ audience: "role", role: "estate", route: () => "/eh" }],
    title: "New Report",
    body: "Approved by admin.",
  },
  "incoming->denied": {
    targets: [{ audience: "reporter", route: () => "/History" }],
    title: "Report Denied",
    body: "Your report was not approved.",
  },
  "*->pending": {
    targets: [{ audience: "role", role: "admin", route: () => "/ah" }],
    title: "Materials Confirmation Request",
    body: "A request is awaiting your approval.",
  },
  "pending->confirmed": {
    targets: [{ audience: "role", role: "procurement", route: () => "/ph" }],
    title: "New Materials Request",
    body: "Estate manager requested some materials.",
  },
  "pending->costDenied": {
    targets: [{ audience: "role", role: "estate", route: () => "/eh" }],
    title: "Request Denied",
    body: "The submitted materials request was rejected.",
  },
  "confirmed->procured": {
    targets: [{ audience: "role", role: "estate", route: () => "/eh" }],
    title: "Materials Procured",
    body: "Ready to assign a Technician.",
  },
  "*->assigned": {
    targets: [{ audience: "assignedWorker", route: () => "/wh" }],
    title: "New Assignment",
    body: "You've been assigned a job.",
  },
  "assigned->accepted": {
    targets: [{ audience: "role", role: "estate", route: () => "/eip" }],
    title: "Assignment Accepted",
    body: "The technician accepted the job.",
  },
  "assigned->rejected": {
    targets: [{ audience: "role", role: "estate", route: () => "/er" }],
    title: "Assignment Rejected",
    body: "The technician declined the job.",
  },
  "*->dropped": {
    targets: [{ audience: "role", role: "estate", route: () => "/edr" }],
    title: "Job Dropped",
    body: "A technician dropped a job. It needs reassignment.",
  },
  "accepted->completed": {
    targets: [{ audience: "reporter", route: () => "/Completed" }],
    title: "Job Completed",
    body: "Awaiting your feedback.",
  },
  "reopened->completed": {
    targets: [{ audience: "reporter", route: () => "/Completed" }],
    title: "Job Completed",
    body: "Awaiting your feedback.",
  },
  "completed->closed": {
    targets: [
      { audience: "assignedWorker", route: () => "/wcl" },
      { audience: "role", role: "estate", route: () => "/ecl" },
    ],
    title: "Report Closed",
    body: "This report is now closed.",
  },
  "completed->reopened": {
    targets: [
      // ← was a flat "/ero" for every reopened report; external-service
      // reports now route estate users to the External Jobs page instead
      // (see estateReopenedRoute above).
      { audience: "role", role: "estate", route: estateReopenedRoute },
      { audience: "assignedWorker", route: () => "/wro" },
    ],
    title: "Report Reopened",
    body: "This report has been reopened.",
  },
  "*->overdue": {
    targets: [
      { audience: "role", role: "estate", route: () => "/eh" },
      // resolveTargetUids already no-ops when report.assignedTo is unset
      // (empty customId → empty uid set → target skipped), so no extra
      // `when` gate is needed here for reports with no worker yet.
      { audience: "assignedWorker", route: () => "/wa" },
      {
        audience: "role",
        role: "admin",
        route: () => "/ah",
        // Admin only needs to hear about this when it's high-stakes — an
        // overdue routine report doesn't need to escalate to admin.
        when: (report) =>
          ["emergency", "urgent"].includes(report?.priorityLevel),
      },
      {
        // Procurement only holds a report while it's "confirmed" (see
        // STATUS_HOLDER above) — gated so procurement isn't notified for
        // every overdue report, only the ones actually sitting with them.
        audience: "role",
        role: "procurement",
        route: () => "/ph",
        when: (report) => report?.status === "confirmed",
      },
      {
        // The reporter is never one of the roles above (estate/worker/
        // admin/procurement) that a report is ever technically "with", so
        // they get their own audience entry and their own wording —
        // pointing them at whoever currently holds the report instead of
        // just saying "overdue" with no context.
        audience: "reporter",
        route: () => "/Pending",
        title: "Your Report Is Overdue",
        body: (report) =>
          `${priorityPhrase(report?.priorityLevel, "reporter")} has passed its deadline. ` +
          `${overdueStatusClause(report)} You may contact them for further action.`,
      },
    ],
    title: "Report Overdue",
    // Default body for every target that doesn't define its own (estate,
    // assignedWorker, admin, procurement) — tells them what's overdue, its
    // priority, and — since a report can be overdue while sitting with a
    // DIFFERENT role than the one reading this — who currently holds it.
    body: (report) =>
      `${priorityPhrase(report?.priorityLevel)} has passed its deadline. ${overdueStatusClause(report)}`,
  },
};

export function resolveTransition(oldStatus, newStatus) {
  return (
    TRANSITIONS[`${oldStatus}->${newStatus}`] ||
    TRANSITIONS[`*->${newStatus}`] ||
    null
  );
}
