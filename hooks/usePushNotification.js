import { useState, useEffect, useCallback } from "react";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "../src/firebase";

// Set from the "Key pair" value under Firebase Console → Project Settings
// → Cloud Messaging → Web configuration (the VAPID key you already
// generated). Add VITE_FIREBASE_VAPID_KEY to both your local .env and
// Vercel's environment variables, same as the reCAPTCHA site key earlier.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// permission mirrors the browser's Notification.permission values
// ("default" | "granted" | "denied"), plus "unsupported" for browsers
// with no push support at all (older Safari, some in-app webviews).
export function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  );
  const [status, setStatus] = useState("idle"); // idle | enabling | enabled | error
  const [error, setError] = useState("");

  // Foreground messages (tab open AND focused) never reach the service
  // worker's background handler — FCM expects the app itself to handle
  // and display those. This is a minimal fallback (console log); swap the
  // body of this callback for whatever in-app toast/banner system you'd
  // rather show instead.
  useEffect(() => {
    let unsubscribe;
    let cancelled = false;
    isSupported().then((supported) => {
      if (!supported || cancelled) return;
      const messaging = getMessaging();
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title;
        const body = payload.notification?.body || payload.data?.body;
        if (title) {
          console.log("Foreground push received:", title, body);
        }
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Silent re-sync on every load for users who already granted permission
  // in a past session — keeps the stored token fresh (FCM tokens can
  // rotate) without requiring them to click "enable" again.
  useEffect(() => {
    if (permission !== "granted") return;
    let cancelled = false;

    (async () => {
      try {
        const supported = await isSupported();
        if (!supported || cancelled) return;

        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
        );

        // register() resolving only means the browser accepted the
        // registration — not that the worker has finished installing and
        // activating yet. getToken() needs an ACTIVE worker; calling it
        // too early throws AbortError ("no active Service Worker").
        // navigator.serviceWorker.ready resolves once a worker is
        // actually controlling the page.
        await navigator.serviceWorker.ready;

        if (cancelled) return;

        const messaging = getMessaging();
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        const uid = auth.currentUser?.uid;
        if (token && uid && !cancelled) {
          await updateDoc(doc(db, "users", uid), {
            fcmTokens: arrayUnion(token),
          });
        }
      } catch (err) {
        // Silent — this is a background sync, not a user-initiated action,
        // so don't surface an error state for it.
        console.warn("Silent token sync failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [permission]);

  const enable = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setError("Push notifications aren't supported in this browser.");
      setStatus("error");
      return;
    }

    setStatus("enabling");
    setError("");

    try {
      // Request permission FIRST, before any other await — the
      // installed/standalone PWA context is stricter about how long the
      // click's user-activation stays valid for gesture-gated APIs than
      // a normal tab is.
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        setStatus("idle");
        return;
      }

      const supported = await isSupported();
      if (!supported) {
        throw new Error("Push notifications aren't supported in this browser.");
      }

      const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
      await navigator.serviceWorker.ready;

      const messaging = getMessaging();
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        throw new Error("Could not get a notification token from Firebase.");
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error("You must be signed in to enable notifications.");
      }

      await updateDoc(doc(db, "users", uid), {
        fcmTokens: arrayUnion(token),
      });

      setStatus("enabled");
    } catch (err) {
      console.error("Failed to enable push notifications:", err);
      setError(err.message || "Something went wrong enabling notifications.");
      setStatus("error");
    }
  }, []);

  return { permission, status, error, enable };
}
