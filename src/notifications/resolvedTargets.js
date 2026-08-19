// src/notifications/resolvedTargets.js
export const TRANSITIONS = {
  "*->incoming": {
    targets: [{ audience: "role", role: "admin" }],
    title: "New Report",
    body: "A new maintenance report was submitted.",
  },
  "incoming->approved": {
    targets: [{ audience: "role", role: "estate" }],
    title: "New Report",
    body: "Approved by admin.",
  },
  "incoming->denied": {
    targets: [{ audience: "reporter" }],
    title: "Report Denied",
    body: "Your report was not approved.",
  },
  "*->pending": {
    targets: [{ audience: "role", role: "admin" }],
    title: "Materials Confirmation Request",
    body: "A request is awaiting your approval.",
  },
  "pending->confirmed": {
    targets: [{ audience: "role", role: "procurement" }],
    title: "New Materials Request",
    body: "Estate manager requested some materials.",
  },
  "pending->costDenied": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Request Denied",
    body: "The submitted materials request was rejected.",
  },
  "confirmed->procured": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Materials Procured",
    body: "Ready to assign a Technician.",
  },
  "*->assigned": {
    targets: [{ audience: "assignedWorker" }],
    title: "New Assignment",
    body: "You've been assigned a job.",
  },
  "assigned->accepted": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Assignment Accepted",
    body: "The technician accepted the job.",
  },
  "assigned->rejected": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Assignment Rejected",
    body: "The technician declined the job.",
  },
  "accepted->completed": {
    targets: [{ audience: "reporter" }],
    title: "Job Completed",
    body: "Awaiting your feedback.",
  },
  "reopened->completed": {
    targets: [{ audience: "reporter" }],
    title: "Job Completed",
    body: "Awaiting your feedback.",
  },
  "completed->closed": {
    targets: [
      { audience: "assignedWorker" },
      { audience: "role", role: "estate" },
    ],
    title: "Report Closed",
    body: "This report is now closed.",
  },
  "completed->reopened": {
    targets: [
      { audience: "role", role: "estate" },
      { audience: "assignedWorker" },
    ],
    title: "Report Reopened",
    body: "This report has been reopened.",
  },
  "*->overdue": {
    targets: [
      { audience: "role", role: "estate" },
      { audience: "assignedWorker" },
    ],
    title: "Report Overdue",
    body: "This report has passed its due date.",
  },
};

export function resolveTransition(oldStatus, newStatus) {
  return (
    TRANSITIONS[`${oldStatus}->${newStatus}`] ||
    TRANSITIONS[`*->${newStatus}`] ||
    null
  );
}
