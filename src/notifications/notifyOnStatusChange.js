import { getAuth } from "firebase/auth";

export async function notifyOnStatusChange(
  oldStatus,
  newStatus,
  report,
  { title, body } = {},
) {
  const idToken = await getAuth().currentUser?.getIdToken();
  if (!idToken) return;

  const res = await fetch("/api/send-notification", {
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
  });

  const json = await res.json();
  console.log("[notify] response:", res.status, json);
}
