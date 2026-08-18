import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "../src/firebase";

export default function StaffSlideInRight({ sidePopup }) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (sidePopup) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 300);

      return () => clearTimeout(t);
    }
  }, [sidePopup]);

  if (!visible) return null;

  const navClass = ({ isActive }) =>
    `w-full max-w-xs rounded-xl py-3 text-center font-semibold transition-all duration-300 shadow-md
    ${
      isActive
        ? "bg-white text-[#F88534] shadow-xl scale-105"
        : "bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-[#F88534] hover:scale-105"
    }`;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("user");
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"></div>

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 z-50 h-screen w-full md:w-[420px]
        flex flex-col justify-center items-center gap-8 px-8
         shadow-2xl
        ${closing ? "slide-out-right" : "slide-in-right"}`}
        style={{
          background:
            "linear-gradient(160deg, #F88534 0%, #FF9F57 45%, #FFD2B4 100%)",
        }}
      >
        <h2 className="text-3xl font-bold text-white mb-4">Staff Dashboard</h2>

        <NavLink to="/Pending" className={navClass}>
          📋 Pending Requests
        </NavLink>

        <NavLink to="/Completed" className={navClass}>
          ✅ Completed Jobs
        </NavLink>

        <NavLink to="/History" className={navClass}>
          📚 History
        </NavLink>

        <button
          onClick={handleLogout}
          className="mt-10 px-8 py-3 rounded-full bg-white text-red-600 font-semibold shadow-lg transition-all duration-300 hover:bg-red-500 hover:text-white hover:scale-105"
        >
          Logout
        </button>
      </div>
    </>
  );
}
