export const TRANSITIONS = {
  // New report submitted — notify admin for approval. This was missing
  // entirely: notifyOnStatusChange(null, "incoming", ...) resolved
  // "null->incoming" (no match) then "*->incoming" (also no match) and
  // fell through to `if (!targets) return;` — so no notification attempt
  // was ever made when a report was first created.
  "*->incoming": [{ audience: "role", role: "admin" }],

  "incoming->approved": [{ audience: "role", role: "admin" }],
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
