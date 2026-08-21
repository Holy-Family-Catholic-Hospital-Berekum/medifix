import { useState, useEffect } from "react";
import { linkPushUser } from "../src/lib/push";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../src/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { useNavigate } from "react-router";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

  .phix-root {
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    position: relative;
    overflow: hidden;
    background: #FF8825;
  }

  /* animated mesh background */
  .phix-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 60% at 20% 10%,  rgba(255,255,255,.25) 0%, transparent 60%),
      radial-gradient(ellipse 60% 80% at 80% 80%,  rgba(64,73,159,.45)   0%, transparent 60%),
      radial-gradient(ellipse 50% 50% at 50% 50%,  rgba(244,134,49,.6)   0%, transparent 70%),
      #FF8825;
    z-index: 0;
  }

  /* floating blobs */
  .phix-blob {
    position: fixed;
    border-radius: 50%;
    filter: blur(60px);
    opacity: .45;
    z-index: 0;
    animation: blob-drift 12s ease-in-out infinite alternate;
  }
  .phix-blob-1 {
    width: 420px; height: 420px;
    background: #40499F;
    top: -120px; left: -100px;
    animation-duration: 14s;
  }
  .phix-blob-2 {
    width: 320px; height: 320px;
    background: #FF8825;
    bottom: -80px; right: -80px;
    animation-duration: 10s;
    animation-delay: -4s;
  }
  .phix-blob-3 {
    width: 240px; height: 240px;
    background: rgba(255,255,255,.3);
    top: 40%; left: 60%;
    animation-duration: 16s;
    animation-delay: -8s;
  }

  @keyframes blob-drift {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(30px, 20px) scale(1.08); }
  }

  /* watermark — hospital name tiled diagonally across the whole background.
     Rendered once as a repeating SVG pattern (not individual DOM nodes) so
     it stays cheap regardless of viewport size. Sits above the mesh/blobs,
     below the glass card, and drifts very slowly for a subtle "alive" feel. */
  .phix-watermark {
    position: fixed;
    inset: -40px;
    z-index: 0;
    pointer-events: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='620' height='260'><text x='-60' y='90' font-family='DM Sans, sans-serif' font-size='22' font-weight='700' letter-spacing='1' fill='white' fill-opacity='0.10' transform='rotate(-16 310 130)'>Holy Family Catholic Hospital, Berekum</text><text x='260' y='230' font-family='DM Sans, sans-serif' font-size='22' font-weight='700' letter-spacing='1' fill='white' fill-opacity='0.10' transform='rotate(-16 310 130)'>Holy Family Catholic Hospital, Berekum</text></svg>");
    background-repeat: repeat;
    animation: watermark-drift 60s linear infinite;
  }

  @keyframes watermark-drift {
    from { background-position: 0 0; }
    to   { background-position: -620px -260px; }
  }

  /* glass card */
  .phix-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 440px;
    background: rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 24px;
    padding: 40px 32px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, .18),
      inset 0 1px 0 rgba(255,255,255,.35);
  }

  /* inner glass highlight stripe */
  .phix-card::before {
    content: '';
    position: absolute;
    top: 0; left: 16px; right: 16px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent);
    border-radius: 24px 24px 0 0;
  }

  .phix-logo {
    position: relative;
    z-index: 1;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: .1em;
    color: #fff;
    text-shadow: 0 2px 12px rgba(0,0,0,.2);
    margin-bottom: 28px;
    text-align: center;
  }

  .phix-title {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    margin: 0 0 4px;
    text-align: center;
  }

  .phix-subtitle {
    font-size: 13px;
    color: rgba(255,255,255,.65);
    text-align: center;
    margin: 0 0 24px;
  }

  /* step dots */
  .phix-step-dot {
    height: 5px;
    width: 36px;
    border-radius: 99px;
    transition: background .3s;
  }
  .phix-step-dot.active  { background: #fff; }
  .phix-step-dot.inactive { background: rgba(255,255,255,.25); }

  /* label */
  .phix-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: rgba(255,255,255,.75);
    margin-bottom: 6px;
    display: block;
  }

  /* input */
  .phix-input {
    width: 100%;
    padding: 11px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.25);
    background: rgba(255,255,255,.14);
    color: #fff;
    font-size: 15px;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border .2s, background .2s, box-shadow .2s;
    box-sizing: border-box;
  }
  .phix-input::placeholder { color: rgba(255,255,255,.4); }
  .phix-input:focus {
    border-color: rgba(255,255,255,.6);
    background: rgba(255,255,255,.2);
    box-shadow: 0 0 0 3px rgba(255,255,255,.12);
  }

  /* date inputs render their calendar-picker icon in dark grey by default,
     which disappears against this dark glass background — invert it so
     it's visible (light) instead. */
  .phix-input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(1);
    opacity: .8;
    cursor: pointer;
  }

  /* primary button */
  .phix-btn-primary {
    width: 100%;
    padding: 12px;
    border-radius: 12px;
    border: none;
    background: #40499F;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: background .2s, transform .15s, box-shadow .2s;
    box-shadow: 0 4px 16px rgba(64,73,159,.45);
    letter-spacing: .02em;
  }
  .phix-btn-primary:hover:not(:disabled) {
    background: #333c8a;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(64,73,159,.55);
  }
  .phix-btn-primary:disabled {
    opacity: .5;
    cursor: not-allowed;
    transform: none;
  }

  /* ghost button */
  .phix-btn-ghost {
    padding: 10px 20px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.3);
    background: rgba(255,255,255,.1);
    color: rgba(255,255,255,.85);
    font-size: 14px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: background .2s, border .2s;
  }
  .phix-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,.2); border-color: rgba(255,255,255,.5); }
  .phix-btn-ghost:disabled { opacity: .35; cursor: not-allowed; }

  /* pill link button */
  .phix-btn-pill {
    padding: 6px 18px;
    border-radius: 99px;
    border: 1px solid rgba(255,255,255,.35);
    background: rgba(255,255,255,.15);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: background .2s;
  }
  .phix-btn-pill:hover { background: rgba(255,255,255,.25); }

  .phix-divider {
    width: 100%;
    height: 1px;
    background: rgba(255,255,255,.15);
    margin: 8px 0;
  }

  .phix-footer-text {
    font-size: 13px;
    color: rgba(255,255,255,.65);
    text-align: center;
  }

  .phix-eye {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    color: rgba(255,255,255,.55);
    font-size: 20px;
    user-select: none;
    transition: color .15s;
  }
  .phix-eye:hover { color: rgba(255,255,255,.9); }

  .phix-fade-enter { animation: phix-fade .3s ease; }
  @keyframes phix-fade {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000; // 30 seconds
const STORAGE_KEY = "phix_login_attempts";
const VALID_REG_TYPES = [
  "staff",
  "worker",
  "estate",
  "admin",
  "manager",
  "procurement",
];

// A 6-digit PIN only has 1,000,000 possible values — far fewer than the
// old nanoid — so this expiry window (not just uniqueness) is what keeps
// a leaked or guessed PIN from being claimable indefinitely. Must match
// what's advertised to the generating admin/manager in GenIDModal
// (Dashboard.jsx: "Expires in 48 hours if not used to register.").
const REG_ID_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

// Where Firebase sends the user after they click the verification link
// in their email. Falls back to the current origin's login route so this
// keeps working across environments (localhost, staging, prod) without
// hardcoding a domain.
const VERIFICATION_ACTION_SETTINGS = {
  url:
    typeof window !== "undefined"
      ? `${window.location.origin}/`
      : "https://phix.app/",
};

export default function SignUp() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [profession, setProfession] = useState("");
  const [id, setId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetFeedback, setResetFeedback] = useState("");

  // ── email verification state ─────────────────────────────────────────────────
  // Set when a login attempt succeeds against Auth but the account's email
  // isn't verified yet. Drives the "Resend verification email" affordance
  // on the login form. Cleared on successful login, mode switch, or resend.
  const [unverifiedEmail, setUnverifiedEmail] = useState("");

  // ── attempt-limiting state ───────────────────────────────────────────────────
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null); // epoch ms
  const [countdown, setCountdown] = useState(0); // seconds remaining

  // Restore persisted lockout on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;
    if (saved.lockoutUntil && Date.now() < saved.lockoutUntil) {
      setLoginAttempts(saved.attempts);
      setLockoutUntil(saved.lockoutUntil);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Live countdown ticker
  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLoginAttempts(0);
        setCountdown(0);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        setCountdown(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const navigate = useNavigate();

  const steps = [
    {
      title: "Account details",
      fields: [
        {
          id: "name",
          label: "Full name",
          type: "text",
          value: name,
          onChange: setName,
        },
        {
          id: "email",
          label: "Email address",
          type: "email",
          value: email,
          onChange: setEmail,
        },
        {
          id: "password",
          label: "Password",
          type: "password",
          value: password,
          onChange: setPassword,
        },
      ],
    },
    {
      title: "Contact info",
      fields: [
        {
          id: "phoneNumber",
          label: "Phone number",
          type: "tel",
          value: phoneNumber,
          onChange: setPhoneNumber,
        },
        {
          id: "location",
          label: "Location",
          type: "text",
          value: location,
          onChange: setLocation,
        },
        {
          id: "birthdate",
          label: "Date of birth",
          type: "date",
          value: birthdate,
          onChange: setBirthdate,
        },
      ],
    },
    {
      title: "Almost done",
      fields: [
        {
          id: "profession",
          label: "Profession",
          type: "text",
          value: profession,
          onChange: setProfession,
        },
        {
          id: "registrationId",
          label: "Registration ID",
          type: "text",
          value: id,
          onChange: setId,
        },
      ],
    },
  ];

  const canProceed = steps[step].fields.every((f) => f.value.trim() !== "");
  const isLastStep = step === steps.length - 1;
  const isFirstStep = step === 0;

  const handleNext = () => {
    if (!isLastStep && canProceed) setStep((c) => c + 1);
  };
  const handlePrev = () => {
    if (!isFirstStep) setStep((c) => c - 1);
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setPhoneNumber("");
    setLocation("");
    setBirthdate("");
    setProfession("");
    setId("");
    setStep(0);
  };

  const switchMode = (newMode) => {
    setClosing(true);
    setTimeout(() => {
      setMode(newMode);
      setClosing(false);
      setStep(0);
      setUnverifiedEmail("");
      setResetFeedback("");
    }, 280);
  };

  // ── sign up ──────────────────────────────────────────────────────────────────
  //
  // ORDERING IS DELIBERATE AND SECURITY-RELEVANT — read before changing it.
  //
  // Previously the registration ID was claimed (used: false -> true)
  // BEFORE the Firebase Auth account existed, while the client was still
  // fully unauthenticated. If account creation then failed for any reason
  // (most commonly auth/email-already-in-use), the code tried to release
  // the ID back to unused — but Firestore's rules only ever permitted an
  // unauthenticated client to flip used false->true, never true->false
  // (allowing the reverse for anyone unauthenticated would let an
  // attacker un-use ANY registration code and hand it to someone else).
  // That release call silently failed, permanently burning a valid
  // registration ID on every failed signup attempt.
  //
  // The fix: create the Auth account FIRST. If that fails, the
  // registration ID was never touched — nothing to roll back. The ID is
  // only claimed once we have a real (if still unverified) Auth session,
  // tagged with `claimedBy: uid` — see firestore.rules for the
  // corresponding narrowly-scoped self-release rule this now relies on.
  const handleSubmit = async () => {
    if (!canProceed || loading) return;
    setLoading(true);

    const trimmedId = id.trim();
    let createdUser = null;

    try {
      // 1) Create the Auth account first. No registration ID has been
      // touched yet, so a failure here needs no cleanup at all.
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
      } catch (authError) {
        console.error("Account creation failed:", authError);
        if (authError.code === "auth/email-already-in-use") {
          alert("Email already in use. Please use a different email.");
        } else if (authError.code === "auth/weak-password") {
          alert("Password too weak. Use at least 6 characters.");
        } else {
          alert("Unable to create account. Please try again later.");
        }
        return;
      }
      createdUser = userCredential.user;
      const uid = createdUser.uid;

      // 2) Now that there's a real (unverified) session, atomically
      // check-and-claim the registration ID, tagged to this uid.
      const regDocRef = doc(db, "registrationIDs", trimmedId);
      let regType;
      try {
        await runTransaction(db, async (tx) => {
          const regSnap = await tx.get(regDocRef);
          if (!regSnap.exists()) {
            throw new Error("REG_NOT_FOUND");
          }
          const regData = regSnap.data();
          if (regData.used === true) {
            throw new Error("REG_ALREADY_USED");
          }
          const createdAtMs = regData.createdAt?.toMillis
            ? regData.createdAt.toMillis()
            : null;
          if (
            createdAtMs == null ||
            Date.now() - createdAtMs > REG_ID_EXPIRY_MS
          ) {
            throw new Error("REG_EXPIRED");
          }
          const type = regData.type?.toLowerCase();
          if (!VALID_REG_TYPES.includes(type)) {
            throw new Error("REG_INVALID_TYPE");
          }
          regType = type;
          tx.update(regDocRef, { used: true, claimedBy: uid });
        });
      } catch (txError) {
        if (txError.message === "REG_NOT_FOUND") {
          alert(
            "Invalid registration ID. Please request one from the Admin or IT Manager.",
          );
        } else if (txError.message === "REG_ALREADY_USED") {
          alert("This registration ID has already been used.");
        } else if (txError.message === "REG_EXPIRED") {
          alert(
            "This registration ID has expired. Please request a new one from the Admin or IT Manager.",
          );
        } else if (txError.message === "REG_INVALID_TYPE") {
          alert("Invalid registration ID type. Contact the IT Manager.");
        } else {
          console.error("Registration ID claim failed:", txError);
          alert("Unable to verify registration ID. Please try again later.");
        }
        // The ID was never successfully claimed, so there's nothing to
        // release — just clean up the orphaned Auth account.
        try {
          await deleteUser(createdUser);
        } catch (e) {
          console.error(
            "Failed to clean up account after invalid registration ID:",
            e,
          );
        }
        return;
      }

      // 3) Write the profile doc.
      try {
        await setDoc(doc(db, "users", uid), {
          name: name.trim(),
          email: email.trim(),
          location: location.trim(),
          profession: profession.trim(),
          ID: trimmedId,
          phoneNumber: phoneNumber.trim(),
          // Stored as "YYYY-MM-DD" (native <input type="date"> format) so
          // it sorts/compares easily. Used later to detect and celebrate
          // birthdays in-app.
          birthdate: birthdate.trim(),
          role: regType,
          deactivated: false,
          createdAt: serverTimestamp(),
        });
      } catch (profileError) {
        console.error("Firestore profile write failed:", profileError);
        // Release the registration-ID claim WHILE we still hold the
        // authenticated session that claimed it — the release rule
        // requires that exact uid, and requires users/{uid} to still not
        // exist. Both are only true right now, before deleteUser signs
        // this session out below.
        try {
          await updateDoc(regDocRef, { used: false });
        } catch (releaseError) {
          console.error(
            "Failed to release registration ID after rollback:",
            releaseError,
          );
        }
        try {
          await deleteUser(createdUser);
        } catch (e) {
          console.error(e);
        }
        alert("Unable to create account. Please try again later.");
        return;
      }

      // 4) Everything succeeded — send the verification email now, not
      // earlier, so a rolled-back attempt (steps 2 or 3 failing) never
      // sends a verification link for an account that's about to be
      // deleted.
      try {
        await sendEmailVerification(createdUser, VERIFICATION_ACTION_SETTINGS);
      } catch (verifyError) {
        console.error("Failed to send verification email:", verifyError);
      }

      // Sign the newly-created (but unverified) user back out immediately.
      // createUserWithEmailAndPassword leaves them signed in by default,
      // but they shouldn't have an authenticated session until they've
      // clicked the link in their inbox — handleLogin enforces the same
      // gate, this just avoids a dangling unverified session in between.
      await signOut(auth);
      alert(
        "Account created! We've sent a verification link to your email — please verify it before logging in.",
      );
      resetForm();
      switchMode("login");
    } finally {
      setLoading(false);
    }
  };

  // ── login ────────────────────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    const emailToReset = loginId.trim();
    if (!emailToReset) {
      alert("Enter your email address first, then click Forgot Password.");
      return;
    }
    if (loading) return;

    setLoading(true);
    setResetFeedback("");

    try {
      await sendPasswordResetEmail(auth, emailToReset);
      setResetFeedback(
        "If that account exists, a secure password reset link has been sent to your email.",
      );
      setLoginPassword("");
    } catch (error) {
      console.error("Password reset email failed:", error);
      if (error.code === "auth/invalid-email") {
        alert("Please enter a valid email address.");
      } else {
        alert(
          "Unable to send reset instructions right now. Please try again later.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Resends the verification email for an account that failed the
  // emailVerified gate in handleLogin. sendEmailVerification requires an
  // authenticated user, so this briefly signs back in with the password
  // already entered, sends the email, then signs back out — mirroring the
  // sign-out-until-verified invariant enforced everywhere else.
  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    if (!loginPassword.trim()) {
      alert("Re-enter your password above, then click resend.");
      return;
    }
    if (loading) return;

    setLoading(true);
    setResetFeedback("");
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        unverifiedEmail,
        loginPassword,
      );
      if (cred.user.emailVerified) {
        // Verified since the last attempt (e.g. they clicked the link
        // just now) — no need to resend, let them know they can log in.
        await signOut(auth);
        setUnverifiedEmail("");
        setResetFeedback(
          "Your email is already verified — you can log in now.",
        );
        return;
      }
      await sendEmailVerification(cred.user, VERIFICATION_ACTION_SETTINGS);
      await signOut(auth);
      setResetFeedback("Verification email resent. Please check your inbox.");
    } catch (error) {
      console.error("Resend verification failed:", error);
      if (
        ["auth/wrong-password", "auth/invalid-credential"].includes(error.code)
      ) {
        alert("Incorrect password. Re-enter it above, then click resend.");
      } else {
        alert("Unable to resend right now. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginId.trim() || !loginPassword.trim()) {
      alert("Please fill in both email and password.");
      return;
    }
    // Block if locked out
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    if (loading) return;
    setLoading(true);
    setUnverifiedEmail("");
    setResetFeedback("");
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        loginId.trim(),
        loginPassword,
      );

      // ── email verification gate ──
      // Checked before the Firestore lookup so an unverified account never
      // reaches the deactivated check or the role-based redirect below.
      if (!userCredential.user.emailVerified) {
        await auth.signOut();
        setUnverifiedEmail(loginId.trim());
        alert(
          "Please verify your email before logging in. Check your inbox, or use the resend option below.",
        );
        return;
      }

      const uid = userCredential.user.uid;
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) {
        await auth.signOut();
        alert("Account not found. Please contact your IT Manager.");
        return;
      }
      const userData = userSnap.data();
      if (userData.deactivated === true) {
        await auth.signOut();
        alert(
          "Your account has been deactivated. Please contact your administrator.",
        );
        return;
      }
      // ✅ Success — clear attempt counter
      setLoginAttempts(0);
      setLockoutUntil(null);
      localStorage.removeItem(STORAGE_KEY);

      localStorage.setItem(
        "user",
        JSON.stringify({ data: userData, timestamp: Date.now() }),
      );
      linkPushUser(uid);
      setLoginId("");
      setLoginPassword("");
      const routes = {
        staff: "/Home",
        worker: "/wh",
        admin: "/ah",
        estate: "/eh",
        manager: "/manager",
        procurement: "/ph",
      };
      setTimeout(() => navigate(routes[userData.role] || "/"), 300);
    } catch (error) {
      console.error("Login failed:", error);
      const next = loginAttempts + 1;
      setLoginAttempts(next);

      if (next >= MAX_ATTEMPTS) {
        // Trigger lockout
        const until = Date.now() + LOCKOUT_MS;
        setLockoutUntil(until);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ attempts: next, lockoutUntil: until }),
        );
        alert(
          "Too many failed attempts. Please wait 30 seconds before trying again.",
        );
      } else {
        const left = MAX_ATTEMPTS - next;
        const attemptsMsg = `${left} attempt${left !== 1 ? "s" : ""} remaining.`;
        if (
          [
            "auth/wrong-password",
            "auth/user-not-found",
            "auth/invalid-credential",
          ].includes(error.code)
        )
          alert(`Invalid email or password. ${attemptsMsg}`);
        else alert("Unable to log in. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isLockedOut = !!lockoutUntil && Date.now() < lockoutUntil;

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="phix-root">
        {/* blobs */}
        <div className="phix-blob phix-blob-1" />
        <div className="phix-blob phix-blob-2" />
        <div className="phix-blob phix-blob-3" />

        {/* watermark — repeated hospital name */}
        <div className="phix-watermark" aria-hidden="true" />

        {/* card */}
        <div
          className="phix-card phix-fade-enter"
          key={mode}
          style={{ opacity: closing ? 0 : 1, transition: "opacity .28s ease" }}
        >
          {/* ── SIGNUP ── */}
          {mode === "signup" && (
            <>
              <p className="phix-title">{steps[step].title}</p>
              <p className="phix-subtitle">
                Step {step + 1} of {steps.length}
              </p>

              {/* step dots */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 28,
                  justifyContent: "center",
                }}
              >
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={`phix-step-dot ${i <= step ? "active" : "inactive"}`}
                  />
                ))}
              </div>

              {/* fields */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                {steps[step].fields.map((field) => (
                  <div
                    key={field.id}
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <label className="phix-label" htmlFor={field.id}>
                      {field.label}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id={field.id}
                        className="phix-input"
                        type={
                          field.type === "password" && showPassword
                            ? "text"
                            : field.type
                        }
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        max={
                          field.id === "birthdate"
                            ? new Date().toISOString().split("T")[0]
                            : undefined
                        }
                        placeholder={
                          field.id === "name"
                            ? "e.g. Kwame Mensah"
                            : field.id === "email"
                              ? "you@example.com"
                              : field.id === "password"
                                ? "Min. 6 characters"
                                : field.id === "phoneNumber"
                                  ? "+233 XX XXX XXXX"
                                  : field.id === "registrationId"
                                    ? "Paste your ID here"
                                    : ""
                        }
                      />
                      {field.type === "password" && (
                        <button
                          type="button"
                          className="material-symbols-outlined phix-eye"
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                          }}
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? "visibility_off" : "visibility"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* nav buttons */}
              <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={isFirstStep}
                  className="phix-btn-ghost"
                  style={{ flex: isLastStep ? "0 0 auto" : 1 }}
                >
                  ← Back
                </button>
                {!isLastStep ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canProceed}
                    className="phix-btn-primary"
                    style={{ flex: 1 }}
                  >
                    Continue →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canProceed || loading}
                    className="phix-btn-primary"
                    style={{ flex: 1 }}
                  >
                    {loading ? "Creating account…" : "Create Account"}
                  </button>
                )}
              </div>

              <div className="phix-divider" />
              <p className="phix-footer-text" style={{ marginTop: 16 }}>
                Already have an account?{" "}
                <button
                  className="phix-btn-pill"
                  style={{ marginLeft: 8 }}
                  type="button"
                  onClick={() => switchMode("login")}
                >
                  Log in
                </button>
              </p>
            </>
          )}

          {/* ── LOGIN ── */}
          {mode === "login" && (
            <form onSubmit={handleLogin}>
              <p className="phix-title">Welcome back</p>
              <p className="phix-subtitle">Sign in to your PHIX account</p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  margin: "28px 0 24px",
                }}
              >
                {/* email */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label className="phix-label" htmlFor="loginId">
                    Email address
                  </label>
                  <input
                    id="loginId"
                    className="phix-input"
                    type="email"
                    value={loginId}
                    onChange={(e) => {
                      setLoginId(e.target.value);
                      // A different email invalidates any pending resend state.
                      if (unverifiedEmail) setUnverifiedEmail("");
                    }}
                    placeholder="you@example.com"
                    disabled={isLockedOut}
                  />
                </div>

                {/* password */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label className="phix-label" htmlFor="loginPassword">
                    Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="loginPassword"
                      className="phix-input"
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Your password"
                      disabled={isLockedOut}
                    />
                    <button
                      type="button"
                      className="material-symbols-outlined phix-eye"
                      style={{ background: "none", border: "none", padding: 0 }}
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? "visibility_off" : "visibility"}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || isLockedOut}
                className="phix-btn-primary"
                style={{ marginBottom: 12 }}
              >
                {isLockedOut
                  ? `Try again in ${countdown}s`
                  : loading
                    ? "Signing in…"
                    : "Sign In"}
              </button>

              <button
                type="button"
                disabled={loading || isLockedOut}
                className="phix-btn-ghost"
                style={{ width: "100%", marginBottom: 12 }}
                onClick={handleForgotPassword}
              >
                Forgot Password?
              </button>

              {/* Resend verification email — only shown once a login attempt
                  has hit the emailVerified gate for the currently-entered
                  address. */}
              {unverifiedEmail && !isLockedOut && (
                <button
                  type="button"
                  disabled={loading}
                  className="phix-btn-ghost"
                  style={{ width: "100%", marginBottom: 12 }}
                  onClick={handleResendVerification}
                >
                  Resend verification email
                </button>
              )}

              {resetFeedback && (
                <p
                  style={{
                    color: "rgba(255,255,255,.9)",
                    fontSize: 12,
                    textAlign: "center",
                    margin: "0 0 12px",
                    lineHeight: 1.5,
                  }}
                >
                  {resetFeedback}
                </p>
              )}

              {/* Attempts remaining hint */}
              {loginAttempts > 0 && !isLockedOut && (
                <p
                  style={{
                    color: "rgba(255,255,255,.65)",
                    fontSize: 12,
                    textAlign: "center",
                    margin: "0 0 12px",
                  }}
                >
                  {MAX_ATTEMPTS - loginAttempts} attempt
                  {MAX_ATTEMPTS - loginAttempts !== 1 ? "s" : ""} remaining
                  before lockout
                </p>
              )}

              <div className="phix-divider" />
              <p className="phix-footer-text" style={{ marginTop: 16 }}>
                Don't have an account?{" "}
                <button
                  className="phix-btn-pill"
                  style={{ marginLeft: 8 }}
                  type="button"
                  onClick={() => switchMode("signup")}
                >
                  Sign up
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
