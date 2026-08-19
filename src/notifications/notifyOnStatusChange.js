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

  try {
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
        // title/body are optional now — if omitted, the server falls back
        // to the copy defined per-transition in resolvedTargets.js, so most
        // call sites don't need to pass these at all.
        ...(title ? { title } : {}),
        ...(body ? { body } : {}),
      }),
    });

    const json = await res.json();

    if (!res.ok || json?.sent === 0) {
      // Not thrown as an error — a 0-sent response can be a legitimate
      // outcome (e.g. no rule for this transition, no matching users), so
      // this stays a warn rather than breaking the caller's flow.
      console.warn("[notify] no notification sent:", res.status, json);
    }

    return json;
  } catch (err) {
    console.error("[notify] request failed:", err);
  }
}
