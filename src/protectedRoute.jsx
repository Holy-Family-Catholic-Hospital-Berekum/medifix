import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Always fetch fresh role from Firestore — never trust localStorage
          const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));

          if (userSnap.exists()) {
            const freshData = userSnap.data();
            setUser(freshData);

            // Keep localStorage in sync so other parts of the app
            // that still read it get the fresh data
            localStorage.setItem(
              "user",
              JSON.stringify({
                data: freshData,
                timestamp: Date.now(),
              }),
            );
          } else {
            // User doc doesn't exist in Firestore — sign out
            await auth.signOut();
            localStorage.removeItem("user");
            setUser(null);
          }
        } catch (err) {
          console.error("Failed to fetch user profile:", err);
          await auth.signOut();
          localStorage.removeItem("user");
          setUser(null);
        }
      } else {
        localStorage.removeItem("user");
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [navigate, user, loading]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center w-full h-screen gap-4 bg-white">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-red-100" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-400 animate-spin" />
        </div>
        <p className="text-red-400 font-semibold text-sm tracking-wide animate-pulse">
          Loading...
        </p>
      </div>
    );
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

  return children;
};

export default ProtectedRoute;
