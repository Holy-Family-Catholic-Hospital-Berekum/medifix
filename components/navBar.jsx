import { NavLink, useNavigate } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "../src/firebase";

export default function NavBar({
  homeRedirect,
  dashboardRedirect,
  theme = {},
}) {
  const navigate = useNavigate();

  const {
    navBg = "bg-green-800",
    navBorder = "border-sky-800",
    logoFrom = "from-sky-300",
    logoTo = "to-cyan-400",
    logoSub = "text-sky-500",
    liveColor = "bg-emerald-400",
    liveShadow = "shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]",
    liveText = "text-emerald-400",
    linkActive = "text-sky-300",
    linkHover = "hover:text-sky-200",
    linkBar = "bg-sky-400",
    logoutBorder = "border-sky-700",
    logoutText = "text-sky-400",
    logoutHoverBorder = "hover:border-red-500/60",
    logoutHoverText = "hover:text-red-400",
    logoutHoverBg = "hover:bg-red-500/5",
    accent = "shadow-[0_1px_0_0_rgba(125,211,252,0.2)]",
    glowLine = "via-sky-400/20",
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

  const navClass = ({ isActive }) =>
    `cursor-pointer transition-all duration-200 text-sm font-semibold tracking-widest uppercase relative group ${
      isActive ? linkActive : `text-white/40 ${linkHover}`
    }`;

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  return (
    <nav
      className={`flex justify-between items-center gap-6 ${navBg} border-b ${navBorder} ${accent} pl-4 md:pl-0 py-4 pr-6 w-full z-[100] fixed top-0 backdrop-blur-md`}
    >
      {/* Subtle top glow line */}
      <div
        className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${glowLine} to-transparent`}
      />

      {/* Logo */}
      <div className="flex items-center md:h-full md:w-full md:max-w-[20%] md:absolute md:justify-center gap-2">
        <span
          className={`font-black tracking-[0.2em] text-sm bg-gradient-to-r ${logoFrom} ${logoTo} bg-clip-text text-transparent uppercase select-none`}
        >
          PHIX
        </span>
        <span className="text-white/20 font-thin">|</span>
        <span
          className={`${logoSub} text-xs tracking-widest font-medium uppercase`}
        >
          HFCH
        </span>
        <span className="ml-2 flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${liveColor} animate-pulse ${liveShadow}`}
          />
          <span
            className={`text-[10px] ${liveText} tracking-widest uppercase font-bold hidden md:inline`}
          >
            Live
          </span>
        </span>
      </div>

      {/* Nav links */}
      <div className="flex items-center gap-8 ml-auto mr-4">
        {user?.role !== "manager" && (
          <NavLink to={`${homeRedirect}`} end className={navClass}>
            {({ isActive }) => (
              <>
                Home
                <span
                  className={`absolute -bottom-1 left-0 h-px w-full ${linkBar} transition-transform duration-200 origin-left ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`}
                />
              </>
            )}
          </NavLink>
        )}
        {(user?.role === "admin" || user?.role === "estate") && (
          <NavLink
            to={`${dashboardRedirect}`}
            end
            className={({ isActive }) =>
              `hidden md:block cursor-pointer transition-all duration-200 text-sm font-semibold tracking-widest uppercase relative group ${isActive ? linkActive : `text-white/40 ${linkHover}`}`
            }
          >
            {({ isActive }) => (
              <>
                Dashboard
                <span
                  className={`absolute -bottom-1 left-0 h-px w-full ${linkBar} transition-transform duration-200 origin-left ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`}
                />
              </>
            )}
          </NavLink>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className={`text-xs tracking-widest uppercase font-semibold px-3 py-1.5 rounded border transition-all duration-200 cursor-pointer ${logoutBorder} ${logoutText} ${logoutHoverBorder} ${logoutHoverText} ${logoutHoverBg}`}
      >
        Logout
      </button>
    </nav>
  );
}
