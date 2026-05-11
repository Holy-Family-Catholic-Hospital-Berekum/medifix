import { useState } from "react";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { db, auth } from "../src/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  deleteUser,
} from "firebase/auth";
import { useNavigate } from "react-router";

export default function SignUp() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState("");
  const [profession, setProfession] = useState("");
  const [id, setId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const steps = [
    {
      title: "Account details",
      fields: [
        {
          id: "name",
          label: "Name",
          type: "text",
          value: name,
          onChange: setName,
        },
        {
          id: "email",
          label: "Email",
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
          label: "Phone Number",
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
      ],
    },
    {
      title: "More details",
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
    }, 300);
  };

  const handleSubmit = async () => {
    if (!canProceed || loading) return;
    setLoading(true);

    let createdUser = null;
    let regDocRef = null;

    try {
      // ✅ Step 1 — validate registration ID
      regDocRef = doc(db, "registrationIDs", id.trim());
      const regSnap = await getDoc(regDocRef);

      if (!regSnap.exists()) {
        alert(
          "Invalid registration ID. Please request one from the Estate Manager.",
        );
        setLoading(false);
        return;
      }

      const regData = regSnap.data();
      const type = regData.type?.toLowerCase();

      if (regData.used === true) {
        alert("This registration ID has already been used.");
        setLoading(false);
        return;
      }

      if (!["staff", "worker"].includes(type)) {
        alert("Invalid registration ID type. Contact the Estate Manager.");
        setLoading(false);
        return;
      }

      // ✅ Step 2 — create Firebase Auth user FIRST
      // only mark ID as used after this succeeds
      // so weak password / email errors don't consume the ID
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      createdUser = userCredential.user;
      const uid = createdUser.uid;

      try {
        // ✅ Step 3 — write Firestore user doc
        await setDoc(doc(db, "users", uid), {
          name: name.trim(),
          email: email.trim(),
          location: location.trim(),
          profession: profession.trim(),
          ID: id.trim(),
          phoneNumber: phoneNumber.trim(),
          role: type,
          createdAt: serverTimestamp(),
        });

        // ✅ Step 4 — only mark ID as used AFTER everything else succeeds
        // auth user is now signed in so the update rule passes
        await updateDoc(regDocRef, { used: true });

        alert("Account created successfully!");
        resetForm();
        switchMode("login");
      } catch (innerError) {
        console.error("Firestore write failed:", innerError);

        // ✅ Clean up auth user since Firestore write failed
        // ID was never marked used so no rollback needed
        if (createdUser) {
          try {
            await deleteUser(createdUser);
          } catch (e) {
            console.error("Auth cleanup failed:", e);
          }
        }

        alert("Unable to create account. Please try again later.");
      }
    } catch (outerError) {
      console.error("Sign up failed:", outerError);

      // ✅ auth errors land here — ID was never touched so no rollback needed
      if (outerError.code === "auth/email-already-in-use") {
        alert("Email already in use. Please use a different email.");
      } else if (outerError.code === "auth/weak-password") {
        alert("Password too weak. Use at least 6 characters.");
      } else {
        alert("Unable to create account. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginId.trim() || !loginPassword.trim()) {
      alert("Please fill in both ID and password.");
      return;
    }
    if (loading) return;
    setLoading(true);

    try {
      // ✅ Sign in anonymously so the users list rule passes
      await signInAnonymously(auth);

      const userQuery = query(
        collection(db, "users"),
        where("ID", "==", loginId.trim()),
        limit(1),
      );
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        await auth.signOut();
        alert("Invalid ID or password. Please try again.");
        return;
      }

      const userData = userSnapshot.docs[0].data();

      // ✅ Sign in with real credentials — replaces the anonymous session
      await signInWithEmailAndPassword(auth, userData.email, loginPassword);

      localStorage.setItem(
        "user",
        JSON.stringify({
          data: userData,
          timestamp: Date.now(),
        }),
      );

      setLoginId("");
      setLoginPassword("");

      const routes = {
        staff: "/Home",
        worker: "/workerHome",
        admin: "/adminHome",
        estate: "/estateHome",
      };

      setTimeout(() => navigate(routes[userData.role] || "/"), 300);
    } catch (error) {
      console.error("Login failed:", error);
      try {
        await auth.signOut();
      } catch (_) {}

      if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found" ||
        error.code === "auth/invalid-credential"
      ) {
        alert("Invalid ID or password. Please try again.");
      } else {
        alert("Unable to log in. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-yellow-400 overflow-y-auto min-h-screen w-full flex justify-center items-center px-4 py-8">
      <div
        className="transition-opacity duration-300 w-full flex justify-center"
        style={{ opacity: closing ? 0 : 1 }}
      >
        {/* SIGNUP FORM */}
        {mode === "signup" && (
          <form className="flex flex-col items-center gap-5 rounded-xl py-10 bg-yellow-500 w-full max-w-96 px-6 md:max-w-[550px] lg:max-w-[680px] shadow-lg">
            <div className="mb-2 text-center">
              <h2 className="text-xl font-semibold text-black">
                {steps[step].title}
              </h2>
              <p className="text-sm text-gray-800">
                Step {step + 1} of {steps.length}
              </p>
            </div>

            <div className="flex gap-2 mb-2">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-10 rounded-full transition-all duration-300 ${
                    i <= step ? "bg-red-700" : "bg-yellow-300"
                  }`}
                />
              ))}
            </div>

            <div className="w-full">
              {steps[step].fields.map((field) => (
                <div
                  key={field.id}
                  className="w-full flex flex-col items-start gap-2 mb-4"
                >
                  <label htmlFor={field.id} className="text-left md:text-lg">
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    type={field.type}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="bg-green-700 text-white md:text-lg w-full border border-yellow-100 rounded p-2"
                  />
                </div>
              ))}
            </div>

            <div className="flex w-full items-center justify-between gap-3">
              <button
                type="button"
                onClick={handlePrev}
                disabled={isFirstStep}
                className={`rounded px-5 py-2 transition ${
                  isFirstStep
                    ? "bg-yellow-300 text-gray-400 cursor-not-allowed"
                    : "bg-yellow-300 text-red-700 cursor-pointer hover:bg-yellow-400"
                }`}
              >
                Previous
              </button>

              {!isLastStep ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceed}
                  className={`rounded px-5 py-2 transition ${
                    canProceed
                      ? "bg-red-700 text-yellow-300 cursor-pointer hover:bg-red-800"
                      : "bg-red-300 text-yellow-200 cursor-not-allowed"
                  }`}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canProceed || loading}
                  className={`rounded px-5 py-2 transition flex-1 ${
                    canProceed && !loading
                      ? "bg-red-700 cursor-pointer text-yellow-300 hover:bg-red-800"
                      : "bg-red-300 text-yellow-200 cursor-not-allowed"
                  }`}
                >
                  {loading ? "Creating account..." : "Submit"}
                </button>
              )}
            </div>

            <div className="mt-2 flex gap-2 items-center justify-center flex-wrap text-sm text-gray-900">
              <p>Already have an account?</p>
              <button
                className="bg-yellow-300 px-4 cursor-pointer hover:bg-yellow-400 transition rounded-full text-red-700"
                type="button"
                onClick={() => switchMode("login")}
              >
                Login
              </button>
            </div>
          </form>
        )}

        {/* LOGIN FORM */}
        {mode === "login" && (
          <form
            className="flex flex-col items-center gap-5 rounded-xl py-10 bg-yellow-500 w-full max-w-96 px-6 md:max-w-[550px] lg:max-w-[680px] shadow-lg"
            onSubmit={handleLogin}
          >
            <div className="mb-6 text-center">
              <h2 className="text-xl font-semibold text-black">Login</h2>
            </div>

            <div className="w-full flex flex-col items-start gap-2 mb-4">
              <label htmlFor="loginId" className="text-left md:text-lg">
                ID
              </label>
              <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="bg-green-700 text-white md:text-lg w-full border border-yellow-100 rounded p-2"
              />
            </div>

            <div className="w-full flex flex-col items-start gap-2 mb-4">
              <label htmlFor="loginPassword" className="text-left md:text-lg">
                Password
              </label>
              <input
                id="loginPassword"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="bg-green-700 text-white md:text-lg w-full border border-yellow-100 rounded p-2"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded py-2 transition text-yellow-300 ${
                loading
                  ? "bg-red-300 cursor-not-allowed"
                  : "bg-red-700 hover:bg-red-800 cursor-pointer"
              }`}
            >
              {loading ? "Logging in..." : "Login"}
            </button>

            <div className="mt-4 flex gap-2 items-center justify-center flex-wrap text-sm text-gray-900">
              <p>Don't have an account?</p>
              <button
                className="bg-yellow-300 px-4 cursor-pointer hover:bg-yellow-400 transition rounded-full text-red-700"
                type="button"
                onClick={() => switchMode("signup")}
              >
                Sign Up
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
