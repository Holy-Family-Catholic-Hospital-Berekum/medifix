import { useState, useEffect } from "react";
import { NavLink } from "react-router";

export default function SlideInRight({
  sidePopup,
  slideInBgColor,
  completedRedirect,
  assignedRedirect,
  completedWithFeedback,
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sidePopup) {
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
  }, [sidePopup]);

  if (!visible) return null;

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? "text-green-800" : "text-[#111827] hover:text-blue-200"
    }`;

  return (
    <div
      className={`fixed pt-24 top-0 flex flex-col gap-10 items-center right-0 w-full md:max-w-[500px] h-screen md:top-[10%] md:h-[80%] md:right-5 md:rounded-xl ${slideInBgColor} z-50 md:hidden shadow-xl overflow-y-auto ${
        closing ? "slide-out-right" : "slide-in-right"
      }`}
    >
      {assignedRedirect && (
        <NavLink to={`${assignedRedirect}`} className={navClass}>
          Assigned
        </NavLink>
      )}
      <NavLink to={`${completedRedirect}`} end className={navClass}>
        Completed
        {completedWithFeedback > 0 && (
          <span className="ml-2 bg-yellow-400 text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {completedWithFeedback}
          </span>
        )}
      </NavLink>
    </div>
  );
}
