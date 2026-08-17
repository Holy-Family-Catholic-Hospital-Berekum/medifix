// src/lib/push.js
//
// OneSignal identity linking.
//
// Android:
//   Median → OneSignal native SDK
//
// iOS PWA / Browser:
//   OneSignal Web SDK
//
// The Firebase UID is used as the OneSignal External ID.

function waitForMedianOneSignal(timeoutMs = 8000, intervalMs = 200) {
  return new Promise((resolve) => {
    const start = Date.now();

    const check = () => {
      if (window.median?.onesignal) {
        return resolve(window.median.onesignal);
      }

      if (Date.now() - start > timeoutMs) {
        return resolve(null);
      }

      setTimeout(check, intervalMs);
    };

    check();
  });
}

export async function linkPushUser(userId) {
  if (!userId) return false;

  const uid = String(userId);

  // ─────────────────────────────────────────────
  // ANDROID — MEDIAN
  // ─────────────────────────────────────────────

  const medianOneSignal = await waitForMedianOneSignal();

  if (medianOneSignal) {
    try {
      medianOneSignal.login(uid);

      console.log("[push] Linked via Median:", uid);

      return true;
    } catch (error) {
      console.error("[push] Median OneSignal login failed:", error);

      return false;
    }
  }

  // WEB / IOS PWA — ONESIGNAL WEB SDK
  if (window.OneSignalDeferred) {
    return new Promise((resolve) => {
      window.OneSignalDeferred.push(async (OneSignal) => {
        const attemptLogin = async (retriesLeft) => {
          try {
            await OneSignal.login(uid);
            console.log("[push] Linked via OneSignal Web:", uid);
            resolve(true);
          } catch (error) {
            if (retriesLeft > 0) {
              console.warn(
                "[push] OneSignal not ready yet, retrying login...",
                error,
              );
              setTimeout(() => attemptLogin(retriesLeft - 1), 500);
            } else {
              console.error("[push] OneSignal Web login failed:", error);
              resolve(false);
            }
          }
        };
        attemptLogin(5);
      });
    });
  }

  console.warn("[push] No Median bridge and no OneSignal Web SDK found.");

  return false;
}
