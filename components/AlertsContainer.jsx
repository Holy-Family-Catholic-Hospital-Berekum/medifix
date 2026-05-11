import { useState, useEffect } from "react";
import { formatDate } from "../src/utils";

export default function AlertsContainer({
  alertsPopup,
  setAlertsPopup,
  alerts = [],
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (alertsPopup) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [alertsPopup]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-0 right-0 w-full md:max-w-[500px] h-screen md:top-[10%] md:h-[80%] md:right-5 md:rounded-xl bg-red-300 z-70 shadow-xl overflow-y-auto ${
        closing ? "slide-out-top" : "slide-in-top"
      }`}
    >
      <div className="p-5">
        <span
          className="absolute top-5 right-5 cursor-pointer text-xl font-bold"
          onClick={() => setAlertsPopup((prev) => !prev)}
        >
          X
        </span>
        <h2 className="text-2xl font-bold mb-5 mt-5">Alerts & Notes</h2>

        {alerts && alerts.length > 0 ? (
          <div className="flex flex-col gap-4">
            {alerts.map((alert, idx) => (
              <div key={idx} className="bg-white rounded-lg p-4 shadow-md">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-gray-700">{alert.from}</span>
                  <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                    {alert.role}
                  </span>
                </div>
                <p className="text-gray-800 mb-2">{alert.content}</p>
                <span className="text-xs text-gray-500">
                  {formatDate(alert.date)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-700 text-center mt-10">No alerts yet</p>
        )}
      </div>
    </div>
  );
}
