import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Reuse a single Admin SDK instance across warm serverless invocations
// instead of re-initializing (and re-parsing the private key) on every
// request.
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // If you pasted the key into Vercel as a single line with literal
      // "\n" sequences, this converts them back into real newlines so the
      // PEM parses. Harmless no-op if you pasted it as an actual
      // multi-line value instead (Vercel's dashboard supports that too).
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminAuth = getAuth();
const db = getFirestore();
const messaging = getMessaging();

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Auth: only a signed-in PHIX user can trigger a send ────────────────
  // Without this, anyone who discovers this URL could spam arbitrary push
  // notifications to arbitrary users for free, forever. The client must
  // send its Firebase Auth ID token; we verify it server-side rather than
  // trusting anything the client claims about who it is.
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
  const { targetUserId, title, body, data } = req.body || {};
  if (!targetUserId || typeof targetUserId !== "string") {
    return res.status(400).json({ error: "targetUserId is required" });
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

  try {
    // targetUserId here is the app-level worker/user "ID" field (e.g.
    // "WK-042") used throughout the rest of the app for assignment —
    // NOT the Firestore document ID / Firebase Auth uid. Every other
    // part of the codebase (ReportDetailsContainer, StaffReportDetails,
    // Firestore rules' getUserID()) treats this ID as the identity token
    // for a user, so this route matches that convention rather than
    // requiring callers to look up a uid first. A direct .doc(id).get()
    // would silently miss almost every real user, since doc IDs are uids.
    const targetQuery = await db
      .collection("users")
      .where("ID", "==", targetUserId)
      .limit(1)
      .get();

    if (targetQuery.empty) {
      return res.status(404).json({ error: "Target user not found" });
    }

    const targetDoc = targetQuery.docs[0];
    const tokens = targetDoc.data().fcmTokens;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      // Not an error — the target just hasn't registered a device for
      // push yet (or cleared permission). The caller's own action (e.g.
      // assigning a worker) already succeeded independently of this call.
      return res.status(200).json({ sent: 0, reason: "No registered devices" });
    }

    const message = {
      notification: { title, body: body || "" },
      data: data && typeof data === "object" ? stringifyDataValues(data) : {},
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    // Prune tokens FCM reports as dead/unregistered so they stop being
    // retried (and billed against the multicast call) on every future send.
    const deadTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          deadTokens.push(tokens[i]);
        } else {
          console.error(`Push failed for token ${tokens[i]}:`, r.error);
        }
      }
    });

    if (deadTokens.length > 0) {
      await targetDoc.ref.update({
        fcmTokens: tokens.filter((t) => !deadTokens.includes(t)),
      });
    }

    return res.status(200).json({
      sent: response.successCount,
      failed: response.failureCount,
      prunedTokens: deadTokens.length,
    });
  } catch (err) {
    console.error("send-notification failed:", err);
    return res.status(500).json({ error: "Failed to send notification" });
  }
}

// FCM's `data` payload requires every value to be a string — this coerces
// whatever you pass (report IDs, statuses, booleans, etc.) so you don't
// have to remember that constraint at every call site.
function stringifyDataValues(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}
