// scripts/reset-mfa.mjs
//
// ONE-OFF ADMIN SCRIPT — clears all enrolled two-factor (TOTP) methods
// from a single user account, by email. Use this whenever an account is
// locked out with auth/maximum-second-factor-count-exceeded, or whenever
// someone genuinely loses their authenticator device and needs to
// re-enroll from scratch.
//
// v2: uses enrolledFactors: null (Google's documented primary form —
// some SDK versions have historically not fully honored an empty array
// the same way) AND re-fetches the user fresh afterward to CONFIRM the
// clear actually took effect, instead of trusting the API call silently.
//
// Usage (from your project ROOT folder):
//   node scripts/reset-mfa.mjs manager@example.com

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "node:fs";
import path from "node:path";

const ENV_FILE_CANDIDATES = [".env.local", ".env"];

function loadEnvFile() {
  const found = ENV_FILE_CANDIDATES.map((name) =>
    path.resolve(process.cwd(), name),
  ).find((p) => fs.existsSync(p));

  if (!found) {
    console.error(
      `Could not find any of: ${ENV_FILE_CANDIDATES.join(", ")} in ${process.cwd()}`,
    );
    console.error("Run this from your project's ROOT folder.");
    process.exit(1);
  }

  const content = fs.readFileSync(found, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

if (
  !process.env.FIREBASE_ADMIN_PROJECT_ID ||
  !process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
  !process.env.FIREBASE_ADMIN_PRIVATE_KEY
) {
  console.error(
    "Missing FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / " +
      "FIREBASE_ADMIN_PRIVATE_KEY in your env file.",
  );
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/reset-mfa.mjs <user-email>");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

async function main() {
  const auth = getAuth();

  const user = await auth.getUserByEmail(email);
  const before = user.multiFactor?.enrolledFactors ?? [];

  console.log(`Found account: ${user.email} (uid: ${user.uid})`);
  console.log(`Currently enrolled factors: ${before.length}`);
  before.forEach((f, i) => {
    console.log(
      `  ${i + 1}. ${f.displayName || f.factorId} — enrolled ${f.enrollmentTime}`,
    );
  });

  if (before.length === 0) {
    console.log("Nothing to clear — this account has no enrolled factors.");
    console.log(
      "If you're still seeing 'too many second factors' at login, you're " +
        "very likely testing a DIFFERENT account than the one you just " +
        "checked — double check the exact email being used to log in.",
    );
    return;
  }

  await auth.updateUser(user.uid, {
    multiFactor: { enrolledFactors: null },
  });

  // Don't trust the response from updateUser() itself — re-fetch fresh
  // from the server to confirm the clear actually took effect. There's a
  // documented history of firebase-admin versions where this silently
  // didn't apply (github.com/firebase/firebase-admin-node/issues/2285).
  const after = await auth.getUser(user.uid);
  const remaining = after.multiFactor?.enrolledFactors ?? [];

  if (remaining.length > 0) {
    console.error(
      `❌ Clear did NOT take effect — ${remaining.length} factor(s) still ` +
        "present after the update call. This matches a known issue in " +
        "some firebase-admin SDK versions where enrolledFactors updates " +
        "silently don't apply.",
    );
    console.error("Next steps:");
    console.error("  1. Check your installed version: npm ls firebase-admin");
    console.error(
      "  2. Upgrade it:                   npm install firebase-admin@latest",
    );
    console.error("  3. Run this script again.");
    process.exit(1);
  }

  console.log(
    `✅ Confirmed cleared — 0 factors remain on ${user.email}. ` +
      "This account will be prompted to enroll a single new TOTP factor " +
      "on its next login.",
  );
}

main().catch((err) => {
  console.error("❌ Failed to reset MFA:", err);
  process.exit(1);
});
