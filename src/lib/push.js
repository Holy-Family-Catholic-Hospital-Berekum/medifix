// src/lib/push.js
//
// Links the current device's push subscription to your app's user id.
// - Android (Median-wrapped APK): uses the native bridge, window.median.onesignal
// - iOS (added-to-homescreen PWA) / any browser: uses OneSignal's Web SDK
//
// Call this once, right after a user successfully authenticates.

function waitForMedianOneSignal(timeoutMs = 8000, intervalMs = 200) {
  // The Median bridge injects asynchronously after native startup, so a
  // single check right after login can race it — poll briefly instead.
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (window.median?.onesignal) return resolve(window.median.onesignal);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

export async function linkPushUser(userId) {
  if (!userId) return;
  const uid = String(userId);

  // ── Path A: Android, wrapped by Median ──────────────────────────────
  const medianOneSignal = await waitForMedianOneSignal();
  if (medianOneSignal) {
    try {
      medianOneSignal.login(uid);
      console.log("[push] linked via Median bridge:", uid);
    } catch (e) {
      console.error("[push] Median onesignal.login() failed:", e);
    }
    return;
  }

  // ── Path B: iOS home-screen PWA (or any regular browser) ────────────
  // Requires the OneSignal Web SDK to already be loaded/initialized —
  // see index.html changes below.
  if (window.OneSignalDeferred) {
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.login(uid);
        console.log("[push] linked via OneSignal Web SDK:", uid);
      } catch (e) {
        console.error("[push] OneSignal.login() (web) failed:", e);
      }
    });
  } else {
    console.warn(
      "[push] No Median bridge and no OneSignal Web SDK found — push not linked.",
    );
  }
}
