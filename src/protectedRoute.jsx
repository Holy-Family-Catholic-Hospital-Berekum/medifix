import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import EnableNotificationsButton from "../components/EnableNotificationsButton";
import { MFA_REQUIRED_ROLES } from "../src/lib/mfaConfig";

// *** THE FIX ***
// This file used to gate admin/manager access on
// `firebaseUser.multiFactor.enrolledFactors.length > 0`, refreshed via
// reload() and retried up to 3 times. That check answers "does this
// account have a factor enrolled at all" — a DIFFERENT question from what
// firestore.rules actually enforces via hasVerifiedSecondFactor(), which
// checks whether THIS SESSION's ID token carries the
// `sign_in_second_factor` claim (only set when sign-in itself was
// challenged and resolved via resolver.resolveSignIn()).
//
// Those two signals can disagree — e.g. immediately after
// multiFactor(user).enroll() on an already-open password-only session,
// enrolledFactors may eventually read non-empty, but sign_in_second_factor
// is NEVER set on that session no matter how long you wait or how many
// times you refresh the token. Polling enrolledFactors could therefore
// either (a) time out and wrongly sign a legitimately-enrolled user back
// out, or (b) "pass" while every subsequent admin/manager Firestore read
// still fails permission-denied, since the rules check a claim this check
// never looked at.
//
// The real fix (see SignUp.jsx's completeMfaEnrollment) is to force a
// sign-out + re-login immediately after enrollment, so the resulting
// session is always one that went through resolveSignIn() and therefore
// always carries the claim. Given that, THIS check can — and should —
// look at the exact same claim the Firestore rules use, instead of a
// different, racier signal. That keeps client-side gating and
// server-side enforcement permanently in agreement, and removes the need
// for a multi-second retry loop: the claim is embedded in the ID token
// itself, available the moment sign-in resolves, with no separate
// account-info fetch to wait on.
async function hasVerifiedSecondFactor(firebaseUser, forceRefresh = false) {
  try {
    const tokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
    return !!tokenResult.claims?.firebase?.sign_in_second_factor;
  } catch (err) {
    console.error("Failed to read ID token claims for MFA check:", err);
    return false;
  }
}

const ProtectedRoute = ({ children, allowedRoles }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Auth state changed — drop any previous per-user doc listener
      // before attaching a new one (or none, if signed out).
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (!firebaseUser) {
        localStorage.removeItem("user");
        setUser(null);
        setLoading(false);
        return;
      }

      // Live listener instead of a one-time getDoc: this is what makes
      // deactivation take effect immediately for a user who's already
      // sitting on a page, not just on next login/navigation. Fresh data
      // from Firestore is still the source of truth — localStorage is
      // only ever a cache kept in sync from what this listener receives,
      // never trusted on its own.
      unsubscribeUserDoc = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        async (userSnap) => {
          if (!userSnap.exists()) {
            auth.signOut().catch((err) => console.error(err));
            localStorage.removeItem("user");
            setUser(null);
            setLoading(false);
            return;
          }

          const freshData = userSnap.data();

          if (freshData.deactivated === true) {
            auth.signOut().catch((err) => console.error(err));
            localStorage.removeItem("user");
            setUser(null);
            setLoading(false);
            return;
          }

          // SECURITY GATE: admin/manager accounts must have signed in
          // THIS SESSION with a verified second factor — checked via the
          // same `sign_in_second_factor` ID token claim Firestore's
          // hasVerifiedSecondFactor() rule checks (see the note above the
          // hasVerifiedSecondFactor() helper for why this, and not
          // multiFactor.enrolledFactors, is the correct signal here).
          //
          // A single forced-refresh retry is kept as a safety net for the
          // rare case where the SDK's cached token predates a claim
          // change — but this should not be needed in normal operation,
          // since resolver.resolveSignIn() already mints a token carrying
          // the claim before this component ever observes the user.
          const needsMfa = MFA_REQUIRED_ROLES.includes(freshData.role);
          let verified = needsMfa
            ? await hasVerifiedSecondFactor(firebaseUser)
            : true;

          if (needsMfa && !verified) {
            verified = await hasVerifiedSecondFactor(firebaseUser, true);
          }

          if (needsMfa && !verified) {
            console.warn(
              `[MFA] ${freshData.role} account's current session was not ` +
                `authenticated with a verified second factor — signing out.`,
            );
            auth.signOut().catch((err) => console.error(err));
            localStorage.removeItem("user");
            setUser(null);
            setLoading(false);
            return;
          }

          setUser(freshData);
          // Keep localStorage in sync so other parts of the app that
          // still read it get the fresh data.
          localStorage.setItem(
            "user",
            JSON.stringify({ data: freshData, timestamp: Date.now() }),
          );
          setLoading(false);
        },
        (err) => {
          console.error("Failed to listen to user profile:", err);
          auth.signOut().catch((e) => console.error(e));
          localStorage.removeItem("user");
          setUser(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [navigate, user, loading]);

  function Preloader({ theme }) {
    const {
      spinnerOuter = "border-t-sky-400",
      spinnerInner = "border-t-cyan-500/60",
      dotColor = "bg-sky-400",
      textColor = "text-sky-500/70",
    } = theme;
    return (
      <div className="flex flex-col justify-center items-center w-full min-h-screen gap-5">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div
            className={`absolute inset-0 rounded-full border-2 border-transparent ${spinnerOuter} animate-spin`}
          />
          <div
            className={`absolute inset-2 rounded-full border border-transparent ${spinnerInner} animate-spin [animation-direction:reverse] [animation-duration:0.7s]`}
          />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p
            className={`text-xs font-medium tracking-[0.2em] uppercase ${textColor}`}
          >
            Loading...
          </p>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`w-1 h-1 ${dotColor} rounded-full animate-bounce`}
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <Preloader theme={""} />;
  }

  if (!user) return null;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center">
          <span className="material-symbols-outlined text-6xl text-red-400">
            lock
          </span>
          <h1 className="text-2xl font-bold text-gray-800">Access Denied</h1>
          <p className="text-gray-500 text-sm">
            You don't have permission to view this page.
          </p>
          <button
            onClick={() => window.history.back()}
            className="mt-2 bg-red-400 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-lg transition cursor-pointer"
          >
            Go Back
          </button>
          <button
            className="bg-red-400 px-8 rounded text-white cursor-pointer hover:bg-red-500 transition py-2"
            onClick={() => navigate("/")}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <EnableNotificationsButton />
      {children}
    </>
  );
};

export default ProtectedRoute;
