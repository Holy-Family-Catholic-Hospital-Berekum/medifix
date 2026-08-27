import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Local dev only — makes App Check issue a debug token instead of running
// real reCAPTCHA v3 (which won't validate correctly on localhost anyway).
// The token gets logged to the browser console on first run; copy it into
// Firebase Console → App Check → your web app → Manage debug tokens.
// Gated behind import.meta.env.DEV so this never runs in a production build.
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = "9f910cb1-2966-49d1-8ad6-5584919888d8";
}

// Must be initialized before any Firestore/Auth calls elsewhere in the app
// actually hit the network, so it's done here, right after initializeApp.
// NOTE: only call this once per app instance — calling it twice throws.
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
const db = getFirestore(app);

export { db };
