// src/notifications/notifyOnStatusChange.js
import { getAuth } from "firebase/auth";

export async function notifyOnStatusChange(
  oldStatus,
  newStatus,
  report,
  { title, body } = {},
) {
  const idToken = await getAuth().currentUser?.getIdToken();
  if (!idToken) return;

  fetch("/api/send-notification", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      oldStatus,
      newStatus,
      report,
      title: title || "Report update",
      body: body || `Report is now ${newStatus}.`,
    }),
  }).catch((err) => console.error("Notification send failed:", err));
}
