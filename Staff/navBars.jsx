import { useState } from "react";
import ReportForm from "./reportForm";
export default function NavBars() {
  const [formPopup, setFormPopup] = useState(false);

  const handleClose = () => {
    // give slide-down time to finish before hiding
    setTimeout(() => setFormPopup(false), 300);
  };
  return (
    <>
      {formPopup && <ReportForm formPopup={formPopup} onClose={handleClose} />}
      <nav className="md:hidden z-50 flex justify-between w-full fixed bottom-auto top-0 px-10 py-5 md:top-auto md:bottom-0 shadow bg-[#eff6ff]">
        <button className="text-[#111827]  cursor-pointer hover:text-red-300 transition">
          SignUp
        </button>
        <button
          className="text-red-300 text-lg bg-[#2563EB] px-4 py-1 rounded-full cursor-pointer hover:text-white transition"
          onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
        >
          {formPopup ? "Close" : "Report"}
        </button>
      </nav>

      <nav className="bg-[#2563EB] border-t border-[#eff6ff] flex md:justify-between z-50 justify-center gap-20 w-full fixed bottom-0 top-auto px-10 py-5 md:top-0 md:bottom-auto">
        <button className="text-[#111827] hidden md:block  cursor-pointer hover:text-red-300 transition">
          SignUp
        </button>
        <div className="flex gap-20">
          <button className="text-[#111827] cursor-pointer hover:text-red-300 transition">
            Home
          </button>
          <button className="text-[#111827] cursor-pointer hover:text-red-300 transition">
            Reports
          </button>
        </div>

        <button
          className="bg-red-300 text-white hidden md:block  text-lg bg-[#2563EB] px-4 py-1 rounded-full cursor-pointer hover:shadow hover:bg-red-400 shadow-white transition"
          onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
        >
          {formPopup ? "Close" : "Report"}
        </button>
      </nav>
    </>
  );
}
