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
    navBg = "bg-gradient-to-r from-[#F38130]/95 via-[#ff9b52]/90 to-[#ffb36e]/85 backdrop-blur-3xl supports-[backdrop-filter]:bg-white/10",

    navBorder = "border border-white/20 shadow-[0_8px_32px_rgba(243,129,48,0.22)]",

    logoFrom = "from-[#7C2D12]",

    logoTo = "to-[#F38130]",

    logoSub = "text-[#7C2D12]/70",

    liveColor = "bg-[#FFD166]",

    liveShadow = "shadow-[0_0_12px_2px_rgba(255,209,102,0.75)]",

    liveText = "text-[#7C2D12]",

    logoutBorder = "border-white/25",

    logoutText = "text-[#7C2D12]",

    logoutHoverBorder = "hover:border-red-400/50",

    logoutHoverText = "hover:text-red-500",

    logoutHoverBg = "hover:bg-red-500/5",

    accent = "shadow-[0_1px_0_0_rgba(255,255,255,0.12)]",

    glowLine = "via-[#FFD7B8]/60",
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
      className={`flex justify-between items-center gap-6 ${navBg} ${navBorder} ${accent} pl-4 md:pl-0 py-4 pr-6 w-full z-[100] fixed top-0`}
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
