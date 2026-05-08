import PageLayout from "./pageLayout";
import { useState } from "react";

export default function StaffOverdue() {
  const [sidePopup, setSidePopup] = useState(false);

  const OverdueReports = <div className="py-24">Overdue reports here</div>;

  return (
    <>
      <span
        className={`material-symbols-outlined md:hidden z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400`}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>
      <PageLayout content={OverdueReports} sidePopup={sidePopup} />
    </>
  );
}
