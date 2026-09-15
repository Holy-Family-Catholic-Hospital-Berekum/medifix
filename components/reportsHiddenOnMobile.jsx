import { useState, useEffect } from "react";

export default function ReportsHiddenOnMobile({
  showReportsHiddenOnMobile,
  onClose,
  reportsHiddenOnMobile,
  reportsHiddenOnMobileTitle,
  secondReports,
  theme = {},
}) {
  const [closing, setClosing] = useState(false);

  const {
    sheetBg = "bg-sky-950",
    sheetBorder = "border-sky-800",
    sheetTopBar = "from-sky-400 via-cyan-400",
    titleColor = "text-sky-100",
    emptyText = "text-sky-500/60",
  } = theme;

  useEffect(() => {
    if (!showReportsHiddenOnMobile) {
      setClosing(true);
      const t = setTimeout(() => setClosing(false), 300);
      return () => clearTimeout(t);
    }
  }, [showReportsHiddenOnMobile]);

  if (!showReportsHiddenOnMobile && !closing) return null;

  return (
    <div className="z-[30] md:hidden fixed inset-0 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={`${sheetBg} border-t border-l border-r ${sheetBorder} w-full h-[90%] overflow-y-auto pt-8 flex flex-col items-center gap-4 rounded-t-3xl relative ${
          closing ? "slide-down" : "slide-up"
        }`}
      >
        {/* Top drag handle + bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${sheetTopBar} to-transparent rounded-t-3xl`}
        />
        <div className="w-12 h-1 rounded-full bg-white/20 mt-3 mb-2 flex-shrink-0" />

        <h1
          className={`text-xl md:text-2xl font-bold tracking-tight leading-tight ${titleColor}`}
        >
          {reportsHiddenOnMobileTitle}
        </h1>

        {secondReports.length > 0 ? (
          <div className="flex gap-4 justify-center flex-wrap py-6 px-4 w-full">
            {reportsHiddenOnMobile}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 mt-16">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl opacity-40">
              📋
            </div>
            <p
              className={`${emptyText} text-sm tracking-widest uppercase font-semibold`}
            >
              Nothing here yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
