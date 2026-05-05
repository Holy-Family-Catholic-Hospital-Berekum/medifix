import NavBars from "./navBars";
import { useState } from "react";

export default function Reports() {
  const [sidePopup, setSidePopup] = useState(false);

  return (
    <>
      <NavBars />
      <div className="md:flex text-center min-h-screen">
        <span
          className={`material-symbols-outlined md:hidden z-50 fixed cursor-pointer top-1/4 text-red-300 rounded-r-full py-2 pl-2 left-0 ${sidePopup ? "bg-white" : "bg-[#2563EB]"}`}
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_left" : "chevron_right"}
        </span>
        <div
          className={`w-full h-screen bg-[#2563EB] max-w-[200px] md:max-w-[500px] fixed rounded  bottom-1/2 md:relative ${sidePopup ? "block" : "hidden md:block"} `}
        >
          SIDEBAR
        </div>
        <main className="w-full h-screen">MAIN PAGE</main>
      </div>
    </>
  );
}
