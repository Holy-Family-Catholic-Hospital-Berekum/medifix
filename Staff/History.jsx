import NavBars from "./navBars";
import { useState } from "react";

export default function History() {
  

  return (
    <>
      <NavBars />
      <div className="md:flex text-center min-h-screen">
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
