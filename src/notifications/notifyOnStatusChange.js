// src/notifications/notifyOnStatusChange.js
import { getAuth } from "firebase/auth";

export async function notifyOnStatusChange(
  oldStatus,
  newStatus,
  report,
  { title, body } = {},
) {
  console.log("[notify] currentUser:", getAuth().currentUser);
  const idToken = await getAuth().currentUser?.getIdToken();
  console.log("[notify] got idToken:", !!idToken);
  if (!idToken) {
    console.warn("[notify] aborting — no authenticated user");
    return;
  }

  const res = await fetch("/api/send-notification", {
    /* ... */
  });
  const json = await res.json();
  console.log("[notify] response:", res.status, json);
}
