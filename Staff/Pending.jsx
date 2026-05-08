import PageLayout from "./pageLayout";
import { useState } from "react";

export default function Pending() {
  const [sidePopup, setSidePopup] = useState(false);

  const pendingReports = <div className="py-24">Pending reports here</div>;

  return (
    <>
      <span
        className={`material-symbols-outlined md:hidden z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400`}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>
      <PageLayout content={pendingReports} sidePopup={sidePopup} />
    </>
  );
}
