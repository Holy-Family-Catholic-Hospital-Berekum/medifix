import { useNavigate } from "react-router";
import { useEffect } from "react";

const ProtectedRoute = ({ children }) => {
  const storedUser = JSON.parse(localStorage.getItem("user"));
  let user = null;

  if (storedUser) {
    const oneWeek = 7 * 24 * 60 * 60 * 1000; // one week in milliseconds
    if (Date.now() - storedUser.timestamp > oneWeek) {
      localStorage.removeItem("user");
    } else {
      user = storedUser.data;
    }
  }

  

  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/");
    }
  }, [navigate, user]);

  // If user exists, render the actual page
  return user ? children : null;
};

export default ProtectedRoute;
