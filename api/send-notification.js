// pages/api/send-notification.js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { sendPushForTransition } from "../src/notifications/sendPushForTransition.js";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminAuth = getAuth();

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    await adminAuth.verifyIdToken(idToken);
  } catch (err) {
    console.error("ID token verification failed:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // ── Validate payload ────────────────────────────────────────────────────
  // Audience resolution + OneSignal send + targetUrl construction all live
  // in sendPushForTransition.js now — this handler is just auth + input
  // validation, so it stays in sync with the cron path for free instead of
  // drifting the way the old inline copy did (which never set targetUrl).
  const { oldStatus, newStatus, report, title, body } = req.body || {};

  if (!report || typeof report !== "object" || typeof report.id !== "string") {
    return res.status(400).json({ error: "report (with an id) is required" });
  }
  if (typeof newStatus !== "string" || !newStatus) {
    return res.status(400).json({ error: "newStatus is required" });
  }
  if (
    title != null &&
    (typeof title !== "string" || title.length > MAX_TITLE_LENGTH)
  ) {
    return res.status(400).json({
      error: `title must be a string under ${MAX_TITLE_LENGTH} characters`,
    });
  }
  if (
    body != null &&
    (typeof body !== "string" || body.length > MAX_BODY_LENGTH)
  ) {
    return res.status(400).json({
      error: `body must be a string under ${MAX_BODY_LENGTH} characters`,
    });
  }

  try {
    const result = await sendPushForTransition({
      oldStatus,
      newStatus,
      report,
      title,
      body,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("send-notification failed:", err);
    return res.status(500).json({ error: "Failed to send notification" });
  }
}
