// pages/api/send-notification.js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { resolveTransition } from "../src/notifications/resolvedTargets.js";

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
const MAX_TARGETS = 100; // OneSignal external_id cap per call — chunked below, not enforced as a hard limit

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
  // Audience resolution now happens here, not on the client — the client
  // no longer needs read access to other users' Firestore docs at all.
  const { oldStatus, newStatus, report, title, body } = req.body || {};

  if (!report || typeof report !== "object" || typeof report.id !== "string") {
    return res.status(400).json({ error: "report (with an id) is required" });
  }
  if (typeof newStatus !== "string" || !newStatus) {
    return res.status(400).json({ error: "newStatus is required" });
  }
  // title/body are now optional — if the caller doesn't pass them, we fall
  // back to the copy defined per-transition below. Still validate length
  // when a caller *does* pass an override, so a bad override can't slip
  // through to OneSignal.
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
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error("Missing ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY env vars");
    return res.status(500).json({ error: "Push service not configured" });
  }

  try {
    const transition = resolveTransition(oldStatus ?? null, newStatus);
    if (!transition) {
      return res.status(200).json({
        provider: "onesignal",
        sent: 0,
        reason: "No notification rule for this status transition",
      });
    }

    const finalTitle = title || transition.title;
    const finalBody = body || transition.body || "";

    const roles = new Set();
    const customIds = new Set(); // legacy "ID" field, not the Firestore doc id

    for (const t of transition.targets) {
      if (t.audience === "role") roles.add(t.role);
      if (t.audience === "reporter" && report.reporterId)
        customIds.add(String(report.reporterId));
      if (t.audience === "assignedWorker" && report.assignedTo)
        customIds.add(String(report.assignedTo));
    }

    const targetUids = new Set();

    // Role audiences: the users collection is keyed by Firebase UID, so
    // doc.id is already a valid OneSignal external_id — no translation
    // needed, unlike the old client-side path.
    for (const role of roles) {
      const snap = await db.collection("users").where("role", "==", role).get();
      snap.forEach((doc) => targetUids.add(doc.id));
    }

    // reporter / assignedWorker are stored as the legacy custom "ID"
    // field on the report (see ReportForm.js: reporterId: currentUser.ID),
    // so these still need the ID -> doc.id translation, chunked at
    // Firestore's 30-value 'in' cap.
    if (customIds.size > 0) {
      const idList = [...customIds];
      for (let i = 0; i < idList.length; i += 30) {
        const chunk = idList.slice(i, i + 30);
        const snap = await db
          .collection("users")
          .where("ID", "in", chunk)
          .get();
        snap.forEach((doc) => targetUids.add(doc.id));
      }
    }

    if (targetUids.size === 0) {
      return res.status(200).json({
        provider: "onesignal",
        sent: 0,
        reason: "No matching users found for this notification",
      });
    }

    // Chunk into multiple OneSignal calls instead of truncating, so a
    // role that grows past MAX_TARGETS still reaches everyone.
    const allIds = [...targetUids];
    const idChunks = [];
    for (let i = 0; i < allIds.length; i += MAX_TARGETS) {
      idChunks.push(allIds.slice(i, i + MAX_TARGETS));
    }

    let totalRecipients = 0;
    const oneSignalIds = [];
    for (const chunk of idChunks) {
      const result = await sendViaOneSignal({
        externalIds: chunk,
        title: finalTitle,
        body: finalBody,
        data: { reportId: report.id, status: newStatus },
      });
      totalRecipients += result.recipients;
      oneSignalIds.push(result.id);
    }

    if (totalRecipients === 0) {
      return res.status(200).json({
        provider: "onesignal",
        sent: 0,
        reason: "No subscribed devices for these users",
      });
    }

    return res.status(200).json({
      provider: "onesignal",
      sent: totalRecipients,
      oneSignalIds,
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
