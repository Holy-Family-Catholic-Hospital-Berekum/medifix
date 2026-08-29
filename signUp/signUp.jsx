import { useState, useEffect } from "react";
import { linkPushUser } from "../src/lib/push";
import { MFA_REQUIRED_ROLES } from "../src/lib/mfaConfig";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth, appCheck } from "../src/firebase";
import { getToken as getAppCheckToken } from "firebase/app-check";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  multiFactor,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
} from "firebase/auth";
// Generates the enrollment QR code entirely client-side, from the
// otpauth:// URI Firebase gives us — the TOTP secret never leaves the app
// to hit a third-party QR-image service. Run `npm install qrcode`.
import QRCode from "qrcode";
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

  /* MFA code input — wider letter spacing so a 6-digit code reads clearly */
  .phix-input.phix-input-otp {
    letter-spacing: .5em;
    text-align: center;
    font-size: 20px;
    font-weight: 700;
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

  /* MFA enrollment QR wrapper — white background so the QR is scannable
     against the glass card's translucent, colored backdrop */
  .phix-qr-wrap {
    display: flex;
    justify-content: center;
    margin: 20px 0;
  }
  .phix-qr-wrap img {
    border-radius: 12px;
    background: #fff;
    padding: 10px;
    width: 180px;
    height: 180px;
  }

  .phix-mfa-error {
    color: #ffd7d7;
    font-size: 12px;
    text-align: center;
    margin: 10px 0 0;
  }
`;

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const STORAGE_KEY = "phix_login_attempts";

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
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [countdown, setCountdown] = useState(0);

  // ── Two-factor auth (TOTP) state ──────────────────────────────────────
  // mfaStage: null (normal login) | "enroll" (first-time setup for a
  // required role) | "verify" (already-enrolled account signing in).
  const [mfaStage, setMfaStage] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [totpSecret, setTotpSecret] = useState(null); // enrollment only
  const [qrDataUrl, setQrDataUrl] = useState(""); // enrollment only
  const [mfaResolver, setMfaResolver] = useState(null); // verify-on-signin only

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

  const resetMfaState = () => {
    setMfaStage(null);
    setMfaCode("");
    setMfaError("");
    setTotpSecret(null);
    setQrDataUrl("");
    setMfaResolver(null);
  };

  const switchMode = (newMode) => {
    setClosing(true);
    setTimeout(() => {
      setMode(newMode);
      setClosing(false);
      setStep(0);
      setUnverifiedEmail("");
      setResetFeedback("");
      resetMfaState();
    }, 280);
  };

  // ── sign up ──────────────────────────────────────────────────────────────
  //
  // ORDERING IS STILL DELIBERATE — read before changing it.
  //
  // 1) Create the Auth account first. Nothing has touched the
  //    registration ID yet, so a failure here needs no cleanup.
  // 2) Claim the PIN via the server-side /api/claim-registration-id route
  //    (Admin SDK + App Check + auth + IP/uid rate limiting). The client
  //    SDK can no longer write `used` directly at all — see
  //    firestore.rules, the client-facing claim branch is gone.
  // 3) Write the profile doc. If this fails, release the claim (the
  //    narrowly-scoped self-release rule still allows this, since it's
  //    the exact uid that claimed it and users/{uid} doesn't exist yet).
  //
  // NOTE: two-factor enrollment is NOT part of sign-up. A brand-new
  // account can only register with the 'staff' / 'worker' / 'estate' /
  // 'procurement' PIN types anyway — admin/manager accounts are created
  // by an existing admin/manager (see registrationIDs rules), and MFA
  // enrollment for them happens on their first login instead (see
  // finishLogin below), since that's the earliest point an Auth session
  // exists to enroll a factor on.
  const handleSubmit = async () => {
    if (!canProceed || loading) return;
    setLoading(true);

    const trimmedId = id.trim();
    let createdUser = null;

    try {
      // 1) Create the Auth account.
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

      // 2) Claim the registration ID server-side.
      const regDocRef = doc(db, "registrationIDs", trimmedId);
      let regType;
      try {
        const idToken = await createdUser.getIdToken();
        const { token: appCheckToken } = await getAppCheckToken(
          appCheck,
          false,
        );

        const res = await fetch("/api/claim-registration-id", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
            "X-Firebase-AppCheck": appCheckToken,
          },
          body: JSON.stringify({ pin: trimmedId }),
        });

        // Guard against non-JSON responses (e.g. the API route being
        // misconfigured and the request falling through to the SPA's
        // index.html / a host 404 page instead of hitting the function).
        const contentType = res.headers.get("content-type") || "";
        let json;
        if (contentType.includes("application/json")) {
          try {
            json = await res.json();
          } catch (parseErr) {
            console.error("Failed to parse claim response as JSON:", parseErr);
            throw new Error("BAD_RESPONSE");
          }
        } else {
          const text = await res.text();
          console.error(
            `Unexpected non-JSON response (status ${res.status}):`,
            text.slice(0, 200),
          );
          throw new Error("BAD_RESPONSE");
        }

        if (!res.ok) {
          if (res.status === 429) {
            alert(
              json.error ||
                "Too many attempts. Please wait a few minutes and try again.",
            );
          } else {
            alert(
              json.error ||
                "Unable to verify registration ID. Please try again later.",
            );
          }
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

        regType = json.role;
      } catch (txError) {
        console.error("Registration ID claim failed:", txError);
        if (txError.message === "BAD_RESPONSE") {
          alert(
            "Unable to reach the registration service (unexpected server response). Please try again shortly or contact support.",
          );
        } else {
          alert("Unable to verify registration ID. Please try again later.");
        }
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
        await setDoc(doc(db, "users", createdUser.uid), {
          name: name.trim(),
          email: email.trim(),
          location: location.trim(),
          profession: profession.trim(),
          ID: trimmedId,
          phoneNumber: phoneNumber.trim(),
          birthdate: birthdate.trim(),
          role: regType,
          deactivated: false,
          mfaEnrolled: false,
          createdAt: serverTimestamp(),
        });
      } catch (profileError) {
        console.error("Firestore profile write failed:", profileError);
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

      // 4) Success — verification email, then sign out until verified.
      try {
        await sendEmailVerification(createdUser, VERIFICATION_ACTION_SETTINGS);
      } catch (verifyError) {
        console.error("Failed to send verification email:", verifyError);
      }

      await signOut(auth);
      alert(
        "Account created! We've sent a verification link to your email, please verify it before logging in.",
      );
      resetForm();
      switchMode("login");
    } finally {
      setLoading(false);
    }
  };

  // ── login ────────────────────────────────────────────────────────────────
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
        await signOut(auth);
        setUnverifiedEmail("");
        setResetFeedback("Your email is already verified, you can log in now.");
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

  // Shared tail of the login flow — reached either directly from a normal
  // password sign-in (no MFA enrolled) or after a 2FA challenge (enrollment
  // or verification) succeeds. Centralizing this means the emailVerified /
  // account-exists / deactivated checks and the final navigation only exist
  // once, instead of being duplicated across every entry point.
  //
  // `factorAlreadyKnownEnrolled` is set to true only by completeMfaSignIn.
  // Reaching that call site already PROVES the account has an enrolled
  // factor server-side (Firebase only throws auth/multi-factor-auth-required
  // — which is what routes login into the "verify" stage in the first
  // place — when a factor already exists, and the code the user typed was
  // just accepted). We trust that proof directly instead of re-deriving it
  // from freshUser.multiFactor.enrolledFactors after a reload(), because
  // that client-side reload has a known timing gap right after
  // resolveSignIn(): it can still read back an empty enrolledFactors array
  // for a brief window even though the account legitimately already has a
  // factor. Without this flag, that false "0 factors" reading was tricking
  // this function into starting a brand-new enrollment on an
  // already-enrolled account, which Firebase then rejected with
  // auth/maximum-second-factor-count-exceeded — the exact lockout this
  // comment is here to prevent.
  const finishLogin = async (user, factorAlreadyKnownEnrolled = false) => {
    if (!user.emailVerified) {
      await auth.signOut();
      setUnverifiedEmail(user.email);
      resetMfaState();
      alert(
        "Please verify your email before logging in. Check your inbox, or use the resend option below.",
      );
      return;
    }

    const uid = user.uid;
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) {
      await auth.signOut();
      resetMfaState();
      alert("Account not found. Please contact your IT Manager.");
      return;
    }
    const userData = userSnap.data();
    if (userData.deactivated === true) {
      await auth.signOut();
      resetMfaState();
      alert(
        "Your account has been deactivated. Please contact your administrator.",
      );
      return;
    }

    // Force a fresh reload before trusting multiFactor.enrolledFactors.
    // The `user` object handed to finishLogin — whether from a plain
    // signInWithEmailAndPassword or from mfaResolver.resolveSignIn() —
    // can carry a stale snapshot where enrolledFactors reads empty even
    // though the account genuinely already has a factor enrolled.
    // Without this, finishLogin can wrongly conclude "no factor yet" on
    // an ALREADY-enrolled account and walk it through enrolling a brand
    // new TOTP factor — and since completeMfaEnrollment's
    // multiFactor(...).enroll(...) ADDS a factor rather than replacing
    // one, this silently piles up factors on every affected login until
    // Firebase's per-account cap is hit
    // (auth/maximum-second-factor-count-exceeded), locking the account
    // out of login entirely until an admin clears its factors via the
    // Admin SDK.
    //
    // reload() closes most of that gap, but not all of it — see the
    // factorAlreadyKnownEnrolled note on the function signature above for
    // the remaining case it doesn't cover.
    try {
      await user.reload();
    } catch (reloadError) {
      console.error("Failed to refresh user before MFA check:", reloadError);
    }
    const freshUser = auth.currentUser ?? user;

    // Admin/Manager accounts must have a TOTP factor enrolled. If this one
    // doesn't yet (first login since the role was granted, or MFA was just
    // rolled out), force enrollment now — this re-triggers on every login
    // attempt until it succeeds, so it can't be bypassed by closing the tab.
    // Checking mfaStage guards against re-entering enrollment on the second
    // call to finishLogin (the one that runs right after enrollment itself
    // completes, further down).
    const needsMfa = MFA_REQUIRED_ROLES.includes(userData.role);
    const hasEnrolledFactor =
      factorAlreadyKnownEnrolled ||
      (freshUser.multiFactor?.enrolledFactors?.length ?? 0) > 0;

    if (needsMfa && !hasEnrolledFactor && mfaStage !== "enroll") {
      try {
        const session = await multiFactor(freshUser).getSession();
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        const otpauthUrl = secret.generateQrCodeUrl(
          freshUser.email,
          "PHIX (Holy Family Hospital)",
        );
        const qrUrl = await QRCode.toDataURL(otpauthUrl);
        setTotpSecret(secret);
        setQrDataUrl(qrUrl);
        setMfaStage("enroll");
      } catch (mfaSetupError) {
        console.error("Failed to start MFA enrollment:", mfaSetupError);
        await auth.signOut();
        resetMfaState();
        if (mfaSetupError.code === "auth/requires-recent-login") {
          alert(
            "For security, please log in again to set up two-factor authentication.",
          );
        } else if (
          mfaSetupError.code === "auth/maximum-second-factor-count-exceeded"
        ) {
          alert(
            "This account has too many two-factor methods enrolled. Please contact your administrator to reset two-factor authentication on this account.",
          );
        } else {
          alert(
            "Unable to start two-factor setup right now. Please try logging in again.",
          );
        }
      }
      return;
    }

    setLoginAttempts(0);
    setLockoutUntil(null);
    localStorage.removeItem(STORAGE_KEY);
    resetMfaState();

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
  };

  // Confirms the 6-digit code from the user's authenticator app against the
  // secret generated in finishLogin, then actually enrolls the factor on
  // the account. Only reached mid-enrollment (mfaStage === "enroll").
  //
  // *** THE FIX ***
  // This used to call finishLogin(auth.currentUser) directly after
  // enroll() succeeded. That is WRONG and is what caused the
  // "QR works, code accepted, then bounced back to login" bug:
  //
  // Enrolling a factor on an already-signed-in (password-only) session
  // does NOT retroactively mark that session as having been verified with
  // a second factor. Firebase Auth only sets the `sign_in_second_factor`
  // claim on an ID token when the sign-in itself was challenged and
  // resolved via resolver.resolveSignIn(assertion) — never as a side
  // effect of multiFactor(user).enroll(). Both this app's Firestore rules
  // (hasVerifiedSecondFactor()) and ProtectedRoute.jsx require that claim
  // for admin/manager access. A session that only just enrolled — but
  // never went through the challenge — would fail every admin/manager
  // Firestore read even though enrollment technically succeeded, and its
  // multiFactor.enrolledFactors also reads inconsistently for a period
  // afterward. Retrying/polling around that inconsistency was treating
  // the symptom, not the cause.
  //
  // The fix: force a full sign-out immediately after enrollment succeeds,
  // and require the user to log back in with their password + the code
  // from their authenticator app. That second login goes through
  // signInWithEmailAndPassword -> auth/multi-factor-auth-required ->
  // completeMfaSignIn -> resolver.resolveSignIn(), which is the ONLY path
  // that mints a token carrying sign_in_second_factor. This is Firebase's
  // intended enrollment pattern (the same one GitHub/Google use), not a
  // workaround — expect a "please log in again" step exactly once, the
  // first time a given admin/manager account sets up 2FA.
  const completeMfaEnrollment = async () => {
    if (!totpSecret || mfaCode.trim().length !== 6 || loading) return;
    setLoading(true);
    setMfaError("");
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        mfaCode.trim(),
      );
      await multiFactor(auth.currentUser).enroll(
        assertion,
        "Authenticator app",
      );
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        mfaEnrolled: true,
      });

      const enrolledEmail = auth.currentUser.email;
      await auth.signOut();
      resetMfaState();
      setLoginId(enrolledEmail || "");
      setLoginPassword("");
      alert(
        "Two-factor authentication is now enabled on your account. Please sign in again using your password and the 6-digit code from your authenticator app.",
      );
    } catch (err) {
      console.error("MFA enrollment failed:", err);
      if (err.code === "auth/invalid-verification-code") {
        setMfaError(
          "Incorrect code. Check your authenticator app and try again.",
        );
      } else if (err.code === "auth/requires-recent-login") {
        await auth.signOut();
        resetMfaState();
        alert(
          "For security, please log in again to finish setting up two-factor authentication.",
        );
      } else {
        setMfaError("Unable to complete setup. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Verifies the 6-digit code against an already-enrolled factor, as part
  // of a normal sign-in. Only reached when signInWithEmailAndPassword threw
  // auth/multi-factor-auth-required (see handleLogin's catch block).
  //
  // Passes factorAlreadyKnownEnrolled = true to finishLogin: getting here
  // at all means Firebase already confirmed this account has an enrolled
  // factor (that's what the multi-factor-auth-required challenge means),
  // and resolveSignIn() just succeeded with the right code. finishLogin
  // doesn't need to re-derive that from a possibly-stale client read.
  const completeMfaSignIn = async () => {
    if (!mfaResolver || mfaCode.trim().length !== 6 || loading) return;
    setLoading(true);
    setMfaError("");
    try {
      const hint = mfaResolver.hints[0];
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        hint.uid,
        mfaCode.trim(),
      );
      const userCredential = await mfaResolver.resolveSignIn(assertion);
      await finishLogin(userCredential.user, true);
    } catch (err) {
      console.error("MFA sign-in verification failed:", err);
      if (err.code === "auth/invalid-verification-code") {
        setMfaError("Incorrect code. Please try again.");
      } else {
        setMfaError("Unable to verify code. Please try again.");
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
      await finishLogin(userCredential.user);
    } catch (error) {
      // A pending 2FA challenge on an already-enrolled account isn't a
      // failed credential — the password was correct, Firebase is just
      // asking for the second factor next. Route straight into the verify
      // screen instead of falling through to the attempt-counting /
      // wrong-password handling below.
      if (error.code === "auth/multi-factor-auth-required") {
        const resolver = getMultiFactorResolver(auth, error);
        setMfaResolver(resolver);
        setMfaStage("verify");
        return;
      }

      console.error("Login failed:", error);
      const next = loginAttempts + 1;
      setLoginAttempts(next);

      if (next >= MAX_ATTEMPTS) {
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

          {/* ── LOGIN — normal email/password form ── */}
          {mode === "login" && !mfaStage && (
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

          {/* ── LOGIN — forced 2FA enrollment (first login for admin/manager) ── */}
          {mode === "login" && mfaStage === "enroll" && (
            <div>
              <p className="phix-title">Set up two-factor authentication</p>
              <p className="phix-subtitle">
                Required for Admin and Manager accounts. Scan this code with
                Google Authenticator, Authy, or a similar app.
              </p>

              {qrDataUrl && (
                <div className="phix-qr-wrap">
                  <img src={qrDataUrl} alt="Scan with your authenticator app" />
                </div>
              )}

              {totpSecret?.secretKey && (
                <p
                  className="phix-footer-text"
                  style={{ marginBottom: 20, wordBreak: "break-all" }}
                >
                  Can't scan? Enter this key manually:{" "}
                  <strong>{totpSecret.secretKey}</strong>
                </p>
              )}

              <label className="phix-label" htmlFor="mfaEnrollCode">
                6-digit code
              </label>
              <input
                id="mfaEnrollCode"
                className="phix-input phix-input-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
              />

              {mfaError && <p className="phix-mfa-error">{mfaError}</p>}

              <button
                type="button"
                className="phix-btn-primary"
                style={{ marginTop: 16 }}
                disabled={loading || mfaCode.length !== 6}
                onClick={completeMfaEnrollment}
              >
                {loading ? "Verifying…" : "Confirm & Enable"}
              </button>

              <p
                className="phix-footer-text"
                style={{ marginTop: 14, lineHeight: 1.5 }}
              >
                After this, you'll be asked to sign in one more time using your
                password and a fresh code from your app — that's expected, and
                only happens this once.
              </p>
            </div>
          )}

          {/* ── LOGIN — 2FA verification (already-enrolled account) ── */}
          {mode === "login" && mfaStage === "verify" && (
            <div>
              <p className="phix-title">Two-factor verification</p>
              <p className="phix-subtitle">
                Enter the 6-digit code from your authenticator app.
              </p>

              <label className="phix-label" htmlFor="mfaVerifyCode">
                Authentication code
              </label>
              <input
                id="mfaVerifyCode"
                className="phix-input phix-input-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                autoFocus
              />

              {mfaError && <p className="phix-mfa-error">{mfaError}</p>}

              <button
                type="button"
                className="phix-btn-primary"
                style={{ marginTop: 16 }}
                disabled={loading || mfaCode.length !== 6}
                onClick={completeMfaSignIn}
              >
                {loading ? "Verifying…" : "Verify"}
              </button>

              <button
                type="button"
                className="phix-btn-ghost"
                style={{ width: "100%", marginTop: 10 }}
                disabled={loading}
                onClick={() => {
                  auth.signOut().catch(() => {});
                  resetMfaState();
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
