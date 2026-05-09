import { useNavigate } from "react-router";

const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();
  // If no user is found, redirect to login
  if (!user) {
    navigate("/");

    return;
  }

  // If user exists, render the actual page
  return children;
};

export default ProtectedRoute;
