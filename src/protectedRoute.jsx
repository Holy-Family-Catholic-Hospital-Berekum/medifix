import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

const ProtectedRoute = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Check localStorage for user data
        const storedUser = JSON.parse(localStorage.getItem("user"));
        if (storedUser && storedUser.data) {
          const oneWeek = 7 * 24 * 60 * 60 * 1000; // one week in milliseconds
          if (Date.now() - storedUser.timestamp > oneWeek) {
            localStorage.removeItem("user");
            setUser(null);
          } else {
            setUser(storedUser.data);
          }
        } else {
          // If no localStorage but Firebase user exists, sign out
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

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex justify-center items-center w-full h-screen font-bold text-red-400">
        Loading...
      </div>
    );
  }

  // If user exists, render the actual page
  return user ? children : null;
};

export default ProtectedRoute;
