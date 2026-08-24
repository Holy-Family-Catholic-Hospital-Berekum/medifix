import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "../src/firebase";
const icons = {
  assigned: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),

  rejected: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 8l8 8M16 8l-8 8" />
    </svg>
  ),

  progress: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),

  reopened: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),

  dropped: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  ),

  completed: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l2.5 2.5L16 9" />
    </svg>
  ),

  closed: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12h8" />
    </svg>
  ),

  dashboard: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
};

export default function SlideInRight({
  sidePopup,
  completedRedirect,
  assignedRedirect,
  rejectedRedirect,
  acceptedRedirect,
  droppedRedirect,
  completedWithFeedback,
  newAssignedCount,
  newRejectedCount,
  newAcceptedCount,
  newCompletedCount,
  newReopenedCount,
  newDroppedCount,
  closedWithFeedback,
  newClosedCount,
  closedRedirect,
  reopenedRedirect,
  dashboardRedirect,
  theme = {},
  onClose,
}) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  const {
    slideBg = "bg-slate-950/98",
    slideBorder = "border-white/10",
    slideTopBar = "from-sky-400 via-cyan-400",
    linkActiveBg = "bg-sky-500/10",
    linkActiveBorder = "border-sky-400/30",
    linkActiveText = "text-sky-300",
    linkIdleText = "text-white/60",
    linkHoverText = "hover:text-white",
    linkHoverBg = "hover:bg-white/[0.04]",
    feedbackBadge = "bg-amber-400 text-amber-950",
    logoutBorder = "border-white/25",
    logoutText = "text-[#7C2D12]",
    logoutHoverBorder = "hover:border-red-400/50",
    logoutHoverText = "hover:text-red-500",
    logoutHoverBg = "hover:bg-red-500/5",
  } = theme;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("user");
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    if (sidePopup) {
      setVisible(true);
      setClosing(false);
      document.body.style.overflow = "hidden";
    } else if (visible) {
      setClosing(true);

      const timer = setTimeout(() => {
        setVisible(false);
        setClosing(false);
        document.body.style.overflow = "";
      }, 300);

      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [sidePopup, visible]);

  if (!visible) return null;

  let user = null;

  try {
    user = JSON.parse(localStorage.getItem("user"))?.data;
  } catch {
    user = null;
  }

  const isManagementRole = ["admin", "estate", "procurement"].includes(
    user?.role,
  );

  const items = [
    {
      label: "Assigned",
      redirect: assignedRedirect,
      icon: icons.assigned,
      count: newAssignedCount,
    },
    {
      label: "In Progress",
      redirect: acceptedRedirect,
      icon: icons.progress,
      count: newAcceptedCount,
    },
    {
      label: "Reopened",
      redirect: reopenedRedirect,
      icon: icons.reopened,
      count: newReopenedCount,
    },
    {
      label: "Dropped",
      redirect: droppedRedirect,
      icon: icons.dropped,
      count: newDroppedCount,
    },
    {
      label: "Completed",
      redirect: completedRedirect,
      icon: icons.completed,
      count: newCompletedCount,
      feedback: completedWithFeedback,
    },
    {
      label: "Closed",
      redirect: closedRedirect,
      icon: icons.closed,
      count: newClosedCount,
      feedback: closedWithFeedback,
    },
    {
      label: "Rejected",
      redirect: rejectedRedirect,
      icon: icons.rejected,
      count: newRejectedCount,
    },
  ];
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`
          fixed top-0 right-0 z-50
          h-screen w-[88%] max-w-[390px]
          ${slideBg}
          border-l ${slideBorder}
          shadow-2xl
          md:hidden
          overflow-hidden
          flex flex-col
          ${closing ? "slide-out-right" : "slide-in-right"}
        `}
      >
        {/* Top gradient */}
        <div
          className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${slideTopBar} to-transparent`}
        />

        {/* Header */}
        <div className="px-6 pt-24 pb-5 border-b border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-sky-400/70 font-bold">
                Maintenance Portal
              </p>
            </div>
          </div>

          {/* User info */}
          {user && (
            <div className="mt-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-300 font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-500 truncate">
                  {user?.name || "User"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <p className="px-3 mb-3 text-[10px] uppercase tracking-[0.25em] font-bold text-white/25">
            Reports
          </p>

          <nav className="space-y-1">
            {items.map(
              ({ label, redirect, icon, count, feedback }) =>
                redirect && (
                  <NavLink
                    key={label}
                    to={redirect}
                    end={label === "Completed" || label === "Closed"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `
                      group relative flex items-center gap-3
                      px-3 py-3.5 rounded-xl
                      border
                      transition-all duration-200
                      ${
                        isActive
                          ? `${linkActiveText} ${linkActiveBg} ${linkActiveBorder}`
                          : `border-transparent ${linkIdleText} ${linkHoverText} ${linkHoverBg}`
                      }
                    `
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active indicator */}
                        {isActive && (
                          <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-sky-400" />
                        )}

                        <span
                          className={`
                            w-9 h-9 rounded-lg
                            flex items-center justify-center
                            shrink-0
                            ${
                              isActive
                                ? "bg-sky-400/10"
                                : "bg-white/[0.03] group-hover:bg-white/[0.06]"
                            }
                          `}
                        >
                          <span className="w-[18px] h-[18px]">{icon}</span>
                        </span>

                        <span className="flex-1 text-sm font-semibold">
                          {label}
                        </span>

                        <span className="flex items-center gap-1.5">
                          {count > 0 && (
                            <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-sky-400 text-sky-950 text-[10px] font-black flex items-center justify-center">
                              {count > 99 ? "99+" : count}
                            </span>
                          )}

                          {feedback > 0 && (
                            <span
                              className={`
                                min-w-[22px] h-[22px] px-1.5
                                rounded-full
                                ${feedbackBadge}
                                text-[10px] font-black
                                flex items-center justify-center
                              `}
                              title={`${feedback} feedback waiting`}
                            >
                              {feedback > 99 ? "99+" : feedback}
                            </span>
                          )}

                          <svg
                            className="w-4 h-4 opacity-20 group-hover:opacity-50 transition"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                      </>
                    )}
                  </NavLink>
                ),
            )}

            <button
              onClick={handleLogout}
              className={`text-xs tracking-widest uppercase md:hidden font-semibold px-3 py-1.5 my-10 rounded border transition-all duration-200 cursor-pointer  border-red-500 text-red-500`}
            >
              Logout
            </button>
          </nav>

          {/* Management */}
          {isManagementRole && dashboardRedirect && (
            <div>
              <p className="px-3 mb-3 text-[10px] uppercase tracking-[0.25em] font-bold text-white/25">
                Management
              </p>

              <NavLink
                to={dashboardRedirect}
                onClick={onClose}
                className={({ isActive }) =>
                  `
                  group relative flex items-center gap-3
                  px-3 py-3.5 rounded-xl
                  border transition-all duration-200
                  ${
                    isActive
                      ? `${linkActiveText} ${linkActiveBg} ${linkActiveBorder}`
                      : `border-transparent ${linkIdleText} ${linkHoverText} ${linkHoverBg}`
                  }
                `
                }
              >
                <span className="w-9 h-9 rounded-lg bg-white/[0.03] flex items-center justify-center">
                  <span className="w-[18px] h-[18px]">{icons.dashboard}</span>
                </span>

                <span className="text-sm font-semibold">Dashboard</span>

                <svg
                  className="w-4 h-4 ml-auto opacity-20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </NavLink>

              <button
                onClick={handleLogout}
                className={`text-xs tracking-widest uppercase md:hidden font-semibold px-3 py-1.5 my-10 rounded border transition-all duration-200 cursor-pointer  border-red-500 text-red-500`}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">
                Signed in as
              </p>
              <p className="text-xs text-gray-500 mt-1 capitalize">
                {user?.role || "User"}
              </p>
            </div>

            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          </div>
        </div>
      </aside>
    </>
  );
}
