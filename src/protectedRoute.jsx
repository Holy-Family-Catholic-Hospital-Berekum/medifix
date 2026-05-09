import { useNavigate } from "react-router";
import { useEffect } from "react";

const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/");
    }
  }, [navigate]);

  // If user exists, render the actual page
  return user ? children : null;
};

export default ProtectedRoute;
