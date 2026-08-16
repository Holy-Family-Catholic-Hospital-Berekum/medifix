import { useState, useEffect } from "react";
import { NavLink } from "react-router";

export default function SlideInRight({
  sidePopup,
  completedRedirect,
  assignedRedirect,
  rejectedRedirect,
  acceptedRedirect,
  completedWithFeedback,
  newAssignedCount,
  newRejectedCount,
  newAcceptedCount,
  newCompletedCount,
  newReopenedCount,
  closedWithFeedback,
  newClosedCount,
  closedRedirect,
  reopenedRedirect,
  dashboardRedirect,
  theme = {},
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  const {
    slideBg = "bg-sky-950/95",
    slideBorder = "border-sky-800",
    slideTopBar = "from-sky-400 via-cyan-400",
    linkActiveBg = "bg-sky-500/15",
    linkActiveBorder = "border-sky-400/40",
    linkActiveText = "text-sky-300",
    linkIdleBorder = "border-white/10",
    linkIdleText = "text-white/40",
    linkHoverText = "hover:text-sky-200",
    linkHoverBorder = "hover:border-sky-400/30",
    linkHoverBg = "hover:bg-sky-500/8",
    feedbackBadge = "bg-sky-400 text-sky-950",
  } = theme;

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
    `cursor-pointer transition-all duration-200 text-sm font-bold tracking-widest uppercase px-6 py-3 rounded-xl border w-full text-center ${
      isActive
        ? `${linkActiveText} ${linkActiveBorder} ${linkActiveBg}`
        : `${linkIdleText} ${linkIdleBorder} ${linkHoverText} ${linkHoverBorder} ${linkHoverBg}`
    }`;

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  return (
    <div
      className={`fixed top-0 flex flex-col gap-4 items-center justify-center md:justify-start right-0 w-full md:max-w-[500px] h-screen ${slideBg} backdrop-blur-xl border-l ${slideBorder} z-50 md:hidden overflow-y-auto px-8 ${
        closing ? "slide-out-right" : "slide-in-right"
      }`}
    >
      <div
        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${slideTopBar} to-transparent`}
      />

      <p className="text-[10px] tracking-[0.3em] uppercase text-white/30 font-semibold mb-2">
        Navigation
      </p>

      {assignedRedirect && (
        <NavLink to={`${assignedRedirect}`} className={navClass}>
          Assigned
          {newAssignedCount > 0 && (
            <span className="bg-sky-400 text-sky-950 text-xs font-black px-2 py-0.5 rounded-full">
              {newAssignedCount}
            </span>
          )}
        </NavLink>
      )}

      {rejectedRedirect && (
        <NavLink to={`${rejectedRedirect}`} className={navClass}>
          Rejected
          {newRejectedCount > 0 && (
            <span className="bg-sky-400 text-sky-950 text-xs font-black px-2 py-0.5 rounded-full">
              {newRejectedCount}
            </span>
          )}
        </NavLink>
      )}

      {acceptedRedirect && (
        <NavLink to={`${acceptedRedirect}`} className={navClass}>
          In Progress
          {newAcceptedCount > 0 && (
            <span className="bg-sky-400 text-sky-950 text-xs font-black px-2 py-0.5 rounded-full">
              {newAcceptedCount}
            </span>
          )}
        </NavLink>
      )}

      {reopenedRedirect && (
        <NavLink to={`${reopenedRedirect}`} className={navClass}>
          Reopened
          {newReopenedCount > 0 && (
            <span className="bg-sky-400 text-sky-950 text-xs font-black px-2 py-0.5 rounded-full">
              {newReopenedCount}
            </span>
          )}
        </NavLink>
      )}

      {completedRedirect && (
        <NavLink to={`${completedRedirect}`} end className={navClass}>
          <span className="flex items-center justify-center gap-2">
            Completed
            {newCompletedCount > 0 && (
              <span className="bg-sky-400 text-sky-950 text-xs font-black px-2 py-0.5 rounded-full">
                {newCompletedCount}
              </span>
            )}
            {completedWithFeedback > 0 && (
              <span
                className={`${feedbackBadge} text-xs font-black px-2 py-0.5 rounded-full`}
              >
                {completedWithFeedback}
              </span>
            )}
          </span>
        </NavLink>
      )}

      {closedRedirect && (
        <NavLink to={`${closedRedirect}`} end className={navClass}>
          <span className="flex items-center justify-center gap-2">
            Closed
            {newClosedCount > 0 && (
              <span className="bg-sky-400 text-sky-950 text-xs font-black px-2 py-0.5 rounded-full">
                {newClosedCount}
              </span>
            )}
            {closedWithFeedback > 0 && (
              <span
                className={`${feedbackBadge} text-xs font-black px-2 py-0.5 rounded-full`}
              >
                {closedWithFeedback}
              </span>
            )}
          </span>
        </NavLink>
      )}

      {["admin", "estate", "procurement"].includes(user?.role) && (
        <NavLink
          to={`${dashboardRedirect}`}
          className={({ isActive }) =>
            `flex md:hidden cursor-pointer transition-all flex justify-center duration-200 text-sm font-bold tracking-widest uppercase px-6 py-3 rounded-xl border w-full ${
              isActive
                ? `${linkActiveText} ${linkActiveBorder} ${linkActiveBg}`
                : `${linkIdleText} ${linkIdleBorder} ${linkHoverText} ${linkHoverBorder} ${linkHoverBg}`
            }`
          }
        >
          Dashboard
        </NavLink>
      )}
    </div>
  );
}
