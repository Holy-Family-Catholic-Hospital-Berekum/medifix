import { NavLink, useNavigate } from "react-router";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../src/firebase";
import AlertsContainer from "./AlertsContainer";
export default function NavBar({ navBarColor, logoBGColor, homeRedirect }) {
  const [alertsPopup, setAlertsPopup] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("user");
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive
        ? "text-red-400 md:flex justify-center md:w-full"
        : "text-[#111827] hover:text-red-400 md:flex justify-center md:w-full"
    }`;

  return (
    <>
      <AlertsContainer
        alertsPopup={alertsPopup}
        setAlertsPopup={setAlertsPopup}
      />
      <nav
        className={`flex justify-between items-center ${navBarColor} shadow pl-4 md:pl-0 py-6 pr-4 w-full z-100 fixed top-0 bottom-auto`}
      >
        <h1
          className={`font-bold ${logoBGColor} md:h-full md:w-full md:max-w-[20%] md:absolute md:flex items-center justify-center`}
        >
          PHIX-HFCH
        </h1>

        <NavLink to={`${homeRedirect}`} end className={navClass}>
          Home
        </NavLink>

        <div
          className="flex relative select-none cursor-pointer"
          onClick={() => setAlertsPopup((prev) => !prev)}
        >
          <span className="text-green-600 absolute bottom-2 font-bold">3</span>
          <span className="material-symbols-outlined text-red-400">
            circle_notifications
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="text-[#111827] hover:text-red-400 cursor-pointer transition"
        >
          Logout
        </button>
      </nav>
    </>
  );
}
