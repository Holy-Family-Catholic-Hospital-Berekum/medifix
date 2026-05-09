import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem("user"));

  // If no user is found, redirect to login
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If user exists, render the actual page
  return children;
};

export default ProtectedRoute;
