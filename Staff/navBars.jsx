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
      isActive
        ? "text-[#FF8825] whitespace-nowrap"
        : "text-blue-100 hover:text-[#FF8825] whitespace-nowrap"
    }`;

  return (
    <>
      {formPopup && <ReportForm formPopup={formPopup} onClose={handleClose} />}
      <nav className="md:hidden z-100 flex justify-between w-full fixed bottom-auto top-0 px-4 md:px-10 py-5 md:top-auto md:bottom-0 shadow bg-[#eff6ff]">
        <div className="flex items-center gap-5">
          <h1 className="font-bold text-[#FF8825] text-2xl">Phix</h1>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            className="text-[#FF8825] text-lg bg-[#40499F] px-4 py-1 rounded-full cursor-pointer hover:text-white transition"
            onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
          >
            {formPopup ? "Close" : "Report"}
          </button>
        </div>
      </nav>

      <nav className="bg-[#40499F] border-t border-[#eff6ff] flex md:justify-between z-100 justify-center gap-20 w-full fixed bottom-0 top-auto px-10 py-5 md:top-0 md:bottom-auto md:shadow ">
        <div className=" items-center gap-5 hidden md:flex">
          <h1 className="font-bold text-[#FF8825] text-2xl">Phix</h1>
        </div>

        <NavLink to="/Home" end className={navClass}>
          Home
        </NavLink>

        <div className="flex items-center justify-center hidden md:block gap-4 md:gap-10">
          <button
            className="bg-[#FF8825] text-white   text-lg  px-4 py-1 rounded-full cursor-pointer hover:shadow hover:bg-orange-500 shadow-white transition"
            onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
          >
            {formPopup ? "Close" : "Report"}
          </button>
        </div>
      </nav>
    </>
  );
}
