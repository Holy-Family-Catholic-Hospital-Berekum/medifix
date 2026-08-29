// scripts/enable-totp-mfa.mjs
//
// ONE-OFF SETUP SCRIPT — run this once from your local machine. It is NOT
// part of the deployed app and is not an API route. There is no Firebase
// console button for TOTP; it has to be turned on at the project level via
// the Admin SDK's projectConfigManager(), which is all this script does.
//
// Deliberately has ZERO third-party dependencies — it reads your env file
// itself with the small parser below instead of pulling in the `dotenv`
// package, so there's nothing here to audit beyond this file and your own
// env file.
//
// Run again anytime with no ill effect — it's idempotent (just re-applies
// the same config).

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "node:fs";
import path from "node:path";

// Checked in this order — .env.local first (if you ever add one later,
// e.g. for local-only overrides), falling back to plain .env, which is
// what this project actually uses.
const ENV_FILE_CANDIDATES = [".env.local", ".env"];

function loadEnvFile() {
  const found = ENV_FILE_CANDIDATES.map((name) =>
    path.resolve(process.cwd(), name),
  ).find((p) => fs.existsSync(p));

  if (!found) {
    console.error(
      `Could not find any of: ${ENV_FILE_CANDIDATES.join(", ")} in ${process.cwd()}`,
    );
    console.error(
      "Run this command from your project's ROOT folder (the one that " +
        "directly contains .env and package.json) — e.g.:\n" +
        "  node scripts/enable-totp-mfa.mjs\n" +
        "not from inside the /scripts folder itself.",
    );
    process.exit(1);
  }

  const content = fs.readFileSync(found, "utf8");
  let loaded = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip a single layer of matching surrounding quotes, if present —
    // handles values written as KEY="value" or KEY='value'.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't clobber a variable that's already set in the real environment.
    if (!(key in process.env)) {
      process.env[key] = value;
      loaded++;
    }
  }

  console.log(`Loaded ${loaded} variable(s) from ${path.basename(found)}`);
}

loadEnvFile();

if (
  !process.env.FIREBASE_ADMIN_PROJECT_ID ||
  !process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
  !process.env.FIREBASE_ADMIN_PRIVATE_KEY
) {
  console.error(
    "Missing FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / " +
      "FIREBASE_ADMIN_PRIVATE_KEY.\n" +
      "Double-check the exact variable names in your .env file match what " +
      "your /api routes use.",
  );
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
  await getAuth().projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      providerConfigs: [
        {
          state: "ENABLED",
          totpProviderConfig: {
            adjacentIntervals: 5, // default clock-skew tolerance Google recommends
          },
        },
      ],
    },
  });
  console.log(
    "✅ TOTP multi-factor authentication is now enabled on this Firebase project.",
  );
}

main().catch((err) => {
  console.error("❌ Failed to enable TOTP MFA:", err);
  process.exit(1);
});
