import { NavLink } from "react-router";
import { useState } from "react";
import AlertsContainer from "../components/AlertsContainer";
export default function NavBar() {
  const [alertsPopup, setAlertsPopup] = useState(false);

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? "text-red-400" : "text-[#111827] hover:text-red-400"
    }`;

  return (
    <>
      <AlertsContainer
        alertsPopup={alertsPopup}
        setAlertsPopup={setAlertsPopup}
      />
      <nav className="flex justify-between items-center bg-green-500 shadow p-4 w-full z-100 fixed top-0 bottom-auto">
        <h1>PHIX-HFCH</h1>

        <NavLink to="/" end className={navClass}>
          Home
        </NavLink>

        <div
          className="flex relative select-none"
          onClick={() => setAlertsPopup((prev) => !prev)}
        >
          <span className="text-green-600 absolute bottom-2 font-bold">3</span>
          <span className="material-symbols-outlined text-red-400 cursor-pointer">
            circle_notifications
          </span>
        </div>
      </nav>
    </>
  );
}
