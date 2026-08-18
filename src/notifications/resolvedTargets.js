export const TRANSITIONS = {
  "*->incoming": [{ audience: "role", role: "admin" }],
  "incoming->approved": [{ audience: "role", role: "estate" }],
  "incoming->denied": [{ audience: "reporter" }],
  "*->pending": [{ audience: "role", role: "admin" }],
  "pending->confirmed": [{ audience: "role", role: "procurement" }],
  "pending->costDenied": [{ audience: "role", role: "estate" }],
  "confirmed->procured": [{ audience: "role", role: "estate" }],
  "*->assigned": [{ audience: "assignedWorker" }],
  "assigned->accepted": [{ audience: "role", role: "estate" }],
  "assigned->rejected": [{ audience: "role", role: "estate" }],
  "accepted->completed": [{ audience: "reporter" }],
  "reopened->completed": [{ audience: "reporter" }],
  "completed->closed": [
    { audience: "assignedWorker" },
    { audience: "role", role: "estate" },
  ],
  "completed->reopened": [
    { audience: "role", role: "estate" },
    { audience: "assignedWorker" },
  ],
};

export function resolveTargets(oldStatus, newStatus) {
  return (
    TRANSITIONS[`${oldStatus}->${newStatus}`] ||
    TRANSITIONS[`*->${newStatus}`] ||
    null
  );
}
