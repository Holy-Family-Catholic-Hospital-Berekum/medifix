// pages/api/claim-registration-id.js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAppCheck } from "firebase-admin/app-check";

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

const VALID_REG_TYPES = [
  "staff",
  "worker",
  "estate",
  "admin",
  "manager",
  "procurement",
];
const REG_ID_EXPIRY_MS = 48 * 60 * 60 * 1000;

// ── rate limiting ──
// Two independent limiters: per-uid (cheap to bypass by making a new
// account, but slows a lazy attacker) and per-IP (harder to rotate at
// volume). Both must pass. Window is short and generous for real users —
// nobody legitimately fails a 6-digit PIN 6+ times in 10 minutes.
const MAX_ATTEMPTS = 6;
const WINDOW_MS = 10 * 60 * 1000;

async function checkAndBumpLimit(key) {
  const ref = db.collection("claimAttempts").doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    const windowStart = data?.windowStart ?? now;

    if (!data || now - windowStart > WINDOW_MS) {
      tx.set(ref, {
        count: 1,
        windowStart: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    if (data.count >= MAX_ATTEMPTS) {
      const err = new Error("RATE_LIMITED");
      err.retryAfterMs = WINDOW_MS - (now - windowStart);
      throw err;
    }
    tx.update(ref, {
      count: data.count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function clearLimit(key) {
  await db
    .collection("claimAttempts")
    .doc(key)
    .delete()
    .catch(() => {});
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── App Check ──
  // Requires the client to send a valid App Check token, proving the
  // request came from your real app (reCAPTCHA v3 attestation on web),
  // not a script hitting this endpoint directly.
  const appCheckToken = req.headers["x-firebase-appcheck"];
  if (!appCheckToken) {
    return res.status(401).json({ error: "Missing App Check token" });
  }
  try {
    await getAppCheck().verifyToken(appCheckToken);
  } catch (err) {
    console.error("App Check verification failed:", err);
    return res.status(401).json({ error: "Invalid App Check token" });
  }

  // ── auth ──
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken)
    return res.status(401).json({ error: "Missing Authorization header" });

  let uid;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const pin = String(req.body?.pin || "").trim();
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: "Invalid PIN format" });
  }

  const ip = getClientIp(req);

  try {
    await checkAndBumpLimit(`uid:${uid}`);
    await checkAndBumpLimit(`ip:${ip}`);
  } catch (err) {
    if (err.message === "RATE_LIMITED") {
      res.setHeader(
        "Retry-After",
        Math.ceil((err.retryAfterMs ?? WINDOW_MS) / 1000),
      );
      return res
        .status(429)
        .json({ error: "Too many attempts. Please wait and try again." });
    }
    console.error("Rate limit check failed:", err);
    return res.status(500).json({ error: "Please try again later." });
  }

  const regRef = db.collection("registrationIDs").doc(pin);

  try {
    const role = await db.runTransaction(async (tx) => {
      const regSnap = await tx.get(regRef);
      if (!regSnap.exists) throw new Error("REG_NOT_FOUND");

      const reg = regSnap.data();
      if (reg.used === true) throw new Error("REG_ALREADY_USED");

      const createdAtMs = reg.createdAt?.toMillis
        ? reg.createdAt.toMillis()
        : null;
      if (createdAtMs == null || Date.now() - createdAtMs > REG_ID_EXPIRY_MS) {
        throw new Error("REG_EXPIRED");
      }

      const type = reg.type?.toLowerCase();
      if (!VALID_REG_TYPES.includes(type)) throw new Error("REG_INVALID_TYPE");

      tx.update(regRef, { used: true, claimedBy: uid });
      return type;
    });

    // Success — clear this uid's counter so a legitimate user who fat-
    // fingered a PIN a couple times isn't left near the limit.
    await clearLimit(`uid:${uid}`);

    return res.status(200).json({ role });
  } catch (err) {
    const code = err.message;
    const messages = {
      REG_NOT_FOUND:
        "Invalid registration ID. Please request one from the Admin or IT Manager.",
      REG_ALREADY_USED: "This registration ID has already been used.",
      REG_EXPIRED:
        "This registration ID has expired. Please request a new one.",
      REG_INVALID_TYPE: "Invalid registration ID type. Contact the IT Manager.",
    };
    if (messages[code]) {
      return res.status(400).json({ error: messages[code], code });
    }
    console.error("claim-registration-id failed:", err);
    return res
      .status(500)
      .json({
        error: "Unable to verify registration ID. Please try again later.",
      });
  }
}
