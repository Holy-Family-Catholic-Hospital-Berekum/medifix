import { useState } from "react";
import ReportForm from "./reportForm";
import AlertsContainer from "../components/AlertsContainer";
import { useNavigate, NavLink } from "react-router";
export default function NavBars() {
  const [formPopup, setFormPopup] = useState(false);
  const navigate = useNavigate();

  const [alertsPopup, setAlertsPopup] = useState(false);

  const handleClose = () => {
    // give slide-down time to finish before hiding
    setTimeout(() => setFormPopup(false), 300);
  };

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? "text-red-300" : "text-[#111827] hover:text-red-300"
    }`;

  return (
    <>
      <AlertsContainer
        alertsPopup={alertsPopup}
        setAlertsPopup={setAlertsPopup}
      />
      {formPopup && <ReportForm formPopup={formPopup} onClose={handleClose} />}
      <nav className="md:hidden z-100 flex justify-between w-full fixed bottom-auto top-0 px-4 md:px-10 py-5 md:top-auto md:bottom-0 shadow bg-[#eff6ff]">
        <div className="flex items-center gap-5">
          <h1 className="font-bold">PHIX-HFCH</h1>
          <button className="text-[#111827] text-sm md:text-md  cursor-pointer hover:text-red-300 transition">
            Logout
          </button>
        </div>

        <div className="flex items-center justify-center gap-4">
          <div
            className="flex relative select-none"
            onClick={() => setAlertsPopup((prev) => !prev)}
          >
            <span className="text-green-600 absolute bottom-2 font-bold">
              3
            </span>
            <span className="material-symbols-outlined text-red-400 cursor-pointer">
              circle_notifications
            </span>
          </div>
          <button
            className="text-red-300 text-lg bg-[#2563EB] px-4 py-1 rounded-full cursor-pointer hover:text-white transition"
            onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
          >
            {formPopup ? "Close" : "Report"}
          </button>
        </div>
      </nav>

      <nav className="bg-[#2563EB] border-t border-[#eff6ff] flex md:justify-between z-100 justify-center gap-20 w-full fixed bottom-0 top-auto px-10 py-5 md:top-0 md:bottom-auto md:shadow ">
        <div className=" items-center gap-5 hidden md:flex">
          <h1 className="font-bold ">PHIX-HFCH</h1>
          <button className="text-[#111827]   cursor-pointer hover:text-red-300 transition">
            Logout
          </button>
        </div>
        <div className="flex gap-20">
          <NavLink to="/Home" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/History" className={navClass}>
            History
          </NavLink>
        </div>

        <div className="flex items-center justify-center gap-4">
          <div
            className="relative cursor-pointer hidden md:flex select-none"
            onClick={() => setAlertsPopup((prev) => !prev)}
          >
            <span className="text-green-600 md:text-red-300 absolute bottom-2 font-bold">
              3
            </span>
            <span className="material-symbols-outlined text-red-400">
              circle_notifications
            </span>
          </div>

          <button
            className="bg-red-300 text-white hidden md:block  text-lg bg-[#2563EB] px-4 py-1 rounded-full cursor-pointer hover:shadow hover:bg-red-400 shadow-white transition"
            onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
          >
            {formPopup ? "Close" : "Report"}
          </button>
        </div>
      </nav>
    </>
  );
}
