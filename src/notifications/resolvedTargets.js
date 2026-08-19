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
    title: "Report Pending",
    body: "A report is awaiting cost review.",
  },
  "pending->confirmed": {
    targets: [{ audience: "role", role: "procurement" }],
    title: "Cost Confirmed",
    body: "Ready for procurement.",
  },
  "pending->costDenied": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Cost Denied",
    body: "The submitted cost was rejected.",
  },
  "confirmed->procured": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Materials Procured",
    body: "Ready to assign a worker.",
  },
  "*->assigned": {
    targets: [{ audience: "assignedWorker" }],
    title: "New Assignment",
    body: "You've been assigned a report.",
  },
  "assigned->accepted": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Assignment Accepted",
    body: "The worker accepted the job.",
  },
  "assigned->rejected": {
    targets: [{ audience: "role", role: "estate" }],
    title: "Assignment Rejected",
    body: "The worker declined the job.",
  },
  "accepted->completed": {
    targets: [{ audience: "reporter" }],
    title: "Report Completed",
    body: "Your report has been resolved.",
  },
  "reopened->completed": {
    targets: [{ audience: "reporter" }],
    title: "Report Completed",
    body: "Your report has been resolved.",
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
};

export function resolveTransition(oldStatus, newStatus) {
  return (
    TRANSITIONS[`${oldStatus}->${newStatus}`] ||
    TRANSITIONS[`*->${newStatus}`] ||
    null
  );
}
