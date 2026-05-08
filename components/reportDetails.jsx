import { useState, useEffect } from "react";

export default function ReportDetailsContainer({
  displayDetails,
  setDisplayDetails,
  currentReport,
  reportDetailsBgColor,
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (displayDetails) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      // ✅ Play slide-out before unmounting
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [displayDetails]);

  if (!visible) return null;

  const reportDetails = currentReport.map((report) => (
    <div className="flex flex-col px-10 gap-10">
      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl">Category:</h2>
        <p className="text-red-400 md:text-lg">{report.category}</p>
      </div>

      <div className="flex gap-2">
        <h2 className="text-lg md:text-xl whitespace-nowrap">
          Report Description:
        </h2>
        <p className="text-red-400 md:text-lg">{report.reportDescription}</p>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl">Date Sent:</h2>
        <p className="text-red-400 md:text-lg">{report.dateSent}</p>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl">Status:</h2>
        <p className="text-red-400 md:text-lg">{report.status}</p>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl">Date Approved:</h2>
        <p className="text-red-400 md:text-lg">{report.dateApproved}</p>
      </div>

      {report.dateConfirmed && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Date confirmed:</h2>
          <p className="text-red-400 md:text-lg">{report.dateConfirmed}</p>
        </div>
      )}

      {report.cost && (
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl">Cost:</h2>
          <p className="text-red-400 md:text-lg">{report.cost}</p>
        </div>
      )}

      {report.costDescription && (
        <div className="flex gap-2">
          <h2 className="text-lg md:text-xl whitespace-nowrap">
            Cost Description:
          </h2>
          <p className="text-red-400 md:text-lg">{report.costDescription}</p>
        </div>
      )}
    </div>
  ));

  return (
    <>
      <div
        className={`fixed top-0 md:top-[10%] py-24 md:py-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden  right-0 w-full md:max-w-[700px] h-screen md:max-h-[80%]  md:right-5 md:rounded-xl ${reportDetailsBgColor} z-80 md:shadow-xl overflow-y-auto ${
          closing ? "slide-out-right" : "slide-in-right"
        }`}
      >
        <span
          className="fixed top-20 md:top-5 right-5 cursor-pointer"
          onClick={() => setDisplayDetails(false)}
        >
          X
        </span>

        {reportDetails}
      </div>
    </>
  );
}
