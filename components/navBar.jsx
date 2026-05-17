import { NavLink, useNavigate } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "../src/firebase";

export default function NavBar({
  navBarColor,
  logoBGColor,
  homeRedirect,
  dashboardRedirect,
}) {
  const navigate = useNavigate();

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
    `cursor-pointer transition ${
      isActive
        ? "text-red-400 md:flex justify-center md:w-full"
        : "text-[#111827] hover:text-red-400 md:flex justify-center md:w-full"
    }`;

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  return (
    <nav
      className={`flex justify-between items-center gap-10 ${navBarColor} shadow pl-4 md:pl-0 py-6  pr-4 w-full z-100 fixed top-0 bottom-auto`}
    >
      <h1
        className={`font-bold ${logoBGColor} md:h-full md:w-full md:max-w-[20%] md:absolute md:flex items-center justify-center`}
      >
        PHIX-HFCH
      </h1>

      {user?.role !== "manager" && (
        <NavLink to={`${homeRedirect}`} end className={navClass}>
          Home
        </NavLink>
      )}
      {(user?.role === "admin" || user?.role === "estate") && (
        <NavLink
          to={`${dashboardRedirect}`} end
          className={({ isActive }) =>
            `${isActive ? "text-red-400" : "hover:text-red-400"} md:flex hidden`
          }
        >
          Dashboard
        </NavLink>
      )}

      <small
        onClick={handleLogout}
        className={`text-[#111827] ${user?.role === "manager" ? "hover:text-yellow-500" : "hover:text-red-400"} cursor-pointer transition ${user.role === "manager" && "absolute right-4"} `}
      >
        Logout
      </small>
    </nav>
  );
}
