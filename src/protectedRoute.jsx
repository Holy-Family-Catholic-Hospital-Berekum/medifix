import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const storedUser = JSON.parse(localStorage.getItem("user"));
        if (storedUser && storedUser.data) {
          const oneWeek = 7 * 24 * 60 * 60 * 1000;
          if (Date.now() - storedUser.timestamp > oneWeek) {
            localStorage.removeItem("user");
            setUser(null);
          } else {
            setUser(storedUser.data);
          }
        } else {
          auth.signOut();
          setUser(null);
        }
      } else {
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
        {/* Spinning ring */}
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

  // Role check — if allowedRoles provided and user's role isn't in it, show access denied
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
            className="bg-red-400 px-8 rounded text-white cursor-pointer hover:bg-red-500 transition"
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
