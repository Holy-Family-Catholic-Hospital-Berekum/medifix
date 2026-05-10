import { useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
} from "firebase/firestore";
import { db, auth } from "../src/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useNavigate } from "react-router";

export default function SignUp() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState(""); // ✅ fixed typo
  const [profession, setProfession] = useState("");
  const [id, setId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [closing, setClosing] = useState(false); // ✅ for smooth mode transition

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
        }, // ✅ fixed typo
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

  const canProceed = steps[step].fields.every(
    (field) => field.value.trim() !== "",
  );
  const isLastStep = step === steps.length - 1;
  const isFirstStep = step === 0;

  const handleNext = () => {
    if (!isLastStep && canProceed) setStep((c) => c + 1);
  };

  const handlePrev = () => {
    if (!isFirstStep) setStep((c) => c - 1);
  };

  // ✅ handleSubmit was missing — now defined
  const handleSubmit = async () => {
    if (!canProceed) return;

    try {
      const registrationQuery = query(
        collection(db, "registrationIDs"),
        where("ID", "==", id),
      );
      const registrationSnapshot = await getDocs(registrationQuery);

      if (registrationSnapshot.empty) {
        alert(
          "Invalid registration ID. Please request a valid ID from the Estate Manager.",
        );
        return;
      }

      const registrationData = registrationSnapshot.docs[0].data();
      const type = registrationData.type?.toLowerCase();

      if (type !== "staff" && type !== "worker") {
        alert(
          "Registration ID type is invalid. Please contact the Estate Manager.",
        );
        return;
      }

      const existingUserQuery = query(
        collection(db, "users"),
        where("ID", "==", id),
      );
      const existingUserSnapshot = await getDocs(existingUserQuery);

      if (!existingUserSnapshot.empty) {
        alert(
          "This registration ID has already been used to create an account.",
        );
        return;
      }

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const uid = userCredential.user.uid;

      // Create user document in Firestore with uid as document ID
      await setDoc(doc(db, "users", uid), {
        name,
        location,
        profession,
        ID: id,
        phoneNumber,
        email,
        role: type,
        createdAt: serverTimestamp(),
      });

      alert("Account created successfully!");
      setName("");
      setEmail("");
      setPassword("");
      setPhoneNumber("");
      setLocation("");
      setProfession("");
      setId("");
      setStep(0);
      setTimeout(() => setMode("login"), 200);
    } catch (error) {
      console.error("Sign up failed:", error);
      if (error.code === "auth/email-already-in-use") {
        alert("Email already in use. Please use a different email.");
      } else if (error.code === "auth/weak-password") {
        alert("Password is too weak. Please choose a stronger password.");
      } else {
        alert("Unable to create account. Please try again later.");
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!loginId.trim() || !loginPassword.trim()) {
      alert("Please fill in both ID and password.");
      return;
    }

    try {
      // Query user by ID to get email
      const userQuery = query(
        collection(db, "users"),
        where("ID", "==", loginId.trim()),
      );
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        alert("Invalid ID or password. Please try again.");
        return;
      }

      const userData = userSnapshot.docs[0].data();
      const userEmail = userData.email;

      // Sign in with Firebase Auth using email and password
      await signInWithEmailAndPassword(auth, userEmail, loginPassword);

      // Store user data in localStorage with timestamp for session management
      const userInfo = {
        data: userData,
        timestamp: Date.now(),
      };
      localStorage.setItem("user", JSON.stringify(userInfo));

      alert(`Login successful! Welcome ${userData.name || "user"}.`);
      setLoginPassword("");
      setLoginId("");

      if (userData.role === "staff") {
        setTimeout(() => navigate("/Home"), 300);
      } else if (userData.role === "worker") {
        setTimeout(() => navigate("/workerHome"), 300);
      } else if (userData.role === "admin") {
        setTimeout(() => navigate("/adminHome"), 300);
      } else if (userData.role === "estate") {
        setTimeout(() => navigate("/estateHome"), 300);
      } else {
        setTimeout(() => navigate("/"), 300);
      }
    } catch (error) {
      console.error("Login failed:", error);
      if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        alert("Invalid ID or password. Please try again.");
      } else {
        alert("Unable to log in. Please try again later.");
      }
    }
  };

  // ✅ Smooth mode switch — fade out then switch
  const switchMode = (newMode) => {
    setClosing(true);
    setTimeout(() => {
      setMode(newMode);
      setClosing(false);
      setStep(0); // reset steps when switching
    }, 300);
  };

  return (
    <div className="bg-yellow-400 overflow-y-auto min-h-screen w-full flex justify-center items-center px-4 py-8">
      {/* ✅ Single wrapper with fade — no conditional rendering killing the animation */}
      <div
        className="transition-opacity duration-300 w-full flex justify-center"
        style={{ opacity: closing ? 0 : 1 }}
      >
        {/* SIGNUP FORM */}
        {mode === "signup" && (
          <form className="flex flex-col items-center gap-5 rounded-xl py-10 bg-yellow-500 w-full max-w-96 px-6 md:max-w-[550px] lg:max-w-[680px] shadow-lg">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-semibold text-black">
                {steps[step].title}
              </h2>
              <p className="text-sm text-gray-800">
                Step {step + 1} of {steps.length}
              </p>
            </div>

            <div className="w-full overflow-hidden">
              <div
                className="flex w-[300%] transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${step * 100}%)` }}
              >
                {steps.map((section) => (
                  <div
                    key={section.title}
                    className="w-full shrink-0 px-1 md:px-4"
                  >
                    {section.fields.map((field) => (
                      <div
                        key={field.id}
                        className="w-full flex flex-col items-start gap-2 mb-4"
                      >
                        <label
                          htmlFor={field.id}
                          className="text-left md:text-lg"
                        >
                          {field.label}
                        </label>
                        <input
                          id={field.id}
                          type={field.type}
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="bg-green-700 md:text-lg w-full border border-yellow-100 rounded p-2"
                          required
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-3 flex-wrap">
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
                  onClick={handleSubmit} // ✅ now defined
                  disabled={!canProceed}
                  className={`rounded px-5 py-2 transition w-full ${
                    canProceed
                      ? "bg-red-700 cursor-pointer text-yellow-300 hover:bg-red-800"
                      : "bg-red-300 text-yellow-200 cursor-not-allowed"
                  }`}
                >
                  Submit
                </button>
              )}
            </div>

            <div className="mt-2 flex gap-2 items-center justify-center flex-wrap text-sm text-gray-900">
              <p>Already have an account?</p>
              <button
                className="bg-yellow-300 px-4 cursor-pointer hover:bg-yellow-400 transition rounded-full text-red-700"
                type="button"
                onClick={() => switchMode("login")} // ✅ smooth switch
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
                className="bg-green-700 md:text-lg w-full border border-yellow-100 rounded p-2"
                required
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
                className="bg-green-700 md:text-lg w-full border border-yellow-100 rounded p-2"
                required
              />
            </div>

            <button
              type="submit"
              className="bg-red-700 w-full rounded py-2 transition text-yellow-300 hover:bg-red-800 cursor-pointer"
            >
              Login
            </button>

            <div className="mt-4 flex gap-2 items-center justify-center flex-wrap text-sm text-gray-900">
              <p>Don't have an account?</p>
              <button
                className="bg-yellow-300 px-4 cursor-pointer hover:bg-yellow-400 transition rounded-full text-red-700"
                type="button"
                onClick={() => switchMode("signup")} // ✅ smooth switch
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
