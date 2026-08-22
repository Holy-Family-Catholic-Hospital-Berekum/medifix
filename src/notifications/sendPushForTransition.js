// src/notifications/sendPushForTransition.js
//
// Server-only. Shared by pages/api/send-notification.js (authenticated,
// client-triggered) and pages/api/cron/mark-overdue.js (secret-authenticated,
// runs on a schedule with no client involved) — both need the exact same
// audience-resolution + OneSignal-send logic, so it lives here once instead
// of being duplicated between them.
import { getFirestore } from "firebase-admin/firestore";
import { resolveTransition } from "./resolvedTargets.js";

const MAX_TARGETS = 100; // OneSignal external_id cap per call — chunked below

// Custom notification sound, uploaded via Median App Studio (Native Plugins
// > OneSignal). See pages/api/send-notification.js's original comment for
// the full explanation — kept here since this is now where the payload is
// actually built.
const IOS_SOUND = "custom_sound_1.caf";
const ANDROID_CHANNEL_ID = "9d88ffe6-598b-4568-acd5-016eb7e24661";

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
// Base origin the app is served from. targetUrl must be an absolute URL on
// this origin for Median to navigate in-app instead of falling back to an
// external browser. If unset, notifications just land on home as before.
const APP_BASE_URL = process.env.APP_BASE_URL;

export async function sendPushForTransition({
  oldStatus,
  newStatus,
  report,
  title,
  body,
}) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error("Missing ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY env vars");
    return {
      provider: "onesignal",
      sent: 0,
      reason: "Push service not configured",
    };
  }
  if (!APP_BASE_URL) {
    console.warn(
      "Missing APP_BASE_URL env var — notifications will omit targetUrl",
    );
  }

  const db = getFirestore();

  const transition = resolveTransition(oldStatus ?? null, newStatus);
  if (!transition) {
    return {
      provider: "onesignal",
      sent: 0,
      reason: "No notification rule for this status transition",
    };
  }

  // Transition-level title/body — used as the fallback for any target that
  // doesn't define its own. Can be a plain string or a function of the
  // report (e.g. overdue copy that needs to mention priorityLevel/status).
  const transitionTitle = resolveText(transition.title, report);
  const transitionBody = resolveText(transition.body, report);

  // Each target audience gets its own send call, since each one deep-links
  // to a different role-specific route (e.g. a closed report notifies both
  // the worker and estate manager, but they land on different pages) —
  // and, as of the overdue rework, can also need entirely different
  // wording (e.g. the reporter's copy differs from the current holder's).
  let totalRecipients = 0;
  let matchedAnyUsers = false;
  const oneSignalIds = [];

  for (const target of transition.targets) {
    // Optional per-target gate — e.g. only notify admin on an overdue
    // report when it's emergency/urgent priority. Targets without a
    // `when` always run, exactly as before.
    if (target.when && !target.when(report)) continue;

    const targetUids = await resolveTargetUids(db, target, report);
    if (targetUids.size === 0) continue;
    matchedAnyUsers = true;

    const targetUrl = APP_BASE_URL
      ? `${APP_BASE_URL}${target.route(report)}`
      : undefined;

    // Precedence: an explicit title/body passed in by the caller (e.g. a
    // one-off override from notifyOnStatusChange) wins for every target;
    // otherwise a target-specific title/body wins; otherwise fall back to
    // the transition-level default.
    const finalTitle =
      title || resolveText(target.title, report) || transitionTitle;
    const finalBody =
      body || resolveText(target.body, report) || transitionBody;

    const allIds = [...targetUids];
    for (let i = 0; i < allIds.length; i += MAX_TARGETS) {
      const chunk = allIds.slice(i, i + MAX_TARGETS);
      const result = await sendViaOneSignal({
        externalIds: chunk,
        title: finalTitle,
        body: finalBody,
        data: { reportId: report.id, status: newStatus, targetUrl },
      });
      totalRecipients += result.recipients;
      oneSignalIds.push(result.id);
    }
  }

  if (!matchedAnyUsers) {
    return {
      provider: "onesignal",
      sent: 0,
      reason: "No matching users found for this notification",
    };
  }

  if (totalRecipients === 0) {
    return {
      provider: "onesignal",
      sent: 0,
      reason: "No subscribed devices for these users",
    };
  }

  return { provider: "onesignal", sent: totalRecipients, oneSignalIds };
}

async function resolveTargetUids(db, target, report) {
  const uids = new Set();

  if (target.audience === "role") {
    const snap = await db
      .collection("users")
      .where("role", "==", target.role)
      .get();
    snap.forEach((doc) => uids.add(doc.id));
    return uids;
  }

  // reporter / assignedWorker are stored as the legacy custom "ID" field
  // on the report, so this still needs the ID -> doc.id translation.
  const customId =
    target.audience === "reporter"
      ? report.reporterId
      : target.audience === "assignedWorker"
        ? report.assignedTo
        : null;

  if (customId) {
    const snap = await db
      .collection("users")
      .where("ID", "==", String(customId))
      .get();
    snap.forEach((doc) => uids.add(doc.id));
  }

  return uids;
}

async function sendViaOneSignal({ externalIds, title, body, data }) {
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: externalIds.map(String) },
    target_channel: "push",
    headings: { en: title },
    contents: { en: body },
    ios_sound: IOS_SOUND,
    android_channel_id: ANDROID_CHANNEL_ID,
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

// Lets a title/body (transition-level OR target-level) be a static string
// OR a function of the report.
function resolveText(value, report) {
  return typeof value === "function" ? value(report) : value;
}
