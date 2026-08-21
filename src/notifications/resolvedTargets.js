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
    targets: [{ audience: "assignedWorker", route: () => "/wa" }],
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
    body: "A technician dropped a job — it needs reassignment.",
  },
  "assigned->rejected": {
    targets: [{ audience: "role", role: "estate", route: () => "/er" }],
    title: "Assignment Rejected",
    body: "The technician declined the job.",
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
      { audience: "role", role: "estate", route: () => "/ero" },
      { audience: "assignedWorker", route: () => "/wro" },
    ],
    title: "Report Reopened",
    body: "This report has been reopened.",
  },
  "*->overdue": {
    targets: [
      { audience: "role", role: "estate", route: () => "/eh" },
      { audience: "assignedWorker", route: () => "/wa" },
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
