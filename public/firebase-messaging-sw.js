// This file MUST be saved at:  public/firebase-messaging-sw.js
// so it's served from your site root as:  https://phix-hfch.vercel.app/firebase-messaging-sw.js
// FCM requires it at exactly that path — it will not work from a subfolder.
//
// This is a plain static file, NOT run through Vite's build — so
// `import.meta.env` is unavailable here. Replace the placeholders below
// with the literal values from your src/firebase.js / .env (Project
// Settings → General → Your apps, in the Firebase console, if you need
// to look them up again). These are safe to hardcode — Firebase web
// config values are public identifiers, not secrets.

importScripts(
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

const messaging = firebase.messaging();

// Fires for pushes that arrive while no tab has focus — app closed,
// backgrounded, or the browser itself isn't the active window. Foreground
// messages (tab open AND focused) don't reach this handler at all — those
// are handled separately in the app itself via onMessage(), where you'd
// render an in-app toast/banner instead of a native OS notification.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "PHIX";
  const options = {
    body: payload.notification?.body || payload.data?.body || "",
    // Adjust this to an actual icon file you have in /public, or remove
    // the line — without it, the browser falls back to a default icon.
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

// Clicking the notification focuses an already-open tab if one exists,
// otherwise opens a new one — instead of the default behavior of just
// dismissing the notification with no action.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("/");
        }
      }),
  );
});
