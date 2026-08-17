// pages/api/send-notification.js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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
const db = getFirestore();

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;
const MAX_TARGETS = 100; // OneSignal external_id array cap per call; chunk above this if a role ever grows past it

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

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
  // targetUserIds replaces targetUserId — always an array now, even for a
  // single recipient (denied, completed, assigned, closed all send a
  // one-element array; role notifications send many).
  const { targetUserIds, title, body, data } = req.body || {};
  if (
    !Array.isArray(targetUserIds) ||
    targetUserIds.length === 0 ||
    !targetUserIds.every((id) => typeof id === "string")
  ) {
    return res
      .status(400)
      .json({ error: "targetUserIds must be a non-empty array of strings" });
  }
  if (targetUserIds.length > MAX_TARGETS) {
    return res
      .status(400)
      .json({ error: `targetUserIds exceeds max of ${MAX_TARGETS}` });
  }
  if (!title || typeof title !== "string" || title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({
      error: `title is required and must be under ${MAX_TITLE_LENGTH} characters`,
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
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error("Missing ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY env vars");
    return res.status(500).json({ error: "Push service not configured" });
  }

  try {
    // Same ID -> uid translation as before, batched. Firestore 'in' caps
    // at 30 values per query, so chunk if a role could ever exceed that.
    const uniqueIds = [...new Set(targetUserIds)];
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 30) {
      chunks.push(uniqueIds.slice(i, i + 30));
    }

    const targetUids = [];
    for (const chunk of chunks) {
      const snap = await db.collection("users").where("ID", "in", chunk).get();
      snap.forEach((doc) => targetUids.push(doc.id));
    }

    if (targetUids.length === 0) {
      return res.status(404).json({ error: "No matching users found" });
    }

    const oneSignalResult = await sendViaOneSignal({
      externalIds: targetUids,
      title,
      body: body || "",
      data,
    });

    if (oneSignalResult.recipients === 0) {
      return res.status(200).json({
        provider: "onesignal",
        sent: 0,
        reason: "No subscribed devices for these users",
      });
    }

    return res.status(200).json({
      provider: "onesignal",
      sent: oneSignalResult.recipients,
      oneSignalId: oneSignalResult.id,
    });
  } catch (err) {
    console.error("send-notification failed:", err);
    return res.status(500).json({ error: "Failed to send notification" });
  }
}

async function sendViaOneSignal({ externalIds, title, body, data }) {
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: externalIds.map(String) },
    target_channel: "push",
    headings: { en: title },
    contents: { en: body },
    ...(data && typeof data === "object"
      ? { data: stringifyDataValues(data) }
      : {}),
  };

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const responseData = await res.json();
  if (!res.ok) {
    console.error("OneSignal send failed:", responseData);
    throw new Error(
      Array.isArray(responseData.errors)
        ? responseData.errors.join(", ")
        : "OneSignal send failed",
    );
  }

  return { id: responseData.id, recipients: responseData.recipients ?? 0 };
}

function stringifyDataValues(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}
