import { useState, useEffect, useCallback } from "react";
import { auth } from "../src/firebase";
import { linkPushUser } from "../src/lib/push";

export function usePushNotifications() {
  const [permission, setPermission] = useState(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  });

  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  // Keep browser permission state in sync
  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }

    const checkPermission = () => {
      setPermission(Notification.permission);
    };

    checkPermission();

    window.addEventListener("focus", checkPermission);

    return () => {
      window.removeEventListener("focus", checkPermission);
    };
  }, []);

  const enable = useCallback(async () => {
    const uid = auth.currentUser?.uid;

    if (!uid) {
      setError("You must be signed in to enable notifications.");
      setStatus("error");
      return;
    }

    setStatus("enabling");
    setError("");

    try {
      /*
       * Android Median
       *
       * Median handles the native OneSignal permission/subscription.
       * We only need to link the PHIX Firebase UID.
       */
      if (window.median?.onesignal) {
        const linked = await linkPushUser(uid);
        if (!linked) {
          setError("Failed to link push notifications. Please try again.");
          setStatus("error");
          return;
        }
        setPermission("granted");
        setStatus("enabled");
        return;
      }

      /*
       * Web / iOS PWA
       *
       * Use OneSignal Web SDK.
       */
      if (!window.OneSignalDeferred) {
        throw new Error(
          "OneSignal is not loaded yet. Please refresh the page and try again.",
        );
      }

      await new Promise((resolve, reject) => {
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            // Ask the user for notification permission.
            await OneSignal.Notifications.requestPermission();

            // Check permission after request.
            const granted = OneSignal.Notifications.permission;

            if (!granted) {
              setPermission("denied");
              setStatus("idle");
              resolve();
              return;
            }

            setPermission("granted");

            // Link OneSignal user to Firebase UID.
            await OneSignal.login(String(uid));

            console.log("[push] OneSignal user linked:", uid);

            setStatus("enabled");
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (err) {
      console.error("Failed to enable notifications:", err);

      setError(
        err?.message || "Something went wrong while enabling notifications.",
      );

      setStatus("error");
    }
  }, []);

  return {
    permission,
    status,
    error,
    enable,
  };
}
