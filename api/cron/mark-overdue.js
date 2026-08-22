// pages/api/cron/mark-overdue.js
//
// No client/user involved — triggered purely by an external scheduler on
// an interval (see setup guide). Mirrors markOverdueReports() in
// src/utils.js but runs server-side with firebase-admin instead of the
// client SDK, and calls sendPushForTransition() directly instead of going
// through notifyOnStatusChange() (which needs a signed-in user's ID
// token — there is none here, nobody is logged in).
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { sendPushForTransition } from "../../src/notifications/sendPushForTransition.js";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// Same list as markOverdueReports() in src/utils.js — keep these in sync.
const ACTIVE_STATUSES = [
  "incoming",
  "approved",
  "pending",
  "confirmed",
  "procured",
  "assigned",
  "accepted",
  "costDenied",
  "rejected",
  "dropped",
];

// Accepts either an Authorization: Bearer header (preferred — what
// cron-job.org and Vercel Cron both support) or a ?secret= query param
// (fallback, in case your chosen scheduler can't send custom headers).
// Fails CLOSED: if CRON_SECRET isn't set at all, nothing is authorized.
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization || "";
  if (header === `Bearer ${secret}`) return true;
  if (req.query?.secret === secret) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getFirestore();

  try {
    const now = new Date();

    // Two equality-type filters (`in` + `==`), no orderBy — Firestore
    // merges these from automatic single-field indexes, so this needs no
    // manual composite index. The dateDue comparison itself is done
    // client-side below (same as the browser version), not as a Firestore
    // range filter, which keeps the query shape this simple on purpose.
    const snapshot = await db
      .collection("reports")
      .where("status", "in", ACTIVE_STATUSES)
      .where("overdue", "==", false)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ checked: 0, markedOverdue: 0 });
    }

    const overdueReports = snapshot.docs
      .map((docSnap) => ({ docSnap, data: docSnap.data() }))
      .filter(({ data }) => {
        if (!data.dateDue) return false;
        const due = data.dateDue?.toDate
          ? data.dateDue.toDate()
          : new Date(data.dateDue);
        return due < now;
      });

    if (overdueReports.length === 0) {
      return res.status(200).json({ checked: snapshot.size, markedOverdue: 0 });
    }

    const batch = db.batch();
    overdueReports.forEach(({ docSnap }) => {
      batch.update(db.collection("reports").doc(docSnap.id), {
        overdue: true,
      });
    });
    await batch.commit();

    // Notify only after the write succeeds. Each report is notified
    // independently (Promise.allSettled) so one bad OneSignal call can't
    // stop the rest, and can't undo any of the overdue flags just set.
    const notifyResults = await Promise.allSettled(
      overdueReports.map(({ docSnap, data }) =>
        sendPushForTransition({
          oldStatus: data.status,
          newStatus: "overdue", // synthetic — never written to the report
          report: {
            id: docSnap.id,
            reporterId: data.reporterId,
            assignedTo: data.assignedTo,
            priorityLevel: data.priorityLevel, // needed by the *->overdue
            status: data.status,
          }, // "admin only if emergency/urgent" rule in resolvedTargets.js
        }),
      ),
    );

    const failed = notifyResults.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error(
        `${failed.length}/${overdueReports.length} overdue notifications failed:`,
        failed.map((f) => f.reason),
      );
    }

    return res.status(200).json({
      checked: snapshot.size,
      markedOverdue: overdueReports.length,
      notifiedFailures: failed.length,
    });
  } catch (err) {
    console.error("mark-overdue cron failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
