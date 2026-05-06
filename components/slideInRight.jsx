import { useState, useEffect } from "react";

export default function SlideInRight({ sidePopup }) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sidePopup) {
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
  }, [sidePopup]);

  if (!visible) return null;

  return (
    <>
      <div
        className={`fixed top-0 right-0 w-full md:max-w-[500px] h-screen md:top-[10%] md:h-[80%] md:right-5 md:rounded-xl bg-red-300 z-50 shadow-xl overflow-y-auto ${
          closing ? "slide-out-right" : "slide-in-right"
        }`}
      ></div>
    </>
  );
}
