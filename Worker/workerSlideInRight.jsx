import { useState, useEffect } from "react";
import { NavLink } from "react-router";

export default function WorkerSlideInRight({ sidePopup }) {
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

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? "text-green-800" : "text-[#111827] hover:text-blue-200"
    }`;

  return (
    <>
      <div
        className={`fixed pt-24 top-0 flex flex-col gap-10 items-center right-0 w-full md:max-w-[500px] h-screen md:top-[10%] md:h-[80%] md:right-5 md:rounded-xl bg-red-300 z-50 shadow-xl overflow-y-auto ${
          closing ? "slide-out-right" : "slide-in-right"
        }`}
      >
        <NavLink to="/workerCompleted" end className={navClass}>
          Completed
        </NavLink>
        <NavLink to="/workerOverdue" className={navClass}>
          Overdue
        </NavLink>
      </div>
    </>
  );
}
