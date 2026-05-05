import { useState, useEffect } from "react";

export default function Alerts({ alertsPopup }) {
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
      className={`fixed top-0 right-0 w-full md:max-w-[500px] h-screen md:top-[10%] md:h-[80%] md:right-5 md:rounded-xl bg-red-300 z-50 shadow-xl overflow-y-auto ${
        closing ? "slide-out-top" : "slide-in-top"
      }`}
    >
      {/* your content here */}
    </div>
  );
}
