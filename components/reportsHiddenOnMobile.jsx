import { useState, useEffect } from "react";

export default function ReportsHiddenOnMobile({
  showReportsHiddenOnMobile,
  onClose,
  reportsHiddenOnMobile,
  reportsHiddenOnMobileTitle,
}) {
  const [closing, setClosing] = useState(false);

  // ✅ When showReportsHiddenOnMobile goes false, play slide-down before hiding
  useEffect(() => {
    if (!showReportsHiddenOnMobile) {
      setClosing(true);
      const t = setTimeout(() => setClosing(false), 300);
      return () => clearTimeout(t);
    }
  }, [showReportsHiddenOnMobile]);

  if (!showReportsHiddenOnMobile && !closing) return null;

  return (
    <div className="z-70 md:hidden md:pointer-events-none fixed inset-0 flex items-end justify-center bg-black/40">
      <div
        className={`bg-red-300 w-full h-full overflow-y-auto pt-24 flex flex-col items-center gap-4 rounded-t-2xl ${
          closing ? "slide-down" : "slide-up"
        }`}
      >
        <h1 className="text-2xl md:text-4xl text-gray-800 font-bold">
          {reportsHiddenOnMobileTitle}
        </h1>
        <div className="flex gap-4 md:gap-10 justify-center flex-wrap py-10 md:py-20 px-4">
          {reportsHiddenOnMobile}
        </div>
      </div>
    </div>
  );
}
